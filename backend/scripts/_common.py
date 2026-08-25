# Helper กลางของสคริปต์ใน backend/scripts/
# ตั้งใจไม่ import main.py เพราะ main.py ต่อ MQTT และ require secret อื่นๆ
# ที่สคริปต์พวกนี้ไม่เกี่ยวด้วยตั้งแต่ตอน import

import os
import sys
import secrets

import bcrypt
import mysql.connector

# กัน terminal ของ Windows แสดงข้อความไทยเพี้ยน (codepage ไม่ใช่ UTF-8 โดย default)
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8")

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


def require_env(name):
    value = os.getenv(name)
    if not value:
        print(f"ขาดตัวแปร {name} ใน backend/.env", file=sys.stderr)
        sys.exit(1)
    return value


def get_connection():
    try:
        return mysql.connector.connect(
            host=os.getenv("DB_HOST", "localhost"),
            user=require_env("DB_USER"),
            password=require_env("DB_PASSWORD"),
            database=require_env("DB_NAME"),
            autocommit=False,
        )
    except mysql.connector.Error as err:
        print(f"เชื่อมต่อฐานข้อมูลไม่สำเร็จ: {err}", file=sys.stderr)
        sys.exit(1)


def generate_password(length=8):
    # ตัดตัวที่สับสนกันบ่อยออก (0/O, 1/l/I)
    alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def hash_password(plain):
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def get_columns(cursor, table):
    """คืน dict ชื่อคอลัมน์ -> {IS_NULLABLE, COLUMN_DEFAULT} ของตารางในฐานข้อมูลปัจจุบัน"""
    cursor.execute(
        "SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT "
        "FROM INFORMATION_SCHEMA.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s",
        (table,),
    )
    return {row["COLUMN_NAME"]: row for row in cursor.fetchall()}


def ensure_column(cursor, table, column, ddl):
    """เพิ่มคอลัมน์ถ้ายังไม่มี — รันซ้ำได้ปลอดภัย (idempotent)"""
    if column not in get_columns(cursor, table):
        print(f"เพิ่มคอลัมน์ {table}.{column} ...")
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {ddl}")
