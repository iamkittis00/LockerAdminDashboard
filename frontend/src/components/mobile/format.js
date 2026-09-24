// ตัวจัดรูปแบบสำหรับมุมมองมือถือ

export function parseDate(value) {
    if (!value) return null;
    const d = new Date(value.replace ? value.replace(' ', 'T') : value);
    return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n) => String(n).padStart(2, '0');

// "22/09/69 13:42" — ปีเป็น พ.ศ. สองหลัก
export function formatDateTimeShortBE(value) {
    const d = parseDate(value);
    if (!d) return '-';
    const yy = pad((d.getFullYear() + 543) % 100);
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${yy} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatTime(value) {
    const d = parseDate(value);
    return d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '-';
}

// "25 น." / "2 ชม. 29 น." / "1 วัน 3 ชม."
export function formatDuration(ms) {
    const totalMinutes = Math.max(0, Math.floor(ms / 60000));
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    if (days > 0) return `${days} วัน ${hours} ชม.`;
    if (hours > 0) return `${hours} ชม. ${minutes} น.`;
    return `${minutes} น.`;
}

// "063-778-2214"
export function formatPhone(phone) {
    if (!phone) return '-';
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    return String(phone);
}

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

// หัวกลุ่มวันของประวัติ: "วันนี้ 23 ก.ย." / "เมื่อวาน 22 ก.ย." / "20 ก.ย."
export function formatDayLabel(d, now = new Date()) {
    const dayStart = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((dayStart(now) - dayStart(d)) / 86400000);
    const label = `${d.getDate()} ${TH_MONTHS[d.getMonth()]}`;
    if (diff === 0) return `วันนี้ ${label}`;
    if (diff === 1) return `เมื่อวาน ${label}`;
    return label;
}

const DEPOSIT = new Set(['deposit', 'assign']);
const RELEASE = new Set(['withdraw', 'web_unlock', 'unlock', 'admin_clear', 'delete']);

export const actionKey = (a) => String(a || '').toLowerCase();

// ระยะเวลาที่ฝาก = เวลารายการปล่อยตู้ ลบ เวลาฝากครั้งล่าสุดก่อนหน้าของตู้เดียวกัน
// คำนวณจากรายการที่โหลดมาแล้วเท่านั้น (rows เรียงใหม่ -> เก่า) หาไม่เจอก็ไม่แสดง
export function attachDurations(rows) {
    return rows.map((row, i) => {
        if (!RELEASE.has(actionKey(row.action))) return { ...row, durationMs: null };
        const end = parseDate(row.timestamp);
        for (let j = i + 1; j < rows.length; j += 1) {
            const prev = rows[j];
            if (prev.locker_id !== row.locker_id || prev.station_id !== row.station_id) continue;
            if (!DEPOSIT.has(actionKey(prev.action))) break;
            const start = parseDate(prev.timestamp);
            return { ...row, durationMs: start && end ? end - start : null };
        }
        return { ...row, durationMs: null };
    });
}
