// ลอจิกผังตู้ล็อกเกอร์ (แยกจาก component เพื่อให้เขียน test ได้)

export const TOTAL_LOCKERS = 36;
export const PER_CABINET = 18;
export const ROW_LABELS = ["Small", "Medium", "Large"];

// ตู้ขวา = 1-18, ตู้ซ้าย = 19-36
export const CABINETS = [
    { key: "right", title: "ตู้ขวา" },
    { key: "left", title: "ตู้ซ้าย" },
];

// เลขช่องจริงบนตู้ = box_number (นับ 1-36 ใหม่ทุกสาขา)
// ส่วน locker_id เป็นคีย์ของแถวใน DB ซึ่งอาจไม่ตรงกับเลขช่องเมื่อมีหลายสาขา
// ทุกที่ที่ "แสดงเลขตู้" หรือ "หาตำแหน่งในผัง" ต้องใช้ค่านี้ ไม่ใช่ locker_id
export function getLockerSlot(locker) {
    if (!locker) return null;
    const slot = locker.box_number ?? locker.locker_id;
    return slot == null ? null : Number(slot);
}

// เลขช่อง -> ตำแหน่งในตู้ (6 คอลัมน์ x 3 แถว)
// เรียงเป็นคู่คอลัมน์ ไล่ลงตามขนาด S -> M -> L
export function getLockerPosition(slotNumber) {
    const idx = Number(slotNumber) - 1;
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

// ช่องจอต้องเป็น 0 ชัดๆ เท่านั้น — NULL/undefined ถือเป็นตู้ปกติ
// ต้องตรงกับฝั่ง backend ไม่งั้นหน้าเว็บบอกว่าช่องจอ แต่ backend เคลียร์ข้อมูลให้
export function isScreenSlot(locker) {
    const flag = locker?.is_usable;
    return flag !== null && flag !== undefined && Number(flag) === 0;
}

// สถานะประตูสำหรับแสดงผล
export function getDoorState(locker) {
    if (isScreenSlot(locker)) {
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
