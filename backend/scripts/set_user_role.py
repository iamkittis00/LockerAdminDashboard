"""
เปลี่ยน username / role / สาขา (station_id) ของบัญชีที่มีอยู่แล้ว

วิธีใช้ (รันจากโฟลเดอร์ backend/):
    python scripts/set_user_role.py --username admin --new-username superadmin
    python scripts/set_user_role.py --username admin --role ceo
    python scripts/set_user_role.py --username somchai --role admin --station-id 1
    python scripts/set_user_role.py --list

กฎของระบบ:
- role='admin' ต้องมี station_id เสมอ (ไม่งั้นล็อกอินไม่ได้ ระบบจะปฏิเสธเพื่อความปลอดภัย)
- role='ceo'   ไม่ต้องมี station_id (ดูได้ทุกสาขาอยู่แล้ว)
- เปลี่ยน username แล้ว token เดิมใช้ไม่ได้ทันที ต้องล็อกอินใหม่ (ตั้งใจให้เป็นแบบนั้น)
"""

import argparse
import re
import sys

from _common import get_connection

VALID_ROLES = ("admin", "ceo")
# username ใช้พิมพ์ตอนล็อกอิน จำกัดให้เป็น a-z 0-9 . _ - เท่านั้น
# กันช่องว่าง/อักษรไทย/อักขระแปลกที่พิมพ์ยากและทำให้ล็อกอินไม่ผ่านโดยไม่รู้ตัว
USERNAME_PATTERN = re.compile(r"^[a-z0-9._-]{3,50}$")


def list_users(cursor):
    cursor.execute(
        "SELECT user_id, username, fullname, role, station_id, is_active "
        "FROM users ORDER BY user_id"
    )
    rows = cursor.fetchall()
    if not rows:
        print("ไม่มีบัญชีในระบบ")
        return
    print(f"{'id':<5}{'username':<20}{'role':<10}{'station':<10}{'active':<8}fullname")
    print("-" * 75)
    for r in rows:
        print(
            f"{r['user_id']:<5}{str(r['username'] or '-'):<20}{str(r['role'] or '-'):<10}"
            f"{str(r['station_id'] if r['station_id'] is not None else '-'):<10}"
            f"{('ใช่' if r['is_active'] else 'ไม่'):<8}{r['fullname'] or ''}"
        )


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--username", help="บัญชีที่ต้องการแก้")
    parser.add_argument("--new-username", default=None, help="เปลี่ยนชื่อผู้ใช้เป็นค่านี้")
    parser.add_argument("--role", choices=VALID_ROLES, help="admin หรือ ceo")
    parser.add_argument("--station-id", type=int, default=None, help="สาขาที่สังกัด (จำเป็นสำหรับ admin)")
    parser.add_argument("--clear-station", action="store_true", help="ล้างสาขาออก (ใช้กับ ceo)")
    parser.add_argument("--list", action="store_true", help="แสดงบัญชีทั้งหมดแล้วจบ")
    args = parser.parse_args()

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        if args.list:
            list_users(cursor)
            return

        if not args.username:
            print("❌ ต้องระบุ --username (หรือใช้ --list เพื่อดูรายชื่อ)", file=sys.stderr)
            sys.exit(1)

        cursor.execute(
            "SELECT user_id, username, role, station_id FROM users WHERE username=%s LIMIT 1",
            (args.username,),
        )
        target = cursor.fetchone()
        if not target:
            print(f"❌ ไม่พบบัญชี '{args.username}'", file=sys.stderr)
            sys.exit(1)

        # ตรวจ username ใหม่ก่อน แล้วค่อยยิง UPDATE — กันแก้ครึ่งๆ กลางๆ
        new_username = target["username"]
        if args.new_username is not None:
            candidate = args.new_username.strip().lower()
            if not USERNAME_PATTERN.match(candidate):
                print(
                    "❌ username ใหม่ต้องยาว 3-50 ตัว และใช้ได้เฉพาะ a-z 0-9 . _ -",
                    file=sys.stderr,
                )
                sys.exit(1)
            if candidate != target["username"]:
                cursor.execute(
                    "SELECT user_id FROM users WHERE username=%s AND user_id<>%s LIMIT 1",
                    (candidate, target["user_id"]),
                )
                if cursor.fetchone():
                    print(f"❌ username '{candidate}' ถูกใช้ไปแล้ว", file=sys.stderr)
                    sys.exit(1)
            new_username = candidate

        new_role = args.role or target["role"]
        if args.clear_station:
            new_station = None
        elif args.station_id is not None:
            new_station = args.station_id
        else:
            new_station = target["station_id"]

        # admin ที่ไม่มีสาขา = ล็อกอินไม่ได้ (ระบบ fail closed) กันไว้ตั้งแต่ตรงนี้เลย
        if new_role == "admin" and new_station is None:
            print("❌ role=admin ต้องมี station_id ด้วย เพิ่ม --station-id <เลขสาขา>", file=sys.stderr)
            sys.exit(1)

        if new_station is not None:
            cursor.execute("SELECT station_id FROM stations WHERE station_id=%s", (new_station,))
            if not cursor.fetchone():
                print(f"❌ ไม่พบสาขาหมายเลข {new_station} ในตาราง stations", file=sys.stderr)
                sys.exit(1)

        cursor.execute(
            "UPDATE users SET username=%s, role=%s, station_id=%s WHERE user_id=%s",
            (new_username, new_role, new_station, target["user_id"]),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()

    print("=" * 50)
    print(f"✅ อัปเดตบัญชี '{args.username}' สำเร็จ")
    print(f"   username   : {target['username']}  ->  {new_username}")
    print(f"   role       : {target['role'] or '-'}  ->  {new_role}")
    print(f"   station_id : {target['station_id'] if target['station_id'] is not None else '-'}"
          f"  ->  {new_station if new_station is not None else '-'}")
    print("=" * 50)
    print("⚠️  บัญชีนี้ต้องล็อกอินใหม่ 1 ครั้ง สิทธิ์ถึงจะมีผล")


if __name__ == "__main__":
    main()
