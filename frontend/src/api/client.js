// HTTP client กลาง — คุม base URL, auth header, และ 401 ที่เดียว

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

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

function handleUnauthorized() {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("username");
    sessionStorage.removeItem("mustChangePassword");
    window.location.href = "/";
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
