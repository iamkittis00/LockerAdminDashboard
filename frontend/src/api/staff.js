import { apiGet, apiPost, apiDelete } from "./client";

export const fetchStaff = (stationId) => apiGet(`/staff?station_id=${stationId}`);
export const createStaff = (payload) => apiPost("/staff", payload);
export const resetStaffPassword = (userId) => apiPost(`/staff/${userId}/reset-password`);

// ลบถาวร — นโยบายปัจจุบันไม่มี "ปิดใช้งานชั่วคราว" ต้องการให้กลับมาใช้คือเพิ่มใหม่
export const deleteStaff = (userId) => apiDelete(`/staff/${encodeURIComponent(userId)}`);
