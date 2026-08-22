from fastapi import FastAPI, HTTPException, Depends
from typing import Optional
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
import bcrypt
import mysql.connector
import os
import paho.mqtt.client as mqtt
import time
import threading
import jwt
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

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_admin(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token credentials")
        return username
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token or unauthorized")

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
    except:
        return 1
    finally:
        cursor.close()
        conn.close()

# ==========================================
# SCHEMAS & API ROUTES
# ==========================================
class UserBase(BaseModel):
    room_number: str
    fullname: str
    phone: str
    custom_max_days: Optional[int] = None

class LoginData(BaseModel):
    username: str
    password: str

class SettingsUpdate(BaseModel):
    max_deposit_days: int

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

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
            cursor.execute("SELECT MIN(DATE(timestamp)) as min_date FROM transactions")
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
            SELECT DATE(timestamp) as date, 
                   COUNT(CASE WHEN action IN ('deposit' , 'ASSIGN') THEN 1 END) as deposits,
                   COUNT(CASE WHEN action IN ('withdraw', 'UNLOCK', 'DELETE') THEN 1 END) as withdraws
            FROM transactions
            WHERE DATE(timestamp) >= %s
            GROUP BY DATE(timestamp)
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
    
    cursor.execute("SELECT password FROM admins WHERE username = %s LIMIT 1", (admin,))
    user_record = cursor.fetchone()
    
    if not user_record:
        cursor.close()
        conn.close()
        raise HTTPException(status_code=404, detail="Admin not found")
        
    db_pass = user_record['password']
    
    is_valid = False
    if db_pass.startswith("$2") or db_pass.startswith("$2b$"):
        is_valid = verify_password(data.current_password, db_pass)
    else:
        is_valid = (data.current_password == db_pass)
        
    if not is_valid:
        cursor.close()
        conn.close()
        raise HTTPException(status_code=401, detail="รหัสผ่านปัจจุบันไม่ถูกต้อง")
        
    new_hashed_pw = get_password_hash(data.new_password)
    
    try:
        cursor.execute("UPDATE admins SET password=%s WHERE username=%s", (new_hashed_pw, admin))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail="Failed to update password")
    finally:
        cursor.close()
        conn.close()
        
    return {"status": "success", "message": "เปลี่ยนรหัสผ่านสำเร็จ"}

@app.post("/api/login")
def login(data: LoginData):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    
    # 1. ค้นหาผู้ใช้จาก username อย่างเดียว
    cursor.execute("SELECT * FROM admins WHERE username=%s AND active=1", (data.username,))
    admin = cursor.fetchone()
    
    if not admin:
        cursor.close()
        conn.close()
        raise HTTPException(status_code=401, detail="ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง")
        
    # 2. ตรวจสอบรหัสผ่าน (รองรับทั้งแบบ Hashed และ Plaintext)
    db_password = admin["password"]
    is_valid = False
    
    if db_password.startswith("$2") or db_password.startswith("$2b$"):
        # รหัสผ่านใน DB ถูกเข้ารหัสแล้วด้วย Bcrypt
        is_valid = verify_password(data.password, db_password)
    else:
        # รหัสผ่านยังเป็นข้อความธรรมดา (admin123)
        if db_password == data.password:
            is_valid = True
            # ระบบจะ "เข้ารหัส" (Bcrypt) แล้วเซฟทับข้อความธรรมดาลงฐานข้อมูลให้อัตโนมัติทันที
            new_hashed_pw = get_password_hash(data.password)
            try:
                cursor.execute("UPDATE admins SET password=%s WHERE admin_id=%s", (new_hashed_pw, admin["admin_id"]))
                conn.commit()
            except Exception as e:
                pass # ปล่อยผ่านไปได้เลย

    cursor.close()
    conn.close()

    if not is_valid:
        raise HTTPException(status_code=401, detail="ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง")
        
    access_token = create_access_token(data={"sub": admin["username"]})
    return {
        "status": "success",
        "access_token": access_token,
        "token_type": "bearer",
        "username": admin["username"]
    }

@app.get("/api/users")
def get_users(admin: str = Depends(get_current_admin)):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    
    max_days = get_max_deposit_days()
    cursor = conn.cursor(dictionary=True)
    
    # ดึงรายชื่อผู้ใช้พร้อมสถานะล็อกเกอร์ (ถ้ามี)
    sql = """
        SELECT u.*, l.status as locker_status, l.deposit_time, l.locker_id
        FROM users u
        LEFT JOIN lockers l ON u.phone = l.phone_owner
        ORDER BY u.created_at DESC
    """
    cursor.execute(sql)
    users = cursor.fetchall()
    
    now = datetime.now()
    for user in users:
        # Use custom_max_days if set, otherwise use global max_days
        user_max_days = user.get('custom_max_days') if user.get('custom_max_days') is not None else max_days
        
        is_overdue = False
        if user.get('locker_status') == 1 and user.get('deposit_time'):
            dep_time = user['deposit_time']
            if isinstance(dep_time, str):
                try:
                    dep_time = datetime.strptime(dep_time, "%Y-%m-%d %H:%M:%S")
                except:
                    dep_time = now
            diff = now - dep_time
            is_overdue = diff.days >= user_max_days
        user['is_overdue'] = is_overdue

    cursor.close()
    conn.close()
    return {"status": "success", "data": users}

@app.post("/api/users")
def create_user(user: UserBase, admin: str = Depends(get_current_admin)):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor()
    try:
        cursor.execute("DESCRIBE users")
        cols = [c[0] for c in cursor.fetchall()]
        if 'custom_max_days' not in cols:
            cursor.execute("ALTER TABLE users ADD COLUMN custom_max_days INT DEFAULT NULL")
            conn.commit()

        sql = """INSERT INTO users (room_number, fullname, phone, passcode, note, active, custom_max_days) 
                 VALUES (%s, %s, %s, %s, %s, %s, %s)"""
        val = (user.room_number, user.fullname, user.phone, "", "User note", 1, user.custom_max_days)
        cursor.execute(sql, val)
        conn.commit()
    except Exception as e:
        conn.rollback()
        error_msg = str(e)
        if "Duplicate entry" in error_msg and "phone" in error_msg:
            raise HTTPException(status_code=400, detail="สทช.102: ไม่สามารถบันทึกได้ เนื่องจากเบอร์โทรศัพท์นี้ถูกลงทะเบียนไว้ในระบบแล้ว!")
        raise HTTPException(status_code=400, detail=error_msg)
    finally:
        cursor.close()
        conn.close()
    return {"status": "success", "message": "เพิ่มข้อมูลผู้ใช้งานสำเร็จ"}

@app.put("/api/users/{user_id}")
def update_user(user_id: int, user: UserBase, admin: str = Depends(get_current_admin)):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT phone FROM users WHERE user_id=%s", (user_id,))
        old_user = cursor.fetchone()
        old_phone = old_user[0] if old_user else None

        sql = """UPDATE users 
                 SET room_number=%s, fullname=%s, phone=%s, custom_max_days=%s 
                 WHERE user_id=%s"""
        val = (user.room_number, user.fullname, user.phone, user.custom_max_days, user_id)
        cursor.execute(sql, val)
        
        if old_phone and old_phone != user.phone:
            # Sync the new phone to any lockers they currently own
            cursor.execute("UPDATE lockers SET phone_owner=%s WHERE phone_owner=%s", (user.phone, old_phone))
            
        conn.commit()
    except Exception as e:
        conn.rollback()
        error_msg = str(e)
        if "Duplicate entry" in error_msg and "phone" in error_msg:
            raise HTTPException(status_code=400, detail="สทช.102: ไม่สามารถบันทึกได้ เนื่องจากเบอร์โทรศัพท์นี้ถูกลงทะเบียนไว้ในระบบแล้ว!")
        raise HTTPException(status_code=400, detail=error_msg)
    finally:
        cursor.close()
        conn.close()
    return {"status": "success", "message": "อัปเดตข้อมูลสำเร็จ"}

@app.delete("/api/users/{user_id}")
def delete_user(user_id: int, admin: str = Depends(get_current_admin)):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT phone FROM users WHERE user_id = %s", (user_id,))
        user_row = cursor.fetchone()
        phone = user_row.get('phone') if user_row else None
        
        if phone:
            cursor.execute("SELECT locker_id FROM lockers WHERE phone_owner=%s", (phone,))
            owned_lockers = cursor.fetchall()
            for l in owned_lockers:
                l_id = l.get('locker_id') if isinstance(l, dict) else l[0]
                cursor.execute("UPDATE lockers SET phone_owner=NULL, temp_pass=NULL, status=0, update_time=NOW() WHERE locker_id=%s", (l_id,))
                
                sql_trans = """INSERT INTO transactions (locker_id, user_id, phone, action, detail)
                               VALUES (%s, NULL, %s, %s, %s)"""
                val_trans = (l_id, phone, 'DELETE', 'ลบผู้ใช้งานและปลดตู้ล็อกเกอร์คืน')
                cursor.execute(sql_trans, val_trans)
                
        # Prevent 1451 FK Error by detaching user_id from previous history logs
        cursor.execute("UPDATE transactions SET user_id = NULL WHERE user_id = %s", (user_id,))
        
        sql = "DELETE FROM users WHERE user_id = %s"
        cursor.execute(sql, (user_id,))
            
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        conn.close()
    return {"status": "success", "message": "ลบข้อมูลสำเร็จ"}

@app.get("/api/lockers")
def get_lockers(admin: str = Depends(get_current_admin)):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM lockers ORDER BY locker_id ASC")
    lockers = cursor.fetchall()
    
    max_days = get_max_deposit_days()
    now = datetime.now()
    
    for locker in lockers:
        if locker['status'] == 1 and locker['deposit_time']:
            dep_time = locker['deposit_time']
            # Ensure dep_time is datetime
            if isinstance(dep_time, str):
                try:
                    dep_time = datetime.strptime(dep_time, "%Y-%m-%d %H:%M:%S")
                except:
                    dep_time = now
            
            diff = now - dep_time
            locker['is_overdue'] = diff.days >= max_days
            locker['days_used'] = diff.days
        else:
            locker['is_overdue'] = False
            locker['days_used'] = 0
            
    cursor.close()
    conn.close()
    return lockers

@app.get("/api/lockers/{locker_id}")
def get_locker_detail(locker_id: int, admin: str = Depends(get_current_admin)):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM lockers WHERE locker_id=%s", (locker_id,))
    data = cursor.fetchall()
    cursor.close()
    conn.close()
    return data

@app.post("/api/unlock/{payload}")
def unlock_hardware_and_release(payload: str, admin: str = Depends(get_current_admin)):
    if "," in payload:
        locker_id_str, phone_owner = payload.split(",", 1)
        locker_id = int(locker_id_str)
    else:
        locker_id = int(payload)
        phone_owner = None

    import json
    topic = "gsm_locker/box/unlock"
    
    if locker_id == 4:
        phone_val = "0"
    else:
        phone_val = phone_owner if phone_owner else "0000000000"
        
    payload_dict = {
        "locker_id": locker_id,
        "phone": phone_val,
        "action": "withdraw"
    }
    message = json.dumps(payload_dict)
    publish_success = publish_message(topic, message)

    if not publish_success:
        raise HTTPException(status_code=500, detail="ไม่สามารถส่งคำสั่ง MQTT ไปที่ตู้ล็อคเกอร์ได้")

    conn = get_db_connection()
    if conn:
        cursor = conn.cursor(dictionary=True)
        try:
            if locker_id == 4:
                # กรณีตู้ 4 ให้แค่บันทึกประวัติการเปิดตู้ แต่ไม่ลบค่าผู้ใช้งาน
                sql_trans = """INSERT INTO transactions (locker_id, user_id, phone, action, detail)
                               VALUES (%s, NULL, %s, %s, %s)"""
                val_trans = (locker_id, phone_owner, 'UNLOCK', 'ส่งคำสั่งเปิดตู้พิเศษ (เบอร์ 4) โดยไม่ลบข้อมูล')
                cursor.execute(sql_trans, val_trans)
            else:
                # ตู้ปกติให้เคลียร์ค่าผู้ใช้งานด้วย
                sql_locker = """UPDATE lockers 
                                SET phone_owner=NULL, temp_pass=NULL, status=0, update_time=NOW()
                                WHERE locker_id=%s"""
                cursor.execute(sql_locker, (locker_id,))
                
                sql_trans = """INSERT INTO transactions (locker_id, user_id, phone, action, detail)
                               VALUES (%s, NULL, %s, %s, %s)"""
                val_trans = (locker_id, phone_owner, 'UNLOCK', 'ส่งคำสั่ง MQTT เปิดตู้และคืนค่าว่างสำเร็จ')
                cursor.execute(sql_trans, val_trans)
            
            conn.commit()
        except Exception as e:
            conn.rollback()
            print("Database Update Auto-Release Error:", e)
        finally:
            cursor.close()
            conn.close()
            
    return {"status": "success", "message": f"สั่งเปิดล็อกเกอร์หมายเลข {locker_id} และอัปเดตระบบแล้ว"}

@app.get("/api/transactions")
def get_transactions(limit: int = 100, offset: int = 0, admin: str = Depends(get_current_admin)):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    sql = """
        SELECT t.*, u.fullname 
        FROM transactions t
        LEFT JOIN users u 
          ON u.phone != '' AND t.phone LIKE CONCAT('%', u.phone, '%')
        ORDER BY t.timestamp DESC 
        LIMIT %s OFFSET %s
    """
    cursor.execute(sql, (limit, offset))
    txs = cursor.fetchall()
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