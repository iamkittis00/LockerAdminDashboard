"""
เทสต์ flow การทำงานจริง — ไล่ตามลำดับที่ผู้ใช้ทำจริงตั้งแต่ต้นจนจบ

flow A  พนักงานสาขา : ล็อกอิน -> ดูตู้ -> เปิดตู้ -> ตรวจประวัติ
flow B  ล็อกอินครั้งแรก      : ถูกบังคับตั้งรหัสใหม่ -> token เก่าตาย -> ล็อกอินใหม่
flow C  ผู้บริหาร            : ดูภาพรวม -> เลือกสาขา -> เพิ่มพนักงาน -> ปิดใช้งาน
flow D  ช่องติดตั้งจอ        : เปิดได้ แต่ต้องไม่ล้างข้อมูลผู้ฝาก
flow E  ตอนระบบมีปัญหา       : MQTT ส่งไม่ออก / DB ล่ม ต้องไม่เงียบ
"""
import json

from conftest import ADMIN_PASSWORD, CEO_PASSWORD, auth


def login(client, username, password):
    r = client.post("/api/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


# ==========================================
# flow A — พนักงานสาขาเปิดตู้ให้ลูกค้า
# ==========================================
def test_flow_พนักงานเปิดตู้ให้ลูกค้าตั้งแต่ต้นจนจบ(client, db):
    # 1) ล็อกอิน
    session = login(client, "admin1", ADMIN_PASSWORD)
    assert session["role"] == "admin"
    assert session["station_id"] == 1
    assert session["must_change_password"] is False
    headers = bearer(session["access_token"])

    # 2) เข้าหน้าแดชบอร์ด — เห็นเฉพาะตู้สาขาตัวเอง
    lockers = client.get("/api/lockers", headers=headers).json()["data"]
    assert {l["station_id"] for l in lockers} == {1}

    occupied = [l for l in lockers if l["status"] == 1]
    assert len(occupied) == 1
    target = occupied[0]
    assert target["locker_id"] == 2

    # 3) กดดูรายละเอียดตู้ก่อนเปิด
    detail = client.get(f"/api/lockers/{target['locker_id']}", headers=headers).json()
    assert detail[0]["phone_owner"] == "0863841265"
    assert detail[0]["room_number"] == "101"

    # 4) สั่งเปิด
    r = client.post(f"/api/lockers/{target['locker_id']}/unlock", headers=headers)
    assert r.status_code == 200

    # 5) คำสั่งถูกส่งไปที่สาขาที่ถูกต้อง พร้อมชื่อคนสั่ง
    topic, payload = db.published[-1]
    assert topic == "locker/1/web/unlock"
    body = json.loads(payload)
    assert body == {"box_number": 2, "staff_id": 1, "staff_name": "แอดมินสาขา 1"}

    # 6) ตู้กลับเป็นว่าง และข้อมูลลูกค้าถูกล้าง
    after = db.find_locker(2)
    assert after["status"] == 0
    assert after["phone_owner"] is None
    assert after["pass_code"] is None

    # 7) ประวัติบันทึกว่าใครเปิด ตู้ไหน สาขาไหน
    history = client.get("/api/transactions", headers=headers).json()["data"]
    assert len(history) == 1
    assert history[0]["action"] == "UNLOCK"
    assert history[0]["locker_id"] == 2          # เลขช่อง ไม่ใช่ locker_id
    assert history[0]["staff_name"] == "แอดมินสาขา 1"
    assert history[0]["station_name"] == "โรงแรม 1"


def test_flow_เลขช่องในประวัติเป็น_box_number_ไม่ใช่_locker_id(client, db):
    """สาขา 2 มี locker_id 37 แต่พนักงานเห็นเลขช่อง 1 บนตู้"""
    headers = auth(db, "superadmin")
    assert client.post("/api/lockers/37/unlock?station_id=2", headers=headers).status_code == 200

    topic, payload = db.published[-1]
    assert topic == "locker/2/web/unlock"
    assert json.loads(payload)["box_number"] == 1

    history = client.get("/api/transactions?station_id=2", headers=headers).json()["data"]
    assert history[0]["locker_id"] == 1


# ==========================================
# flow B — ล็อกอินครั้งแรก ต้องตั้งรหัสใหม่
# ==========================================
def test_flow_ล็อกอินครั้งแรกต้องตั้งรหัสใหม่แล้ว_token_เก่าตาย(client, db):
    db.find_user(username="admin1")["must_change_password"] = 1

    # 1) ล็อกอิน — backend บอกว่าต้องเปลี่ยนรหัส
    session = login(client, "admin1", ADMIN_PASSWORD)
    assert session["must_change_password"] is True
    headers = bearer(session["access_token"])

    # 2) ยังใช้งานได้ระหว่างที่ยังไม่เปลี่ยน (หน้าเว็บเป็นคนบังคับ modal)
    assert client.get("/api/lockers", headers=headers).status_code == 200

    # 3) ตั้งรหัสใหม่
    r = client.put("/api/admin/password", headers=headers, json={
        "current_password": ADMIN_PASSWORD, "new_password": "รหัสใหม่ที่ยาวพอ",
    })
    assert r.status_code == 200
    assert db.find_user(username="admin1")["must_change_password"] == 0

    # 4) token ใบเดิมตายทันที ต้องล็อกอินใหม่
    assert client.get("/api/lockers", headers=headers).status_code == 401

    # 5) ล็อกอินด้วยรหัสใหม่ผ่าน ส่วนรหัสเก่าใช้ไม่ได้แล้ว
    fresh = login(client, "admin1", "รหัสใหม่ที่ยาวพอ")
    assert fresh["must_change_password"] is False
    assert client.post("/api/login",
                       json={"username": "admin1", "password": ADMIN_PASSWORD}).status_code == 401


def test_flow_พิมพ์รหัสเดิมผิดต้องไม่ถูกเตะออกจากระบบ(client, db):
    session = login(client, "admin1", ADMIN_PASSWORD)
    headers = bearer(session["access_token"])

    r = client.put("/api/admin/password", headers=headers, json={
        "current_password": "จำผิด", "new_password": "รหัสใหม่ที่ยาวพอ",
    })
    assert r.status_code == 400          # 400 = แค่กรอกผิด ไม่ใช่ session ตาย
    assert client.get("/api/lockers", headers=headers).status_code == 200


# ==========================================
# flow C — ผู้บริหารดูภาพรวมแล้วจัดการพนักงาน
# ==========================================
def test_flow_ผู้บริหารเลือกสาขาแล้วจัดการพนักงาน(client, db):
    session = login(client, "superadmin", CEO_PASSWORD)
    assert session["role"] == "ceo"
    assert session["station_id"] is None
    headers = bearer(session["access_token"])

    # 1) หน้าเลือกสาขา — เห็นทุกสาขาพร้อมยอดสรุป ไม่ต้องยิงทีละสาขา
    stations = client.get("/api/stations", headers=headers).json()["data"]
    assert {s["station_id"] for s in stations} == {1, 2}
    station1 = next(s for s in stations if s["station_id"] == 1)
    assert station1["occupied_count"] == 1
    assert station1["staff_count"] == 1        # admin1 คนเดียว (ceo ไม่นับ)

    # 2) เข้าสาขา 1 แล้วดูรายชื่อพนักงาน
    staff = client.get("/api/staff?station_id=1", headers=headers).json()["data"]
    assert [s["username"] for s in staff] == ["admin1"]

    # 3) เพิ่มพนักงานใหม่ — ได้รหัสผ่านสุ่มมาแสดงครั้งเดียว
    created = client.post("/api/staff", headers=headers, json={
        "username": "NewStaff", "fullname": "พนักงานใหม่",
        "phone": "0811111111", "station_id": 1,
    })
    assert created.status_code == 200
    account = created.json()["data"]
    assert account["username"] == "newstaff"   # ถูกลดเป็นตัวพิมพ์เล็ก
    assert len(account["password"]) == 8

    # 4) คนใหม่ล็อกอินได้ และถูกบังคับตั้งรหัสใหม่
    new_session = login(client, "newstaff", account["password"])
    assert new_session["must_change_password"] is True
    assert new_session["station_id"] == 1

    # 5) ยอดพนักงานของสาขาขยับตาม
    stations = client.get("/api/stations", headers=headers).json()["data"]
    assert next(s for s in stations if s["station_id"] == 1)["staff_count"] == 2

    # 6) ปิดใช้งาน แล้วคนนั้นล็อกอินไม่ได้อีก
    assert client.put(f"/api/staff/{account['user_id']}", headers=headers,
                      json={"is_active": False}).status_code == 200
    assert client.post("/api/login", json={
        "username": "newstaff", "password": account["password"],
    }).status_code == 401


def test_flow_รีเซ็ตรหัสผ่านให้พนักงานที่ลืมรหัส(client, db):
    headers = auth(db, "superadmin")

    r = client.post("/api/staff/1/reset-password", headers=headers)
    assert r.status_code == 200
    new_password = r.json()["data"]["password"]

    # รหัสเดิมใช้ไม่ได้ รหัสใหม่ใช้ได้ และถูกบังคับตั้งใหม่อีกรอบ
    assert client.post("/api/login",
                       json={"username": "admin1", "password": ADMIN_PASSWORD}).status_code == 401
    assert login(client, "admin1", new_password)["must_change_password"] is True


def test_flow_ชื่อผู้ใช้ซ้ำถูกปฏิเสธ_ไม่ทับของเดิม(client, db):
    headers = auth(db, "superadmin")
    before = db.find_user(username="admin1")["password"]

    r = client.post("/api/staff", headers=headers, json={
        "username": "admin1", "fullname": "คนใหม่", "phone": "0800000001", "station_id": 1,
    })
    assert r.status_code == 400
    assert db.find_user(username="admin1")["password"] == before


def test_flow_ย้ายพนักงานไปสาขาที่ไม่มีอยู่ไม่ได้(client, db):
    headers = auth(db, "superadmin")
    r = client.put("/api/staff/1", headers=headers, json={"station_id": 999})
    assert r.status_code == 400
    assert db.find_user(user_id=1)["station_id"] == 1


# ==========================================
# flow D — ช่องติดตั้งจอ
# ==========================================
def test_flow_เปิดช่องจอได้แต่ไม่ล้างข้อมูล(client, db):
    """ช่องจอไม่ได้ใช้รับฝากของ เปิดเพื่อเข้าไปดูแลอุปกรณ์เท่านั้น"""
    headers = auth(db, "admin1")
    r = client.post("/api/lockers/3/unlock", headers=headers)
    assert r.status_code == 200

    assert json.loads(db.published[-1][1])["box_number"] == 3
    assert db.transactions[-1]["detail"] == "ส่งคำสั่งเปิดช่องติดตั้งจอ (ไม่ลบข้อมูล)"


def test_flow_is_usable_เป็น_NULL_ถือเป็นตู้ปกติ(client, db):
    """ถ้ามองผิดเป็นช่องจอ ตู้จะค้าง status=1 ตลอดไป"""
    db.find_locker(2)["is_usable"] = None
    headers = auth(db, "admin1")

    assert client.post("/api/lockers/2/unlock", headers=headers).status_code == 200
    assert db.find_locker(2)["status"] == 0
    assert db.find_locker(2)["phone_owner"] is None


# ==========================================
# flow E — ตอนระบบมีปัญหา ต้องไม่เงียบ
# ==========================================
def test_flow_MQTT_ส่งไม่ออก_ต้องไม่แตะฐานข้อมูล(client, db, monkeypatch):
    import main
    monkeypatch.setattr(main, "publish_message", lambda *a: False)

    r = client.post("/api/lockers/2/unlock", headers=auth(db, "admin1"))
    assert r.status_code == 500

    # ประตูไม่ได้เปิด ตู้จึงต้องยังมีของฝากอยู่เหมือนเดิม
    assert db.find_locker(2)["status"] == 1
    assert db.find_locker(2)["phone_owner"] == "0863841265"
    assert db.transactions == []


def test_flow_DB_ล่มหลังเปิดประตู_ต้องตอบ_error_ไม่ใช่_success(client, db, monkeypatch):
    """
    เคสที่เคยพัง: ประตูเปิดไปแล้วแต่ DB ล่ม โค้ดเดิมข้ามเงียบแล้วตอบ success
    ผลคือตู้ค้าง status=1 ตลอดไปโดยไม่มีใครรู้
    """
    import main
    headers = auth(db, "admin1")

    real_connect = db.connect

    # ล่ม "หลังส่ง MQTT ออกไปแล้ว" พอดี — คือจังหวะที่ประตูเปิดแต่ยังไม่ได้บันทึก
    def flaky_connect():
        return None if db.published else real_connect()

    monkeypatch.setattr(main, "get_db_connection", flaky_connect)

    r = client.post("/api/lockers/2/unlock", headers=headers)
    assert r.status_code == 500
    assert "แจ้งผู้ดูแลระบบ" in r.json()["detail"]
    assert db.published, "ประตูเปิดไปแล้วจริง จึงต้องเตือนให้ไปตรวจสถานะตู้"


def test_flow_DB_ล่มตั้งแต่แรก_ล็อกอินไม่ได้แต่ไม่หลุด_stack_trace(client, db):
    db.connect_fails = True
    r = client.post("/api/login", json={"username": "admin1", "password": ADMIN_PASSWORD})
    assert r.status_code == 500
    assert "Traceback" not in r.text
    assert "main.py" not in r.text
