import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { extractErrorMessage } from "./client";

describe("extractErrorMessage", () => {
    it("returns a string detail as-is", () => {
        expect(extractErrorMessage({ detail: "รหัสผ่านไม่ถูกต้อง" })).toBe("รหัสผ่านไม่ถูกต้อง");
    });

    it("joins FastAPI validation-error arrays into one message", () => {
        const detail = [{ msg: "field required" }, { msg: "too short" }];
        expect(extractErrorMessage({ detail })).toBe("field required, too short");
    });

    it("stringifies an object detail", () => {
        expect(extractErrorMessage({ detail: { code: 1 } })).toBe('{"code":1}');
    });

    it("falls back to message, then the given fallback", () => {
        expect(extractErrorMessage({ message: "boom" })).toBe("boom");
        expect(extractErrorMessage({})).toBe("เกิดข้อผิดพลาด");
        expect(extractErrorMessage(null)).toBe("เกิดข้อผิดพลาด");
        expect(extractErrorMessage(null, "custom fallback")).toBe("custom fallback");
    });
});

describe("api client requests", () => {
    const ORIGINAL_LOCATION = window.location;

    beforeEach(() => {
        vi.resetModules();
        sessionStorage.clear();
        delete window.location;
        window.location = { ...ORIGINAL_LOCATION, href: "" };
    });

    afterEach(() => {
        window.location = ORIGINAL_LOCATION;
        vi.unstubAllGlobals();
    });

    it("attaches the Authorization header from sessionStorage", async () => {
        sessionStorage.setItem("token", "abc123");
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ status: "success" }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const { apiGet } = await import("./client");
        await apiGet("/lockers");

        const [, options] = fetchMock.mock.calls[0];
        expect(options.headers.Authorization).toBe("Bearer abc123");
    });

    it("clears the session and redirects to / on 401", async () => {
        sessionStorage.setItem("token", "expired-token");
        sessionStorage.setItem("username", "admin");
        const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
        vi.stubGlobal("fetch", fetchMock);

        const { apiGet, ApiError } = await import("./client");
        await expect(apiGet("/users")).rejects.toBeInstanceOf(ApiError);

        expect(sessionStorage.getItem("token")).toBeNull();
        expect(sessionStorage.getItem("username")).toBeNull();
        expect(window.location.href).toBe("/");
    });

    it("does not redirect on 401 for unauthenticated requests (e.g. login)", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 401,
            json: async () => ({ detail: "wrong password" }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const { apiPost, ApiError } = await import("./client");
        await expect(apiPost("/login", { username: "a", password: "b" }, { auth: false }))
            .rejects.toThrow("wrong password");

        // ต้องไม่ redirect เพราะ 401 ตรงนี้คือ "รหัสผ่านผิด" ไม่ใช่ session หมดอายุ
        expect(window.location.href).toBe("");
    });

    it("throws ApiError with the parsed message on non-2xx", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 400,
            json: async () => ({ detail: "ข้อมูลไม่ถูกต้อง" }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const { apiPost, ApiError } = await import("./client");
        try {
            await apiPost("/lockers/1/unlock");
            expect.unreachable("should have thrown");
        } catch (err) {
            expect(err).toBeInstanceOf(ApiError);
            expect(err.status).toBe(400);
            expect(err.message).toBe("ข้อมูลไม่ถูกต้อง");
        }
    });
});
