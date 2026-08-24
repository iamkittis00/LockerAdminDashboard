import { Navigate } from 'react-router-dom';

// ยามเฝ้าเส้นทาง — เช็คตั้งแต่ตอน render ไม่ใช่ใน useEffect
// ถ้าเช็คใน useEffect หน้าจะถูกวาดออกมา 1 เฟรมก่อนแล้วค่อยเด้ง (เห็นโครงหน้าแวบนึง)
function RequireAuth({ children }) {
    if (!sessionStorage.getItem('token')) {
        return <Navigate to="/" replace />;
    }
    return children;
}

export default RequireAuth;
