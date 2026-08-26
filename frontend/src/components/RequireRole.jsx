import { Navigate } from 'react-router-dom';
import { clearSession, hasValidSession, isSessionExpired, EXPIRED_REDIRECT } from '../api/client';

// หน้าแรกประจำ role — ใช้เป็นปลายทางตอนเข้าผิดโซน
const HOME_BY_ROLE = {
    admin: '/dashboard',
    ceo: '/ceo',
};

// กันเส้นทางเฉพาะ role — เช็คตั้งแต่ตอน render เหมือน RequireAuth
// หมายเหตุ: นี่เป็นแค่ UX ตัวจริงที่กันคือ backend (require_ceo / resolve_station_id)
// เพราะค่าใน sessionStorage ผู้ใช้แก้เองได้ แก้แล้วก็ยิง API ไม่ผ่านอยู่ดี
function RequireRole({ role, children }) {
    // หมดอายุ (เกิน 24 ชม.) ให้เตะออกพร้อมบอกเหตุผล ไม่ใช่ปล่อยให้เข้าไปเจอหน้าพัง
    if (isSessionExpired()) {
        clearSession();
        return <Navigate to={EXPIRED_REDIRECT} replace />;
    }
    if (!hasValidSession()) {
        return <Navigate to="/" replace />;
    }

    const current = sessionStorage.getItem('role') || '';
    if (current === role) {
        return children;
    }

    // ส่งกลับหน้าแรกของ role ตัวเอง ไม่ใช่ /dashboard ตายตัว —
    // ceo ที่ถูกส่งไป /dashboard จะเจอหน้าว่างเพราะ API ต้องการ station_id
    const home = HOME_BY_ROLE[current];
    if (!home) {
        // role ไม่รู้จัก (session เก่าหรือถูกแก้มือ) — ให้ล็อกอินใหม่ ดีกว่าวนซ้ำ
        clearSession();
        return <Navigate to="/" replace />;
    }
    return <Navigate to={home} replace />;
}

export default RequireRole;
