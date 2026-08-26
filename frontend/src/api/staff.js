import { apiGet, apiPost, apiPut } from "./client";

export const fetchStaff = (stationId) => apiGet(`/staff?station_id=${stationId}`);
export const createStaff = (payload) => apiPost("/staff", payload);
export const updateStaff = (userId, payload) => apiPut(`/staff/${userId}`, payload);
export const resetStaffPassword = (userId) => apiPost(`/staff/${userId}/reset-password`);
