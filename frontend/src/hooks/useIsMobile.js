import { useEffect, useState } from 'react';

// ต่ำกว่า breakpoint sm ของ Tailwind (640px) = มุมมองแอปมือถือ
// จอใหญ่ใช้หน้าตาเดิมทั้งหมด ไม่ใช่แค่ซ่อนด้วย CSS
const QUERY = '(max-width: 639px)';

function readMatch() {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(QUERY).matches;
}

export default function useIsMobile() {
    const [isMobile, setIsMobile] = useState(readMatch);

    useEffect(() => {
        if (!window.matchMedia) return undefined;
        const mql = window.matchMedia(QUERY);
        const onChange = (e) => setIsMobile(e.matches);
        mql.addEventListener?.('change', onChange);
        return () => mql.removeEventListener?.('change', onChange);
    }, []);

    return isMobile;
}
