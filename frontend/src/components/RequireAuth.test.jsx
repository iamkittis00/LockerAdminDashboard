import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import RequireAuth from "./RequireAuth";

function renderAt(path) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="/" element={<div>หน้าเข้าสู่ระบบ</div>} />
                <Route
                    path="/secret"
                    element={<RequireAuth><div>ข้อมูลลับ</div></RequireAuth>}
                />
            </Routes>
        </MemoryRouter>
    );
}

describe("RequireAuth", () => {
    beforeEach(() => {
        sessionStorage.clear();
    });

    it("ไม่ render เนื้อหาที่ป้องกันไว้เลยแม้แวบเดียว เมื่อไม่มี token", () => {
        renderAt("/secret");

        // ต้องไม่โผล่ตั้งแต่ render แรก ไม่ใช่โผล่แล้วค่อยเด้งทีหลัง
        expect(screen.queryByText("ข้อมูลลับ")).not.toBeInTheDocument();
        expect(screen.getByText("หน้าเข้าสู่ระบบ")).toBeInTheDocument();
    });

    it("ปล่อยผ่านเมื่อมี token", () => {
        sessionStorage.setItem("token", "tok-1");
        renderAt("/secret");

        expect(screen.getByText("ข้อมูลลับ")).toBeInTheDocument();
    });

    it("token ที่เป็นค่าว่างถือว่าไม่ผ่าน", () => {
        sessionStorage.setItem("token", "");
        renderAt("/secret");

        expect(screen.queryByText("ข้อมูลลับ")).not.toBeInTheDocument();
    });
});
