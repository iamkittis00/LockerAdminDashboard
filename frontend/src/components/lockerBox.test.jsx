import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import LockerBox from "./lockerBox";
import { fetchLockers, fetchLockerDetail, unlockLocker } from "../api/lockers";

vi.mock("../api/lockers", () => ({
    fetchLockers: vi.fn(),
    fetchLockerDetail: vi.fn(),
    unlockLocker: vi.fn(),
}));

// สร้างข้อมูลตู้จำลอง 36 ช่อง ว่างทั้งหมด แล้ว override เฉพาะที่ต้องการ
function makeLockers(overrides = {}) {
    return Array.from({ length: 36 }, (_, i) => {
        const id = i + 1;
        const base = {
            locker_id: id,
            size: ["S", "S", "M", "M", "L", "L"][i % 6],
            is_usable: id === 3 ? 0 : 1, // locker 3 = ช่องจอ ตามผังจริง
            status: 0,
            is_overdue: false,
            phone_owner: null,
        };
        return { ...base, ...(overrides[id] || {}) };
    });
}

function renderLockerBox() {
    return render(
        <MemoryRouter>
            <LockerBox />
        </MemoryRouter>
    );
}

async function goRight(user) {
    await user.click(screen.getByRole("button", { name: "ไปตู้ขวา" }));
}

async function goLeft(user) {
    await user.click(screen.getByRole("button", { name: "ไปตู้ซ้าย" }));
}

describe("LockerBox", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sessionStorage.setItem("token", "tok-1");
    });

    it("lands on the front overview first, with no doors clickable yet", async () => {
        fetchLockers.mockResolvedValue(makeLockers());
        renderLockerBox();

        expect(await screen.findByText("ด้านหน้า")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /^ตู้ / })).not.toBeInTheDocument();
    });

    it("shows the right cabinet (1-18) after pressing the right arrow, with the screen slot marked", async () => {
        fetchLockers.mockResolvedValue(makeLockers());
        const user = userEvent.setup();
        renderLockerBox();

        await goRight(user);

        const doors = await screen.findAllByRole("button", { name: /^ตู้ / });
        expect(doors).toHaveLength(18); // ตู้ขวา = 18 ช่อง

        const screenDoor = screen.getByRole("button", { name: /^ตู้ 3 / });
        expect(screenDoor).toHaveClass("door-screen");
        expect(within(screenDoor).getByText("ช่องจอ")).toBeInTheDocument();
    });

    it("shows the left cabinet (19-36) after pressing the left arrow", async () => {
        fetchLockers.mockResolvedValue(makeLockers());
        const user = userEvent.setup();
        renderLockerBox();

        await goLeft(user);

        expect(await screen.findByRole("button", { name: /^ตู้ 19 / })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /^ตู้ 1 / })).not.toBeInTheDocument();
    });

    it("disables the arrow once it reaches the far side", async () => {
        fetchLockers.mockResolvedValue(makeLockers());
        const user = userEvent.setup();
        renderLockerBox();

        await goRight(user);
        expect(await screen.findByRole("button", { name: "ไปตู้ขวา" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "ไปตู้ซ้าย" })).toBeEnabled();
    });

    it("shows an overdue locker in red", async () => {
        fetchLockers.mockResolvedValue(makeLockers({ 5: { status: 1, is_overdue: true, phone_owner: "0812345678" } }));
        const user = userEvent.setup();
        renderLockerBox();

        await goRight(user);

        const overdueDoor = await screen.findByRole("button", { name: /^ตู้ 5 / });
        expect(overdueDoor).toHaveClass("door-overdue");
    });

    it("lets staff unlock the screen slot and shows the note", async () => {
        fetchLockers.mockResolvedValue(makeLockers());
        fetchLockerDetail.mockResolvedValue([{ locker_id: 3, is_usable: 0, phone_owner: null }]);
        unlockLocker.mockResolvedValue({ status: "success" });
        const user = userEvent.setup();
        renderLockerBox();

        await goRight(user);
        await user.click(await screen.findByRole("button", { name: /^ตู้ 3 / }));

        expect(await screen.findByText(/ช่องนี้ถูกล็อคไว้สำหรับติดตั้งจอ/)).toBeInTheDocument();

        const unlockButton = screen.getByRole("button", { name: "สั่งเปิดตู้" });
        expect(unlockButton).toBeEnabled();
        await user.click(unlockButton);

        await waitFor(() => expect(unlockLocker).toHaveBeenCalledWith(3, null));
    });

    it("does not call unlock twice while a request is already in flight", async () => {
        fetchLockers.mockResolvedValue(makeLockers({ 1: { status: 1, phone_owner: "0812345678" } }));
        fetchLockerDetail.mockResolvedValue([{ locker_id: 1, is_usable: 1, phone_owner: "0812345678" }]);
        let resolveUnlock;
        unlockLocker.mockReturnValue(new Promise((resolve) => { resolveUnlock = resolve; }));
        const user = userEvent.setup();
        renderLockerBox();

        await goRight(user);
        await user.click(await screen.findByRole("button", { name: /^ตู้ 1 / }));
        const unlockButton = await screen.findByRole("button", { name: "สั่งเปิดตู้" });

        await user.click(unlockButton);
        await user.click(unlockButton); // กดซ้ำระหว่างรอ

        expect(unlockLocker).toHaveBeenCalledTimes(1);
        resolveUnlock({ status: "success" });
    });
});

// สาขาที่ 2 ขึ้นไป: locker_id เป็นคีย์ใน DB (37-72) ส่วนเลขช่องจริงบนตู้คือ box_number (1-36)
// ก่อนหน้านี้ผังแมปด้วย locker_id ทำให้ตู้ของสาขาอื่นหายทั้งกระดาน
describe("LockerBox — สาขาที่ locker_id ไม่ตรงกับเลขช่อง", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sessionStorage.setItem("token", "tok-1");
    });

    function makeStation2Lockers(overrides = {}) {
        return Array.from({ length: 36 }, (_, i) => {
            const box = i + 1;
            const base = {
                locker_id: 36 + box,          // 37-72
                box_number: box,               // 1-36
                size: ["S", "S", "M", "M", "L", "L"][i % 6],
                is_usable: box === 3 ? 0 : 1,
                status: 0,
                is_overdue: false,
                phone_owner: null,
            };
            return { ...base, ...(overrides[box] || {}) };
        });
    }

    function renderStation2() {
        return render(
            <MemoryRouter>
                <LockerBox stationId="2" />
            </MemoryRouter>
        );
    }

    it("วาดตู้ครบทั้ง 36 ช่อง ไม่ใช่กระดานว่าง", async () => {
        fetchLockers.mockResolvedValue(makeStation2Lockers());
        const user = userEvent.setup();
        renderStation2();

        await goRight(user);
        const doors = await screen.findAllByRole("button", { name: /^ตู้ \d+ / });
        expect(doors).toHaveLength(18);
    });

    it("ป้ายบนประตูเป็นเลขช่องจริง ไม่ใช่ locker_id", async () => {
        fetchLockers.mockResolvedValue(makeStation2Lockers());
        const user = userEvent.setup();
        renderStation2();

        await goRight(user);
        expect(await screen.findByRole("button", { name: /^ตู้ 1 / })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /^ตู้ 37 / })).not.toBeInTheDocument();
    });

    it("ช่องจอยังอยู่ช่องที่ 3 ของสาขานั้น", async () => {
        fetchLockers.mockResolvedValue(makeStation2Lockers());
        const user = userEvent.setup();
        renderStation2();

        await goRight(user);
        expect(await screen.findByRole("button", { name: /^ตู้ 3 / })).toHaveClass("door-screen");
    });

    it("สั่งเปิดส่ง locker_id จริงกับสาขาไปให้ backend แต่โชว์เลขช่องให้พนักงาน", async () => {
        fetchLockers.mockResolvedValue(makeStation2Lockers({ 5: { status: 1, phone_owner: "0812345678" } }));
        fetchLockerDetail.mockResolvedValue([{ locker_id: 41, box_number: 5, is_usable: 1, phone_owner: "0812345678" }]);
        unlockLocker.mockResolvedValue({ status: "success" });
        const user = userEvent.setup();
        renderStation2();

        await goRight(user);
        await user.click(await screen.findByRole("button", { name: /^ตู้ 5 / }));

        await waitFor(() => expect(fetchLockerDetail).toHaveBeenCalledWith(41, "2"));
        const popup = await screen.findByText("รายละเอียดตู้ล็อกเกอร์");
        expect(within(popup.parentElement).getByText("หมายเลขตู้").parentElement)
            .toHaveTextContent("หมายเลขตู้ 5");

        await user.click(screen.getByRole("button", { name: "สั่งเปิดตู้" }));
        await waitFor(() => expect(unlockLocker).toHaveBeenCalledWith(41, "2"));
    });

    it("ไม่มี box_number ส่งมา ให้ถอยไปใช้ locker_id เหมือนเดิม", async () => {
        fetchLockers.mockResolvedValue(
            Array.from({ length: 36 }, (_, i) => ({
                locker_id: i + 1, size: "S", is_usable: 1, status: 0, is_overdue: false, phone_owner: null,
            }))
        );
        const user = userEvent.setup();
        renderStation2();

        await goRight(user);
        expect(await screen.findByRole("button", { name: /^ตู้ 1 / })).toBeInTheDocument();
    });
});
