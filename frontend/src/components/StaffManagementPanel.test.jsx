import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StaffManagementPanel from "./StaffManagementPanel";
import { fetchStaff, createStaff, updateStaff, resetStaffPassword } from "../api/staff";

vi.mock("../api/staff", () => ({
    fetchStaff: vi.fn(),
    createStaff: vi.fn(),
    updateStaff: vi.fn(),
    resetStaffPassword: vi.fn(),
}));

vi.mock("react-hot-toast", () => ({
    default: { success: vi.fn(), error: vi.fn() },
}));

const ACTIVE = {
    user_id: 11,
    username: "somchai",
    fullname: "สมชาย ใจดี",
    phone: "0812345678",
    is_active: 1,
    last_login: "2026-08-20 09:14:00",
};

const NEVER_LOGGED_IN = {
    user_id: 12,
    username: "malee",
    fullname: "มาลี สดใส",
    phone: "0898765432",
    is_active: 1,
    last_login: null,
};

const INACTIVE = {
    user_id: 13,
    username: "somsak",
    fullname: "สมศักดิ์ มั่นคง",
    phone: "0800000000",
    is_active: 0,
    last_login: "2026-01-05 11:00:00",
};

function rowOf(name) {
    return screen.getByText(name).closest("tr");
}

function renderPanel(props = {}) {
    return render(<StaffManagementPanel stationId={2} stationName="โรงแรม 2" {...props} />);
}

beforeEach(() => {
    vi.clearAllMocks();
    fetchStaff.mockResolvedValue({ data: [ACTIVE, NEVER_LOGGED_IN, INACTIVE] });
});

describe("StaffManagementPanel", () => {
    it("โหลดพนักงานตาม station ที่ส่งเข้ามา", async () => {
        renderPanel();
        await waitFor(() => expect(fetchStaff).toHaveBeenCalledWith(2));
    });

    it("แสดงชื่อและ username ในเซลล์เดียวกัน", async () => {
        renderPanel();
        const row = await waitFor(() => rowOf("สมชาย ใจดี"));
        expect(within(row).getByText("somchai")).toBeInTheDocument();
    });

    it("มีคอลัมน์สาขา และใช้ชื่อสาขาที่ส่งมา", async () => {
        renderPanel();
        await screen.findByText("สมชาย ใจดี");
        expect(screen.getByRole("columnheader", { name: "สาขา" })).toBeInTheDocument();
        expect(screen.getAllByText("โรงแรม 2").length).toBe(3);
    });

    it("ไม่มี stationName ให้ fallback เป็น 'สาขา {id}'", async () => {
        renderPanel({ stationName: undefined });
        await screen.findByText("สมชาย ใจดี");
        expect(screen.getAllByText("สาขา 2").length).toBe(3);
    });

    it("คนที่ยังไม่เคยเข้าใช้ ขึ้นว่า 'ยังไม่เคยเข้า'", async () => {
        renderPanel();
        const row = await waitFor(() => rowOf("มาลี สดใส"));
        expect(within(row).getByText("ยังไม่เคยเข้า")).toBeInTheDocument();
    });

    it("คนที่เคยเข้าแล้ว แสดงวันเวลาแทน", async () => {
        renderPanel();
        const row = await waitFor(() => rowOf("สมชาย ใจดี"));
        expect(within(row).queryByText("ยังไม่เคยเข้า")).not.toBeInTheDocument();
        expect(within(row).getByText("20/08 09:14")).toBeInTheDocument();
    });

    it("แถวที่ปิดใช้งาน มีปุ่มเปิดใช้งานอีกครั้ง ไม่มีปุ่มรีเซ็ตรหัส", async () => {
        renderPanel();
        const row = await waitFor(() => rowOf("สมศักดิ์ มั่นคง"));
        expect(within(row).getByRole("button", { name: "เปิดใช้งานอีกครั้ง" })).toBeInTheDocument();
        expect(within(row).queryByRole("button", { name: /รีเซ็ตรหัส/ })).not.toBeInTheDocument();
    });

    it("กดปิดใช้งาน ส่ง is_active=false", async () => {
        const user = userEvent.setup();
        updateStaff.mockResolvedValue({});
        renderPanel();
        const row = await waitFor(() => rowOf("สมชาย ใจดี"));
        await user.click(within(row).getByRole("button", { name: "ปิดใช้งาน" }));
        await waitFor(() => expect(updateStaff).toHaveBeenCalledWith(11, { is_active: false }));
    });

    it("กดเปิดใช้งานอีกครั้ง ส่ง is_active=true", async () => {
        const user = userEvent.setup();
        updateStaff.mockResolvedValue({});
        renderPanel();
        const row = await waitFor(() => rowOf("สมศักดิ์ มั่นคง"));
        await user.click(within(row).getByRole("button", { name: "เปิดใช้งานอีกครั้ง" }));
        await waitFor(() => expect(updateStaff).toHaveBeenCalledWith(13, { is_active: true }));
    });

    it("รีเซ็ตรหัสแล้วโชว์รหัสใหม่พร้อมคำเตือนแสดงครั้งเดียว", async () => {
        const user = userEvent.setup();
        resetStaffPassword.mockResolvedValue({ data: { username: "somchai", password: "aB3dE7kQ" } });
        renderPanel();
        const row = await waitFor(() => rowOf("สมชาย ใจดี"));
        await user.click(within(row).getByRole("button", { name: /รีเซ็ตรหัส/ }));

        expect(await screen.findByText("aB3dE7kQ")).toBeInTheDocument();
        expect(screen.getByText("รหัสนี้จะแสดงแค่ครั้งเดียว")).toBeInTheDocument();
    });

    it("ปิด modal รหัสผ่านแล้วดูรหัสซ้ำไม่ได้", async () => {
        const user = userEvent.setup();
        resetStaffPassword.mockResolvedValue({ data: { username: "somchai", password: "aB3dE7kQ" } });
        renderPanel();
        const row = await waitFor(() => rowOf("สมชาย ใจดี"));
        await user.click(within(row).getByRole("button", { name: /รีเซ็ตรหัส/ }));
        await screen.findByText("aB3dE7kQ");

        await user.click(screen.getByRole("button", { name: "ส่งให้พนักงานแล้ว ปิดหน้าต่าง" }));
        await waitFor(() => expect(screen.queryByText("aB3dE7kQ")).not.toBeInTheDocument());
    });

    it("ปุ่มคัดลอกส่งรหัสเข้า clipboard", async () => {
        const user = userEvent.setup();
        resetStaffPassword.mockResolvedValue({ data: { username: "somchai", password: "aB3dE7kQ" } });
        renderPanel();
        const row = await waitFor(() => rowOf("สมชาย ใจดี"));
        await user.click(within(row).getByRole("button", { name: /รีเซ็ตรหัส/ }));
        await screen.findByText("aB3dE7kQ");

        await user.click(screen.getByRole("button", { name: /คัดลอก/ }));
        await waitFor(async () => {
            expect(await navigator.clipboard.readText()).toBe("aB3dE7kQ");
        });
    });

    it("เพิ่มพนักงานส่ง station_id เป็นตัวเลขเสมอ", async () => {
        const user = userEvent.setup();
        createStaff.mockResolvedValue({ data: { username: "newguy", password: "xY9zQ2mN" } });
        renderPanel({ stationId: "2" });
        await screen.findByText("สมชาย ใจดี");

        await user.click(screen.getByRole("button", { name: /เพิ่มพนักงาน/ }));

        const dialog = screen.getByRole("dialog", { name: "เพิ่มพนักงานใหม่" });
        await user.type(within(dialog).getByLabelText(/ชื่อผู้ใช้/), "newguy");
        await user.type(within(dialog).getByLabelText(/ชื่อ-นามสกุล/), "พนักงานใหม่");
        await user.type(within(dialog).getByLabelText(/เบอร์โทร/), "0811111111");
        await user.click(within(dialog).getByRole("button", { name: "เพิ่มพนักงาน" }));

        await waitFor(() =>
            expect(createStaff).toHaveBeenCalledWith({
                username: "newguy",
                fullname: "พนักงานใหม่",
                phone: "0811111111",
                station_id: 2,
            })
        );
    });

    it("ยังไม่มีพนักงาน แสดงข้อความชวนให้เพิ่ม", async () => {
        fetchStaff.mockResolvedValue({ data: [] });
        renderPanel();
        expect(await screen.findByText("ยังไม่มีพนักงานในสาขานี้")).toBeInTheDocument();
    });
});
