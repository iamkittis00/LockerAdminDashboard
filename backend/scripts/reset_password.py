"""
รีเซ็ตรหัสผ่านของบัญชี admin ที่มีอยู่แล้ว
ไม่ระบุ --password จะสุ่มรหัสผ่านใหม่ 8 ตัวให้ และบังคับให้เปลี่ยนรหัสผ่านตอนล็อกอินครั้งถัดไปเสมอ

วิธีใช้ (รันจากโฟลเดอร์ backend/):
    python scripts/reset_password.py --username admin
    python scripts/reset_password.py --username admin --password admin1234
"""

import argparse
import sys

from _common import get_connection, generate_password, hash_password, ensure_column


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--username", required=True)
    parser.add_argument("--password", default=None, help="ไม่ระบุ = สุ่มให้ 8 ตัว (แนะนำสำหรับโปรดักชัน)")
    args = parser.parse_args()

    if args.password and len(args.password) < 8:
        print("⚠️  รหัสผ่านสั้นกว่า 8 ตัว — แนะนำให้ใช้อย่างน้อย 8 ตัว", file=sys.stderr)

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    plain_password = None

    try:
        ensure_column(cursor, "users", "must_change_password", "must_change_password TINYINT(1) NOT NULL DEFAULT 0")
        conn.commit()

        cursor.execute("SELECT user_id FROM users WHERE username=%s AND role='admin'", (args.username,))
        user = cursor.fetchone()
        if not user:
            print(f"❌ ไม่พบบัญชี admin ชื่อ '{args.username}'", file=sys.stderr)
            sys.exit(1)

        plain_password = args.password or generate_password()
        hashed = hash_password(plain_password)

        cursor.execute(
            "UPDATE users SET password=%s, must_change_password=1 WHERE user_id=%s",
            (hashed, user["user_id"]),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()

    print("=" * 50)
    print(f"✅ รีเซ็ตรหัสผ่านของ '{args.username}' สำเร็จ")
    print(f"   Password ใหม่ : {plain_password}")
    print("=" * 50)
    print("⚠️  บันทึกรหัสผ่านนี้ไว้ตอนนี้เลย ระบบจะไม่แสดงซ้ำอีก")
    print("⚠️  ระบบจะบังคับให้เปลี่ยนรหัสผ่านทันทีที่ล็อกอินครั้งถัดไป")


if __name__ == "__main__":
    main()
