import { describe, it, expect } from "vitest";
import {
    TOTAL_LOCKERS,
    getLockerPosition,
    getDoorState,
    isScreenSlot,
    formatDateTime,
} from "./lockerLayout";

// ตำแหน่งอ้างอิงที่ผู้ใช้ยืนยันจริงจากผังตู้ (2026-08-22)
const EXPECTED = {
    right: [
        [1, 2, 7, 8, 13, 14],
        [3, 4, 9, 10, 15, 16],
        [5, 6, 11, 12, 17, 18],
    ],
    left: [
        [19, 20, 25, 26, 31, 32],
        [21, 22, 27, 28, 33, 34],
        [23, 24, 29, 30, 35, 36],
    ],
};

describe("getLockerPosition", () => {
    it.each(
        Object.entries(EXPECTED).flatMap(([cabinet, rows]) =>
            rows.flatMap((ids, row) => ids.map((id, col) => [id, cabinet, row, col]))
        )
    )("locker %i -> %s cabinet, row %i, col %i", (id, cabinet, row, col) => {
        expect(getLockerPosition(id)).toEqual({ cabinet, row, col });
    });

    it("covers all 36 lockers with no gaps or duplicates", () => {
        const seen = new Set();
        for (let id = 1; id <= TOTAL_LOCKERS; id++) {
            const pos = getLockerPosition(id);
            expect(pos).not.toBeNull();
            const key = `${pos.cabinet}-${pos.row}-${pos.col}`;
            expect(seen.has(key)).toBe(false);
            seen.add(key);
        }
        expect(seen.size).toBe(TOTAL_LOCKERS);
    });

    it.each([0, -1, 37, 100, NaN])("returns null for out-of-range id %s", (id) => {
        expect(getLockerPosition(id)).toBeNull();
    });

    it("returns null for non-numeric id", () => {
        expect(getLockerPosition("abc")).toBeNull();
        expect(getLockerPosition(undefined)).toBeNull();
        expect(getLockerPosition(null)).toBeNull();
    });

    it("accepts numeric strings the way the API sends them", () => {
        expect(getLockerPosition("1")).toEqual({ cabinet: "right", row: 0, col: 0 });
    });
});

describe("getDoorState", () => {
    it("marks the screen slot regardless of status/overdue", () => {
        expect(getDoorState({ is_usable: 0, status: 1, is_overdue: true })).toEqual({
            className: "door-screen",
            label: "ช่องจอ",
        });
        expect(getDoorState({ is_usable: 0, status: 0 })).toEqual({
            className: "door-screen",
            label: "ช่องจอ",
        });
    });

    it("marks overdue red only when occupied AND overdue", () => {
        expect(getDoorState({ is_usable: 1, status: 1, is_overdue: true })).toEqual({
            className: "door-overdue",
            label: "เกินกำหนด",
        });
    });

    it("marks occupied-but-not-overdue as used", () => {
        expect(getDoorState({ is_usable: 1, status: 1, is_overdue: false })).toEqual({
            className: "door-used",
            label: "มีของฝาก",
        });
    });

    it("marks empty lockers as free", () => {
        expect(getDoorState({ is_usable: 1, status: 0, is_overdue: false })).toEqual({
            className: "door-free",
            label: "ว่าง",
        });
    });

    it("treats string '0'/'1' from the API the same as numbers", () => {
        expect(getDoorState({ is_usable: "0", status: "1" }).className).toBe("door-screen");
        expect(getDoorState({ is_usable: "1", status: "1", is_overdue: true }).className).toBe("door-overdue");
    });
});

describe("formatDateTime", () => {
    it("returns '-' for empty/null/undefined", () => {
        expect(formatDateTime(null)).toBe("-");
        expect(formatDateTime(undefined)).toBe("-");
        expect(formatDateTime("")).toBe("-");
    });

    it("falls back to the raw string for an unparsable date", () => {
        expect(formatDateTime("not-a-date")).toBe("not-a-date");
    });

    it("formats a valid date string", () => {
        const result = formatDateTime("2026-08-22 10:00:00");
        expect(result).not.toBe("-");
        expect(result).not.toBe("2026-08-22 10:00:00");
    });
});

describe("isScreenSlot", () => {
    it("เป็นช่องจอเมื่อ is_usable = 0 เท่านั้น", () => {
        expect(isScreenSlot({ is_usable: 0 })).toBe(true);
        expect(isScreenSlot({ is_usable: "0" })).toBe(true);
        expect(isScreenSlot({ is_usable: 1 })).toBe(false);
    });

    it("NULL/undefined ถือเป็นตู้ปกติ ให้ตรงกับ backend", () => {
        // ถ้ามองผิดเป็นช่องจอ backend จะเคลียร์ข้อมูลให้แต่หน้าเว็บบอกว่าไม่ใช่ตู้ฝากของ
        expect(isScreenSlot({ is_usable: null })).toBe(false);
        expect(isScreenSlot({})).toBe(false);
        expect(isScreenSlot(null)).toBe(false);
    });

    it("ตู้ที่ is_usable เป็น NULL ต้องแสดงสถานะตามการใช้งานจริง ไม่ใช่ช่องจอ", () => {
        expect(getDoorState({ is_usable: null, status: 0 }).className).toBe("door-free");
        expect(getDoorState({ is_usable: null, status: 1, is_overdue: false }).className).toBe("door-used");
    });
});
