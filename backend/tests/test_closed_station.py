"""
สาขาที่ปิดให้บริการ (stations.status = 0) — ต้องปิดจริงที่ backend ไม่ใช่แค่ซ่อนปุ่มหน้าเว็บ
"""
import pytest

from conftest import ADMIN_HASH, ADMIN_PASSWORD, auth

CLOSED = 3
CLOSED_DETAIL = "สาขานี้ปิดให้บริการ"


@pytest.fixture
def closed(db):
    """สาขา 3 ปิดให้บริการ มีตู้ที่มีของฝาก 1 ตู้ และพนักงาน 1 คน"""
    db.add_station(CLOSED, "โรงแรม 3", status=0)
    db.add_locker(locker_id=73, station_id=CLOSED, box_number=1, status=1,
                  phone_owner="0811111111", pass_code="2222",
                  room_number="301", deposit_time="2026-08-25 10:00:00")
    db.add_user(user_id=30, username="admin3", role="admin",
                station_id=CLOSED, password=ADMIN_HASH)
    return db


def _assert_closed(r):
    assert r.status_code == 403
    assert r.json()["detail"] == CLOSED_DETAIL


# ---------- ผู้บริหาร ----------

@pytest.mark.parametrize("path", [
    f"/api/lockers?station_id={CLOSED}",
    f"/api/lockers/73?station_id={CLOSED}",
    f"/api/transactions?station_id={CLOSED}",
    f"/api/staff?station_id={CLOSED}",
])
def test_ผู้บริหารดูข้อมูลสาขาที่ปิดไม่ได้(client, closed, path):
    _assert_closed(client.get(path, headers=auth(closed, "superadmin")))


def test_ผู้บริหารสั่งเปิดตู้สาขาที่ปิดไม่ได้_ไม่ส่ง_MQTT_ไม่แตะ_DB(client, closed):
    r = client.post(f"/api/lockers/73/unlock?station_id={CLOSED}", headers=auth(closed, "superadmin"))
    _assert_closed(r)
    assert closed.published == []
    locker = closed.find_locker(73, CLOSED)
    assert locker["status"] == 1 and locker["phone_owner"] == "0811111111"
    assert closed.transactions == []


def test_ผู้บริหารเปลี่ยนชื่อสาขาที่ปิดไม่ได้(client, closed):
    r = client.put(f"/api/stations/{CLOSED}", headers=auth(closed, "superadmin"),
                   json={"station_name": "ชื่อใหม่"})
    _assert_closed(r)
    assert closed.stations[-1]["station_name"] == "โรงแรม 3"


def test_ผู้บริหารเพิ่มพนักงานเข้าสาขาที่ปิดไม่ได้(client, closed):
    r = client.post("/api/staff", headers=auth(closed, "superadmin"),
                    json={"username": "newbie", "fullname": "ใหม่", "phone": "0800000000",
                          "station_id": CLOSED})
    _assert_closed(r)
    assert closed.find_user(username="newbie") is None


def test_ผู้บริหารย้ายพนักงานเข้าสาขาที่ปิดไม่ได้(client, closed):
    r = client.put("/api/staff/1", headers=auth(closed, "superadmin"), json={"station_id": CLOSED})
    _assert_closed(r)
    assert closed.find_user(username="admin1")["station_id"] == 1


@pytest.mark.parametrize("method,path", [
    ("put", "/api/staff/30"),
    ("post", "/api/staff/30/reset-password"),
    ("delete", "/api/staff/30"),
])
def test_ผู้บริหารจัดการพนักงานของสาขาที่ปิดไม่ได้(client, closed, method, path):
    before = dict(closed.find_user(username="admin3"))
    kwargs = {"json": {"fullname": "แก้ชื่อ"}} if method == "put" else {}
    r = getattr(client, method)(path, headers=auth(closed, "superadmin"), **kwargs)
    _assert_closed(r)
    assert closed.find_user(username="admin3") == before


def test_รายการสาขายังเห็นสาขาที่ปิด_เพื่อแสดงป้ายปิดให้บริการ(client, closed):
    r = client.get("/api/stations", headers=auth(closed, "superadmin"))
    assert r.status_code == 200
    row = next(s for s in r.json()["data"] if s["station_id"] == CLOSED)
    assert row["status"] == 0


def test_สาขาที่เปิดอยู่ยังใช้งานได้ปกติ(client, closed):
    r = client.get("/api/lockers?station_id=1", headers=auth(closed, "superadmin"))
    assert r.status_code == 200


# ---------- พนักงานของสาขาที่ปิด ----------

def test_พนักงานสาขาที่ปิดล็อกอินไม่ได้(client, closed):
    r = client.post("/api/login", json={"username": "admin3", "password": ADMIN_PASSWORD})
    _assert_closed(r)
    assert "access_token" not in r.json()


def test_token_ของพนักงานตายทันทีเมื่อสาขาถูกปิด(client, closed):
    r = client.get("/api/lockers", headers=auth(closed, "admin3"))
    assert r.status_code == 401


def test_สาขาถูกปิดระหว่างใช้งาน_token_ที่ออกไปแล้วใช้ต่อไม่ได้(client, db):
    headers = auth(db, "admin1")
    assert client.get("/api/lockers", headers=headers).status_code == 200
    db.stations[0]["status"] = 0
    assert client.get("/api/lockers", headers=headers).status_code == 401
    assert client.post("/api/lockers/2/unlock", headers=headers).status_code == 401
    assert db.published == []


def test_status_เป็น_NULL_ถือว่าปิด_ไม่ปล่อยผ่าน(client, db):
    db.stations[0]["status"] = None
    _assert_closed(client.get("/api/lockers?station_id=1", headers=auth(db, "superadmin")))
