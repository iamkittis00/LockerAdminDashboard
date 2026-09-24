import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import CeoStationPage from "./CeoStationPage";
import { fetchStations, updateStation } from "../api/stations";
import { fetchStaff } from "../api/staff";
import { fetchLockers } from "../api/lockers";

vi.mock("../api/stations", () => ({ fetchStations: vi.fn(), updateStation: vi.fn() }));
vi.mock("../api/lockers", () => ({ fetchLockers: vi.fn() }));
vi.mock("../api/transactions", () => ({ fetchTransactions: vi.fn() }));
vi.mock("../api/auth", () => ({ changePassword: vi.fn() }));
vi.mock("../api/staff", () => ({
    fetchStaff: vi.fn(),
    createStaff: vi.fn(),
    updateStaff: vi.fn(),
    resetStaffPassword: vi.fn(),
}));

vi.mock("react-hot-toast", () => ({
    default: { success: vi.fn(), error: vi.fn() },
    Toaster: () => null,
}));

const STATION = {
    station_id: 2,
    station_name: "โรงแรม 2",
    location: "สีลม",
    status: 1,
    occupied_count: 4,
    overdue_count: 1,
    staff_count: 5,
};

function renderPage(path = "/ceo/2") {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="/" element={<div>หน้าล็อกอิน</div>} />
                <Route path="/ceo" element={<div>หน้ารวมสาขา</div>} />
                <Route path="/ceo/:stationId" element={<CeoStationPage />} />
            </Routes>
        </MemoryRouter>
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    fetchStations.mockResolvedValue({ data: [STATION] });
    fetchLockers.mockResolvedValue([]);
    fetchStaff.mockResolvedValue({ data: [] });
});

describe("CeoStationPage", () => {
    it("แสดงชื่อสาขา ที่ตั้ง และรหัสสาขาไว้บนหัวหน้า", async () => {
        renderPage();
        expect(await screen.findByRole("heading", { name: "โรงแรม 2" })).toBeInTheDocument();
        expect(screen.getByText("สีลม · รหัสสาขา #2")).toBeInTheDocument();
    });

    it("เปิดหน้ามาอยู่แท็บตู้ล็อกเกอร์ก่อน และยังไม่โหลดรายชื่อพนักงาน", async () => {
        renderPage();
        await waitFor(() => expect(fetchLockers).toHaveBeenCalledWith("2"));
        expect(screen.getByRole("tab", { name: /ตู้ล็อกเกอร์/ })).toHaveAttribute("aria-selected", "true");
        expect(fetchStaff).not.toHaveBeenCalled();
    });

    it("badge จำนวนพนักงานมาจากยอดที่ backend ส่งมา ไม่ต้องเปิดแท็บก่อน", async () => {
        renderPage();
        const staffTab = await screen.findByRole("tab", { name: /พนักงาน/ });
        // ยอดมาจาก fetch แบบ async — รอให้ขึ้นก่อน (CI ช้ากว่าเครื่อง dev)
        await waitFor(() => expect(staffTab).toHaveTextContent("5"));
    });

    it("กดแท็บพนักงานแล้วสลับเนื้อหา ไม่ต้องเลื่อนหน้าจอ", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByRole("heading", { name: "โรงแรม 2" });

        await user.click(screen.getByRole("tab", { name: /พนักงาน/ }));

        expect(await screen.findByText("พนักงานของสาขานี้")).toBeInTheDocument();
        expect(screen.queryByText("ตู้ที่กำลังใช้งาน")).not.toBeInTheDocument();
        await waitFor(() => expect(fetchStaff).toHaveBeenCalledWith("2"));
    });

    it("เปิดลิงก์ ?tab=staff ตรงๆ ได้เลย", async () => {
        renderPage("/ceo/2?tab=staff");
        expect(await screen.findByText("พนักงานของสาขานี้")).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: /พนักงาน/ })).toHaveAttribute("aria-selected", "true");
    });

    it("กลับมาแท็บตู้ล็อกเกอร์ได้", async () => {
        const user = userEvent.setup();
        renderPage("/ceo/2?tab=staff");
        await screen.findByText("พนักงานของสาขานี้");

        await user.click(screen.getByRole("tab", { name: /ตู้ล็อกเกอร์/ }));
        expect(await screen.findByText("ตู้ที่กำลังใช้งาน")).toBeInTheDocument();
    });

    it("สาขาที่ปิดให้บริการ ขึ้นป้ายกำกับไว้ข้างชื่อ", async () => {
        fetchStations.mockResolvedValue({ data: [{ ...STATION, status: 0 }] });
        renderPage();
        expect(await screen.findByText("ปิดให้บริการ")).toBeInTheDocument();
    });

    it("stationId ที่ไม่ใช่ตัวเลข เด้งกลับหน้ารวมสาขา", async () => {
        renderPage("/ceo/abc");
        expect(await screen.findByText("หน้ารวมสาขา")).toBeInTheDocument();
        expect(fetchLockers).not.toHaveBeenCalled();
    });

    it("กดทุกสาขา กลับไปหน้าเลือกสาขา", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByRole("heading", { name: "โรงแรม 2" });

        await user.click(screen.getByRole("button", { name: /ทุกสาขา/ }));
        expect(await screen.findByText("หน้ารวมสาขา")).toBeInTheDocument();
    });

    it("ออกจากระบบล้าง session แล้วกลับหน้า login", async () => {
        const user = userEvent.setup();
        sessionStorage.setItem("token", "t");
        sessionStorage.setItem("role", "ceo");
        renderPage();
        await screen.findByRole("heading", { name: "โรงแรม 2" });

        await user.click(screen.getByRole("button", { name: /ออกจากระบบ/ }));
        expect(sessionStorage.getItem("token")).toBeNull();
        expect(await screen.findByText("หน้าล็อกอิน")).toBeInTheDocument();
    });

    it("เปลี่ยนชื่อสาขาแล้วหัวหน้าเพจอัปเดตทันที", async () => {
        const user = userEvent.setup();
        updateStation.mockResolvedValue({});
        renderPage();
        await screen.findByRole("heading", { name: "โรงแรม 2" });

        await user.click(screen.getByRole("button", { name: "แก้ไขข้อมูลสาขา" }));
        const dialog = await screen.findByRole("dialog", { name: "แก้ไขข้อมูลสาขา" });

        // ค่าเดิมถูกเติมไว้ให้แก้ต่อ ไม่ต้องพิมพ์ใหม่หมด
        expect(within(dialog).getByLabelText("ชื่อสาขา")).toHaveValue("โรงแรม 2");

        // หลังบันทึก โหลดข้อมูลใหม่ได้ชื่อที่เปลี่ยนแล้ว
        fetchStations.mockResolvedValue({ data: [{ ...STATION, station_name: "โรงแรมริมหาด" }] });
        await user.clear(within(dialog).getByLabelText("ชื่อสาขา"));
        await user.type(within(dialog).getByLabelText("ชื่อสาขา"), "โรงแรมริมหาด");
        await user.click(within(dialog).getByRole("button", { name: "บันทึก" }));

        await waitFor(() => expect(updateStation).toHaveBeenCalledWith("2", {
            station_name: "โรงแรมริมหาด",
            location: "สีลม",
        }));
        expect(await screen.findByRole("heading", { name: "โรงแรมริมหาด" })).toBeInTheDocument();
    });

    it("ยังไม่รู้ชื่อสาขา ใช้ 'สาขา {id}' ไปก่อน ไม่โชว์ค่าว่าง", async () => {
        fetchStations.mockResolvedValue({ data: [] });
        renderPage();
        expect(await screen.findByRole("heading", { name: "สาขา 2" })).toBeInTheDocument();
    });
});
