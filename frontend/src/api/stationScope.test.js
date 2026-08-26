import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ตรวจว่า api layer แนบ station_id ให้ถูก — ceo ต้องส่ง, admin ต้องไม่ส่ง (ให้ backend
// บังคับสาขาตัวเอง ถ้าเผลอส่งมาจาก client จะกลายเป็นเชื่อค่าที่ผู้ใช้แก้ได้)
describe("api layer — station scoping", () => {
    let fetchMock;

    beforeEach(() => {
        vi.resetModules();
        sessionStorage.clear();
        sessionStorage.setItem("token", "tok-1");
    sessionStorage.setItem("expiresAt", String(Date.now() + 3600_000));
        fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ status: "success", data: [] }),
        });
        vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const calledUrl = () => String(fetchMock.mock.calls[0][0]);

    it("fetchLockers ไม่ส่ง station_id เมื่อไม่ระบุ (โหมด admin)", async () => {
        const { fetchLockers } = await import("./lockers");
        await fetchLockers();
        expect(calledUrl()).toContain("/lockers");
        expect(calledUrl()).not.toContain("station_id");
    });

    it("fetchLockers ส่ง station_id เมื่อ ceo เลือกสาขา", async () => {
        const { fetchLockers } = await import("./lockers");
        await fetchLockers(3);
        expect(calledUrl()).toContain("station_id=3");
    });

    it("fetchTransactions ไม่ส่ง station_id เมื่อไม่ระบุ", async () => {
        const { fetchTransactions } = await import("./transactions");
        await fetchTransactions(50, 0);
        expect(calledUrl()).toContain("limit=50");
        expect(calledUrl()).not.toContain("station_id");
    });

    it("fetchTransactions ส่ง station_id เมื่อระบุ", async () => {
        const { fetchTransactions } = await import("./transactions");
        await fetchTransactions(50, 0, 2);
        expect(calledUrl()).toContain("station_id=2");
    });

    it("fetchStaff ผูกกับสาขาที่ระบุเสมอ", async () => {
        const { fetchStaff } = await import("./staff");
        await fetchStaff(4);
        expect(calledUrl()).toContain("/staff?station_id=4");
    });

    it("unlockLocker ไม่แนบสาขาจาก client — backend อ่านของตู้เองจาก DB", async () => {
        const { unlockLocker } = await import("./lockers");
        await unlockLocker(7);
        expect(calledUrl()).toContain("/lockers/7/unlock");
        expect(calledUrl()).not.toContain("station_id");
    });
});
