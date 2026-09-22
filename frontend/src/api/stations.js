import { apiGet, apiPut } from "./client";

// ceo ได้ทุกสาขา / admin ได้เฉพาะสาขาตัวเอง (backend เป็นคนตัดสิน)
export const fetchStations = () => apiGet("/stations");

// เปลี่ยนชื่อ/ที่ตั้งสาขา — backend เปิดให้เฉพาะ ceo
export const updateStation = (stationId, payload) =>
    apiPut(`/stations/${encodeURIComponent(stationId)}`, payload);
