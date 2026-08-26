import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import { ArrowLeft, Box, Users, Clock, Settings as SettingsIcon, LogOut } from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import LockerOverview from '../components/LockerOverview';
import StaffManagementPanel from '../components/StaffManagementPanel';
import HistoryModal from '../components/HistoryModal';
import ChangePasswordModal from '../components/ChangePasswordModal';
import { clearSession } from '../api/client';
import { fetchStations } from '../api/stations';

const TABS = [
    { key: 'lockers', label: 'ตู้ล็อกเกอร์', icon: Box },
    { key: 'staff', label: 'พนักงาน', icon: Users },
];

// หน้าสาขาของ CEO — แยกเป็นแท็บ จะได้ไม่ต้องเลื่อนผ่านตารางตู้กว่าจะถึงส่วนพนักงาน
function CeoStationPage() {
    const { stationId } = useParams();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [station, setStation] = useState(null);
    const [staffCount, setStaffCount] = useState(null);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [isPasswordOpen, setIsPasswordOpen] = useState(false);

    const activeTab = searchParams.get('tab') === 'staff' ? 'staff' : 'lockers';

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const result = await fetchStations();
                const found = (result.data || []).find((s) => String(s.station_id) === String(stationId));
                if (!cancelled && found) {
                    setStation(found);
                    setStaffCount(Number(found.staff_count) || 0);
                }
            } catch (error) {
                console.error('Error fetching station:', error);
            }
        })();
        return () => { cancelled = true; };
    }, [stationId]);

    // กัน /ceo/abc หรือ /ceo/-1 — ต้องเป็นเลขสาขาที่ใช้ได้จริง
    if (!/^\d+$/.test(stationId || '')) {
        return <Navigate to="/ceo" replace />;
    }

    const stationLabel = station?.station_name || `สาขา ${stationId}`;
    const isClosed = station && Number(station.status) === 0;

    const handleLogout = () => {
        clearSession();
        navigate('/');
    };

    return (
        <div className="min-h-screen p-4 sm:p-6 lg:p-10">
            <Toaster position="top-right" />
            <div className="max-w-4xl mx-auto">

                {/* แถวบน: ทางกลับ + เครื่องมือประจำหน้า */}
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-1.5 text-sm min-w-0">
                        <button
                            onClick={() => navigate('/ceo')}
                            className="flex items-center gap-1.5 px-2 py-1 -ml-2 rounded-lg font-medium text-slate-500 hover:text-brand hover:bg-white transition-colors whitespace-nowrap"
                        >
                            <ArrowLeft size={15} />
                            ทุกสาขา
                        </button>
                        <span className="text-slate-300">/</span>
                        <span className="font-semibold text-slate-900 truncate">{stationLabel}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                        <button
                            onClick={() => setIsHistoryOpen(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-200 transition-colors"
                        >
                            <Clock size={15} />
                            ประวัติ
                        </button>
                        <button
                            onClick={() => setIsPasswordOpen(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-200 transition-colors"
                        >
                            <SettingsIcon size={15} />
                            ตั้งค่า
                        </button>
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 transition-colors"
                        >
                            <LogOut size={15} />
                            ออกจากระบบ
                        </button>
                    </div>
                </div>

                {/* ชื่อสาขา */}
                <div className="mb-5">
                    <div className="flex items-center gap-2.5 flex-wrap">
                        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{stationLabel}</h1>
                        {isClosed && (
                            <span className="inline-flex px-2 py-1 rounded-md bg-slate-200 text-slate-600 text-xs font-semibold">
                                ปิดให้บริการ
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-slate-500 mt-1">
                        {station?.location ? `${station.location} · ` : ''}รหัสสาขา #{stationId}
                    </p>
                </div>

                {/* แท็บ — สลับระหว่างงานตู้กับงานพนักงานได้ในคลิกเดียว ไม่ต้องเลื่อนหา */}
                <div role="tablist" aria-label="ส่วนจัดการของสาขา" className="inline-flex p-1 gap-1 mb-5 bg-white border border-slate-200 rounded-xl">
                    {TABS.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.key;
                        return (
                            <button
                                key={tab.key}
                                role="tab"
                                aria-selected={isActive}
                                onClick={() => setSearchParams(tab.key === 'lockers' ? {} : { tab: tab.key }, { replace: true })}
                                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                                    isActive ? 'bg-brand text-white' : 'text-slate-600 hover:bg-slate-50'
                                }`}
                            >
                                <Icon size={15} />
                                {tab.label}
                                {tab.key === 'staff' && staffCount !== null && (
                                    <span className={`px-1.5 py-0.5 rounded text-xs font-bold tabular-nums ${
                                        isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                                    }`}>
                                        {staffCount}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {activeTab === 'lockers' ? (
                    <LockerOverview stationId={stationId} lockerPath={`/ceo/${stationId}/locker`} />
                ) : (
                    <StaffManagementPanel
                        stationId={stationId}
                        stationName={stationLabel}
                        onCountChange={setStaffCount}
                    />
                )}
            </div>

            {isPasswordOpen && (
                <ChangePasswordModal
                    onClose={() => setIsPasswordOpen(false)}
                    onSuccess={() => { clearSession(); setTimeout(() => navigate('/'), 1000); }}
                />
            )}

            {isHistoryOpen && (
                <HistoryModal stationId={stationId} onClose={() => setIsHistoryOpen(false)} />
            )}
        </div>
    );
}

export default CeoStationPage;
