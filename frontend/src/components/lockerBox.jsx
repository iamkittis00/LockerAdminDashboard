import "./lockerBox.css";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import toast, { Toaster } from 'react-hot-toast';
import {
    CABINETS,
    ROW_LABELS,
    getLockerPosition,
    getLockerSlot,
    getDoorState,
    isScreenSlot,
    formatDateTime,
} from "./lockerLayout";
import { fetchLockers, fetchLockerDetail, unlockLocker as apiUnlockLocker } from "../api/lockers";

// ลำดับการเลื่อนดู: ซ้าย <- หน้า -> ขวา — เข้าหน้านี้ครั้งแรกเจอ "หน้า" ก่อนเสมอ
const VIEWS = ["left", "front", "right"];

function LockerBox({ stationId = null }) {
    const navigate = useNavigate();

    const [lockerData, setLockerData] = useState([]);
    const [view, setView] = useState("front");
    const [direction, setDirection] = useState("forward"); // ทิศตอนสลับ ใช้เลือกอนิเมชั่น
    const [selectedLocker, setSelectedLocker] = useState(null);
    const [currentLocker, setCurrentLocker] = useState(null);
    const [showPopup, setShowPopup] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isUnlocking, setIsUnlocking] = useState(false);

    const viewIndex = VIEWS.indexOf(view);
    const cabinet = CABINETS.find((c) => c.key === view); // undefined ตอน view === "front"
    const canGoLeft = viewIndex > 0;
    const canGoRight = viewIndex < VIEWS.length - 1;

    const goTo = useCallback((nextView) => {
        setDirection(VIEWS.indexOf(nextView) > VIEWS.indexOf(view) ? "forward" : "backward");
        setView(nextView);
    }, [view]);

    const goLeft = useCallback(() => {
        if (viewIndex > 0) goTo(VIEWS[viewIndex - 1]);
    }, [viewIndex, goTo]);

    const goRight = useCallback(() => {
        if (viewIndex < VIEWS.length - 1) goTo(VIEWS[viewIndex + 1]);
    }, [viewIndex, goTo]);

    const statusLocker = useCallback(async () => {
        try {
            const data = await fetchLockers(stationId);
            setLockerData(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error("Error fetching locker status:", error);
        }
    }, [stationId]);

    useEffect(() => {
        if (!sessionStorage.getItem("token")) {
            navigate("/");
            return;
        }
        statusLocker();
        const interval = setInterval(statusLocker, 30000);
        return () => clearInterval(interval);
    }, [navigate, statusLocker]);

    // สลับตู้ด้วยปุ่มลูกศรคีย์บอร์ด
    useEffect(() => {
        const onKeyDown = (e) => {
            if (showPopup) return;
            if (e.key === "ArrowLeft") goLeft();
            if (e.key === "ArrowRight") goRight();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [showPopup, goLeft, goRight]);

    const cabinetLockers = useMemo(
        () =>
            !cabinet
                ? []
                : lockerData
                    .map((locker) => ({
                        locker,
                        slot: getLockerSlot(locker),
                        pos: getLockerPosition(getLockerSlot(locker)),
                    }))
                    .filter((item) => item.pos && item.pos.cabinet === cabinet.key),
        [lockerData, cabinet]
    );

    const unlockLocker = async () => {
        const lockerInfo = selectedLocker || currentLocker;
        if (!lockerInfo || isUnlocking) return;

        setIsUnlocking(true);
        const lockerId = lockerInfo.locker_id;
        const slot = getLockerSlot(lockerInfo);

        try {
            await apiUnlockLocker(lockerId, stationId);
            closePopup();
            toast.success(`สั่งเปิดตู้ ${slot} สำเร็จ`);
            setTimeout(statusLocker, 1500);
        } catch (error) {
            console.error("Error unlocking locker:", error);
            toast.error(error.message || `สั่งเปิดตู้ ${slot} ไม่สำเร็จ`);
        } finally {
            setIsUnlocking(false);
        }
    };

    const handleLockerClick = async (locker) => {
        setCurrentLocker(locker);
        setIsLoading(true);
        setShowPopup(true);
        setSelectedLocker(null);
        try {
            const data = await fetchLockerDetail(locker.locker_id, stationId);
            setSelectedLocker(Array.isArray(data) && data.length > 0 ? data[0] : null);
        } catch (error) {
            console.error("Error fetching locker detail:", error);
            setSelectedLocker(null);
        } finally {
            setIsLoading(false);
        }
    };

    const closePopup = () => {
        setShowPopup(false);
        setSelectedLocker(null);
        setCurrentLocker(null);
    };

    const detail = selectedLocker || currentLocker;
    const showScreenSlotNote = detail && isScreenSlot(detail);

    return (
        <div className="locker-scene">
            <Toaster position="top-center" />

            <div className="locker-stage">
                <button
                    className="cabinet-nav"
                    aria-label="ไปตู้ซ้าย"
                    onClick={goLeft}
                    disabled={!canGoLeft}
                >
                    &lsaquo;
                </button>

                <div className="cabinet-column">
                    <div className="cabinet-header">
                        <h2 className="cabinet-title">{cabinet ? cabinet.title : "ด้านหน้า"}</h2>
                        <div className="cabinet-dots">
                            {VIEWS.map((v) => (
                                <button
                                    key={v}
                                    className={`cabinet-dot ${v === view ? "is-active" : ""} ${v === "front" ? "is-front" : ""}`}
                                    aria-label={v === "front" ? "ดูด้านหน้า" : `ดู${CABINETS.find((c) => c.key === v).title}`}
                                    onClick={() => goTo(v)}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="cabinet-scroll">
                      <div className="cabinet-viewport">
                        <div key={view} className={`view-panel view-panel-${direction}`}>
                            {view === "front" ? (
                                <div className="front-frame">
                                    <div className="front-body">
                                        <div className="front-half">
                                            <span className="front-half-label">ตู้ซ้าย</span>
                                        </div>
                                        <div className="front-divider" />
                                        <div className="front-half">
                                            <span className="front-screen-mark" aria-hidden="true" />
                                            <span className="front-half-label">ตู้ขวา</span>
                                        </div>
                                    </div>
                                    <div className="locker-legs">
                                        <div className="leg"></div>
                                        <div className="leg"></div>
                                    </div>
                                    <div className="locker-ground-shadow"></div>
                                </div>
                            ) : (
                                <div className="cabinet-frame">
                                    <div className="size-labels" aria-hidden="true">
                                        {ROW_LABELS.map((label) => (
                                            <span key={label}>{label}</span>
                                        ))}
                                    </div>

                                    <div className="locker-wrapper">
                                        <div className="locker-body">
                                            <div className="inline-locker">
                                                {cabinetLockers.map(({ locker, slot, pos }) => {
                                                    const state = getDoorState(locker);
                                                    return (
                                                        <button
                                                            key={locker.locker_id}
                                                            type="button"
                                                            className={`door-locker ${state.className}`}
                                                            style={{ gridRow: pos.row + 1, gridColumn: pos.col + 1 }}
                                                            onClick={() => handleLockerClick(locker)}
                                                            aria-label={`ตู้ ${slot} (${locker.size || "-"}) — ${state.label}`}
                                                            title={`ตู้ ${slot} (${locker.size || "-"}) — ${state.label}`}
                                                        >
                                                            <span className="door-label">{state.label}</span>
                                                            <span className="door-handle" />
                                                            <span className="door-id">{slot}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        <div className="locker-legs">
                                            <div className="leg"></div>
                                            <div className="leg"></div>
                                        </div>
                                        <div className="locker-ground-shadow"></div>
                                    </div>
                                </div>
                            )}
                        </div>
                      </div>
                    </div>
                    <p className="nav-hint">กดลูกศรซ้าย-ขวาเพื่อสลับดูตู้แต่ละฝั่ง</p>

                    <div className="locker-legend">
                        <span><i className="dot-free" />ว่าง</span>
                        <span><i className="dot-used" />มีของฝาก</span>
                        <span><i className="dot-overdue" />เกินกำหนด</span>
                        <span><i className="dot-screen" />ช่องติดตั้งจอ</span>
                    </div>
                </div>

                <button
                    className="cabinet-nav"
                    aria-label="ไปตู้ขวา"
                    onClick={goRight}
                    disabled={!canGoRight}
                >
                    &rsaquo;
                </button>
            </div>

            {showPopup && (
                <div className="popup-overlay" onClick={closePopup}>
                    <div className="popup-content" onClick={(e) => e.stopPropagation()}>
                        <h2>รายละเอียดตู้ล็อกเกอร์</h2>

                        {isLoading ? (
                            <p className="popup-loading">กำลังโหลด...</p>
                        ) : detail ? (
                            <>
                                {showScreenSlotNote && (
                                    <div className="popup-note">
                                        <strong>หมายเหตุ:</strong> ช่องนี้ถูกล็อคไว้สำหรับติดตั้งจอ
                                        ไม่ใช้รับฝากของ เปิดได้เฉพาะตอนเข้าไปดูแลอุปกรณ์
                                    </div>
                                )}
                                <div className="locker-details">
                                    <p><strong>หมายเลขตู้</strong> {getLockerSlot(detail)}</p>
                                    <p><strong>ขนาด</strong> {detail.size || "-"}</p>
                                    <p><strong>เบอร์ผู้ฝาก</strong> {detail.phone_owner || "-"}</p>
                                    <p><strong>ห้อง</strong> {detail.room_number || "-"}</p>
                                    <p><strong>เวลาฝาก</strong> {formatDateTime(detail.deposit_time)}</p>
                                    <p><strong>รหัสผ่าน</strong> {detail.pass_code || "-"}</p>
                                </div>
                            </>
                        ) : (
                            <p className="popup-loading">ไม่พบข้อมูล</p>
                        )}

                        <div className="popup-buttons">
                            <button
                                className="popup-btn-action"
                                onClick={unlockLocker}
                                disabled={isUnlocking || isLoading}
                            >
                                {isUnlocking ? "กำลังสั่งเปิด..." : "สั่งเปิดตู้"}
                            </button>
                            <button className="popup-btn-close" onClick={closePopup}>ปิด</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default LockerBox;
