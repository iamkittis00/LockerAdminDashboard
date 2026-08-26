"""
เทสต์ด่านความปลอดภัย — เน้นว่า "ใครทำอะไรไม่ได้บ้าง"

แบ่งเป็น 5 ด่านตามลำดับที่ request วิ่งผ่านจริง:
  1. ไม่มี token / token ปลอม            -> 401
  2. token ใช้ได้ แต่บัญชีใช้ไม่ได้แล้ว   -> 401/403
  3. ข้ามสาขา                            -> 403
  4. ข้าม role                           -> 403
  5. rate limit + ข้อมูลที่ห้ามหลุด
"""
import time

import jwt
import pytest

import main
from conftest import ADMIN_PASSWORD, CEO_PASSWORD, auth, token_for

# endpoint ที่ต้องล็อกอินก่อนทั้งหมด (method, path)
PROTECTED = [
    ("get", "/api/me"),
    ("get", "/api/stations"),
    ("get", "/api/settings"),
    ("put", "/api/settings"),
    ("put", "/api/admin/password"),
    ("get", "/api/lockers"),
    ("get", "/api/lockers/1"),
    ("post", "/api/lockers/1/unlock"),
    ("get", "/api/transactions"),
    ("get", "/api/staff"),
    ("post", "/api/staff"),
    ("put", "/api/staff/1"),
    ("post", "/api/staff/1/reset-password"),
]


# ==========================================
# ด่าน 1 — ไม่มี token / token ปลอม
# ==========================================
@pytest.mark.parametrize("method,path", PROTECTED)
def test_ไม่มี_token_เข้าไม่ได้สักเส้นทาง(client, method, path):
    assert getattr(client, method)(path).status_code == 401


@pytest.mark.parametrize("method,path", PROTECTED)
def test_token_มั่วเข้าไม่ได้(client, method, path):
    r = getattr(client, method)(path, headers={"Authorization": "Bearer not-a-token"})
    assert r.status_code == 401


def test_token_ที่เซ็นด้วยกุญแจอื่นใช้ไม่ได้(client, db):
    forged = jwt.encode(
        {"sub": "admin1", "ver": "x" * 16, "exp": time.time() + 3600},
        "กุญแจของคนร้าย" * 4, algorithm="HS256",
    )
    r = client.get("/api/lockers", headers={"Authorization": f"Bearer {forged}"})
    assert r.status_code == 401


def test_token_หมดอายุใช้ไม่ได้(client, db):
    user = db.find_user(username="admin1")
    expired = jwt.encode(
        {
            "sub": "admin1",
            "ver": main.password_token_version(user["password"]),
            "exp": time.time() - 1,
        },
        main.SECRET_KEY, algorithm="HS256",
    )
    r = client.get("/api/lockers", headers={"Authorization": f"Bearer {expired}"})
    assert r.status_code == 401
    assert "หมดอายุ" in r.json()["detail"]


def test_อายุ_token_เท่ากับ_SESSION_MAX_HOURS(db):
    """หน้าเว็บอ่าน exp ตัวนี้ไปบังคับ ต้องตรงกับที่ตั้งใจ (24 ชม.)"""
    token = token_for(db, "admin1")
    payload = jwt.decode(token, main.SECRET_KEY, algorithms=["HS256"])
    lifetime_hours = (payload["exp"] - payload["iat"]) / 3600
    assert lifetime_hours == pytest.approx(main.SESSION_MAX_HOURS, abs=0.01)


def test_แก้_sub_ใน_token_ให้เป็นคนอื่นไม่ได้(client, db):
    """ไม่ได้เซ็นใหม่ = ลายเซ็นไม่ตรง ถูกปฏิเสธตั้งแต่ decode"""
    token = token_for(db, "admin1")
    header, payload, _ = token.split(".")
    r = client.get("/api/lockers", headers={"Authorization": f"Bearer {header}.{payload}.fake"})
    assert r.status_code == 401


# ==========================================
# ด่าน 2 — token ถูกต้อง แต่บัญชีใช้ไม่ได้แล้ว
# ==========================================
def test_เปลี่ยนรหัสผ่านแล้ว_token_เก่าตายทันที(client, db):
    headers = auth(db, "admin1")
    assert client.get("/api/lockers", headers=headers).status_code == 200

    db.find_user(username="admin1")["password"] = main.get_password_hash("รหัสใหม่-12345")

    r = client.get("/api/lockers", headers=headers)
    assert r.status_code == 401
    assert "รหัสผ่านถูกเปลี่ยน" in r.json()["detail"]


def test_ปิดบัญชีแล้ว_token_เก่าตายทันที(client, db):
    headers = auth(db, "admin1")
    db.find_user(username="admin1")["is_active"] = 0

    r = client.get("/api/lockers", headers=headers)
    assert r.status_code == 401


def test_เปลี่ยน_role_เป็นค่าที่ไม่รู้จักแล้วใช้ไม่ได้(client, db):
    headers = auth(db, "admin1")
    db.find_user(username="admin1")["role"] = "guest"

    r = client.get("/api/lockers", headers=headers)
    assert r.status_code == 403


def test_admin_ที่ไม่มีสาขา_ถูกปิดประตูไว้ก่อน(client, db):
    """fail closed — ดีกว่าเผลอปล่อยให้เห็นทุกสาขา"""
    headers = auth(db, "admin1")
    db.find_user(username="admin1")["station_id"] = None

    r = client.get("/api/lockers", headers=headers)
    assert r.status_code == 403
    assert "ยังไม่ได้ผูกกับสาขา" in r.json()["detail"]


def test_ย้ายสาขาแล้วเห็นข้อมูลสาขาใหม่ทันทีโดยไม่ต้องล็อกอินใหม่(client, db):
    headers = auth(db, "admin1")
    db.find_user(username="admin1")["station_id"] = 2

    lockers = client.get("/api/lockers", headers=headers).json()["data"]
    assert {l["station_id"] for l in lockers} == {2}


# ==========================================
# ด่าน 3 — ข้ามสาขา
# ==========================================
def test_admin_เห็นเฉพาะตู้สาขาตัวเอง(client, db):
    lockers = client.get("/api/lockers", headers=auth(db, "admin1")).json()["data"]
    assert {l["station_id"] for l in lockers} == {1}


@pytest.mark.parametrize("path", [
    "/api/lockers?station_id=2",
    "/api/transactions?station_id=2",
    "/api/staff?station_id=2",
    "/api/lockers/37?station_id=2",
])
def test_admin_ขอข้อมูลสาขาอื่นตรงๆ_ถูกปฏิเสธ(client, db, path):
    r = client.get(path, headers=auth(db, "admin1"))
    assert r.status_code == 403
    assert "สาขาอื่น" in r.json()["detail"]


def test_admin_สั่งเปิดตู้สาขาอื่นไม่ได้(client, db):
    r = client.post("/api/lockers/37/unlock?station_id=2", headers=auth(db, "admin1"))
    assert r.status_code == 403
    assert db.published == []          # ต้องไม่มีคำสั่งหลุดไปถึงตู้
    assert db.find_locker(37)["status"] == 1   # ตู้สาขา 2 ต้องไม่ถูกแตะ


def test_admin_เดา_locker_id_ของสาขาอื่นไม่เจอ(client, db):
    """ไม่ส่ง station_id มาก็ยังเข้าไม่ถึง เพราะ query ผูกสาขาตัวเองไว้แล้ว"""
    r = client.post("/api/lockers/37/unlock", headers=auth(db, "admin1"))
    assert r.status_code == 404
    assert db.published == []
    assert db.find_locker(37)["status"] == 1


def test_admin_ดูรายละเอียดตู้สาขาอื่นไม่ได้แม้ไม่ระบุสาขา(client, db):
    r = client.get("/api/lockers/37", headers=auth(db, "admin1"))
    assert r.status_code == 200
    assert r.json() == []              # ไม่เจอ = ไม่หลุดเบอร์/รหัสผ่านลูกค้า


def test_ceo_ต้องบอกว่าจะดูสาขาไหน(client, db):
    r = client.get("/api/lockers", headers=auth(db, "superadmin"))
    assert r.status_code == 400
    assert "station_id" in r.json()["detail"]


def test_ceo_ดูได้ทุกสาขา(client, db):
    headers = auth(db, "superadmin")
    for station_id in (1, 2):
        lockers = client.get(f"/api/lockers?station_id={station_id}", headers=headers).json()["data"]
        assert {l["station_id"] for l in lockers} == {station_id}


def test_ceo_เห็นทุกสาขาในรายชื่อ_แต่_admin_เห็นแค่ของตัวเอง(client, db):
    ceo = client.get("/api/stations", headers=auth(db, "superadmin")).json()["data"]
    admin = client.get("/api/stations", headers=auth(db, "admin1")).json()["data"]
    assert {s["station_id"] for s in ceo} == {1, 2}
    assert {s["station_id"] for s in admin} == {1}


# ==========================================
# ด่าน 4 — ข้าม role
# ==========================================
CEO_ONLY = [
    ("put", "/api/settings", {"max_deposit_days": 3}),
    ("post", "/api/staff", {"username": "newstaff", "fullname": "พนักงานใหม่",
                            "phone": "0811111111", "station_id": 1}),
    ("put", "/api/staff/2", {"fullname": "แก้ชื่อ"}),
    ("post", "/api/staff/2/reset-password", None),
]


@pytest.mark.parametrize("method,path,body", CEO_ONLY)
def test_admin_แตะส่วนของผู้บริหารไม่ได้(client, db, method, path, body):
    kwargs = {"headers": auth(db, "admin1")}
    if body is not None:
        kwargs["json"] = body
    r = getattr(client, method)(path, **kwargs)
    assert r.status_code == 403
    assert "ผู้บริหาร" in r.json()["detail"]


def test_สร้างบัญชีผู้บริหารผ่านหน้าเว็บไม่ได้(client, db):
    """กันยกระดับสิทธิ์ — role ถูก hardcode เป็น admin เสมอ"""
    r = client.post("/api/staff", headers=auth(db, "superadmin"), json={
        "username": "another-ceo", "fullname": "อยากเป็นซีอีโอ",
        "phone": "0822222222", "station_id": 1, "role": "ceo",
    })
    assert r.status_code == 200
    assert db.find_user(username="another-ceo")["role"] == "admin"


def test_ceo_แก้บัญชี_ceo_ด้วยกันไม่ได้(client, db):
    r = client.put("/api/staff/9", headers=auth(db, "superadmin"), json={"is_active": False})
    assert r.status_code == 403
    assert db.find_user(user_id=9)["is_active"] == 1


def test_ceo_รีเซ็ตรหัสผ่านบัญชี_ceo_ไม่ได้(client, db):
    before = db.find_user(user_id=9)["password"]
    r = client.post("/api/staff/9/reset-password", headers=auth(db, "superadmin"))
    assert r.status_code == 403
    assert db.find_user(user_id=9)["password"] == before


# ==========================================
# ด่าน 5 — rate limit และข้อมูลที่ห้ามหลุด
# ==========================================
def test_เดารหัสผ่านรัวๆ_ถูกล็อก(client, db):
    for _ in range(main.LOGIN_MAX_ATTEMPTS):
        r = client.post("/api/login", json={"username": "admin1", "password": "ผิด"})
        assert r.status_code == 401

    r = client.post("/api/login", json={"username": "admin1", "password": ADMIN_PASSWORD})
    assert r.status_code == 429
    assert "รอ" in r.json()["detail"]


def test_ล็อกอินสำเร็จล้างตัวนับ(client, db):
    for _ in range(main.LOGIN_MAX_ATTEMPTS - 1):
        client.post("/api/login", json={"username": "admin1", "password": "ผิด"})

    assert client.post("/api/login",
                       json={"username": "admin1", "password": ADMIN_PASSWORD}).status_code == 200
    # นับใหม่ตั้งแต่ต้น ไม่ถูกล็อกจากของเก่า
    for _ in range(main.LOGIN_MAX_ATTEMPTS - 1):
        assert client.post("/api/login",
                           json={"username": "admin1", "password": "ผิด"}).status_code == 401


def test_ล็อกคนละ_username_ไม่กระทบกัน(client, db):
    for _ in range(main.LOGIN_MAX_ATTEMPTS):
        client.post("/api/login", json={"username": "admin1", "password": "ผิด"})

    r = client.post("/api/login", json={"username": "admin2", "password": ADMIN_PASSWORD})
    assert r.status_code == 200


def test_บัญชีมีอยู่จริงหรือไม่_ตอบข้อความเดียวกัน(client, db):
    """กันไล่เดาว่ามี username ไหนอยู่ในระบบบ้าง"""
    a = client.post("/api/login", json={"username": "admin1", "password": "ผิด"})
    b = client.post("/api/login", json={"username": "ไม่มีคนนี้", "password": "ผิด"})
    assert a.status_code == b.status_code == 401
    assert a.json()["detail"] == b.json()["detail"]


def test_บัญชีที่ถูกปิดใช้งานล็อกอินไม่ได้(client, db):
    db.find_user(username="admin1")["is_active"] = 0
    r = client.post("/api/login", json={"username": "admin1", "password": ADMIN_PASSWORD})
    assert r.status_code == 401


@pytest.mark.parametrize("username,password", [
    ("admin1", ADMIN_PASSWORD),
    ("superadmin", CEO_PASSWORD),
])
def test_login_ไม่คืน_password_hash(client, db, username, password):
    body = client.post("/api/login", json={"username": username, "password": password}).json()
    assert "password" not in body
    assert "$2b$" not in str(body)


def test_รายชื่อพนักงานไม่มี_password_hash(client, db):
    body = client.get("/api/staff?station_id=1", headers=auth(db, "superadmin")).json()
    assert body["data"], "ควรมีพนักงานอย่างน้อยหนึ่งคน"
    assert all("password" not in row for row in body["data"])
    assert "$2b$" not in str(body)


def test_เปลี่ยนรหัสผ่านผิด_ต้องเป็น_400_ไม่ใช่_401(client, db):
    """401 = หน้าเว็บเตะออกจากระบบทันที ทั้งที่แค่พิมพ์รหัสเดิมผิด"""
    r = client.put("/api/admin/password", headers=auth(db, "admin1"), json={
        "current_password": "ผิด", "new_password": "รหัสใหม่ยาวพอ",
    })
    assert r.status_code == 400


def test_รหัสผ่านไทยยาวๆ_ต้องได้_400_ไม่ใช่_500(client, db):
    """bcrypt 5.0 raise ValueError เมื่อเกิน 72 ไบต์ — ไทย 25 ตัว = 75 ไบต์
    ถ้าไม่เช็คก่อน ผู้ใช้จะเจอ 500 โดยไม่รู้ว่าตั้งรหัสแบบไหนถึงจะผ่าน"""
    r = client.put("/api/admin/password", headers=auth(db, "admin1"), json={
        "current_password": ADMIN_PASSWORD, "new_password": "ก" * 25,
    })
    assert r.status_code == 400
    assert "ไบต์" in r.json()["detail"]
    # รหัสเดิมยังใช้ได้ ไม่ถูกแตะ
    assert client.post("/api/login",
                       json={"username": "admin1", "password": ADMIN_PASSWORD}).status_code == 200


def test_รหัสผ่านไทยที่ไม่เกิน_72_ไบต์ตั้งได้ปกติ(client, db):
    r = client.put("/api/admin/password", headers=auth(db, "admin1"), json={
        "current_password": ADMIN_PASSWORD, "new_password": "รหัสลับ-๑๒๓",   # 8+ ตัว แต่ < 72 ไบต์
    })
    assert r.status_code == 200


@pytest.mark.parametrize("bad_username", [
    "มีภาษาไทย", "has space", "UPPER CASE!", "semi;colon", "a" * 51, "ab",
])
def test_ชื่อผู้ใช้พนักงานที่ไม่ตรงกฎถูกปฏิเสธ(client, db, bad_username):
    r = client.post("/api/staff", headers=auth(db, "superadmin"), json={
        "username": bad_username, "fullname": "ทดสอบ",
        "phone": "0800000009", "station_id": 1,
    })
    assert r.status_code in (400, 422), bad_username
    assert db.find_user(username=bad_username.strip().lower()) is None


def test_ชื่อผู้ใช้ที่ถูกกฎยังสร้างได้(client, db):
    r = client.post("/api/staff", headers=auth(db, "superadmin"), json={
        "username": "front.desk_01", "fullname": "พนักงานหน้าเคาน์เตอร์",
        "phone": "0800000010", "station_id": 1,
    })
    assert r.status_code == 200


def test_รหัสผ่านใหม่สั้นเกินไปถูกปฏิเสธที่ฝั่ง_server(client, db):
    r = client.put("/api/admin/password", headers=auth(db, "admin1"), json={
        "current_password": ADMIN_PASSWORD, "new_password": "sh0rt",
    })
    assert r.status_code == 422


def test_ตั้งวันฝากสูงสุดเป็นศูนย์หรือติดลบไม่ได้(client, db):
    """0 = ตู้ทุกใบขึ้นเกินกำหนดทันทีทั้งระบบ"""
    for bad in (0, -1, 400):
        r = client.put("/api/settings", headers=auth(db, "superadmin"),
                       json={"max_deposit_days": bad})
        assert r.status_code == 422, bad
    assert db.settings["max_deposit_days"] == "1"


def test_ดึงประวัติทีละมากๆ_ถูกจำกัดเพดาน(client, db):
    """กัน ?limit=99999999 ลากทั้งตาราง"""
    for i in range(3):
        db.transactions.append({
            "transaction_id": i + 1, "created_at": "2026-08-26 10:00:00",
            "station_id": 1, "box_number": 1, "phone": None, "room_number": None,
            "staff_id": 1, "action": "web_unlock", "detail": "-",
        })
    r = client.get("/api/transactions?limit=99999999&offset=-5", headers=auth(db, "admin1"))
    assert r.status_code == 200
    assert len(r.json()["data"]) == 3
