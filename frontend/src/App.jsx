import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import LockerPage from './pages/LockerPage';
import CeoStationPickerPage from './pages/CeoStationPickerPage';
import CeoStationPage from './pages/CeoStationPage';
import CeoLockerPage from './pages/CeoLockerPage';
import RequireRole from './components/RequireRole';
import { clearSession, watchSessionExpiry, EXPIRED_REDIRECT } from './api/client';

// เปิดหน้าค้างไว้ข้ามคืนจะไม่มีอะไรมาสะกิดเลยถ้าไม่เฝ้าเอง
// (หน้า dashboard ไม่ได้ยิง API เป็นระยะ)
function SessionWatcher() {
  useEffect(() => watchSessionExpiry(() => {
    clearSession();
    window.location.href = EXPIRED_REDIRECT;
  }), []);
  return null;
}

function App() {
  return (
    <BrowserRouter>
      <SessionWatcher />
      <Routes>
        <Route path="/" element={<LoginPage />} />

        {/* พนักงานประจำสาขา — backend บังคับให้เห็นเฉพาะสาขาตัวเองอยู่แล้ว
            กัน role="admin" ไว้ด้วย เพราะ ceo ที่หลงเข้ามาจะเจอหน้าว่าง
            (API ต้องการ station_id ซึ่งหน้านี้ไม่ได้ส่ง) */}
        <Route
          path="/dashboard"
          element={<RequireRole role="admin"><DashboardPage /></RequireRole>}
        />
        <Route
          path="/locker"
          element={<RequireRole role="admin"><LockerPage /></RequireRole>}
        />

        {/* ผู้บริหาร — เลือกสาขาก่อน แล้วดูได้ทุกสาขา + จัดการพนักงาน */}
        <Route
          path="/ceo"
          element={<RequireRole role="ceo"><CeoStationPickerPage /></RequireRole>}
        />
        <Route
          path="/ceo/:stationId"
          element={<RequireRole role="ceo"><CeoStationPage /></RequireRole>}
        />
        <Route
          path="/ceo/:stationId/locker"
          element={<RequireRole role="ceo"><CeoLockerPage /></RequireRole>}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
