import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import DashboardPage from "./DashboardPage";
import { changePassword } from "../api/auth";
import { fetchLockers } from "../api/lockers";
import { fetchTransactions } from "../api/transactions";

vi.mock("../api/auth", () => ({
    changePassword: vi.fn(),
}));
vi.mock("../api/lockers", () => ({
    fetchLockers: vi.fn(),
}));
vi.mock("../api/transactions", () => ({
    fetchTransactions: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, useNavigate: () => mockNavigate };
});

function renderDashboard() {
    return render(
        <MemoryRouter>
            <DashboardPage />
        </MemoryRouter>
    );
}

async function openPasswordModal(user) {
    await user.click(screen.getByRole("button", { name: /ตั้งค่า/ }));
}

async function fillPasswordForm(user, { current = "old-pass", next = "new-password-1", confirm = "new-password-1" } = {}) {
    const [currentInput, newInput, confirmInput] = screen.getAllByPlaceholderText(/รหัสผ่าน/);
    await user.type(currentInput, current);
    await user.type(newInput, next);
    await user.type(confirmInput, confirm);
}

describe("DashboardPage — เปลี่ยนรหัสผ่าน", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sessionStorage.clear();
        fetchLockers.mockResolvedValue([]);
        fetchTransactions.mockResolvedValue({ data: [] });
    });

    it("ไม่เรียก API ถ้ารหัสผ่านใหม่กับที่ยืนยันไม่ตรงกัน", async () => {
        const user = userEvent.setup();
        renderDashboard();

        await openPasswordModal(user);
        await fillPasswordForm(user, { next: "aaaaaaaa", confirm: "bbbbbbbb" });
        await user.click(screen.getByRole("button", { name: "ยืนยันการตั้งรหัสผ่านใหม่" }));

        expect(changePassword).not.toHaveBeenCalled();
    });

    it("เปลี่ยนรหัสผ่านสำเร็จ — ล้าง session ครบทั้ง 3 key แล้วพากลับหน้า login", async () => {
        sessionStorage.setItem("token", "tok-1");
        sessionStorage.setItem("username", "admin");
        changePassword.mockResolvedValue({ status: "success" });
        const user = userEvent.setup();
        renderDashboard();

        await openPasswordModal(user);
        await fillPasswordForm(user);
        await user.click(screen.getByRole("button", { name: "ยืนยันการตั้งรหัสผ่านใหม่" }));

        await waitFor(() => {
            expect(changePassword).toHaveBeenCalledWith("old-pass", "new-password-1");
        });
        expect(sessionStorage.getItem("token")).toBeNull();
        expect(sessionStorage.getItem("username")).toBeNull();
        expect(sessionStorage.getItem("mustChangePassword")).toBeNull();

        // navigate('/') ถูกเรียกหลัง setTimeout 1s
        await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/"), { timeout: 2000 });
    });

    it("พิมพ์รหัสผ่านปัจจุบันผิด (400) — ไม่ล้าง session ไม่เด้งออกจากระบบ (regression)", async () => {
        sessionStorage.setItem("token", "tok-1");
        sessionStorage.setItem("username", "admin");
        changePassword.mockRejectedValue(new Error("รหัสผ่านปัจจุบันไม่ถูกต้อง"));
        const user = userEvent.setup();
        renderDashboard();

        await openPasswordModal(user);
        await fillPasswordForm(user);
        await user.click(screen.getByRole("button", { name: "ยืนยันการตั้งรหัสผ่านใหม่" }));

        await waitFor(() => expect(changePassword).toHaveBeenCalled());

        // ต้องยังอยู่ในระบบ ไม่ถูกเตะออก
        expect(sessionStorage.getItem("token")).toBe("tok-1");
        expect(sessionStorage.getItem("username")).toBe("admin");
        expect(mockNavigate).not.toHaveBeenCalled();

        // ปุ่มกลับมากดได้อีกครั้ง (ไม่ค้างสถานะ "กำลังบันทึก...")
        expect(await screen.findByRole("button", { name: "ยืนยันการตั้งรหัสผ่านใหม่" })).toBeEnabled();
    });

    it("กดปุ่มยืนยันรัวๆ ระหว่างรอ ยิง API แค่ครั้งเดียว", async () => {
        let resolveChange;
        changePassword.mockReturnValue(new Promise((resolve) => { resolveChange = resolve; }));
        const user = userEvent.setup();
        renderDashboard();

        await openPasswordModal(user);
        await fillPasswordForm(user);
        const submitButton = screen.getByRole("button", { name: "ยืนยันการตั้งรหัสผ่านใหม่" });

        await user.click(submitButton);
        // ปุ่มควร disabled ทันทีระหว่างรอ ทำให้กดซ้ำไม่ทำอะไร
        expect(screen.getByRole("button", { name: "กำลังบันทึก..." })).toBeDisabled();
        await user.click(screen.getByRole("button", { name: "กำลังบันทึก..." }));

        expect(changePassword).toHaveBeenCalledTimes(1);
        resolveChange({ status: "success" });
    });

    it("บังคับเปิด modal เปลี่ยนรหัสผ่านทันทีตอน login ครั้งแรก และซ่อนปุ่มปิด", async () => {
        sessionStorage.setItem("token", "tok-1");
        sessionStorage.setItem("mustChangePassword", "1");
        renderDashboard();

        expect(await screen.findByText("ต้องเปลี่ยนรหัสผ่านก่อนใช้งาน")).toBeInTheDocument();

        const dialogHeading = screen.getByText("ต้องเปลี่ยนรหัสผ่านก่อนใช้งาน");
        const modal = dialogHeading.closest(".bg-white");
        // ตอนบังคับเปลี่ยนรหัสผ่าน ต้องมีปุ่มเดียวคือ "ยืนยัน..." ไม่มีปุ่มปิด (X) ให้หนีออกไปได้
        expect(within(modal).getAllByRole("button")).toHaveLength(1);
        expect(within(modal).getByRole("button", { name: /ยืนยัน/ })).toBeInTheDocument();
    });
});

describe("DashboardPage — ออกจากระบบ", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sessionStorage.clear();
        fetchLockers.mockResolvedValue([]);
        fetchTransactions.mockResolvedValue({ data: [] });
    });

    it("ลบ session ครบทั้ง 3 key แล้วพากลับหน้า login", async () => {
        sessionStorage.setItem("token", "tok-1");
        sessionStorage.setItem("username", "admin");
        sessionStorage.setItem("mustChangePassword", "0");
        const user = userEvent.setup();
        renderDashboard();

        await user.click(screen.getByRole("button", { name: /ออกจากระบบ/ }));

        expect(sessionStorage.getItem("token")).toBeNull();
        expect(sessionStorage.getItem("username")).toBeNull();
        expect(sessionStorage.getItem("mustChangePassword")).toBeNull();
        expect(mockNavigate).toHaveBeenCalledWith("/");
    });
});
