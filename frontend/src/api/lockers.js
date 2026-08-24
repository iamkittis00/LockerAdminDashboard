import { apiGet, apiPost } from "./client";

export const fetchLockers = () => apiGet("/lockers");
export const fetchLockerDetail = (lockerId) => apiGet(`/lockers/${lockerId}`);

// เบอร์เจ้าของตู้ backend อ่านจาก DB เอง ไม่ต้องส่งมาจาก client
export const unlockLocker = (lockerId) => apiPost(`/lockers/${lockerId}/unlock`);
