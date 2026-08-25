"""
สร้างบัญชี admin สำหรับเข้าเว็บนี้ (เว็บนี้ให้เฉพาะพนักงานเข้า)
ไม่ระบุ --password จะสุ่มรหัสผ่าน 8 ตัวให้ และบังคับให้เปลี่ยนรหัสผ่านตอนล็อกอินครั้งแรกเสมอ

วิธีใช้ (รันจากโฟลเดอร์ backend/):
    python scripts/create_admin.py
    python scripts/create_admin.py --username admin --password admin1234
    python scripts/create_admin.py --username admin --phone 0800000000 --station-id 1

ถ้าตาราง users ยังไม่มีคอลัมน์ username / must_change_password
สคริปต์จะเพิ่มให้อัตโนมัติ (รันซ้ำได้ปลอดภัย)
"""

import argparse
import sys

from _common import get_connection, generate_password, hash_password, ensure_column, get_columns


def check_required(columns, col, cli_value, flag):
    info = columns.get(col)
    if info and info["IS_NULLABLE"] == "NO" and info["COLUMN_DEFAULT"] is None and cli_value is None:
        print(f"❌ คอลัมน์ {col} ของตาราง users ห้ามว่าง กรุณาระบุ {flag} ด้วย", file=sys.stderr)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--username", default="admin")
    parser.add_argument("--fullname", default="Administrator")
    parser.add_argument("--password", default=None, help="ไม่ระบุ = สุ่มให้ 8 ตัว (แนะนำสำหรับโปรดักชัน)")
    parser.add_argument("--phone", default=None, help="ใส่ถ้าคอลัมน์ phone ห้ามว่าง")
    parser.add_argument("--station-id", type=int, default=None, help="ใส่ถ้าคอลัมน์ station_id ห้ามว่าง")
    args = parser.parse_args()

    if args.password and len(args.password) < 8:
        print("⚠️  รหัสผ่านสั้นกว่า 8 ตัว — แนะนำให้ใช้อย่างน้อย 8 ตัว", file=sys.stderr)

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    plain_password = None

    try:
        ensure_column(cursor, "users", "username", "username VARCHAR(50) NULL UNIQUE")
        ensure_column(cursor, "users", "must_change_password", "must_change_password TINYINT(1) NOT NULL DEFAULT 0")
        conn.commit()

        cursor.execute("SELECT user_id FROM users WHERE username=%s", (args.username,))
        if cursor.fetchone():
            print(f"❌ มี username '{args.username}' อยู่แล้ว — ใช้ reset_password.py แทนถ้าต้องการรีเซ็ตรหัสผ่าน", file=sys.stderr)
            sys.exit(1)

        columns = get_columns(cursor, "users")
        check_required(columns, "phone", args.phone, "--phone")
        check_required(columns, "station_id", args.station_id, "--station-id")

        plain_password = args.password or generate_password()
        hashed = hash_password(plain_password)

        cursor.execute(
            """INSERT INTO users
                   (username, fullname, phone, role, station_id, password, is_active, must_change_password, last_login)
               VALUES (%s, %s, %s, 'admin', %s, %s, 1, 1, NULL)""",
            (args.username, args.fullname, args.phone, args.station_id, hashed),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()

    print("=" * 50)
    print("✅ สร้างบัญชี admin สำเร็จ")
    print(f"   Username : {args.username}")
    print(f"   Password : {plain_password}")
    print("=" * 50)
    print("⚠️  บันทึกรหัสผ่านนี้ไว้ตอนนี้เลย ระบบจะไม่แสดงซ้ำอีก")
    print("⚠️  ระบบจะบังคับให้เปลี่ยนรหัสผ่านทันทีที่ล็อกอินครั้งแรก")


if __name__ == "__main__":
    main()
