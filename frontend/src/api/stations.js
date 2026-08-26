import { apiGet } from "./client";

// ceo ได้ทุกสาขา / admin ได้เฉพาะสาขาตัวเอง (backend เป็นคนตัดสิน)
export const fetchStations = () => apiGet("/stations");
