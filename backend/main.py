from fastapi import FastAPI, HTTPException, Depends, Request
from typing import Optional
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, Field
import bcrypt
import mysql.connector
import os
import paho.mqtt.client as mqtt
import time
import threading
import hmac
import hashlib
import secrets
import json
import jwt
from collections import defaultdict
from datetime import datetime, timedelta

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

def env_int(name: str, default: int, low: int = None, high: int = None) -> int:
    """
    อ่าน env ที่เป็นตัวเลข — พิมพ์ผิดต้องบอกให้ชัดว่าตัวไหน
    ปล่อยให้ int() โยน ValueError เปล่าๆ จะได้แค่ traceback ที่ไม่บอกชื่อตัวแปร
    ซึ่งแปลว่า service ไม่ขึ้นแล้วคนแก้ต้องมานั่งไล่เดาเอง
    """
    raw = os.getenv(name)
    if raw is None or raw == "":
        value = default
    else:
        try:
            value = int(raw)
        except ValueError:
            raise RuntimeError(f"ค่า {name} ต้องเป็นตัวเลข แต่ได้ {raw!r}")
    if low is not None:
        value = max(low, value)
    if high is not None:
        value = min(high, value)
    return value

def require_env(name: str) -> str:
    # Fail fast if secret missing
    value = os.getenv(name)
    if not value:
        raise RuntimeError(
            f"Missing required environment variable: {name}. "
            f"Copy backend/.env.example to backend/.env and fill it in."
        )
    return value

app = FastAPI()

# CORS allow-list
_allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'user': require_env('DB_USER'),
    'password': require_env('DB_PASSWORD'),
    'database': require_env('DB_NAME'),
    'autocommit': True
}

def get_db_connection():
    try:
        return mysql.connector.connect(**DB_CONFIG)
    except mysql.connector.Error as err:
        print(f"Error connecting to DB: {err}")
        return None

# ==========================================
# JWT & PASSWORD CONFIGURATION
# ==========================================
SECRET_KEY = require_env("JWT_SECRET_KEY")
# กุญแจสั้นเกินไป = เดา/brute force ออกได้ แล้วปลอม token เป็น admin ได้เลย
if len(SECRET_KEY) < 32:
    raise RuntimeError(
        "JWT_SECRET_KEY สั้นเกินไป (ต้องอย่างน้อย 32 ตัวอักษร) "
        'สร้างใหม่ด้วย: python -c "import secrets; print(secrets.token_hex(32))"'
    )
ALGORITHM = "HS256"
# อายุ session สูงสุด — เปิดค้างเกินนี้ต้องล็อกอินใหม่เสมอ ไม่มีการต่ออายุอัตโนมัติ
# หน้าเว็บอ่าน exp จาก token ตัวนี้ไปบังคับเอง ค่าจึงมีที่มาที่เดียว
SESSION_MAX_HOURS = env_int("SESSION_MAX_HOURS", 24, low=1, high=720)
ACCESS_TOKEN_EXPIRE_MINUTES = SESSION_MAX_HOURS * 60

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/login")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def generate_password(length: int = 8) -> str:
    # ตัดตัวที่สับสนกันบ่อยออก (0/O, 1/l/I)
    alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
    return "".join(secrets.choice(alphabet) for _ in range(length))

# ผูก token เข้ากับรหัสผ่านปัจจุบัน — พอเปลี่ยนรหัสผ่าน token เก่าตายทันทีทุกใบ
# ใช้ HMAC เพื่อไม่ให้ payload ที่ใครก็อ่านได้ เปิดเผยอะไรเกี่ยวกับ hash จริง
def password_token_version(password_hash: str) -> str:
    return hmac.new(SECRET_KEY.encode(), password_hash.encode(), hashlib.sha256).hexdigest()[:16]

def create_access_token(username: str, password_hash: str) -> str:
    now = datetime.utcnow()
    payload = {
        "sub": username,
        "ver": password_token_version(password_hash),
        "iat": now,
        "exp": now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

# ==========================================
# ROLES & STATION SCOPING
# admin = ผู้ดูแลของสาขาเดียว เห็น/สั่งงานได้เฉพาะ station_id ของตัวเอง
# ceo   = เจ้าของ ดูได้ทุกสาขา + จัดการพนักงานได้
# ==========================================
ROLE_ADMIN = "admin"
ROLE_CEO = "ceo"
ALLOWED_ROLES = (ROLE_ADMIN, ROLE_CEO)

def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token or unauthorized")

    username = payload.get("sub")
    if not username:
        raise HTTPException(status_code=401, detail="Invalid token credentials")

    # ตรวจกับ DB ทุก request — ปิดบัญชี/ย้ายสาขา/เปลี่ยนรหัสผ่าน แล้ว token เก่าต้องใช้ไม่ได้ทันที
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=503, detail="Database unavailable")
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT user_id, username, fullname, role, station_id, password, is_active "
            "FROM users WHERE username=%s LIMIT 1",
            (username,),
        )
        row = cursor.fetchone()
    finally:
        cursor.close()
        conn.close()

    if not row or int(row.get("is_active") or 0) != 1:
        raise HTTPException(status_code=401, detail="บัญชีนี้ใช้งานไม่ได้แล้ว")

    if payload.get("ver") != password_token_version(row["password"]):
        raise HTTPException(status_code=401, detail="รหัสผ่านถูกเปลี่ยนแล้ว กรุณาเข้าสู่ระบบใหม่")

    role = (row.get("role") or "").strip().lower()
    if role not in ALLOWED_ROLES:
        raise HTTPException(status_code=403, detail="บัญชีนี้ไม่มีสิทธิ์ใช้งานระบบนี้")

    station_id = row.get("station_id")
    # admin ต้องผูกกับสาขาเสมอ — ถ้าไม่มี ปิดประตูไว้ก่อน (fail closed)
    # ดีกว่าเผลอปล่อยให้เห็น/สั่งเปิดได้ทุกสาขา
    if role == ROLE_ADMIN and station_id is None:
        raise HTTPException(
            status_code=403,
            detail="บัญชีนี้ยังไม่ได้ผูกกับสาขา กรุณาติดต่อผู้ดูแลระบบ",
        )

    return {
        "user_id": row["user_id"],
        "username": row["username"],
        "fullname": row.get("fullname"),
        "role": role,
        "station_id": int(station_id) if station_id is not None else None,
    }

def require_ceo(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != ROLE_CEO:
        raise HTTPException(status_code=403, detail="เฉพาะผู้บริหารเท่านั้นที่เข้าถึงส่วนนี้ได้")
    return user

def resolve_station_id(user: dict, requested) -> int:
    """
    คืน station_id ที่ผู้ใช้คนนี้มีสิทธิ์ดูจริง
    - admin: ใช้สาขาตัวเองเสมอ ส่งสาขาอื่นมา = 403 (กันแอบดู/แอบสั่งเปิดข้ามสาขา)
    - ceo:   ต้องระบุว่าจะดูสาขาไหน
    """
    if user["role"] == ROLE_CEO:
        if requested is None:
            raise HTTPException(status_code=400, detail="กรุณาระบุสาขาที่ต้องการดู (station_id)")
        return int(requested)

    own = user["station_id"]
    if requested is not None and int(requested) != own:
        raise HTTPException(status_code=403, detail="ไม่มีสิทธิ์เข้าถึงข้อมูลของสาขาอื่น")
    return own

def assert_can_access_station(user: dict, station_id) -> None:
    """เช็คของที่หยิบมาจาก DB แล้วว่าอยู่สาขาที่ผู้ใช้มีสิทธิ์ไหม (ใช้กับ locker เป็นหลัก)"""
    if user["role"] == ROLE_CEO:
        return
    if station_id is None or int(station_id) != user["station_id"]:
        raise HTTPException(status_code=403, detail="ไม่มีสิทธิ์เข้าถึงข้อมูลของสาขาอื่น")

# ==========================================
# LOGIN RATE LIMIT — กัน brute force เดารหัสผ่าน
# นับแยกตาม (username + IP) เพื่อไม่ให้คนร้ายล็อคบัญชีพนักงานจริงได้ง่ายๆ
# หมายเหตุ: เก็บใน memory ของ process เดียว ถ้าวันหลังรันหลาย worker ต้องย้ายไป Redis
# ==========================================
LOGIN_MAX_ATTEMPTS = env_int("LOGIN_MAX_ATTEMPTS", 10, low=1)
LOGIN_WINDOW_SECONDS = env_int("LOGIN_WINDOW_SECONDS", 300, low=1)
LOGIN_LOCKOUT_SECONDS = env_int("LOGIN_LOCKOUT_SECONDS", 900, low=1)

_login_failures = defaultdict(list)
_login_lock = threading.Lock()

# ยิง login ด้วย username สุ่มรัวๆ จะสร้าง key ใหม่ทุกครั้ง ถ้าไม่กวาดทิ้งจะกิน RAM ไปเรื่อยๆ
LOGIN_FAILURE_MAX_KEYS = 10000

def _sweep_login_failures(now: float):
    """ต้องถือ _login_lock อยู่ก่อนเรียก"""
    if len(_login_failures) <= LOGIN_FAILURE_MAX_KEYS:
        return
    stale = [k for k, times in _login_failures.items()
             if not times or now - max(times) >= LOGIN_LOCKOUT_SECONDS]
    for k in stale:
        del _login_failures[k]

def _client_ip(request: Request) -> str:
    # อยู่หลัง nginx ซึ่ง set X-Real-IP ให้ (ดู nginx config ของโดเมนนี้)
    return request.headers.get("x-real-ip") or (request.client.host if request.client else "unknown")

def _rate_key(username: str, request: Request) -> str:
    return f"{(username or '').strip().lower()}|{_client_ip(request)}"

def check_login_allowed(username: str, request: Request):
    key = _rate_key(username, request)
    now = time.time()
    with _login_lock:
        _sweep_login_failures(now)
        recent = [t for t in _login_failures[key] if now - t < LOGIN_LOCKOUT_SECONDS]
        _login_failures[key] = recent
        in_window = [t for t in recent if now - t < LOGIN_WINDOW_SECONDS]
        if len(in_window) >= LOGIN_MAX_ATTEMPTS:
            wait_min = int(LOGIN_LOCKOUT_SECONDS - (now - max(in_window))) // 60 + 1
            raise HTTPException(
                status_code=429,
                detail=f"กรอกรหัสผ่านผิดหลายครั้งเกินไป กรุณารออีกประมาณ {wait_min} นาที",
            )

def record_login_failure(username: str, request: Request):
    with _login_lock:
        _login_failures[_rate_key(username, request)].append(time.time())

def clear_login_failures(username: str, request: Request):
    with _login_lock:
        _login_failures.pop(_rate_key(username, request), None)

# ==========================================
# MQTT CONFIGURATION
# ==========================================
MQTT_BROKER = require_env("MQTT_BROKER")
MQTT_PORT = env_int("MQTT_PORT", 1883, low=1, high=65535)
MQTT_USERNAME = require_env("MQTT_USERNAME")
MQTT_PASSWORD = require_env("MQTT_PASSWORD")
# หัวข้อแยกตามสาขา — {station_id} จะถูกแทนตอนสั่งเปิดจริง
MQTT_UNLOCK_TOPIC = os.getenv("MQTT_UNLOCK_TOPIC", "locker/{station_id}/web/unlock")

mqtt_client = mqtt.Client()

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("MQTT Connected Successfully")
    else:
        print(f"MQTT Connection Failed, return code {rc}")

def on_publish(client, userdata, mid):
    print(f"Message Published, MID: {mid}")

def on_disconnect(client, userdata, rc):
    print("MQTT Disconnected")

mqtt_client.on_connect = on_connect
mqtt_client.on_publish = on_publish
mqtt_client.on_disconnect = on_disconnect
mqtt_client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)

def connect_mqtt():
    # connect_async + loop_start = paho พยายามต่อใหม่ให้เองเรื่อยๆ
    # ถ้าใช้ connect() ธรรมดาแล้ว broker ยังไม่ขึ้นตอน service boot จะ throw
    # แล้ว loop_start() ไม่ได้ทำงานเลย = ต่อ MQTT ไม่ได้ถาวรจนกว่าจะ restart เอง
    # (API ยังขึ้นปกติ healthcheck ผ่าน แต่สั่งเปิดตู้ไม่ได้สักครั้ง)
    try:
        print("Connecting to MQTT Broker...")
        mqtt_client.reconnect_delay_set(min_delay=1, max_delay=60)
        mqtt_client.connect_async(MQTT_BROKER, MQTT_PORT, 60)
        mqtt_client.loop_start()
    except Exception as e:
        print("MQTT Connect Error:", e)

threading.Thread(target=connect_mqtt, daemon=True).start()

MQTT_PUBLISH_TIMEOUT = env_int("MQTT_PUBLISH_TIMEOUT_SECONDS", 5, low=1, high=60)

def publish_message(topic: str, message: str):
    """
    ส่งด้วย qos=1 แล้วรอ broker ตอบรับจริง

    qos=0 + เช็คแค่ rc==0 บอกได้แค่ว่า "เข้าคิวแล้ว" ตอนสายหลุดอยู่ข้อความจะหายเงียบ
    แต่ฝั่งเราไปเคลียร์ตู้เป็นว่างเรียบร้อยแล้ว = ของลูกค้าติดอยู่ในตู้ที่ระบบบอกว่าว่าง
    """
    print(f"Publishing to topic: {topic}")
    print(f"Payload: {message}")
    try:
        result = mqtt_client.publish(topic, message, qos=1)
        if result.rc != mqtt.MQTT_ERR_SUCCESS:
            print(f"Send Failed (rc={result.rc})")
            return False
        result.wait_for_publish(timeout=MQTT_PUBLISH_TIMEOUT)
        if not result.is_published():
            print("Send Failed (broker ไม่ตอบรับภายในเวลาที่กำหนด)")
            return False
    except Exception as e:
        print("Publish Error:", e)
        return False
    print("Send Success")
    return True

# ==========================================
# HELPERS
# ==========================================
# ฟังก์ชันนี้ถูกเรียกจากหลาย endpoint ต่อ request จึงไม่ควรยิง DDL ทุกครั้ง
# สร้างตารางครั้งเดียวพอ (ตั้งธงหลังทำสำเร็จ)
_settings_table_ready = False

def get_max_deposit_days():
    global _settings_table_ready
    conn = get_db_connection()
    if not conn:
        return 1
    cursor = conn.cursor()
    try:
        if not _settings_table_ready:
            cursor.execute("CREATE TABLE IF NOT EXISTS settings (`key` VARCHAR(50) PRIMARY KEY, `value` VARCHAR(255))")
            _settings_table_ready = True
        cursor.execute("SELECT `value` FROM settings WHERE `key` = 'max_deposit_days'")
        result = cursor.fetchone()
        if not result:
            cursor.execute("INSERT INTO settings (`key`, `value`) VALUES ('max_deposit_days', '1')")
            conn.commit()
            return 1
        return int(result[0])
    except Exception as e:
        # กลืนเงียบไม่ได้ — ตกมาที่ 1 วันแปลว่าตู้ทั้งระบบจะขึ้น "เกินกำหนด" เร็วกว่าที่ตั้งไว้
        print("get_max_deposit_days error:", e)
        return 1
    finally:
        cursor.close()
        conn.close()

def station_exists(station_id: int) -> bool:
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=503, detail="Database unavailable")
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT 1 FROM stations WHERE station_id=%s LIMIT 1", (station_id,))
        return cursor.fetchone() is not None
    finally:
        cursor.close()
        conn.close()

# ==========================================
# SCHEMAS
# ==========================================
class LoginData(BaseModel):
    username: str
    password: str

class SettingsUpdate(BaseModel):
    # 0 หรือติดลบ = ตู้ทุกใบขึ้น "เกินกำหนด" ทันทีทั้งระบบ จึงต้องกันไว้ที่ schema
    max_deposit_days: int = Field(ge=1, le=365)

class PasswordChange(BaseModel):
    current_password: str
    # บังคับความยาวขั้นต่ำที่ฝั่ง server ด้วย ไม่ใช่เชื่อ validation ฝั่งหน้าเว็บอย่างเดียว
    new_password: str = Field(min_length=8, max_length=128)

class StaffCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    fullname: str = Field(min_length=1, max_length=150)
    phone: str = Field(min_length=1, max_length=20)
    station_id: int

class StaffUpdate(BaseModel):
    fullname: Optional[str] = Field(default=None, max_length=150)
    phone: Optional[str] = Field(default=None, max_length=20)
    station_id: Optional[int] = None
    is_active: Optional[bool] = None

# ==========================================
# ROUTES
# ==========================================
@app.get("/api/ping")
def ping():
    return {"status": "ok", "time": str(datetime.now())}

@app.get("/api/me")
def get_me(user: dict = Depends(get_current_user)):
    """ให้หน้าเว็บถามสิทธิ์ตัวเองได้ (role/สาขา) โดยไม่ต้องเชื่อค่าใน sessionStorage"""
    return {
        "username": user["username"],
        "fullname": user["fullname"],
        "role": user["role"],
        "station_id": user["station_id"],
    }

@app.get("/api/stations")
def get_stations(user: dict = Depends(get_current_user)):
    """
    ceo เห็นทุกสาขา / admin เห็นเฉพาะสาขาตัวเอง
    แนบยอดของแต่ละสาขามาด้วย (ตู้มีของ / เกินกำหนด / พนักงาน) เพื่อให้หน้าเลือกสาขา
    เห็นได้เลยว่าสาขาไหนต้องรีบดู โดยไม่ต้องยิง API ทีละสาขา
    """
    max_days = get_max_deposit_days()
    scope_all = user["role"] == ROLE_CEO

    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        if scope_all:
            cursor.execute(
                "SELECT station_id, station_name, location, status "
                "FROM stations ORDER BY station_id ASC"
            )
        else:
            cursor.execute(
                "SELECT station_id, station_name, location, status "
                "FROM stations WHERE station_id=%s",
                (user["station_id"],),
            )
        stations = cursor.fetchall()

        if not stations:
            return {"status": "success", "data": []}

        ids = [s["station_id"] for s in stations]
        placeholders = ", ".join(["%s"] * len(ids))

        # TIMESTAMPDIFF(DAY, ...) นับวันเต็มที่ผ่านไป ให้ผลตรงกับ timedelta.days
        # ที่ใช้คิด is_overdue ในฝั่ง Python (DATEDIFF จะนับจากวันที่อย่างเดียว ไม่ตรงกัน)
        cursor.execute(
            f"""SELECT station_id,
                       COUNT(CASE WHEN status = 1 THEN 1 END) AS occupied_count,
                       COUNT(CASE WHEN status = 1 AND deposit_time IS NOT NULL
                                   AND TIMESTAMPDIFF(DAY, deposit_time, NOW()) >= %s
                                  THEN 1 END) AS overdue_count
                FROM lockers
                WHERE station_id IN ({placeholders})
                GROUP BY station_id""",
            (max_days, *ids),
        )
        locker_counts = {r["station_id"]: r for r in cursor.fetchall()}

        cursor.execute(
            f"""SELECT station_id, COUNT(*) AS staff_count
                FROM users
                WHERE station_id IN ({placeholders}) AND role = %s AND is_active = 1
                GROUP BY station_id""",
            (*ids, ROLE_ADMIN),
        )
        staff_counts = {r["station_id"]: r["staff_count"] for r in cursor.fetchall()}
    finally:
        cursor.close()
        conn.close()

    for st in stations:
        counts = locker_counts.get(st["station_id"])
        st["occupied_count"] = int(counts["occupied_count"]) if counts else 0
        st["overdue_count"] = int(counts["overdue_count"]) if counts else 0
        st["staff_count"] = int(staff_counts.get(st["station_id"], 0))

    return {"status": "success", "data": stations}

@app.get("/api/settings")
def get_settings(user: dict = Depends(get_current_user)):
    return {"max_deposit_days": get_max_deposit_days()}

@app.put("/api/settings")
def update_settings(settings: SettingsUpdate, user: dict = Depends(require_ceo)):
    # ค่านี้ใช้ร่วมกันทุกสาขา จึงให้เฉพาะ ceo แก้ได้
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor()
    try:
        # upsert — UPDATE เฉยๆ จะเงียบสนิทถ้าแถวยังไม่มี (ตอบ success ทั้งที่ไม่ได้บันทึก)
        cursor.execute(
            "INSERT INTO settings (`key`, `value`) VALUES ('max_deposit_days', %s) "
            "ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)",
            (str(settings.max_deposit_days),),
        )
        conn.commit()
    finally:
        cursor.close()
        conn.close()
    return {"status": "success", "message": "Settings updated"}

@app.put("/api/admin/password")
def change_admin_password(data: PasswordChange, user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT user_id, password FROM users WHERE user_id=%s LIMIT 1",
            (user["user_id"],),
        )
        user_record = cursor.fetchone()

        if not user_record:
            raise HTTPException(status_code=404, detail="ไม่พบบัญชีผู้ใช้")

        if not verify_password(data.current_password, user_record["password"]):
            # ใช้ 400 ไม่ใช่ 401 — 401 หมายถึง "token เสีย" ในมุมมอง frontend
            # (client.js จะเตะออกจากระบบทันที ไม่ทันได้เห็น toast) แต่นี่ยังเป็น
            # ผู้ใช้คนเดิมที่ล็อกอินอยู่ แค่พิมพ์รหัสผ่านปัจจุบันผิด ไม่ควรถูกเตะออก
            raise HTTPException(status_code=400, detail="รหัสผ่านปัจจุบันไม่ถูกต้อง")

        try:
            cursor.execute(
                "UPDATE users SET password=%s, must_change_password=0 WHERE user_id=%s",
                (get_password_hash(data.new_password), user_record["user_id"]),
            )
            conn.commit()
        except Exception as e:
            conn.rollback()
            print("change_admin_password error:", e)
            raise HTTPException(status_code=500, detail="เปลี่ยนรหัสผ่านไม่สำเร็จ")
    finally:
        cursor.close()
        conn.close()

    return {"status": "success", "message": "เปลี่ยนรหัสผ่านสำเร็จ"}

@app.post("/api/login")
def login(data: LoginData, request: Request):
    check_login_allowed(data.username, request)

    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        # ระบุคอลัมน์ให้ชัด ห้าม SELECT * จากตาราง users — กันเผลอส่ง hash ออกไปกับ response
        cursor.execute(
            "SELECT user_id, username, fullname, role, station_id, password, must_change_password "
            "FROM users WHERE username=%s AND is_active=1",
            (data.username,),
        )
        account = cursor.fetchone()

        if not account or not verify_password(data.password, account["password"]):
            record_login_failure(data.username, request)
            raise HTTPException(status_code=401, detail="ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง")

        role = (account.get("role") or "").strip().lower()
        if role not in ALLOWED_ROLES:
            record_login_failure(data.username, request)
            raise HTTPException(status_code=403, detail="บัญชีนี้ไม่มีสิทธิ์ใช้งานระบบนี้")

        if role == ROLE_ADMIN and account.get("station_id") is None:
            raise HTTPException(
                status_code=403,
                detail="บัญชีนี้ยังไม่ได้ผูกกับสาขา กรุณาติดต่อผู้ดูแลระบบ",
            )

        clear_login_failures(data.username, request)

        # อัปเดตเวลาเข้าใช้ล่าสุด — ล้มเหลวไม่ควรทำให้ล็อกอินพัง
        try:
            cursor.execute("UPDATE users SET last_login=NOW() WHERE user_id=%s", (account["user_id"],))
            conn.commit()
        except Exception as e:
            conn.rollback()
            print("Update last_login error:", e)
    finally:
        cursor.close()
        conn.close()

    access_token = create_access_token(account["username"], account["password"])
    return {
        "status": "success",
        "access_token": access_token,
        "token_type": "bearer",
        "username": account["username"],
        "fullname": account.get("fullname"),
        "role": role,
        "station_id": account.get("station_id"),
        "must_change_password": bool(account.get("must_change_password")),
    }

@app.get("/api/lockers")
def get_lockers(station_id: Optional[int] = None, user: dict = Depends(get_current_user)):
    scope_station = resolve_station_id(user, station_id)

    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT * FROM lockers WHERE station_id=%s ORDER BY locker_id ASC",
            (scope_station,),
        )
        lockers = cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

    max_days = get_max_deposit_days()
    now = datetime.now()

    for locker in lockers:
        if locker["status"] == 1 and locker["deposit_time"]:
            dep_time = locker["deposit_time"]
            if isinstance(dep_time, str):
                try:
                    dep_time = datetime.strptime(dep_time, "%Y-%m-%d %H:%M:%S")
                except Exception:
                    dep_time = now
            diff = now - dep_time
            locker["is_overdue"] = diff.days >= max_days
            locker["days_used"] = diff.days
        else:
            locker["is_overdue"] = False
            locker["days_used"] = 0

    return {"status": "success", "data": lockers}

@app.get("/api/lockers/{locker_id}")
def get_locker_detail(locker_id: int, station_id: Optional[int] = None,
                      user: dict = Depends(get_current_user)):
    # กรอง station_id ใน SQL เลย ไม่ใช่ดึงมาแล้วค่อยเช็ค — ถ้า locker_id ซ้ำได้ข้ามสาขา
    # การดึงมาก่อนจะได้ตู้ผิดใบ (แล้วโดน 403 ทั้งที่เป็นตู้ของตัวเอง)
    scope_station = resolve_station_id(user, station_id)

    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT * FROM lockers WHERE locker_id=%s AND station_id=%s",
            (locker_id, scope_station),
        )
        rows = cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

    return rows

@app.post("/api/lockers/{locker_id}/unlock")
def unlock_hardware_and_release(locker_id: int, station_id: Optional[int] = None,
                                user: dict = Depends(get_current_user)):
    # ด่านสำคัญที่สุดของทั้งไฟล์ — admin สาขาหนึ่งต้องสั่งเปิดตู้ของอีกสาขาไม่ได้เด็ดขาด
    # จึงล็อกสาขาตั้งแต่ WHERE ทั้ง SELECT และ UPDATE ข้างล่าง ไม่ใช่ค่อยมาเช็คทีหลัง
    scope_station = resolve_station_id(user, station_id)

    # เบอร์เจ้าของอ่านจาก DB เสมอ ไม่รับจาก client เพื่อกันส่งเบอร์ปลอม/ผิดมาปนใน log
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT locker_id, station_id, box_number, is_usable, phone_owner, room_number "
            "FROM lockers WHERE locker_id=%s AND station_id=%s",
            (locker_id, scope_station),
        )
        locker = cursor.fetchone()
    finally:
        cursor.close()
        conn.close()

    if not locker:
        raise HTTPException(status_code=404, detail=f"ไม่พบตู้ล็อกเกอร์หมายเลข {locker_id}")

    assert_can_access_station(user, locker.get("station_id"))

    station_id = locker.get("station_id")
    box_number = locker.get("box_number") or locker_id
    phone_owner = locker.get("phone_owner")
    # is_usable = 0 คือช่องจอ (เปิดได้ แต่ไม่มีของฝาก จึงไม่ต้องเคลียร์ข้อมูล)
    # NULL ให้ถือเป็นตู้ปกติ — เผลอเคลียร์ช่องจอไม่เสียหาย (ข้อมูลเป็น NULL อยู่แล้ว)
    # แต่ถ้าเผลอมองตู้ปกติเป็นช่องจอ ตู้จะค้าง status=1 ตลอดไป
    usable_flag = locker.get("is_usable")
    is_screen_slot = usable_flag is not None and int(usable_flag) == 0

    topic = MQTT_UNLOCK_TOPIC.format(station_id=station_id)
    message = json.dumps({
        "box_number": box_number,
        "staff_id": user["user_id"],
        "staff_name": user["fullname"] or user["username"],
    }, ensure_ascii=False)

    if not publish_message(topic, message):
        raise HTTPException(status_code=500, detail="ไม่สามารถส่งคำสั่ง MQTT ไปที่ตู้ล็อคเกอร์ได้")

    # หมายเหตุ: DB_CONFIG ตั้ง autocommit=True ทุกคำสั่งข้างล่างจึง commit ทันทีทีละคำสั่ง
    # ไม่ใช่ atomic — เป็นความเสี่ยงที่รู้อยู่แล้ว (ดู memory locker-security-hardening) ยังไม่แก้ในรอบนี้
    # ต้อง raise ไม่ใช่ข้ามเงียบๆ — ประตูเปิดไปแล้ว ถ้าไม่บันทึกจะได้ตู้ค้าง status=1
    # ตลอดไปโดยที่หน้าเว็บขึ้นว่าสำเร็จ (เคยเจอมาแล้วตอน schema rename)
    conn = get_db_connection()
    if not conn:
        raise HTTPException(
            status_code=500,
            detail="เปิดตู้แล้ว แต่เชื่อมต่อฐานข้อมูลไม่ได้ กรุณาแจ้งผู้ดูแลระบบให้ตรวจสอบสถานะตู้",
        )
    cursor = conn.cursor(dictionary=True)
    try:
        sql_trans = """INSERT INTO transactions
                           (station_id, box_number, phone, room_number, staff_id, action, detail)
                       VALUES (%s, %s, %s, %s, %s, %s, %s)"""
        if is_screen_slot:
            # ช่องจอ: บันทึกประวัติอย่างเดียว ไม่แตะข้อมูลผู้ใช้
            detail = 'ส่งคำสั่งเปิดช่องติดตั้งจอ (ไม่ลบข้อมูล)'
        else:
            # ตู้ปกติ: เคลียร์ค่าผู้ใช้งานคืนเป็นตู้ว่าง
            cursor.execute("""UPDATE lockers
                              SET phone_owner=NULL, pass_code=NULL, status=0, updated_at=NOW()
                              WHERE locker_id=%s AND station_id=%s""",
                           (locker_id, station_id))
            detail = 'ส่งคำสั่ง MQTT เปิดตู้และคืนค่าว่างสำเร็จ'

        cursor.execute(sql_trans, (
            station_id, box_number, phone_owner, locker.get("room_number"),
            user["user_id"], 'UNLOCK', detail,
        ))
        conn.commit()
    except Exception as e:
        conn.rollback()
        print("Database Update Auto-Release Error:", e)
        raise HTTPException(status_code=500, detail="เปิดตู้แล้ว แต่บันทึกสถานะลงฐานข้อมูลไม่สำเร็จ")
    finally:
        cursor.close()
        conn.close()

    return {"status": "success", "message": f"สั่งเปิดล็อกเกอร์หมายเลข {locker_id} และอัปเดตระบบแล้ว"}

@app.get("/api/transactions")
def get_transactions(limit: int = 100, offset: int = 0, station_id: Optional[int] = None,
                     user: dict = Depends(get_current_user)):
    # จำกัดช่วงค่า กัน ?limit=99999999 ลากทั้งตารางจนเซิร์ฟเวอร์ล่ม
    limit = max(1, min(limit, 500))
    offset = max(0, offset)
    scope_station = resolve_station_id(user, station_id)

    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT t.transaction_id AS trans_id,
                   t.created_at AS timestamp,
                   t.box_number AS locker_id,
                   t.station_id, t.room_number, t.staff_id,
                   t.phone, t.action, t.detail,
                   s.fullname AS staff_name,
                   st.station_name
            FROM transactions t
            LEFT JOIN users s ON s.user_id = t.staff_id
            LEFT JOIN stations st ON st.station_id = t.station_id
            WHERE t.station_id = %s
            ORDER BY t.created_at DESC
            LIMIT %s OFFSET %s
        """, (scope_station, limit, offset))
        txs = cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

    return {"status": "success", "data": txs}

# ==========================================
# STAFF MANAGEMENT — เฉพาะ ceo เท่านั้น
# ตั้งใจให้สร้าง/แก้ได้เฉพาะ role='admin' ไม่ให้ตั้ง ceo เพิ่มผ่านหน้าเว็บ
# (ยกระดับสิทธิ์ตัวเองได้ = ช่องโหว่) ถ้าจะเพิ่ม ceo ให้ใช้สคริปต์ create_admin.py
# ==========================================
def _fetch_staff_row(cursor, user_id: int):
    cursor.execute(
        "SELECT user_id, username, fullname, phone, role, station_id, is_active "
        "FROM users WHERE user_id=%s LIMIT 1",
        (user_id,),
    )
    return cursor.fetchone()

@app.get("/api/staff")
def list_staff(station_id: Optional[int] = None, user: dict = Depends(get_current_user)):
    """รายชื่อพนักงานของสาขา — admin ดูของสาขาตัวเองได้ / ceo ระบุสาขาที่จะดู"""
    scope_station = resolve_station_id(user, station_id)

    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT user_id, username, fullname, phone, role, station_id, is_active, last_login, created_at "
            "FROM users WHERE station_id=%s AND role=%s ORDER BY created_at DESC",
            (scope_station, ROLE_ADMIN),
        )
        staff = cursor.fetchall()
    finally:
        cursor.close()
        conn.close()
    return {"status": "success", "data": staff}

@app.post("/api/staff")
def create_staff(data: StaffCreate, user: dict = Depends(require_ceo)):
    if not station_exists(data.station_id):
        raise HTTPException(status_code=400, detail="ไม่พบสาขาที่ระบุ")

    username = data.username.strip().lower()
    plain_password = generate_password()

    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT user_id FROM users WHERE username=%s LIMIT 1", (username,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="ชื่อผู้ใช้นี้ถูกใช้ไปแล้ว")

        cursor.execute(
            """INSERT INTO users
                   (username, fullname, phone, role, station_id, password,
                    is_active, must_change_password, last_login)
               VALUES (%s, %s, %s, %s, %s, %s, 1, 1, NULL)""",
            (username, data.fullname.strip(), data.phone.strip(), ROLE_ADMIN,
             data.station_id, get_password_hash(plain_password)),
        )
        conn.commit()
        new_id = cursor.lastrowid
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        print("create_staff error:", e)
        raise HTTPException(status_code=400, detail="ไม่สามารถเพิ่มพนักงานได้")
    finally:
        cursor.close()
        conn.close()

    # รหัสผ่านแสดงครั้งเดียวตรงนี้ ไม่ได้เก็บ plaintext ไว้ที่ไหน
    return {
        "status": "success",
        "message": "เพิ่มพนักงานสำเร็จ",
        "data": {"user_id": new_id, "username": username, "password": plain_password},
    }

@app.put("/api/staff/{user_id}")
def update_staff(user_id: int, data: StaffUpdate, user: dict = Depends(require_ceo)):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        target = _fetch_staff_row(cursor, user_id)
        if not target:
            raise HTTPException(status_code=404, detail="ไม่พบพนักงานคนนี้")
        if (target.get("role") or "").lower() != ROLE_ADMIN:
            raise HTTPException(status_code=403, detail="แก้ไขได้เฉพาะบัญชีพนักงานเท่านั้น")

        fields, values = [], []
        if data.fullname is not None:
            fields.append("fullname=%s"); values.append(data.fullname.strip())
        if data.phone is not None:
            fields.append("phone=%s"); values.append(data.phone.strip())
        if data.station_id is not None:
            if not station_exists(data.station_id):
                raise HTTPException(status_code=400, detail="ไม่พบสาขาที่ระบุ")
            fields.append("station_id=%s"); values.append(data.station_id)
        if data.is_active is not None:
            fields.append("is_active=%s"); values.append(1 if data.is_active else 0)

        if not fields:
            raise HTTPException(status_code=400, detail="ไม่มีข้อมูลที่ต้องแก้ไข")

        values.append(user_id)
        cursor.execute(f"UPDATE users SET {', '.join(fields)} WHERE user_id=%s", tuple(values))
        conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        print("update_staff error:", e)
        raise HTTPException(status_code=400, detail="ไม่สามารถแก้ไขข้อมูลพนักงานได้")
    finally:
        cursor.close()
        conn.close()

    return {"status": "success", "message": "แก้ไขข้อมูลพนักงานสำเร็จ"}

@app.post("/api/staff/{user_id}/reset-password")
def reset_staff_password(user_id: int, user: dict = Depends(require_ceo)):
    plain_password = generate_password()

    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        target = _fetch_staff_row(cursor, user_id)
        if not target:
            raise HTTPException(status_code=404, detail="ไม่พบพนักงานคนนี้")
        if (target.get("role") or "").lower() != ROLE_ADMIN:
            raise HTTPException(status_code=403, detail="รีเซ็ตรหัสผ่านได้เฉพาะบัญชีพนักงานเท่านั้น")

        cursor.execute(
            "UPDATE users SET password=%s, must_change_password=1 WHERE user_id=%s",
            (get_password_hash(plain_password), user_id),
        )
        conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        print("reset_staff_password error:", e)
        raise HTTPException(status_code=400, detail="ไม่สามารถรีเซ็ตรหัสผ่านได้")
    finally:
        cursor.close()
        conn.close()

    return {
        "status": "success",
        "message": "รีเซ็ตรหัสผ่านสำเร็จ",
        "data": {"username": target["username"], "password": plain_password},
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        # default = รับเฉพาะ localhost ให้ nginx เป็นทางเข้าเดียว
        # ถ้าจะเปิดออกเน็ตต้องตั้ง API_HOST เองอย่างจงใจ
        host=os.getenv("API_HOST", "127.0.0.1"),
        port=env_int("API_PORT", 8885, low=1, high=65535),
        reload=True,
    )
