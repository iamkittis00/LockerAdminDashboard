"""
ตั้งค่าให้ import main.py ได้โดยไม่ต้องมี MySQL/MQTT จริง

main.py อ่าน env ตั้งแต่ตอน import (fail fast) จึงต้อง set ให้ครบ "ก่อน" import
"""
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault("DB_HOST", "127.0.0.1")
os.environ.setdefault("DB_USER", "test")
os.environ.setdefault("DB_PASSWORD", "test")
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("JWT_SECRET_KEY", "t" * 64)
os.environ.setdefault("MQTT_BROKER", "127.0.0.1")
os.environ.setdefault("MQTT_USERNAME", "test")
os.environ.setdefault("MQTT_PASSWORD", "test")
os.environ.setdefault("ALLOWED_ORIGINS", "https://locker-admin.donaus-dev.net")
os.environ.setdefault("SESSION_MAX_HOURS", "24")

import pytest                      # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main                        # noqa: E402
from fake_db import FakeDB         # noqa: E402

# รหัสผ่านของบัญชีทดสอบ — hash ครั้งเดียวแล้วใช้ซ้ำ (bcrypt ช้าเกินกว่าจะ hash ทุกเทสต์)
ADMIN_PASSWORD = "admin-password-1"
CEO_PASSWORD = "ceo-password-1"
ADMIN_HASH = main.get_password_hash(ADMIN_PASSWORD)
CEO_HASH = main.get_password_hash(CEO_PASSWORD)


@pytest.fixture
def db(monkeypatch):
    """ฐานข้อมูลจำลอง 2 สาขา + admin สาขา 1, admin สาขา 2, ceo หนึ่งคน"""
    fake = FakeDB()

    fake.add_station(1, "โรงแรม 1")
    fake.add_station(2, "โรงแรม 2")

    fake.add_user(user_id=1, username="admin1", fullname="แอดมินสาขา 1",
                  role="admin", station_id=1, password=ADMIN_HASH)
    fake.add_user(user_id=2, username="admin2", fullname="แอดมินสาขา 2",
                  role="admin", station_id=2, password=ADMIN_HASH)
    fake.add_user(user_id=9, username="superadmin", fullname="ผู้บริหาร",
                  role="ceo", station_id=None, password=CEO_HASH)

    # สาขา 1: ตู้ 1 ว่าง, ตู้ 2 มีของฝาก, ตู้ 3 เป็นช่องจอ
    fake.add_locker(locker_id=1, station_id=1, box_number=1)
    fake.add_locker(locker_id=2, station_id=1, box_number=2, status=1,
                    phone_owner="0863841265", pass_code="4821",
                    room_number="101", deposit_time="2026-08-25 10:00:00")
    fake.add_locker(locker_id=3, station_id=1, box_number=3, is_usable=0)
    # สาขา 2: locker_id ต่อจากสาขา 1 แต่ box_number เริ่มใหม่ที่ 1
    fake.add_locker(locker_id=37, station_id=2, box_number=1, status=1,
                    phone_owner="0899999999", pass_code="1111",
                    room_number="201", deposit_time="2026-08-25 10:00:00")

    monkeypatch.setattr(main, "get_db_connection", fake.connect)
    # ไม่ยิง MQTT จริง — เก็บไว้ตรวจว่าส่ง topic/payload อะไรออกไป
    fake.published = []

    def fake_publish(topic, message):
        fake.published.append((topic, message))
        return True

    monkeypatch.setattr(main, "publish_message", fake_publish)
    # ตารางถูก "สร้าง" แล้วในโลกจำลอง ไม่ต้องให้ flag ค้างข้ามเทสต์
    monkeypatch.setattr(main, "_settings_table_ready", False)
    main._login_failures.clear()
    return fake


@pytest.fixture
def client(db):
    return TestClient(main.app)


def token_for(db, username):
    """ออก token ให้ผู้ใช้คนนั้นตามสถานะรหัสผ่านปัจจุบัน"""
    user = db.find_user(username=username)
    return main.create_access_token(user["username"], user["password"])


def auth(db, username):
    return {"Authorization": f"Bearer {token_for(db, username)}"}
