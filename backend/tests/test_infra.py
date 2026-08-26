"""
เทสต์ชั้นล่างที่ endpoint พึ่งพา — อ่าน env และส่ง MQTT

สองอย่างนี้พังแบบเงียบๆ ได้ทั้งคู่ และเวลาพังคือ "ตู้ไม่เปิดแต่ระบบบอกว่าสำเร็จ"
"""
import paho.mqtt.client as mqtt
import pytest

import main

# เก็บตัวจริงไว้ตั้งแต่ตอน import — fixture `db` จะ patch main.publish_message
# เป็นตัวจำลองทับ ถ้าอ่านตอนอยู่ในเทสต์จะได้ตัวจำลองมาแทน
REAL_PUBLISH_MESSAGE = main.publish_message


# ==========================================
# env_int — ตั้งค่าผิดต้องบอกได้ว่าตัวไหน
# ==========================================
def test_ไม่ได้ตั้งค่าใช้ค่าเริ่มต้น(monkeypatch):
    monkeypatch.delenv("SOME_KNOB", raising=False)
    assert main.env_int("SOME_KNOB", 7) == 7


def test_ค่าว่างก็ใช้ค่าเริ่มต้น(monkeypatch):
    monkeypatch.setenv("SOME_KNOB", "")
    assert main.env_int("SOME_KNOB", 7) == 7


def test_อ่านค่าที่ตั้งไว้(monkeypatch):
    monkeypatch.setenv("SOME_KNOB", "42")
    assert main.env_int("SOME_KNOB", 7) == 42


@pytest.mark.parametrize("raw,expected", [("0", 1), ("5", 5), ("9999", 720)])
def test_บีบให้อยู่ในช่วงที่ยอมรับได้(monkeypatch, raw, expected):
    monkeypatch.setenv("SOME_KNOB", raw)
    assert main.env_int("SOME_KNOB", 24, low=1, high=720) == expected


def test_ค่าที่ไม่ใช่ตัวเลข_ต้องบอกชื่อตัวแปรในข้อความ(monkeypatch):
    """service ไม่ขึ้นแล้วเห็นแค่ ValueError เปล่าๆ = ต้องมานั่งไล่เดาว่าตัวไหนพัง"""
    monkeypatch.setenv("SOME_KNOB", "ยี่สิบสี่")
    with pytest.raises(RuntimeError) as err:
        main.env_int("SOME_KNOB", 24)
    assert "SOME_KNOB" in str(err.value)


# ==========================================
# publish_message — ต้องรู้ว่าถึง broker จริง
# ==========================================
class FakeResult:
    def __init__(self, rc=mqtt.MQTT_ERR_SUCCESS, published=True, raises=None):
        self.rc = rc
        self._published = published
        self._raises = raises
        self.waited = False

    def wait_for_publish(self, timeout=None):
        self.waited = True
        if self._raises:
            raise self._raises

    def is_published(self):
        return self._published


def patch_publish(monkeypatch, result):
    calls = {}

    def fake_publish(topic, payload, qos=0):
        calls.update(topic=topic, payload=payload, qos=qos)
        return result

    monkeypatch.setattr(main.mqtt_client, "publish", fake_publish)
    return calls


def test_ส่งสำเร็จเมื่อ_broker_ตอบรับ(monkeypatch):
    result = FakeResult()
    calls = patch_publish(monkeypatch, result)

    assert main.publish_message("locker/1/web/unlock", "{}") is True
    assert calls["qos"] == 1, "ต้องใช้ qos=1 ไม่งั้นข้อความหายได้เงียบๆ"
    assert result.waited, "ต้องรอ broker ตอบรับ ไม่ใช่แค่เข้าคิวแล้วถือว่าสำเร็จ"


def test_ส่งไม่ออกเลย_คืน_False(monkeypatch):
    patch_publish(monkeypatch, FakeResult(rc=mqtt.MQTT_ERR_NO_CONN))
    assert main.publish_message("locker/1/web/unlock", "{}") is False


def test_เข้าคิวแล้วแต่_broker_ไม่ตอบรับในเวลา_คืน_False(monkeypatch):
    """
    เคสอันตรายที่สุด: rc=0 แปลว่า "เข้าคิว" เท่านั้น
    ถ้าถือว่าสำเร็จเลย ระบบจะเคลียร์ตู้เป็นว่างทั้งที่ประตูไม่เคยเปิด
    """
    patch_publish(monkeypatch, FakeResult(published=False))
    assert main.publish_message("locker/1/web/unlock", "{}") is False


def test_รอแล้วเกิด_error_คืน_False_ไม่โยนต่อ(monkeypatch):
    patch_publish(monkeypatch, FakeResult(raises=RuntimeError("ยังไม่ได้ต่อ broker")))
    assert main.publish_message("locker/1/web/unlock", "{}") is False


def test_ส่งไม่สำเร็จแล้วตู้ต้องไม่ถูกเคลียร์(client, db, monkeypatch):
    """ผูกกับ endpoint จริง — publish คืน False ต้องไม่มีอะไรถูกแตะ"""
    from conftest import auth

    monkeypatch.setattr(main.mqtt_client, "publish", lambda *a, **k: FakeResult(published=False))
    monkeypatch.setattr(main, "publish_message", REAL_PUBLISH_MESSAGE)

    r = client.post("/api/lockers/2/unlock", headers=auth(db, "admin1"))
    assert r.status_code == 500
    assert db.find_locker(2)["status"] == 1
    assert db.find_locker(2)["phone_owner"] == "0863841265"
    assert db.transactions == []
