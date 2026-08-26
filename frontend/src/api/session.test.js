import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    readTokenExpiry,
    saveSession,
    clearSession,
    getSessionExpiry,
    isSessionExpired,
    hasValidSession,
    watchSessionExpiry,
    SESSION_MAX_MS,
} from "./client";

// สร้าง JWT ปลอมที่มีแค่ payload ให้ถอดได้ (ไม่ต้องเซ็นจริง ฝั่งเว็บอ่านแค่ exp)
function fakeToken(payload) {
    const b64 = btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return `header.${b64}.signature`;
}

const IN_1H = () => Math.floor((Date.now() + 60 * 60 * 1000) / 1000);

beforeEach(() => {
    sessionStorage.clear();
});

describe("readTokenExpiry", () => {
    it("อ่าน exp ออกมาเป็นมิลลิวินาที", () => {
        const exp = IN_1H();
        expect(readTokenExpiry(fakeToken({ sub: "admin", exp }))).toBe(exp * 1000);
    });

    it("รองรับ base64url ที่ไม่มี padding", () => {
        const exp = IN_1H();
        const token = fakeToken({ sub: "a".repeat(5), exp });
        expect(token).not.toContain("=");
        expect(readTokenExpiry(token)).toBe(exp * 1000);
    });

    it("token พังหรือไม่มี exp คืน null ไม่ throw", () => {
        expect(readTokenExpiry("")).toBeNull();
        expect(readTokenExpiry("not-a-jwt")).toBeNull();
        expect(readTokenExpiry("a.!!!!.c")).toBeNull();
        expect(readTokenExpiry(fakeToken({ sub: "admin" }))).toBeNull();
        expect(readTokenExpiry(fakeToken({ exp: "soon" }))).toBeNull();
        expect(readTokenExpiry(null)).toBeNull();
    });
});

describe("saveSession", () => {
    it("เก็บครบทุกคีย์ และตั้งวันหมดอายุตาม exp ของ token", () => {
        const exp = IN_1H();
        saveSession({
            access_token: fakeToken({ sub: "superadmin", exp }),
            username: "superadmin",
            role: "ceo",
            must_change_password: false,
        });

        expect(sessionStorage.getItem("username")).toBe("superadmin");
        expect(sessionStorage.getItem("role")).toBe("ceo");
        expect(sessionStorage.getItem("mustChangePassword")).toBe("0");
        expect(getSessionExpiry()).toBe(exp * 1000);
        expect(hasValidSession()).toBe(true);
    });

    it("token ที่อ่าน exp ไม่ได้ ให้ตกลงมาที่เพดาน 24 ชม.", () => {
        const before = Date.now();
        saveSession({ access_token: "opaque-token", username: "admin", role: "admin" });

        const expiresAt = getSessionExpiry();
        expect(expiresAt).toBeGreaterThanOrEqual(before + SESSION_MAX_MS);
        expect(expiresAt).toBeLessThanOrEqual(Date.now() + SESSION_MAX_MS);
    });

    it("clearSession ลบวันหมดอายุไปด้วย ไม่เหลือค้าง", () => {
        saveSession({ access_token: fakeToken({ exp: IN_1H() }), username: "admin", role: "admin" });
        clearSession();
        expect(sessionStorage.getItem("expiresAt")).toBeNull();
        expect(hasValidSession()).toBe(false);
    });
});

describe("isSessionExpired", () => {
    it("ไม่มี session ไม่นับว่าหมดอายุ (แค่ยังไม่ได้ล็อกอิน)", () => {
        expect(isSessionExpired()).toBe(false);
    });

    it("ยังไม่ถึงเวลา = ยังไม่หมด", () => {
        sessionStorage.setItem("token", "tok");
        sessionStorage.setItem("expiresAt", String(Date.now() + 1000));
        expect(isSessionExpired()).toBe(false);
    });

    it("เลยเวลาแล้ว = หมด", () => {
        sessionStorage.setItem("token", "tok");
        sessionStorage.setItem("expiresAt", String(Date.now() - 1));
        expect(isSessionExpired()).toBe(true);
    });

    it("มี token แต่ไม่มี/พัง expiresAt ถือว่าหมด (fail closed)", () => {
        sessionStorage.setItem("token", "tok");
        expect(isSessionExpired()).toBe(true);

        sessionStorage.setItem("expiresAt", "ไม่ใช่ตัวเลข");
        expect(isSessionExpired()).toBe(true);
    });
});

describe("watchSessionExpiry", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("เตะออกเองเมื่อถึงเวลา โดยไม่ต้องรอผู้ใช้กดอะไร", () => {
        const onExpire = vi.fn();
        sessionStorage.setItem("token", "tok");
        sessionStorage.setItem("expiresAt", String(Date.now() + 60_000));

        const stop = watchSessionExpiry(onExpire);
        expect(onExpire).not.toHaveBeenCalled();

        vi.advanceTimersByTime(60_000);
        expect(onExpire).toHaveBeenCalledTimes(1);
        stop();
    });

    it("เรียกทันทีถ้าหมดอายุไปแล้วตั้งแต่เปิดหน้า", () => {
        const onExpire = vi.fn();
        sessionStorage.setItem("token", "tok");
        sessionStorage.setItem("expiresAt", String(Date.now() - 1));

        const stop = watchSessionExpiry(onExpire);
        expect(onExpire).toHaveBeenCalledTimes(1);
        stop();
    });

    it("อยู่หน้า login (ไม่มี token) ต้องไม่เตะซ้ำจนวนลูป", () => {
        const onExpire = vi.fn();
        const stop = watchSessionExpiry(onExpire);
        vi.advanceTimersByTime(SESSION_MAX_MS);
        expect(onExpire).not.toHaveBeenCalled();
        stop();
    });

    it("กลับมาที่แท็บแล้วเช็คซ้ำ — กันเคสเครื่อง sleep ทำให้ timer ไม่เดิน", () => {
        const onExpire = vi.fn();
        sessionStorage.setItem("token", "tok");
        sessionStorage.setItem("expiresAt", String(Date.now() + 60_000));

        const stop = watchSessionExpiry(onExpire);
        // จำลองว่าเครื่องหลับข้ามเวลาหมดอายุไป โดย timer ไม่ทำงาน
        sessionStorage.setItem("expiresAt", String(Date.now() - 1));
        document.dispatchEvent(new Event("visibilitychange"));

        expect(onExpire).toHaveBeenCalledTimes(1);
        stop();
    });

    it("ล็อกอินหลังตัวเฝ้าเริ่มทำงานแล้ว ต้องตั้งนาฬิกาใหม่ให้", () => {
        // เคสจริง: App mount ตอนอยู่หน้า login (ยังไม่มี token) แล้ว navigate
        // ไป dashboard แบบ client-side — App ไม่ remount ตัวเฝ้าจึงไม่มีอะไรมาปลุก
        const onExpire = vi.fn();
        const stop = watchSessionExpiry(onExpire);

        saveSession({ access_token: "opaque", username: "admin1", role: "admin" });

        vi.advanceTimersByTime(SESSION_MAX_MS);
        expect(onExpire).toHaveBeenCalledTimes(1);
        stop();
    });

    it("ออกจากระบบเองแล้วตัวเฝ้าต้องเงียบ ไม่เตะซ้ำ", () => {
        const onExpire = vi.fn();
        saveSession({ access_token: "opaque", username: "admin1", role: "admin" });
        const stop = watchSessionExpiry(onExpire);

        clearSession();
        vi.advanceTimersByTime(SESSION_MAX_MS * 2);
        expect(onExpire).not.toHaveBeenCalled();
        stop();
    });

    it("เลิกเฝ้าแล้ว timer ต้องไม่ยิงอีก", () => {
        const onExpire = vi.fn();
        sessionStorage.setItem("token", "tok");
        sessionStorage.setItem("expiresAt", String(Date.now() + 60_000));

        const stop = watchSessionExpiry(onExpire);
        stop();
        vi.advanceTimersByTime(120_000);
        document.dispatchEvent(new Event("visibilitychange"));
        expect(onExpire).not.toHaveBeenCalled();
    });
});
