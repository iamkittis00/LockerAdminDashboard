import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { attachDurations, formatDateTimeShortBE, formatDuration, formatDayLabel } from "./format";
import HistoryList from "./HistoryList";
import DashboardPage from "../../pages/DashboardPage";
import StaffManagementPanel from "../StaffManagementPanel";
import { fetchTransactions } from "../../api/transactions";
import { fetchLockers } from "../../api/lockers";
import { fetchStations } from "../../api/stations";
import { fetchStaff } from "../../api/staff";

vi.mock("../../api/transactions", () => ({ fetchTransactions: vi.fn() }));
vi.mock("../../api/lockers", () => ({ fetchLockers: vi.fn() }));
vi.mock("../../api/stations", () => ({ fetchStations: vi.fn() }));
vi.mock("../../api/auth", () => ({ changePassword: vi.fn() }));
vi.mock("../../api/staff", () => ({
    fetchStaff: vi.fn(), createStaff: vi.fn(), deleteStaff: vi.fn(), resetStaffPassword: vi.fn(),
}));
vi.mock("react-hot-toast", () => ({
    default: { success: vi.fn(), error: vi.fn() },
    Toaster: () => null,
}));

const originalMatchMedia = window.matchMedia;

function forceMobile() {
    window.matchMedia = (query) => ({
        matches: query.includes("max-width"),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    forceMobile();
    sessionStorage.clear();
    sessionStorage.setItem("username", "test");
    fetchStations.mockResolvedValue({ data: [{ station_id: 1, station_name: "Rama 9 Hotel" }] });
});

afterEach(() => {
    window.matchMedia = originalMatchMedia;
});

describe("ตัวจัดรูปแบบ", () => {
    it("วันเวลาเป็น dd/mm/yy แบบ พ.ศ.", () => {
        expect(formatDateTimeShortBE("2026-09-22 13:42:00")).toBe("22/09/69 13:42");
        expect(formatDateTimeShortBE(null)).toBe("-");
    });

    it("ระยะเวลาอ่านง่าย", () => {
        expect(formatDuration(25 * 60000)).toBe("25 น.");
        expect(formatDuration((2 * 60 + 29) * 60000)).toBe("2 ชม. 29 น.");
        expect(formatDuration((27 * 60) * 60000)).toBe("1 วัน 3 ชม.");
    });

    it("หัวกลุ่มวัน", () => {
        const now = new Date(2026, 8, 23, 12);
        expect(formatDayLabel(new Date(2026, 8, 23, 8), now)).toBe("วันนี้ 23 ก.ย.");
        expect(formatDayLabel(new Date(2026, 8, 22, 8), now)).toBe("เมื่อวาน 22 ก.ย.");
        expect(formatDayLabel(new Date(2026, 8, 20, 8), now)).toBe("20 ก.ย.");
    });
});

describe("attachDurations — ระยะเวลาที่ฝาก", () => {
    const rows = [
        { trans_id: 3, locker_id: 4, station_id: 1, action: "withdraw", timestamp: "2026-09-23 15:40:00" },
        { trans_id: 2, locker_id: 9, station_id: 1, action: "deposit", timestamp: "2026-09-23 15:20:00" },
        { trans_id: 1, locker_id: 4, station_id: 1, action: "deposit", timestamp: "2026-09-23 15:15:00" },
    ];

    it("จับคู่รับคืนกับการฝากล่าสุดของตู้เดียวกัน", () => {
        const out = attachDurations(rows);
        expect(out[0].durationMs).toBe(25 * 60000);
    });

    it("รายการฝากของไม่มีระยะเวลา", () => {
        expect(attachDurations(rows)[1].durationMs).toBeNull();
    });

    it("หาการฝากก่อนหน้าไม่เจอ (อยู่หน้าที่ยังไม่โหลด) ไม่แสดง ไม่เดา", () => {
        expect(attachDurations([rows[0]])[0].durationMs).toBeNull();
    });

    it("ถ้าเจอการปล่อยตู้ซ้อนก่อนเจอการฝาก ไม่จับคู่ข้ามกัน", () => {
        const out = attachDurations([
            rows[0],
            { trans_id: 9, locker_id: 4, station_id: 1, action: "web_unlock", timestamp: "2026-09-23 15:30:00" },
            rows[2],
        ]);
        expect(out[0].durationMs).toBeNull();
    });
});

describe("HistoryList (มือถือ)", () => {
    it("แสดงแต่ละรายการตามรูปแบบที่ตกลง", async () => {
        const today = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        const d = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
        fetchTransactions.mockResolvedValue({
            data: [
                { trans_id: 2, locker_id: 1, station_id: 1, room_number: "1116", phone: "0816339304",
                  action: "withdraw", staff_id: null, staff_name: null, timestamp: `${d} 00:40:00` },
                { trans_id: 1, locker_id: 1, station_id: 1, room_number: "1116", phone: "0816339304",
                  action: "deposit", staff_id: null, staff_name: null, timestamp: `${d} 00:15:00` },
            ],
        });
        render(<HistoryList stationId="1" />);

        const item = (await screen.findByText("รับของคืน")).closest("li");
        expect(item).not.toHaveClass("bg-amber-50");
        expect(within(item).getByText("ตู้ 1")).toBeInTheDocument();
        expect(within(item).getByText("ห้อง 1116")).toBeInTheDocument();
        expect(within(item).getByText("เบอร์โทร 081-633-9304")).toBeInTheDocument();
        expect(within(item).getByText("ลูกค้าทำเองที่ตู้")).toBeInTheDocument();
        expect(within(item).getByText("ฝากไป 25 น.")).toBeInTheDocument();
        expect(within(item).getByText("00:40")).toBeInTheDocument();
        expect(screen.getByText(/^วันนี้ /)).toBeInTheDocument();
    });

    it("รายการที่พนักงานสั่งเปิดบอกชื่อคนกด", async () => {
        fetchTransactions.mockResolvedValue({
            data: [{ trans_id: 5, locker_id: 25, station_id: 1, action: "web_unlock",
                     staff_id: 3, staff_name: "test", timestamp: "2026-09-23 15:51:00" }],
        });
        render(<HistoryList stationId="1" />);
        expect(await screen.findByText("โดย test")).toBeInTheDocument();
        expect(screen.getByText("แอดมินสั่งเปิด").closest("li")).toHaveClass("bg-amber-50");
    });
});

describe("DashboardPage บนมือถือ", () => {
    function renderDash() {
        return render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    }

    it("มีเมนูล่าง และไม่มีปุ่มแถวบนแบบจอคอม", async () => {
        fetchLockers.mockResolvedValue([]);
        renderDash();
        const nav = screen.getByRole("navigation", { name: "เมนูหลัก" });
        expect(within(nav).getByRole("button", { name: "ตู้" })).toHaveAttribute("aria-current", "page");
        expect(within(nav).queryByRole("button", { name: "พนักงาน" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /ออกจากระบบ/ })).not.toBeInTheDocument();
        expect(await screen.findByRole("heading", { name: "Rama 9 Hotel" })).toBeInTheDocument();
    });

    it("ตู้เกินกำหนดเป็นการ์ดพื้นแดงทั้งกล่อง พร้อมข้อมูลครบ", async () => {
        const dep = new Date(Date.now() - 27 * 3600000);
        const pad = (n) => String(n).padStart(2, "0");
        const ts = `${dep.getFullYear()}-${pad(dep.getMonth() + 1)}-${pad(dep.getDate())} ${pad(dep.getHours())}:${pad(dep.getMinutes())}:00`;
        fetchLockers.mockResolvedValue([
            { locker_id: 7, box_number: 7, status: 1, is_usable: 1, is_overdue: true,
              room_number: "0118", phone_owner: "0845556677", deposit_time: ts },
        ]);
        renderDash();
        const card = (await screen.findByText("ตู้ 7")).closest("li");
        expect(card).toHaveClass("bg-red-50");
        expect(within(card).getByText("ห้อง 0118")).toBeInTheDocument();
        expect(within(card).getByText("เบอร์โทร 084-555-6677")).toBeInTheDocument();
        expect(within(card).getByText(/^ฝากเมื่อ \d\d\/\d\d\/\d\d \d\d:\d\d$/)).toBeInTheDocument();
        expect(within(card).getByText(/^เกินมา /)).toBeInTheDocument();
    });

    it("ออกจากระบบอยู่ในหน้าตั้งค่า และล้าง session จริง", async () => {
        fetchLockers.mockResolvedValue([]);
        sessionStorage.setItem("token", "t");
        const user = userEvent.setup();
        renderDash();
        await user.click(screen.getByRole("button", { name: "ตั้งค่า" }));
        await user.click(screen.getByRole("button", { name: "ออกจากระบบ" }));
        expect(sessionStorage.getItem("token")).toBeNull();
    });

    it("กดประวัติแล้วสลับเป็นหน้าลิสต์ ไม่ใช่ modal", async () => {
        fetchLockers.mockResolvedValue([]);
        fetchTransactions.mockResolvedValue({ data: [] });
        const user = userEvent.setup();
        renderDash();
        await user.click(screen.getByRole("button", { name: "ประวัติ" }));
        expect(await screen.findByText("ยังไม่มีประวัติการใช้งาน")).toBeInTheDocument();
        expect(screen.queryByText("ประวัติการใช้งานล็อกเกอร์")).not.toBeInTheDocument();
    });
});

describe("StaffManagementPanel บนมือถือ", () => {
    it("เป็นการ์ด ปุ่มรีเซ็ตรหัสและลบอยู่ในการ์ดเสมอ", async () => {
        fetchStaff.mockResolvedValue({
            data: [{ user_id: 11, username: "somchai", fullname: "สมชาย ใจดี", phone: "0812345678",
                     is_active: 1, last_login: null }],
        });
        render(<StaffManagementPanel stationId={1} stationName="Rama 9" />);
        const card = (await screen.findByText("สมชาย ใจดี")).closest("li");
        expect(within(card).getByRole("button", { name: /รีเซ็ตรหัส/ })).toBeInTheDocument();
        expect(within(card).getByRole("button", { name: /ลบ/ })).toBeInTheDocument();
        expect(within(card).getByText("ยังไม่เคยเข้า")).toBeInTheDocument();
        expect(screen.queryByRole("table")).not.toBeInTheDocument();
        await waitFor(() => expect(fetchStaff).toHaveBeenCalledWith(1));
    });
});
