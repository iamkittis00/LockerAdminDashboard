"""
ฐานข้อมูลจำลองในหน่วยความจำ สำหรับเทสต์ endpoint โดยไม่ต้องมี MySQL จริง

ตอบเฉพาะ query ที่ main.py ใช้จริงเท่านั้น ถ้ามี query ใหม่เข้ามาแล้วไม่รู้จัก
จะ raise ทันที — ตั้งใจให้พังเสียงดัง จะได้รู้ว่าโค้ดเปลี่ยนแล้วเทสต์ตามไม่ทัน
"""


def _norm(sql):
    return " ".join(sql.split())


def _select_columns(q):
    """คืนรายการ (นิพจน์, ชื่อที่ใช้ตอบ) ของ SELECT — คืน None ถ้าเป็น SELECT * (เอาทั้งแถว)"""
    if not q.upper().startswith("SELECT "):
        return None
    body = q[len("SELECT "):]
    idx = body.upper().find(" FROM ")
    if idx == -1:
        return None
    cols = body[:idx].strip()
    if cols == "*" or cols.endswith(".*"):
        return None
    out = []
    for part in cols.split(","):
        part = part.strip()
        upper = part.upper()
        if " AS " in upper:
            i = upper.rindex(" AS ")
            out.append((part[:i].strip(), part[i + 4:].strip()))
        else:
            out.append((part, part.split(".")[-1]))
    return out


def _project(q, rows):
    """
    ตัดให้เหลือเฉพาะคอลัมน์ที่ SQL เลือกจริงๆ
    สำคัญมาก — ถ้า fake คืนทั้งแถวเสมอ เทสต์ที่เช็คว่า password hash ไม่หลุด
    จะกลายเป็นเช็คตัว fake แทนที่จะเช็คโค้ดจริง
    """
    cols = _select_columns(q)
    if cols is None:
        return [dict(r) for r in rows]
    out = []
    for r in rows:
        item = {}
        for expr, alias in cols:
            item[alias] = r.get(expr.split(".")[-1])
        out.append(item)
    return out


class FakeDB:
    def __init__(self):
        self.users = []
        self.lockers = []
        self.stations = []
        self.transactions = []
        self.settings = {"max_deposit_days": "1"}
        self.connect_fails = False   # จำลอง DB ล่ม
        self._next_user_id = 100

    # ---------- ตัวช่วยสร้างข้อมูลตั้งต้น ----------
    def add_user(self, **kw):
        row = {
            "user_id": kw.get("user_id", self._next_id()),
            "username": kw["username"],
            "fullname": kw.get("fullname", kw["username"]),
            "phone": kw.get("phone", "0800000000"),
            "role": kw.get("role", "admin"),
            "station_id": kw.get("station_id", 1),
            "password": kw["password"],
            "is_active": kw.get("is_active", 1),
            "must_change_password": kw.get("must_change_password", 0),
            "last_login": kw.get("last_login"),
            "created_at": kw.get("created_at", "2026-01-01 00:00:00"),
        }
        self.users.append(row)
        return row

    def add_locker(self, **kw):
        row = {
            "locker_id": kw["locker_id"],
            "station_id": kw.get("station_id", 1),
            "box_number": kw.get("box_number", kw["locker_id"]),
            "size": kw.get("size", "S"),
            "is_usable": kw.get("is_usable", 1),
            "status": kw.get("status", 0),
            "phone_owner": kw.get("phone_owner"),
            "pass_code": kw.get("pass_code"),
            "room_number": kw.get("room_number"),
            "deposit_time": kw.get("deposit_time"),
            "updated_at": kw.get("updated_at"),
        }
        self.lockers.append(row)
        return row

    def add_station(self, station_id, name=None, location=None, status=1):
        row = {
            "station_id": station_id,
            "station_name": name or f"Station {station_id}",
            "location": location or "-",
            "status": status,
        }
        self.stations.append(row)
        return row

    def _next_id(self):
        self._next_user_id += 1
        return self._next_user_id

    def find_user(self, **kw):
        for u in self.users:
            if all(u.get(k) == v for k, v in kw.items()):
                return u
        return None

    def find_locker(self, locker_id, station_id=None):
        for l in self.lockers:
            if l["locker_id"] == locker_id and (station_id is None or l["station_id"] == station_id):
                return l
        return None

    # ---------- ใช้แทน main.get_db_connection ----------
    def connect(self):
        return None if self.connect_fails else FakeConnection(self)


class FakeConnection:
    def __init__(self, db):
        self.db = db
        self.closed = False
        self.commits = 0
        self.rollbacks = 0

    def cursor(self, dictionary=False):
        return FakeCursor(self.db, dictionary)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def close(self):
        self.closed = True


class FakeCursor:
    def __init__(self, db, dictionary):
        self.db = db
        self.dictionary = dictionary
        self._rows = []
        self.lastrowid = None
        self.closed = False

    def close(self):
        self.closed = True

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def fetchall(self):
        return list(self._rows)

    def _scalar_rows(self, values):
        """query ที่ใช้ cursor ธรรมดา (ไม่ dictionary) จะได้ tuple"""
        self._rows = [v if isinstance(v, tuple) else (v,) for v in values]

    def execute(self, sql, params=()):
        q = _norm(sql)
        p = tuple(params or ())
        self._rows = []

        # ---------- settings ----------
        if "CREATE TABLE IF NOT EXISTS settings" in q:
            return
        if "FROM settings WHERE `key` = 'max_deposit_days'" in q:
            value = self.db.settings.get("max_deposit_days")
            self._scalar_rows([value] if value is not None else [])
            return
        if "INSERT INTO settings" in q:
            self.db.settings["max_deposit_days"] = p[0]
            return

        # ---------- users ----------
        if "FROM users WHERE username=%s AND is_active=1" in q:
            u = self.db.find_user(username=p[0], is_active=1)
            self._rows = _project(q, [u]) if u else []
            return
        if "FROM users WHERE username=%s LIMIT 1" in q:
            u = self.db.find_user(username=p[0])
            self._rows = _project(q, [u]) if u else []
            return
        if q.startswith("SELECT user_id FROM users WHERE username=%s"):
            u = self.db.find_user(username=p[0])
            self._rows = [{"user_id": u["user_id"]}] if u else []
            return
        if "FROM users WHERE user_id=%s LIMIT 1" in q:
            u = self.db.find_user(user_id=p[0])
            self._rows = _project(q, [u]) if u else []
            return
        if "FROM users WHERE station_id=%s AND role=%s" in q:
            self._rows = _project(q, [u for u in self.db.users
                                     if u["station_id"] == p[0] and u["role"] == p[1]])
            return
        if "COUNT(*) AS staff_count" in q:
            ids, role = p[:-1], p[-1]
            counts = {}
            for u in self.db.users:
                if u["station_id"] in ids and u["role"] == role and u["is_active"] == 1:
                    counts[u["station_id"]] = counts.get(u["station_id"], 0) + 1
            self._rows = [{"station_id": k, "staff_count": v} for k, v in counts.items()]
            return
        if "INSERT INTO users" in q:
            username, fullname, phone, role, station_id, password = p
            row = self.db.add_user(username=username, fullname=fullname, phone=phone,
                                   role=role, station_id=station_id, password=password,
                                   is_active=1, must_change_password=1)
            self.lastrowid = row["user_id"]
            return
        if "UPDATE users SET last_login=NOW()" in q:
            u = self.db.find_user(user_id=p[0])
            if u:
                u["last_login"] = "2026-08-26 10:00:00"
            return
        if q.startswith("UPDATE users SET"):
            assignments = q[len("UPDATE users SET "):].split(" WHERE ")[0]
            fields = [f.strip().split("=")[0].strip() for f in assignments.split(",")]
            values = list(p[:-1])
            u = self.db.find_user(user_id=p[-1])
            if u:
                for field, value in zip(fields, values):
                    u[field] = value
                if "must_change_password=0" in q:
                    u["must_change_password"] = 0
                if "must_change_password=1" in q:
                    u["must_change_password"] = 1
            return

        # ---------- stations ----------
        if "FROM stations WHERE station_id=%s LIMIT 1" in q:
            self._scalar_rows([1] if any(s["station_id"] == p[0] for s in self.db.stations) else [])
            return
        if "FROM stations ORDER BY station_id ASC" in q:
            self._rows = _project(q, sorted(self.db.stations, key=lambda s: s["station_id"]))
            return
        if "FROM stations WHERE station_id=%s" in q:
            self._rows = _project(q, [s for s in self.db.stations if s["station_id"] == p[0]])
            return

        # ---------- lockers ----------
        if "occupied_count" in q:
            max_days, ids = p[0], p[1:]
            out = {}
            for l in self.db.lockers:
                if l["station_id"] not in ids:
                    continue
                bucket = out.setdefault(l["station_id"],
                                        {"station_id": l["station_id"], "occupied_count": 0, "overdue_count": 0})
                if l["status"] == 1:
                    bucket["occupied_count"] += 1
                    if l.get("days_held", 0) >= max_days:
                        bucket["overdue_count"] += 1
            self._rows = list(out.values())
            return
        if "FROM lockers WHERE station_id=%s ORDER BY" in q:
            self._rows = _project(q, [l for l in self.db.lockers if l["station_id"] == p[0]])
            return
        if "FROM lockers WHERE locker_id=%s AND station_id=%s" in q:
            l = self.db.find_locker(p[0], p[1])
            self._rows = _project(q, [l]) if l else []
            return
        if q.startswith("UPDATE lockers"):
            l = self.db.find_locker(p[0], p[1])
            if l:
                l.update(phone_owner=None, pass_code=None, room_number=None,
                         deposit_time=None, status=0, updated_at="now")
            return

        # ---------- transactions ----------
        if "INSERT INTO transactions" in q:
            station_id, box_number, phone, room_number, staff_id, action, detail = p
            self.db.transactions.append({
                "transaction_id": len(self.db.transactions) + 1,
                "created_at": "2026-08-26 10:00:00",
                "station_id": station_id, "box_number": box_number, "phone": phone,
                "room_number": room_number, "staff_id": staff_id,
                "action": action, "detail": detail,
            })
            return
        if "FROM transactions t" in q:
            station_id, limit, offset = p
            rows = [t for t in self.db.transactions if t["station_id"] == station_id]
            rows.sort(key=lambda t: t["transaction_id"], reverse=True)
            out = []
            for t in rows[offset:offset + limit]:
                staff = self.db.find_user(user_id=t["staff_id"])
                station = next((s for s in self.db.stations if s["station_id"] == t["station_id"]), None)
                out.append({
                    "trans_id": t["transaction_id"], "timestamp": t["created_at"],
                    "locker_id": t["box_number"], "station_id": t["station_id"],
                    "room_number": t["room_number"], "staff_id": t["staff_id"],
                    "phone": t["phone"], "action": t["action"], "detail": t["detail"],
                    "staff_name": staff["fullname"] if staff else None,
                    "station_name": station["station_name"] if station else None,
                })
            self._rows = out
            return

        raise AssertionError(f"FakeCursor ยังไม่รู้จัก query นี้:\n{q}")
