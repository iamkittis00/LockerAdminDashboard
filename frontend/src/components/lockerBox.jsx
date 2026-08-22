import "../components/lockerBox.css";
import { useState, useEffect } from "react";
import toast, { Toaster } from 'react-hot-toast'; // ใช้ไลบรารีแทนของเดิม

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

function LockerBox() {
    const [lockerData, setLockerData] = useState([]);
    const [selectedLocker, setSelectedLocker] = useState(null);
    const [currentLocker, setCurrentLocker] = useState(null);
    const [showPopup, setShowPopup] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const statusLocker = async () => {
        try {
            const token = sessionStorage.getItem("token");
            const response = await fetch(`${API_BASE_URL}/lockers`, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
            });
            if (response.status === 401) {
                sessionStorage.removeItem("token");
                window.location.href = "/";
                return;
            }
            if (!response.ok) throw new Error("Failed to fetch locker status");
            const data = await response.json();
            setLockerData(data);
        } catch (error) {
            console.error("Error fetching locker status:", error);
        }
    };

    useEffect(() => {
        if (!sessionStorage.getItem("token")) {
            window.location.href = "/";
            return;
        }
        statusLocker();
        const interval = setInterval(statusLocker, 30000);
        return () => clearInterval(interval);
    }, []);

    const unlockLocker = async () => {
        const lockerInfo = selectedLocker || currentLocker;
        if (!lockerInfo) return;

        try {
            const token = sessionStorage.getItem("token");
            const lockerId = lockerInfo.locker_id;
            const phoneOwner = lockerInfo.phone_owner || "none";

            // เปลี่ยนมาเรียก API บน 8885 ที่เพิ่งเขียนใหม่ ซึ่งจะสั่ง MQTT + เคลียร์ DB ให้จบในที่เดียว
            const res = await fetch(`${API_BASE_URL}/unlock/${lockerId},${phoneOwner}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
            });

            if (res.ok) {
                closePopup();
                toast.success(`🔓 สั่งเปิดตู้ Locker ${lockerId} ผ่านเซิร์ฟเวอร์สำเร็จ`); // ใช้ toast ใหม่
                setTimeout(() => {
                    statusLocker();
                }, 1500);
            } else {
                const errJSON = await res.json().catch(() => ({}));
                console.error("Unlock Error:", errJSON);
                toast.error(`❌ สั่งเปิด Locker ${lockerId} ไม่สำเร็จ`); // ใช้ toast ใหม่
            }
        } catch (error) {
            console.error("Error unlocking locker:", error);
            toast.error("❌ เกิดข้อผิดพลาด ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์หลักได้"); // ใช้ toast ใหม่
        }
    };

    const handleLockerClick = async (locker) => {
        setCurrentLocker(locker);
        setIsLoading(true);
        setShowPopup(true);
        setSelectedLocker(null);
        try {
            const token = sessionStorage.getItem("token");
            const response = await fetch(`${API_BASE_URL}/lockers/${locker.locker_id}`, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
            });

            if (response.ok) {
                const data = await response.json();
                if (Array.isArray(data) && data.length > 0) {
                    setSelectedLocker(data[0]);
                } else {
                    setSelectedLocker(null);
                }
            } else {
                setSelectedLocker(null);
            }
        } catch (error) {
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

    return (
        <div className="locker-scene">
            <Toaster position="top-center" /> {/* เพิ่มตัวแสดง Toast */}

            <div className="locker-wrapper">
                <div className="locker-body">
                    <div className="inline-locker">
                        {lockerData.map((locker, index) => {
                            const isOccupied = Number(locker.status) === 1;
                            const isOverdue = locker.is_overdue;

                            let doorClass = "door-free"; // Gray (Available)
                            let dotColor = "bg-gray-400";

                            if (isOccupied) {
                                if (isOverdue) {
                                    doorClass = "door-overdue"; // Red
                                    dotColor = "bg-red-500 text-white";
                                } else {
                                    doorClass = "door-used"; // Green
                                    dotColor = "bg-green-500";
                                }
                            }

                            return (
                                <div
                                    key={locker.locker_id || index}
                                    className={`door-locker ${doorClass}`}
                                    onClick={() => handleLockerClick(locker)}
                                >
                                    <div className="door-label">
                                        {isOccupied ? (isOverdue ? "Overdue" : "Occupied") : "Available"}
                                    </div>
                                    <div className="locker-id-container flex justify-center items-center gap-1.5 mt-2">
                                        <div className={`w-2 h-2 rounded-full ${dotColor} shadow-sm`}></div>
                                        <span className="locker-id">{locker.locker_id}</span>
                                    </div>
                                </div>
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

            {showPopup && (
                <div className="popup-overlay" onClick={closePopup}>
                    <div className="popup-content" onClick={(e) => e.stopPropagation()}>
                        <h2 className="text-xl font-bold mb-4">Locker Details</h2>
                        {isLoading ? (
                            <p className="text-gray-500">Loading...</p>
                        ) : selectedLocker ? (
                            <div className="locker-details">
                                <p><strong>Locker ID:</strong> {selectedLocker.locker_id}</p>
                                <p><strong>Owner Phone:</strong> {selectedLocker.phone_owner || "-"}</p>
                                <p><strong>Deposit Time:</strong> {selectedLocker.deposit_time || "-"}</p>
                                <p><strong>Temp Pass:</strong> {selectedLocker.temp_pass || "-"}</p>
                            </div>
                        ) : (
                            <p>No details available.</p>
                        )}
                        <div className="popup-buttons">
                            <button className="popup-btn-action" onClick={unlockLocker}>Unlock</button>
                            <button className="popup-btn-close" onClick={closePopup}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default LockerBox;
