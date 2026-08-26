import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchLockers, fetchLockerDetail, unlockLocker } from "./lockers";

const fetchMock = vi.fn();

function jsonOnce(payload, ok = true, status = 200) {
    fetchMock.mockResolvedValueOnce({ ok, status, json: async () => payload });
}

function calledPath() {
    return String(fetchMock.mock.calls[0][0]);
}

beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    sessionStorage.clear();
    sessionStorage.setItem("token", "tok-1");
    sessionStorage.setItem("expiresAt", String(Date.now() + 3600_000));
});

afterEach(() => {
    vi.unstubAllGlobals();
});

// เทสต์รันโดยไม่มี VITE_API_BASE_URL เหมือน CI เป๊ะ — จึงเป็นด่านจับ regression ตัวนี้ได้
describe("base URL", () => {
    it("ไม่มี VITE_API_BASE_URL ต้องยิงไป /api ไม่ใช่ undefined", async () => {
        jsonOnce({ data: [] });
        await fetchLockers();
        const url = calledPath();
        expect(url.startsWith("/api/")).toBe(true);
        expect(url).not.toContain("undefined");
    });
});

describe("fetchLockers", () => {
    it("แกะ data ออกจาก {status, data} ให้เป็น array", async () => {
        jsonOnce({ status: "success", data: [{ locker_id: 1 }] });
        await expect(fetchLockers()).resolves.toEqual([{ locker_id: 1 }]);
    });

    it("ยังรับ array เปล่าได้ เผื่อ bundle เก่าเจอ API เก่า", async () => {
        jsonOnce([{ locker_id: 2 }]);
        await expect(fetchLockers()).resolves.toEqual([{ locker_id: 2 }]);
    });

    it("รูปแบบที่ไม่รู้จัก คืน array ว่าง ไม่ระเบิด", async () => {
        jsonOnce({ status: "success" });
        await expect(fetchLockers()).resolves.toEqual([]);
    });

    it("ไม่ส่ง station_id เมื่อไม่ได้ระบุ (admin ใช้สาขาตัวเอง)", async () => {
        jsonOnce({ data: [] });
        await fetchLockers();
        expect(calledPath()).toBe("/api/lockers");
    });

    it("ส่ง station_id เมื่อ ceo เลือกสาขา", async () => {
        jsonOnce({ data: [] });
        await fetchLockers("2");
        expect(calledPath()).toBe("/api/lockers?station_id=2");
    });
});

describe("fetchLockerDetail / unlockLocker", () => {
    it("แนบ station_id ไปกับ path ของตู้", async () => {
        jsonOnce([{ locker_id: 41 }]);
        await fetchLockerDetail(41, "2");
        expect(calledPath()).toBe("/api/lockers/41?station_id=2");
    });

    it("ไม่มี station ก็ยิงได้ ไม่มี query ติดไป", async () => {
        jsonOnce([]);
        await fetchLockerDetail(3);
        expect(calledPath()).toBe("/api/lockers/3");
    });

    it("unlock ส่ง POST พร้อม station_id", async () => {
        jsonOnce({ status: "success" });
        await unlockLocker(41, "2");
        expect(calledPath()).toBe("/api/lockers/41/unlock?station_id=2");
        expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    });

    it("encode ค่าที่ไม่ปลอดภัยใน path", async () => {
        jsonOnce([]);
        await fetchLockerDetail("1/../9");
        expect(calledPath()).toBe("/api/lockers/1%2F..%2F9");
    });
});
