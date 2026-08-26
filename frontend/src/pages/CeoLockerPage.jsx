import { useParams, Navigate } from 'react-router-dom';
import LockerPage from './LockerPage';

// หน้าตู้ล็อกเกอร์ในมุมมองของ CEO — ผูกกับสาขาที่เลือกไว้
function CeoLockerPage() {
    const { stationId } = useParams();

    if (!/^\d+$/.test(stationId || '')) {
        return <Navigate to="/ceo" replace />;
    }

    return <LockerPage stationId={stationId} backPath={`/ceo/${stationId}`} />;
}

export default CeoLockerPage;
