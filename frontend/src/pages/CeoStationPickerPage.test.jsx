import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import CeoStationPickerPage from "./CeoStationPickerPage";
import { fetchStations } from "../api/stations";

vi.mock("../api/stations", () => ({
    fetchStations: vi.fn(),
}));

vi.mock("react-hot-toast", () => ({
    default: { success: vi.fn(), error: vi.fn() },
    Toaster: () => null,
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, useNavigate: () => mockNavigate };
});

const NORMAL = {
    station_id: 1,
    station_name: "โรงแรม 1",
    location: "สุขุมวิท",
    status: 1,
    occupied_count: 8,
    overdue_count: 0,
    staff_count: 4,
};

const OVERDUE = {
    station_id: 2,
    station_name: "โรงแรม 2",
    location: "สีลม",
    status: 1,
    occupied_count: 12,
    overdue_count: 3,
    staff_count: 5,
};

const CLOSED = {
    station_id: 3,
    station_name: "โรงแรม 3",
    location: "อโศก",
    status: 0,
    occupied_count: 0,
    overdue_count: 0,
    staff_count: 2,
};

function cardOf(name) {
    return screen.getByText(name).closest("button");
}

function renderPicker() {
    return render(
        <MemoryRouter>
            <CeoStationPickerPage />
        </MemoryRouter>
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    fetchStations.mockResolvedValue({ data: [NORMAL, OVERDUE, CLOSED] });
});

describe("CeoStationPickerPage", () => {
    it("แสดงจำนวนสาขาทั้งหมด", async () => {
        renderPicker();
        expect(await screen.findByText("3 สาขา")).toBeInTheDocument();
    });

    it("สาขาที่มีตู้เกินกำหนด ขึ้น badge เกินกำหนดพร้อมจำนวน", async () => {
        renderPicker();
        const card = await waitFor(() => cardOf("โรงแรม 2"));
        expect(within(card).getByText("เกินกำหนด 3")).toBeInTheDocument();
        expect(within(card).queryByText("ปกติ")).not.toBeInTheDocument();
    });

    it("สาขาที่ไม่มีตู้เกินกำหนด ขึ้น badge ปกติ", async () => {
        renderPicker();
        const card = await waitFor(() => cardOf("โรงแรม 1"));
        expect(within(card).getByText("ปกติ")).toBeInTheDocument();
        expect(within(card).getByText("มีของฝาก 8")).toBeInTheDocument();
        expect(within(card).getByText("พนักงาน 4")).toBeInTheDocument();
    });

    it("สาขาที่ปิดให้บริการ ไม่ขึ้นสถานะปกติ/เกินกำหนด", async () => {
        renderPicker();
        const card = await waitFor(() => cardOf("โรงแรม 3"));
        expect(within(card).getByText("ปิดให้บริการ")).toBeInTheDocument();
        expect(within(card).queryByText("ปกติ")).not.toBeInTheDocument();
        expect(within(card).queryByText(/เกินกำหนด/)).not.toBeInTheDocument();
    });

    it("ไม่มีค่านับส่งมา ให้ถือเป็น 0 ไม่ใช่ NaN", async () => {
        fetchStations.mockResolvedValue({
            data: [{ station_id: 9, station_name: "โรงแรม 9", status: 1 }],
        });
        renderPicker();
        const card = await waitFor(() => cardOf("โรงแรม 9"));
        expect(within(card).getByText("มีของฝาก 0")).toBeInTheDocument();
        expect(within(card).getByText("พนักงาน 0")).toBeInTheDocument();
        expect(within(card).getByText("ปกติ")).toBeInTheDocument();
    });

    it("กดการ์ดแล้วเข้าหน้าสาขานั้น", async () => {
        const user = userEvent.setup();
        renderPicker();
        const card = await waitFor(() => cardOf("โรงแรม 2"));
        await user.click(card);
        expect(mockNavigate).toHaveBeenCalledWith("/ceo/2");
    });

    it("ออกจากระบบแล้วล้าง session และกลับหน้า login", async () => {
        const user = userEvent.setup();
        sessionStorage.setItem("token", "t");
        sessionStorage.setItem("role", "ceo");
        renderPicker();
        await screen.findByText("โรงแรม 1");

        await user.click(screen.getByRole("button", { name: /ออกจากระบบ/ }));
        expect(sessionStorage.getItem("token")).toBeNull();
        expect(sessionStorage.getItem("role")).toBeNull();
        expect(mockNavigate).toHaveBeenCalledWith("/");
    });

    it("ยังไม่มีสาขาในระบบ แสดงข้อความบอก", async () => {
        fetchStations.mockResolvedValue({ data: [] });
        renderPicker();
        expect(await screen.findByText("ยังไม่มีสาขาในระบบ")).toBeInTheDocument();
    });
});
