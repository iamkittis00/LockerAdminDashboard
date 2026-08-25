# Deploy — locker-admin

โปรเจคนี้เป็น **shape B**: app server (FastAPI + systemd) หลัง nginx ไม่ใช่ static SPA
เพราะฉะนั้น deploy = อัปไฟล์ + **restart service** + เช็คว่ากลับมาจริง

> ข้อมูลในไฟล์นี้อยู่ใน git โดยตั้งใจ — Claude memory แยกกันต่อโปรเจค ทำให้ความรู้เรื่อง deploy
> ไม่ข้ามไปโปรเจคอื่น ไฟล์นี้คือแหล่งความจริงเดียว ไม่ใช่บทสนทนาเก่า

## วิธี deploy

**อัตโนมัติ**: push เข้า `main` → [.github/workflows/deploy.yml](.github/workflows/deploy.yml) ทำงานเอง
**สั่งเอง**: GitHub → Actions → "Deploy locker-admin" → Run workflow

pipeline จะ: `npm ci` → **lint + test** → build → rsync frontend → rsync backend → `pip install` → `systemctl restart` → **healthcheck**
ถ้า test ไม่ผ่าน จะหยุดก่อนแตะเซิร์ฟเวอร์ ถ้า healthcheck ไม่ผ่าน job จะ fail พร้อม log 40 บรรทัดล่าสุดของ service

## ต้องตั้งค่าก่อนใช้ครั้งแรก

### 1. GitHub Secrets

| Secret | คืออะไร |
|---|---|
| `SERVER_HOST` | โฮสต์/IP ของ VPS |
| `SERVER_USER` | ผู้ใช้ที่ SSH เข้า |
| `SERVER_SSH_KEY` | private key (ทั้งไฟล์ รวมบรรทัด BEGIN/END) |

**ค่าทั้ง 3 เหมือนกับที่ Donaus-pms ใช้อยู่** (ถ้าลง VPS เครื่องเดียวกัน) แต่ GitHub เก็บ secret
**แยกต่อ repo** และบัญชีส่วนตัวไม่มี secret ระดับบัญชี — org secrets แชร์ข้าม private repo ได้เฉพาะแพลนเสียเงิน
เพราะฉะนั้นต้องใส่ซ้ำทุก repo แต่ไม่ต้องคลิกเอง ใช้สคริปต์:

```powershell
cd D:\Intern\ManagerIntern\scripts
Copy-Item deploy-secrets.example.json deploy-secrets.local.json   # ครั้งแรกครั้งเดียว แล้วเปิดกรอกค่า
.\set-deploy-secrets.ps1 -Repo iamkittis00/LockerAdminDashboard

# เช็คว่าตั้งไปแล้วหรือยัง (ไม่แก้อะไร)
.\set-deploy-secrets.ps1 -Repo iamkittis00/LockerAdminDashboard -ListOnly
```

> ณ 2026-08-25 repo นี้ยังไม่มี secret สักตัว (`gh secret list` ว่าง)
> GitHub อ่านค่า secret กลับออกมาไม่ได้ ต้องใช้ private key ฉบับที่เก็บไว้ในเครื่อง

### 2. ค่าที่ต้องแก้ให้ตรงเซิร์ฟเวอร์
อยู่ในบล็อก `env:` หัวไฟล์ workflow — **ค่าตอนนี้เป็นค่าเดา ต้องยืนยันก่อนรันจริง**

| ตัวแปร | ค่าที่ใส่ไว้ | ยืนยันด้วย (SSH เข้าเซิร์ฟเวอร์) |
|---|---|---|
| `SSH_PORT` | `222` | พอร์ตเดียวกับ pms-donaus |
| `REMOTE_FRONTEND_DIR` | `/var/www/locker-admin/dist` | `grep -r root /etc/nginx/sites-enabled/` |
| `REMOTE_BACKEND_DIR` | `/opt/locker-admin/backend` | `systemctl cat locker-api.service \| grep WorkingDirectory` |
| `REMOTE_VENV` | `/opt/locker-admin/venv` | `systemctl cat locker-api.service \| grep ExecStart` |
| `SERVICE_NAME` | `locker-api.service` | `systemctl list-units \| grep locker` |
| `HEALTHCHECK_URL` | `http://127.0.0.1:8885/api/ping` | ตรงกับ `API_PORT` ใน `.env` บนเซิร์ฟเวอร์ |

### 3. sudo ต้องไม่ถามรหัส
ขั้นตอน restart ใช้ `sudo systemctl restart` ผ่าน SSH แบบไม่มี TTY ถ้า sudo ถามรหัสผ่าน job จะค้างแล้ว fail
เปิดสิทธิ์เฉพาะคำสั่งที่จำเป็น (`visudo`):

```
<SERVER_USER> ALL=(root) NOPASSWD: /bin/systemctl restart locker-api.service, /bin/journalctl -u locker-api.service *
```

## สิ่งที่ pipeline **ไม่** ทำ (ต้องทำมือ)

- **ไม่แตะ `.env` บนเซิร์ฟเวอร์** — ตั้งใจ `--exclude='.env'` ไว้ ค่า production เป็นของเซิร์ฟเวอร์เท่านั้น
  ถ้าเพิ่ม env var ใหม่ใน `.env.example` **ต้องไป SSH เพิ่มใน `.env` จริงเองก่อน deploy** ไม่งั้น backend จะ fail-fast ตอน start แล้ว healthcheck จะ fail
- **ไม่ทำ DB migration** — เปลี่ยน schema ต้องรันเองก่อน deploy
- **ไม่สร้าง admin / reset password** — ใช้สคริปต์ใน `backend/scripts/`

## หลัง deploy ต้องเช็ค

1. `API_HOST` ใน `.env` บนเซิร์ฟเวอร์เป็น `127.0.0.1`
   (ค่า default ในโค้ดคือ `0.0.0.0` — ถ้า `.env` ไม่ได้ตั้ง API จะเปิดออกเน็ตตรงๆ ข้าม nginx/HTTPS)
   และ systemd unit ต้องไม่ override ด้วย `--host 0.0.0.0`
2. `ALLOWED_ORIGINS` = `https://locker-admin.donaus-dev.net`
3. **ถ้า deploy รอบนั้นแตะระบบ auth: ทุกคนต้อง login ใหม่** — token เก่าไม่มี `ver` claim จึงถูก revoke ทั้งหมด

## Rollback

pipeline ไม่มี rollback อัตโนมัติ ทำมือ:

```bash
# ในเครื่อง — ย้อนไป commit ที่ดี แล้ว push (workflow จะ deploy ทับให้)
git revert <commit-ที่พัง>
git push origin main
```

ถ้าเซิร์ฟเวอร์พังจน pipeline ใช้ไม่ได้ ให้ SSH เข้าไปแล้ว:
```bash
sudo systemctl status locker-api.service
sudo journalctl -u locker-api.service -n 100 --no-pager
sudo systemctl restart locker-api.service
```

## สรุปสถาปัตยกรรม

```
เบราว์เซอร์ → nginx (443, locker-admin.donaus-dev.net)
                ├─ /            → REMOTE_FRONTEND_DIR (React build)
                └─ /api/*       → 127.0.0.1:8885 (FastAPI, locker-api.service)
                                    └─ MySQL + MQTT broker
```
