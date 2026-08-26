# เทสต์ฝั่ง backend

```bash
cd backend
python -m pip install -r requirements-dev.txt
python -m pytest
```

ไม่ต้องมี MySQL หรือ MQTT จริง — `conftest.py` ตั้ง env ให้ครบก่อน import `main.py`
แล้วสลับ `get_db_connection` / `publish_message` เป็นตัวจำลองใน `fake_db.py`

| ไฟล์ | ครอบคลุม |
|---|---|
| `test_security.py` | ด่านความปลอดภัย — token, บัญชีถูกปิด, ข้ามสาขา, ข้าม role, rate limit, ข้อมูลรั่ว |
| `test_flow.py` | flow การทำงานจริงตั้งแต่ต้นจนจบ 5 flow |

`fake_db.py` ตอบเฉพาะ query ที่ `main.py` ใช้จริง ถ้าเจอ query ที่ไม่รู้จักจะ raise ทันที
ตั้งใจให้พังเสียงดังเวลามีคนเพิ่ม query ใหม่แล้วลืมอัปเดตเทสต์

และมันตัดคอลัมน์ตามที่ `SELECT` ระบุจริงๆ ด้วย ถ้าคืนทั้งแถวเสมอ เทสต์ที่เช็คว่า
password hash ไม่หลุดจะกลายเป็นเช็คตัว fake แทนที่จะเช็คโค้ดจริง
