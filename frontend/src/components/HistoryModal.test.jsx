import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import HistoryModal from "./HistoryModal";
import { fetchTransactions } from "../api/transactions";

vi.mock("../api/transactions", () => ({ fetchTransactions: vi.fn() }));

const ROWS = [
    {
        trans_id: 1,
        timestamp: "2026-08-25 16:45:48",
        station_id: 1,
        station_name: "LockerStation 1",
        locker_id: 5,
        phone: "0863841265",
        staff_name: null,
        action: "deposit",
        detail: "Deposit size L with pass_code",
    },
    {
        trans_id: 2,
        timestamp: "2026-08-25 16:36:29",
        station_id: 1,
        station_name: "LockerStation 1",
        locker_id: 4,
        phone: "0863841265",
        staff_name: "สมชาย ใจดี",
        action: "UNLOCK",
        detail: "ส่งคำสั่ง MQTT เปิดตู้",
    },
];

function rowOf(text) {
    return screen.getByText(text).closest("tr");
}

beforeEach(() => {
    vi.clearAllMocks();
    fetchTransactions.mockResolvedValue({ data: ROWS });
});

describe("HistoryModal", () => {
    it("ดึงประวัติเฉพาะสาขาที่เปิดอยู่", async () => {
        render(<HistoryModal stationId="1" onClose={() => {}} />);
        await waitFor(() => expect(fetchTransactions).toHaveBeenCalledWith(100, 0, "1"));
    });

    it("มีคอลัมน์สาขา และแสดงชื่อสาขาในแต่ละแถว", async () => {
        render(<HistoryModal stationId="1" onClose={() => {}} />);
        expect(await screen.findByRole("columnheader", { name: "สาขา" })).toBeInTheDocument();
        expect(screen.getAllByText("LockerStation 1")).toHaveLength(2);
    });

    it("ไม่มีชื่อสาขาส่งมา ให้ fallback เป็น 'สาขา {id}'", async () => {
        fetchTransactions.mockResolvedValue({ data: [{ ...ROWS[0], station_name: null }] });
        render(<HistoryModal stationId="1" onClose={() => {}} />);
        expect(await screen.findByText("สาขา 1")).toBeInTheDocument();
    });

    it("แสดงชื่อพนักงานจาก staff_name ไม่ใช่ fullname ที่ backend ไม่ได้ส่งมา", async () => {
        render(<HistoryModal stationId="1" onClose={() => {}} />);
        const row = await waitFor(() => rowOf("ส่งคำสั่ง MQTT เปิดตู้"));
        expect(within(row).getByText("สมชาย ใจดี")).toBeInTheDocument();
    });

    it("รายการที่ไม่มีพนักงาน (ลูกค้าทำเองที่ตู้) ขึ้นว่า ระบบ/ตู้", async () => {
        render(<HistoryModal stationId="1" onClose={() => {}} />);
        const row = await waitFor(() => rowOf("Deposit size L with pass_code"));
        expect(within(row).getByText("ระบบ/ตู้")).toBeInTheDocument();
    });

    it("แปลง action เป็นภาษาไทย รองรับทั้งตัวพิมพ์เล็กจากตู้และตัวพิมพ์ใหญ่จากหน้าเว็บ", async () => {
        render(<HistoryModal stationId="1" onClose={() => {}} />);
        expect(await screen.findByText("ฝากของ")).toBeInTheDocument();
        expect(screen.getByText("แอดมินสั่งเปิด")).toBeInTheDocument();
    });

    it("action ที่ไม่รู้จัก แสดงค่าดิบไว้ ไม่ทำให้แถวหาย", async () => {
        fetchTransactions.mockResolvedValue({ data: [{ ...ROWS[0], action: "SOMETHING_NEW" }] });
        render(<HistoryModal stationId="1" onClose={() => {}} />);
        expect(await screen.findByText("SOMETHING_NEW")).toBeInTheDocument();
    });

    it("ได้ไม่ครบหน้า ไม่ต้องขึ้นปุ่มโหลดเพิ่มเติม", async () => {
        render(<HistoryModal stationId="1" onClose={() => {}} />);
        await screen.findByText("ฝากของ");
        expect(screen.queryByRole("button", { name: "โหลดเพิ่มเติม" })).not.toBeInTheDocument();
    });

    it("ได้เต็มหน้า ขึ้นปุ่มโหลดเพิ่มเติม แล้วดึงหน้าถัดไปด้วย offset ที่ถูกต้อง", async () => {
        const full = Array.from({ length: 100 }, (_, i) => ({ ...ROWS[0], trans_id: i + 1 }));
        fetchTransactions.mockResolvedValueOnce({ data: full }).mockResolvedValueOnce({ data: [] });
        const user = userEvent.setup();
        render(<HistoryModal stationId="1" onClose={() => {}} />);

        const more = await screen.findByRole("button", { name: "โหลดเพิ่มเติม" });
        await user.click(more);
        await waitFor(() => expect(fetchTransactions).toHaveBeenLastCalledWith(100, 100, "1"));
    });

    it("คืนค่า overflow ของ body ตอนปิด", async () => {
        const { unmount } = render(<HistoryModal stationId="1" onClose={() => {}} />);
        await screen.findByText("ฝากของ");
        expect(document.body.style.overflow).toBe("hidden");
        unmount();
        expect(document.body.style.overflow).toBe("");
    });
});
