import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import RequireRole from "./RequireRole";

// โซนที่กันไว้ใช้ path แยกจากปลายทางที่ redirect ไป จะได้ไม่ชนกันเองในเทสต์
function renderAt(path) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="/" element={<div>หน้าล็อกอิน</div>} />
                <Route path="/dashboard" element={<div>หน้าแอดมิน</div>} />
                <Route path="/ceo" element={<div>หน้าเลือกสาขา</div>} />
                <Route
                    path="/admin-zone"
                    element={<RequireRole role="admin"><div>โซนแอดมิน</div></RequireRole>}
                />
                <Route
                    path="/ceo-zone"
                    element={<RequireRole role="ceo"><div>โซนผู้บริหาร</div></RequireRole>}
                />
            </Routes>
        </MemoryRouter>
    );
}

// session ที่ยังใช้ได้ = token + วันหมดอายุที่ยังไม่ถึง
function signIn(role, msFromNow = 60 * 60 * 1000) {
    sessionStorage.setItem("token", "tok-1");
    sessionStorage.setItem("role", role);
    sessionStorage.setItem("expiresAt", String(Date.now() + msFromNow));
}

beforeEach(() => {
    sessionStorage.clear();
});

describe("RequireRole", () => {
    it("ไม่มี token เด้งไปหน้าล็อกอิน", () => {
        renderAt("/ceo-zone");
        expect(screen.getByText("หน้าล็อกอิน")).toBeInTheDocument();
    });

    it("token ว่างเปล่าถือว่าไม่มี", () => {
        sessionStorage.setItem("token", "");
        renderAt("/ceo-zone");
        expect(screen.getByText("หน้าล็อกอิน")).toBeInTheDocument();
    });

    it("role ตรงกับที่กันไว้ ผ่านเข้าไปได้", () => {
        signIn("ceo");
        renderAt("/ceo-zone");
        expect(screen.getByText("โซนผู้บริหาร")).toBeInTheDocument();
    });

    it("admin เข้าโซน ceo ถูกส่งกลับหน้าแอดมิน", () => {
        signIn("admin");
        renderAt("/ceo-zone");
        expect(screen.getByText("หน้าแอดมิน")).toBeInTheDocument();
    });

    it("ceo เข้าโซนแอดมิน ถูกส่งไปหน้าเลือกสาขา ไม่ใช่ปล่อยให้เจอหน้าว่าง", () => {
        signIn("ceo");
        renderAt("/admin-zone");
        expect(screen.getByText("หน้าเลือกสาขา")).toBeInTheDocument();
    });

    it("role ไม่รู้จัก ล้าง session แล้วให้ล็อกอินใหม่ ไม่วนซ้ำ", () => {
        signIn("something-else");
        renderAt("/admin-zone");
        expect(screen.getByText("หน้าล็อกอิน")).toBeInTheDocument();
        expect(sessionStorage.getItem("token")).toBeNull();
    });

    it("ไม่มี role เก็บไว้เลย (session เก่า) ก็ให้ล็อกอินใหม่", () => {
        sessionStorage.setItem("token", "tok-1");
        sessionStorage.setItem("expiresAt", String(Date.now() + 3600_000));
        renderAt("/admin-zone");
        expect(screen.getByText("หน้าล็อกอิน")).toBeInTheDocument();
        expect(sessionStorage.getItem("token")).toBeNull();
    });

    it("session หมดอายุ ถูกเตะออกพร้อมบอกเหตุผล", () => {
        signIn("ceo", -1000);
        renderAt("/ceo-zone");
        expect(screen.getByText("หน้าล็อกอิน")).toBeInTheDocument();
        expect(sessionStorage.getItem("token")).toBeNull();
    });

    it("มี token แต่ไม่มีวันหมดอายุ (session ก่อนอัปเดต) ถือว่าหมดอายุ", () => {
        sessionStorage.setItem("token", "tok-1");
        sessionStorage.setItem("role", "ceo");
        renderAt("/ceo-zone");
        expect(screen.getByText("หน้าล็อกอิน")).toBeInTheDocument();
        expect(sessionStorage.getItem("token")).toBeNull();
    });
});
