// ลอจิกผังตู้ล็อกเกอร์ (แยกจาก component เพื่อให้เขียน test ได้)

export const TOTAL_LOCKERS = 36;
export const PER_CABINET = 18;
export const ROW_LABELS = ["Small", "Medium", "Large"];

// ตู้ขวา = 1-18, ตู้ซ้าย = 19-36
export const CABINETS = [
    { key: "right", title: "ตู้ขวา" },
    { key: "left", title: "ตู้ซ้าย" },
];

// locker_id -> ตำแหน่งในตู้ (6 คอลัมน์ x 3 แถว)
// เรียงเป็นคู่คอลัมน์ ไล่ลงตามขนาด S -> M -> L
export function getLockerPosition(lockerId) {
    const idx = Number(lockerId) - 1;
    if (!Number.isInteger(idx) || idx < 0 || idx >= TOTAL_LOCKERS) return null;

    const local = idx % PER_CABINET;
    const pair = Math.floor(local / 6);   // คู่คอลัมน์ 0-2
    const within = local % 6;

    return {
        cabinet: idx < PER_CABINET ? "right" : "left",
        row: Math.floor(within / 2),      // 0=Small 1=Medium 2=Large
        col: pair * 2 + (within % 2),     // 0-5
    };
}

// สถานะประตูสำหรับแสดงผล
export function getDoorState(locker) {
    if (Number(locker.is_usable) === 0) {
        return { className: "door-screen", label: "ช่องจอ" };
    }
    if (Number(locker.status) === 1) {
        return locker.is_overdue
            ? { className: "door-overdue", label: "เกินกำหนด" }
            : { className: "door-used", label: "มีของฝาก" };
    }
    return { className: "door-free", label: "ว่าง" };
}

export function formatDateTime(value) {
    if (!value) return "-";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString("th-TH");
}
