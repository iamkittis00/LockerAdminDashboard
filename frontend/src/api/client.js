// HTTP client กลาง — คุม base URL, auth header, และอายุ session ที่เดียว

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// เผื่อกรณีอ่าน exp จาก token ไม่ได้ — ต้องไม่ยาวกว่าที่ backend ตั้งไว้ (24 ชม.)
export const SESSION_MAX_MS = 24 * 60 * 60 * 1000;

// ปลายทางตอนถูกเตะออก — กลับหน้า login เฉยๆ ไม่ต้องบอกเหตุผล
export const EXPIRED_REDIRECT = "/";

// ตัวเฝ้าอายุ session ติดตั้งตอนแอปเปิด ซึ่งตอนนั้นยังไม่มีใครล็อกอิน
// จึงต้องมีสัญญาณบอกให้มันตั้งนาฬิกาใหม่เมื่อ session เปลี่ยน
const SESSION_CHANGED = "locker:session-changed";

function announceSessionChange() {
    window.dispatchEvent(new Event(SESSION_CHANGED));
}

export class ApiError extends Error {
    constructor(message, status, detail) {
        super(message);
        this.status = status;
        this.detail = detail;
    }
}

function getToken() {
    return sessionStorage.getItem("token");
}

// ล้าง session ที่เดียว — เคยพลาดลืมลบบางคีย์เพราะเขียนแยกกันหลายที่
const SESSION_KEYS = ["token", "username", "role", "mustChangePassword", "expiresAt"];

export function clearSession() {
    SESSION_KEYS.forEach((k) => sessionStorage.removeItem(k));
    announceSessionChange();
}

// อ่าน exp ออกจาก JWT — ให้ backend เป็นคนกำหนดอายุจริง ฝั่งเว็บแค่บังคับตาม
// จะได้ไม่มีทางที่หน้าเว็บคิดว่า session ยังไม่หมดทั้งที่ server ปฏิเสธไปแล้ว
export function readTokenExpiry(token) {
    try {
        const part = String(token || "").split(".")[1];
        if (!part) return null;
        const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
        const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
        const exp = JSON.parse(atob(padded)).exp;
        return typeof exp === "number" && exp > 0 ? exp * 1000 : null;
    } catch {
        return null;
    }
}

// เก็บ session ที่เดียวเหมือน clearSession
// sessionStorage = ปิดแท็บ/ปิดเบราว์เซอร์แล้วหาย ต้องล็อกอินใหม่
export function saveSession(result) {
    const token = result.access_token;
    sessionStorage.setItem("token", token);
    sessionStorage.setItem("username", result.username);
    sessionStorage.setItem("role", result.role || "");
    sessionStorage.setItem("mustChangePassword", result.must_change_password ? "1" : "0");
    sessionStorage.setItem("expiresAt", String(readTokenExpiry(token) ?? Date.now() + SESSION_MAX_MS));
    announceSessionChange();
}

export function getSessionExpiry() {
    const raw = Number(sessionStorage.getItem("expiresAt"));
    return Number.isFinite(raw) && raw > 0 ? raw : null;
}

// มี token แต่ไม่รู้วันหมดอายุ = session เก่าก่อนเพิ่มระบบนี้ หรือถูกแก้มือ
// ถือว่าหมดอายุไว้ก่อน (fail closed)
export function isSessionExpired() {
    if (!getToken()) return false;
    const expiresAt = getSessionExpiry();
    return expiresAt === null || Date.now() >= expiresAt;
}

export function hasValidSession() {
    return Boolean(getToken()) && !isSessionExpired();
}

function handleUnauthorized() {
    clearSession();
    window.location.href = EXPIRED_REDIRECT;
}

// เฝ้าเวลาหมดอายุแล้วเตะออกเอง ไม่ต้องรอให้ผู้ใช้กดอะไรก่อน
// (หน้า dashboard ไม่ได้ยิง API ตลอด เปิดค้างข้ามคืนจะไม่มีอะไรมาสะกิดเลย)
export function watchSessionExpiry(onExpire) {
    let timer = null;

    const check = () => {
        clearTimeout(timer);
        if (!getToken()) return;
        const expiresAt = getSessionExpiry();
        if (expiresAt === null || Date.now() >= expiresAt) {
            onExpire();
            return;
        }
        // setTimeout รับได้สูงสุด ~24.8 วัน และไม่เดินตอนเครื่อง sleep
        timer = setTimeout(check, Math.min(expiresAt - Date.now(), 2 ** 31 - 1));
    };

    // กลับมาที่แท็บ (ตื่นจาก sleep / สลับแท็บ) ให้เช็คซ้ำ เพราะ timer อาจเพี้ยน
    const onVisible = () => {
        if (document.visibilityState === "visible") check();
    };

    check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(SESSION_CHANGED, check);
    return () => {
        clearTimeout(timer);
        document.removeEventListener("visibilitychange", onVisible);
        window.removeEventListener(SESSION_CHANGED, check);
    };
}

// แปลง error response ของ backend (string/array/object) ให้เป็นข้อความเดียว
export function extractErrorMessage(errorData, fallback = "เกิดข้อผิดพลาด") {
    if (!errorData) return fallback;
    const { detail, message } = errorData;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail.map((d) => d.msg).join(", ");
    if (detail) return JSON.stringify(detail);
    return message || fallback;
}

async function request(path, { auth = true, body, ...options } = {}) {
    // หมดอายุแล้วก็ไม่ต้องยิงให้เสียเที่ยว server ปฏิเสธอยู่ดี
    if (auth && isSessionExpired()) {
        handleUnauthorized();
        throw new ApiError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่", 401);
    }

    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };

    if (auth) {
        const token = getToken();
        if (token) headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (response.status === 401 && auth) {
        handleUnauthorized();
        throw new ApiError("Unauthorized", 401);
    }
    return response;
}

// ยิง request แล้วคืน JSON ตรงๆ, throw ApiError ถ้า response ไม่ ok
async function requestJson(path, options) {
    const response = await request(path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new ApiError(extractErrorMessage(data), response.status, data.detail);
    }
    return data;
}

export const apiGet = (path, options) => requestJson(path, { ...options, method: "GET" });
export const apiPost = (path, body, options) => requestJson(path, { ...options, method: "POST", body });
export const apiPut = (path, body, options) => requestJson(path, { ...options, method: "PUT", body });
export const apiDelete = (path, options) => requestJson(path, { ...options, method: "DELETE" });
