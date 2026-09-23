"""
ทางออกสุดท้ายเมื่อ superadmin (ผู้บริหาร) ลืมรหัสผ่าน — รันบนเซิร์ฟเวอร์เท่านั้น

พนักงานลืมรหัส ผู้บริหารกดรีเซ็ตให้ได้จากหน้าเว็บ แต่ผู้บริหารเองไม่มีใครรีเซ็ตให้
สคริปต์นี้จึงเป็นประตูเดียว และ "กั้นไว้ให้บัญชี role='ceo' เท่านั้น" —
รีเซ็ตบัญชีพนักงาน (admin) ไม่ได้ ให้ใช้หน้าเว็บหรือ reset_password.py แทน

พฤติกรรมเหมือนกดรีเซ็ตบนหน้าเว็บ: สุ่มรหัสใหม่ 6 ตัว แสดงครั้งเดียว
และบังคับตั้งรหัสของตัวเองใหม่ทันทีที่ล็อกอินครั้งถัดไป
รหัสผ่านเปลี่ยนแล้ว token เก่าตายทันทีทุกเครื่อง (ver ใน JWT ผูกกับ hash)

วิธีใช้ (รันจากโฟลเดอร์ backend/ บนเซิร์ฟเวอร์):
    python scripts/reset_superadmin.py
    python scripts/reset_superadmin.py --username somchai-ceo   # กรณีมี ceo หลายคน
"""

import argparse
import sys

from _common import get_connection, generate_password, hash_password, ensure_column


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--username", default="superadmin",
                        help="ชื่อบัญชีผู้บริหารที่จะรีเซ็ต (ไม่ระบุ = superadmin)")
    args = parser.parse_args()

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    plain_password = None

    try:
        ensure_column(cursor, "users", "must_change_password",
                      "must_change_password TINYINT(1) NOT NULL DEFAULT 0")
        conn.commit()

        # กั้นที่ role ใน WHERE เลย — ต่อให้พิมพ์ชื่อพนักงานมาก็จะไม่เจอ ไม่ใช่รีเซ็ตผิดคน
        cursor.execute(
            "SELECT user_id, username, is_active FROM users WHERE username=%s AND role='ceo'",
            (args.username,),
        )
        user = cursor.fetchone()

        if not user:
            print(f"❌ ไม่พบบัญชีผู้บริหาร (role='ceo') ชื่อ '{args.username}'", file=sys.stderr)
            cursor.execute("SELECT username FROM users WHERE role='ceo' ORDER BY username")
            ceos = [row["username"] for row in cursor.fetchall()]
            if ceos:
                print(f"   บัญชีผู้บริหารที่มีอยู่: {', '.join(ceos)}", file=sys.stderr)
            else:
                print("   ยังไม่มีบัญชี role='ceo' ในระบบเลย — สร้างด้วย create_admin.py "
                      "แล้วปรับ role ด้วย set_user_role.py", file=sys.stderr)
            sys.exit(1)

        # สุ่ม 6 ตัว ตาม flow หน้าเว็บ (เป็นแค่รหัสชั่วคราว เดี๋ยวถูกบังคับตั้งใหม่อยู่ดี
        # และ login โดน rate limit กันเดารหัสไว้แล้ว)
        plain_password = generate_password(6)
        hashed = hash_password(plain_password)

        # เปิด is_active คืนด้วย — นี่คือสคริปต์กู้ชีพ ถ้าบัญชีเผลอถูกปิดไว้
        # รีเซ็ตรหัสอย่างเดียวก็ยังล็อกอินไม่ได้อยู่ดี
        cursor.execute(
            "UPDATE users SET password=%s, must_change_password=1, is_active=1 WHERE user_id=%s",
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
    print(f"✅ รีเซ็ตรหัสผ่านผู้บริหาร '{user['username']}' สำเร็จ")
    print(f"   Password ชั่วคราว : {plain_password}")
    if not user["is_active"]:
        print("   (บัญชีเคยถูกปิดใช้งานอยู่ — เปิดคืนให้แล้ว)")
    print("=" * 50)
    print("⚠️  บันทึกรหัสผ่านนี้ไว้ตอนนี้เลย ระบบจะไม่แสดงซ้ำอีก")
    print("⚠️  ล็อกอินครั้งถัดไปจะถูกบังคับให้ตั้งรหัสผ่านใหม่ทันที")
    print("⚠️  ทุกเครื่องที่ล็อกอินค้างไว้ด้วยบัญชีนี้ถูกตัดออกจากระบบแล้ว")


if __name__ == "__main__":
    main()
