import { apiGet, apiPost } from "./client";

// stationId ใส่เฉพาะตอน ceo เลือกดูสาขา — admin ไม่ต้องส่ง backend บังคับใช้สาขาตัวเองอยู่แล้ว
const withStation = (path, stationId) =>
    stationId != null ? `${path}${path.includes("?") ? "&" : "?"}station_id=${stationId}` : path;

// backend ห่อเป็น {status, data} เหมือน endpoint อื่นแล้ว แต่ยังรับ array เปล่าไว้ด้วย
// เผื่อช่วง deploy ที่เบราว์เซอร์ยังถือ bundle เก่า/ใหม่คนละรอบกับ API
export const fetchLockers = async (stationId) => {
    const result = await apiGet(withStation("/lockers", stationId));
    if (Array.isArray(result)) return result;
    return Array.isArray(result?.data) ? result.data : [];
};

// ต้องส่ง station ไปด้วย — locker_id อย่างเดียวไม่พอที่จะชี้ตู้ให้ตรงใบเมื่อมีหลายสาขา
export const fetchLockerDetail = (lockerId, stationId) =>
    apiGet(withStation(`/lockers/${encodeURIComponent(lockerId)}`, stationId));

// เบอร์เจ้าของตู้ backend อ่านจาก DB เอง ไม่ต้องส่งมาจาก client
export const unlockLocker = (lockerId, stationId) =>
    apiPost(withStation(`/lockers/${encodeURIComponent(lockerId)}/unlock`, stationId));
