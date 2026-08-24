import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import LoginPage from "./LoginPage";
import { login } from "../api/auth";

vi.mock("../api/auth", () => ({
    login: vi.fn(),
}));

function renderLoginPage() {
    return render(
        <MemoryRouter>
            <LoginPage />
        </MemoryRouter>
    );
}

describe("LoginPage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sessionStorage.clear();
    });

    it("stores the token and username on successful login", async () => {
        login.mockResolvedValue({ access_token: "tok-1", username: "admin" });
        const user = userEvent.setup();
        renderLoginPage();

        await user.type(screen.getByLabelText("ชื่อผู้ใช้งาน"), "admin");
        await user.type(screen.getByLabelText("รหัสผ่าน"), "secret");
        await user.click(screen.getByRole("button", { name: /เข้าสู่ระบบ/ }));

        await waitFor(() => {
            expect(login).toHaveBeenCalledWith("admin", "secret");
        });
        await waitFor(() => {
            expect(sessionStorage.getItem("token")).toBe("tok-1");
            expect(sessionStorage.getItem("username")).toBe("admin");
        });
    });

    it("flags mustChangePassword when the backend requires it (first login)", async () => {
        login.mockResolvedValue({ access_token: "tok-1", username: "admin", must_change_password: true });
        const user = userEvent.setup();
        renderLoginPage();

        await user.type(screen.getByLabelText("ชื่อผู้ใช้งาน"), "admin");
        await user.type(screen.getByLabelText("รหัสผ่าน"), "temp-pass");
        await user.click(screen.getByRole("button", { name: /เข้าสู่ระบบ/ }));

        await waitFor(() => {
            expect(sessionStorage.getItem("mustChangePassword")).toBe("1");
        });
    });

    it("does not flag mustChangePassword on a normal login", async () => {
        login.mockResolvedValue({ access_token: "tok-1", username: "admin", must_change_password: false });
        const user = userEvent.setup();
        renderLoginPage();

        await user.type(screen.getByLabelText("ชื่อผู้ใช้งาน"), "admin");
        await user.type(screen.getByLabelText("รหัสผ่าน"), "secret");
        await user.click(screen.getByRole("button", { name: /เข้าสู่ระบบ/ }));

        await waitFor(() => {
            expect(sessionStorage.getItem("mustChangePassword")).toBe("0");
        });
    });

    it("does not store a token when login fails", async () => {
        login.mockRejectedValue(new Error("ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง"));
        const user = userEvent.setup();
        renderLoginPage();

        await user.type(screen.getByLabelText("ชื่อผู้ใช้งาน"), "admin");
        await user.type(screen.getByLabelText("รหัสผ่าน"), "wrong");
        await user.click(screen.getByRole("button", { name: /เข้าสู่ระบบ/ }));

        await waitFor(() => expect(login).toHaveBeenCalled());
        expect(sessionStorage.getItem("token")).toBeNull();
    });

    it("requires both fields before submitting", async () => {
        renderLoginPage();
        const usernameInput = screen.getByLabelText("ชื่อผู้ใช้งาน");
        expect(usernameInput).toBeRequired();
        expect(screen.getByLabelText("รหัสผ่าน")).toBeRequired();
    });
});
