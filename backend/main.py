from fastapi import FastAPI, HTTPException, Depends, Request
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
import jwt
from collections import defaultdict
from datetime import datetime, timedelta

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

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
ACCESS_TOKEN_EXPIRE_MINUTES = 1440 # 24 hours

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/login")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

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

def get_current_admin(token: str = Depends(oauth2_scheme)) -> str:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token or unauthorized")

    username = payload.get("sub")
    if not username:
        raise HTTPException(status_code=401, detail="Invalid token credentials")

    # ตรวจกับ DB ทุก request — ปิดบัญชี/ลบ/เปลี่ยนรหัสผ่าน แล้ว token เก่าต้องใช้ไม่ได้ทันที
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=503, detail="Database unavailable")
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT username, password, is_active FROM users "
            "WHERE username=%s AND role='admin' LIMIT 1",
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

    return row["username"]

# ==========================================
# LOGIN RATE LIMIT — กัน brute force เดารหัสผ่าน
# นับแยกตาม (username + IP) เพื่อไม่ให้คนร้ายล็อคบัญชีพนักงานจริงได้ง่ายๆ
# หมายเหตุ: เก็บใน memory ของ process เดียว ถ้าวันหลังรันหลาย worker ต้องย้ายไป Redis
# ==========================================
LOGIN_MAX_ATTEMPTS = int(os.getenv("LOGIN_MAX_ATTEMPTS", 10))
LOGIN_WINDOW_SECONDS = int(os.getenv("LOGIN_WINDOW_SECONDS", 300))
LOGIN_LOCKOUT_SECONDS = int(os.getenv("LOGIN_LOCKOUT_SECONDS", 900))

_login_failures = defaultdict(list)
_login_lock = threading.Lock()

def _client_ip(request: Request) -> str:
    # อยู่หลัง nginx ซึ่ง set X-Real-IP ให้ (ดู nginx config ของโดเมนนี้)
    return request.headers.get("x-real-ip") or (request.client.host if request.client else "unknown")

def _rate_key(username: str, request: Request) -> str:
    return f"{(username or '').strip().lower()}|{_client_ip(request)}"

def check_login_allowed(username: str, request: Request):
    key = _rate_key(username, request)
    now = time.time()
    with _login_lock:
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

def get_staff_id(username: str):
    """หา user_id ของพนักงานจาก username เอาไว้บันทึกลง transactions.staff_id"""
    conn = get_db_connection()
    if not conn:
        return None
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT user_id FROM users WHERE username=%s LIMIT 1", (username,))
        row = cursor.fetchone()
        return row["user_id"] if row else None
    finally:
        cursor.close()
        conn.close()

# ==========================================
# MQTT CONFIGURATION
# ==========================================
MQTT_BROKER = require_env("MQTT_BROKER")
MQTT_PORT = int(os.getenv("MQTT_PORT", 1883))
MQTT_USERNAME = require_env("MQTT_USERNAME")
MQTT_PASSWORD = require_env("MQTT_PASSWORD")

mqtt_client = mqtt.Client()

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("✅ MQTT Connected Successfully")
    else:
        print(f"❌ MQTT Connection Failed, return code {rc}")

def on_publish(client, userdata, mid):
    print(f"📤 Message Published, MID: {mid}")

def on_disconnect(client, userdata, rc):
    print("⚠️ MQTT Disconnected")

mqtt_client.on_connect = on_connect
mqtt_client.on_publish = on_publish
mqtt_client.on_disconnect = on_disconnect
mqtt_client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)

def connect_mqtt():
    try:
        print("🔌 Connecting to MQTT Broker...")
        mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
        mqtt_client.loop_start()
    except Exception as e:
        print("❌ MQTT Connect Error:", e)

threading.Thread(target=connect_mqtt, daemon=True).start()

def publish_message(topic: str, message: str):
    print(f"📡 Publishing to topic: {topic}")
    print(f"📨 Payload: {message}")
    result = mqtt_client.publish(topic, message)
    if result[0] == 0:
        print("✅ Send Success")
        return True
    else:
        print("❌ Send Failed")
        return False

# ==========================================
# HELPERS
# ==========================================
def get_max_deposit_days():
    conn = get_db_connection()
    if not conn:
        return 1
    cursor = conn.cursor()
    try:
        cursor.execute("CREATE TABLE IF NOT EXISTS settings (`key` VARCHAR(50) PRIMARY KEY, `value` VARCHAR(255))")
        cursor.execute("SELECT `value` FROM settings WHERE `key` = 'max_deposit_days'")
        result = cursor.fetchone()
        if not result:
            cursor.execute("INSERT INTO settings (`key`, `value`) VALUES ('max_deposit_days', '1')")
            conn.commit()
            return 1
        return int(result[0])
    except Exception:
        return 1
    finally:
        cursor.close()
        conn.close()

# ==========================================
# SCHEMAS & API ROUTES
# ==========================================
class LoginData(BaseModel):
    username: str
    password: str

class SettingsUpdate(BaseModel):
    max_deposit_days: int

class PasswordChange(BaseModel):
    current_password: str
    # บังคับความยาวขั้นต่ำที่ฝั่ง server ด้วย ไม่ใช่เชื่อ validation ฝั่งหน้าเว็บอย่างเดียว
    new_password: str = Field(min_length=8, max_length=128)

@app.get("/api/debug")
def debug_check():
    return {"status": "ok", "message": "Backend is reachable and updated - v2"}

print("🚀 BACKEND RELOADED - VERSION 3 - API ACTIVE")

@app.get("/api/ping")
def ping():
    return {"status": "ok", "time": str(datetime.now())}

@app.get("/api/settings")
def get_settings(admin: str = Depends(get_current_admin)):
    return {"max_deposit_days": get_max_deposit_days()}

@app.put("/api/settings")
def update_settings(settings: SettingsUpdate, admin: str = Depends(get_current_admin)):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE settings SET `value` = %s WHERE `key` = 'max_deposit_days'", (str(settings.max_deposit_days),))
        conn.commit()
    finally:
        cursor.close()
        conn.close()
    return {"status": "success", "message": "Settings updated"}

# (Moved to top)

# (Moved up to near schemas)

@app.get("/api/stats/daily")
def get_daily_stats(days: int = 7, admin: str = Depends(get_current_admin)):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        end_date = datetime.now().date()
        
        if days <= 0:
            cursor.execute("SELECT MIN(DATE(created_at)) as min_date FROM transactions")
            res = cursor.fetchone()
            if res and res['min_date']:
                start_date = res['min_date']
                delta = (end_date - start_date).days + 1
                query_days = min(delta, 1000) # limit to prevent huge loops
                start_date = end_date - timedelta(days=query_days-1)
            else:
                start_date = end_date
                query_days = 1
        else:
            query_days = days
            start_date = end_date - timedelta(days=query_days-1)
            
        sql = """
            SELECT DATE(created_at) as date,
                   COUNT(CASE WHEN action IN ('deposit' , 'ASSIGN') THEN 1 END) as deposits,
                   COUNT(CASE WHEN action IN ('withdraw', 'UNLOCK', 'DELETE') THEN 1 END) as withdraws
            FROM transactions
            WHERE DATE(created_at) >= %s
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        """
        cursor.execute(sql, (start_date,))
        stats = cursor.fetchall()
        
        # Fill missing dates with 0
        stats_dict = {str(s['date']): s for s in stats}
        filled_stats = []
        for i in range(query_days):
            d = start_date + timedelta(days=i)
            d_str = str(d)
            if d_str in stats_dict:
                filled_stats.append({
                    "date": d_str,
                    "deposits": stats_dict[d_str]['deposits'],
                    "withdraws": stats_dict[d_str]['withdraws']
                })
            else:
                filled_stats.append({
                    "date": d_str,
                    "deposits": 0,
                    "withdraws": 0
                })
                
        return {"status": "success", "data": filled_stats}
    finally:
        cursor.close()
        conn.close()

@app.put("/api/admin/password")
def change_admin_password(data: PasswordChange, admin: str = Depends(get_current_admin)):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT user_id, password FROM users WHERE username=%s AND role='admin' LIMIT 1",
            (admin,),
        )
        user_record = cursor.fetchone()

        if not user_record:
            raise HTTPException(status_code=404, detail="Admin not found")

        if not verify_password(data.current_password, user_record["password"]):
            # ใช้ 400 ไม่ใช่ 401 — 401 หมายถึง "token เสีย" ในมุมมอง frontend
            # (client.js จะเตะออกจากระบบทันที ไม่ทันได้เห็น toast) แต่นี่ยังเป็น
            # admin คนเดิมที่ล็อกอินอยู่ แค่พิมพ์รหัสผ่านปัจจุบันผิด ไม่ควรถูกเตะออก
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
        cursor.execute(
            "SELECT * FROM users WHERE username=%s AND role='admin' AND is_active=1",
            (data.username,),
        )
        admin = cursor.fetchone()

        if not admin or not verify_password(data.password, admin["password"]):
            record_login_failure(data.username, request)
            raise HTTPException(status_code=401, detail="ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง")

        clear_login_failures(data.username, request)

        # อัปเดตเวลาเข้าใช้ล่าสุด — ล้มเหลวไม่ควรทำให้ล็อกอินพัง
        try:
            cursor.execute("UPDATE users SET last_login=NOW() WHERE user_id=%s", (admin["user_id"],))
            conn.commit()
        except Exception as e:
            conn.rollback()
            print("Update last_login error:", e)
    finally:
        cursor.close()
        conn.close()

    access_token = create_access_token(admin["username"], admin["password"])
    return {
        "status": "success",
        "access_token": access_token,
        "token_type": "bearer",
        "username": admin["username"],
        "must_change_password": bool(admin.get("must_change_password")),
    }

@app.get("/api/users")
def get_users(admin: str = Depends(get_current_admin)):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")

    max_days = get_max_deposit_days()
    cursor = conn.cursor(dictionary=True)
    try:
        # ระบุคอลัมน์ให้ชัด ห้ามใช้ u.* เด็ดขาด — จะพ่วง password hash ออกไปด้วย
        cursor.execute("""
            SELECT u.user_id, u.fullname, u.phone, u.role, u.is_active, u.created_at,
                   l.status as locker_status, l.deposit_time, l.locker_id
            FROM users u
            LEFT JOIN lockers l ON u.phone = l.phone_owner
            ORDER BY u.created_at DESC
        """)
        users = cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

    now = datetime.now()
    for user in users:
        is_overdue = False
        if user.get("locker_status") == 1 and user.get("deposit_time"):
            dep_time = user["deposit_time"]
            if isinstance(dep_time, str):
                try:
                    dep_time = datetime.strptime(dep_time, "%Y-%m-%d %H:%M:%S")
                except Exception:
                    dep_time = now
            is_overdue = (now - dep_time).days >= max_days
        user["is_overdue"] = is_overdue

    return {"status": "success", "data": users}


# ลบ POST/PUT/DELETE /api/users ออกแล้ว (2026-08-24)
# เหตุผล: หน้าเว็บเลิกเรียกตั้งแต่ตัด scope, SQL อ้างคอลัมน์ที่ไม่มีใน schema ปัจจุบัน
# (room_number/passcode/custom_max_days) จึงพังทุกครั้งอยู่แล้ว และ delete_user
# ยิง DELETE FROM users โดยไม่เช็ค role — ลบบัญชี admin ทิ้งได้

@app.get("/api/lockers")
def get_lockers(admin: str = Depends(get_current_admin)):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM lockers ORDER BY locker_id ASC")
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

    return lockers


@app.get("/api/lockers/{locker_id}")
def get_locker_detail(locker_id: int, admin: str = Depends(get_current_admin)):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM lockers WHERE locker_id=%s", (locker_id,))
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()


@app.post("/api/lockers/{locker_id}/unlock")
def unlock_hardware_and_release(locker_id: int, admin: str = Depends(get_current_admin)):
    # เบอร์เจ้าของอ่านจาก DB เสมอ ไม่รับจาก client เพื่อกันส่งเบอร์ปลอม/ผิดมาปนใน log
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT locker_id, station_id, is_usable, phone_owner, room_number "
            "FROM lockers WHERE locker_id=%s",
            (locker_id,),
        )
        locker = cursor.fetchone()
    finally:
        cursor.close()
        conn.close()

    if not locker:
        raise HTTPException(status_code=404, detail=f"ไม่พบตู้ล็อกเกอร์หมายเลข {locker_id}")

    phone_owner = locker.get("phone_owner")
    # is_usable = 0 คือช่องจอ (เปิดได้ แต่ไม่มีของฝาก จึงไม่ต้องเคลียร์ข้อมูล)
    is_screen_slot = int(locker.get("is_usable") or 0) == 0
    staff_id = get_staff_id(admin)

    import json
    topic = "gsm_locker/box/unlock"
    phone_val = "0" if is_screen_slot else (phone_owner or "0000000000")

    payload_dict = {
        "locker_id": locker_id,
        "phone": phone_val,
        "action": "withdraw"
    }
    message = json.dumps(payload_dict)
    publish_success = publish_message(topic, message)

    if not publish_success:
        raise HTTPException(status_code=500, detail="ไม่สามารถส่งคำสั่ง MQTT ไปที่ตู้ล็อคเกอร์ได้")

    # หมายเหตุ: DB_CONFIG ตั้ง autocommit=True ทุกคำสั่งข้างล่างจึง commit ทันทีทีละคำสั่ง
    # ไม่ใช่ atomic — เป็นความเสี่ยงที่รู้อยู่แล้ว (ดู memory locker-security-hardening) ยังไม่แก้ในรอบนี้
    conn = get_db_connection()
    if conn:
        cursor = conn.cursor(dictionary=True)
        try:
            sql_trans = """INSERT INTO transactions
                               (station_id, box_number, phone, room_number, staff_id, action, detail)
                           VALUES (%s, %s, %s, %s, %s, %s, %s)"""
            if is_screen_slot:
                # ช่องจอ: บันทึกประวัติอย่างเดียว ไม่แตะข้อมูลผู้ใช้
                val_trans = (
                    locker.get("station_id"), locker_id, phone_owner, locker.get("room_number"),
                    staff_id, 'UNLOCK', 'ส่งคำสั่งเปิดช่องติดตั้งจอ (ไม่ลบข้อมูล)',
                )
                cursor.execute(sql_trans, val_trans)
            else:
                # ตู้ปกติ: เคลียร์ค่าผู้ใช้งานคืนเป็นตู้ว่าง
                sql_locker = """UPDATE lockers
                                SET phone_owner=NULL, pass_code=NULL, status=0, updated_at=NOW()
                                WHERE locker_id=%s"""
                cursor.execute(sql_locker, (locker_id,))

                val_trans = (
                    locker.get("station_id"), locker_id, phone_owner, locker.get("room_number"),
                    staff_id, 'UNLOCK', 'ส่งคำสั่ง MQTT เปิดตู้และคืนค่าว่างสำเร็จ',
                )
                cursor.execute(sql_trans, val_trans)

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
def get_transactions(limit: int = 100, offset: int = 0, admin: str = Depends(get_current_admin)):
    # จำกัดช่วงค่า กัน ?limit=99999999 ลากทั้งตารางจนเซิร์ฟเวอร์ล่ม
    limit = max(1, min(limit, 500))
    offset = max(0, offset)

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
                   u.fullname
            FROM transactions t
            LEFT JOIN users u
              ON u.phone != '' AND t.phone LIKE CONCAT('%', u.phone, '%')
            ORDER BY t.created_at DESC
            LIMIT %s OFFSET %s
        """, (limit, offset))
        txs = cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

    return {"status": "success", "data": txs}


# (Moved up to near schemas for better organization)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=os.getenv("API_HOST", "0.0.0.0"),
        port=int(os.getenv("API_PORT", 8885)),
        reload=True,
    )