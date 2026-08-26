import { useState } from 'react';
import { Clock, Settings as SettingsIcon, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { clearSession } from '../api/client';
import LockerOverview from '../components/LockerOverview';
import HistoryModal from '../components/HistoryModal';
import ChangePasswordModal from '../components/ChangePasswordModal';

// หน้าหลักของพนักงานประจำสาขา
function DashboardPage() {
    const navigate = useNavigate();
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);

    // ล็อกอินครั้งแรก -> เปิด modal ตั้งรหัสใหม่ตั้งแต่ render แรก
    // (การตรวจสิทธิ์ทำที่ <RequireRole> ระดับ route แล้ว ดู App.jsx)
    const [mustChangePassword] = useState(() => sessionStorage.getItem('mustChangePassword') === '1');
    const [isPasswordOpen, setIsPasswordOpen] = useState(mustChangePassword);

    const handleLogout = () => {
        clearSession();
        navigate('/');
    };

    return (
        <div className="min-h-screen p-4 sm:p-6 lg:p-10">
            <Toaster position="top-right" />
            <div className="max-w-4xl mx-auto">

                {/* Header — ชิดซ้าย ไม่บังคับ symmetry */}
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">จัดการล็อกเกอร์</h1>
                        <p className="text-sm text-slate-500 mt-1">เปิด-ปิดตู้ และตรวจสอบสถานะการใช้งาน</p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setIsHistoryOpen(true)}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-200 transition-colors"
                        >
                            <Clock size={16} />
                            ประวัติ
                        </button>
                        <button
                            onClick={() => setIsPasswordOpen(true)}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-200 transition-colors"
                        >
                            <SettingsIcon size={16} />
                            ตั้งค่า
                        </button>
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 transition-colors"
                        >
                            <LogOut size={16} />
                            ออกจากระบบ
                        </button>
                    </div>
                </div>

                <LockerOverview />
            </div>

            {isPasswordOpen && (
                <ChangePasswordModal
                    mustChange={mustChangePassword}
                    onClose={() => setIsPasswordOpen(false)}
                    onSuccess={() => { clearSession(); setTimeout(() => navigate('/'), 1000); }}
                />
            )}

            {isHistoryOpen && <HistoryModal onClose={() => setIsHistoryOpen(false)} />}
        </div>
    );
}

export default DashboardPage;
