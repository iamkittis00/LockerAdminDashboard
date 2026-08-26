import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import LockerBox from "../components/lockerBox";

// การตรวจสิทธิ์ทำที่ <RequireRole> ระดับ route แล้ว (ดู App.jsx)
function LockerPage({ stationId = null, backPath = '/dashboard' }) {
  const navigate = useNavigate();

  return (
    <div className="min-h-dvh relative">
      <button
        onClick={() => navigate(backPath)}
        className="fixed top-4 left-4 sm:top-5 sm:left-5 z-20 flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium text-slate-600 bg-white/90 backdrop-blur border border-slate-200 shadow-sm hover:text-slate-900 hover:border-slate-300 transition-colors"
      >
        <ArrowLeft size={16} />
        กลับหน้าแดชบอร์ด
      </button>
      <LockerBox stationId={stationId} />
    </div>
  );
}

export default LockerPage;
