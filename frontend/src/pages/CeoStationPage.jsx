import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import { ArrowLeft, Box, Users, Clock, Settings as SettingsIcon, LogOut, Pencil, X } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import LockerOverview from '../components/LockerOverview';
import StaffManagementPanel from '../components/StaffManagementPanel';
import HistoryModal from '../components/HistoryModal';
import ChangePasswordModal from '../components/ChangePasswordModal';
import { clearSession } from '../api/client';
import { fetchStations, updateStation } from '../api/stations';
import MobileNav from '../components/mobile/MobileNav';
import HistoryList from '../components/mobile/HistoryList';
import SettingsView from '../components/mobile/SettingsView';
import useIsMobile from '../hooks/useIsMobile';

const TABS = [
    { key: 'lockers', label: 'ตู้ล็อกเกอร์', icon: Box },
    { key: 'staff', label: 'พนักงาน', icon: Users },
];

// แก้ชื่อ/ที่ตั้งสาขา — ชื่อนี้โชว์ทุกหน้า (หน้าเลือกสาขา, แผงพนักงาน, ประวัติ)
function RenameStationModal({ station, stationId, onClose, onSaved }) {
    const [form, setForm] = useState({
        station_name: station?.station_name || '',
        location: station?.location || '',
    });
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isSaving) return;
        setIsSaving(true);
        try {
            await updateStation(stationId, {
                station_name: form.station_name.trim(),
                location: form.location.trim() || null,
            });
            toast.success('แก้ไขข้อมูลสาขาแล้ว');
            onSaved();
            onClose();
        } catch (error) {
            console.error('Error updating station:', error);
            toast.error(error.message || 'แก้ไขข้อมูลสาขาไม่สำเร็จ');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div
                role="dialog"
                aria-modal="true"
                aria-label="แก้ไขข้อมูลสาขา"
                className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6"
            >
                <div className="flex justify-between items-center mb-1">
                    <h3 className="text-lg font-bold text-slate-900">แก้ไขข้อมูลสาขา</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X size={20} />
                    </button>
                </div>
                <p className="text-sm text-slate-500 mb-4">
                    ชื่อนี้จะแสดงกับพนักงานทุกคนและในประวัติทั้งหมดของสาขา
                </p>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="station-name" className="block text-sm font-medium text-slate-700 mb-1.5">
                            ชื่อสาขา
                        </label>
                        <input
                            id="station-name"
                            value={form.station_name}
                            onChange={(e) => setForm({ ...form, station_name: e.target.value })}
                            maxLength={100}
                            required
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
                        />
                    </div>
                    <div>
                        <label htmlFor="station-location" className="block text-sm font-medium text-slate-700 mb-1.5">
                            ที่ตั้ง (ไม่บังคับ)
                        </label>
                        <input
                            id="station-location"
                            value={form.location}
                            onChange={(e) => setForm({ ...form, location: e.target.value })}
                            maxLength={255}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={isSaving}
                        className="w-full bg-brand hover:bg-brand-dark text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
                    </button>
                </form>
            </div>
        </div>
    );
}

// หน้าสาขาของ CEO — แยกเป็นแท็บ จะได้ไม่ต้องเลื่อนผ่านตารางตู้กว่าจะถึงส่วนพนักงาน
function CeoStationPage() {
    const { stationId } = useParams();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [station, setStation] = useState(null);
    const [staffCount, setStaffCount] = useState(null);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [isPasswordOpen, setIsPasswordOpen] = useState(false);
    const [isRenameOpen, setIsRenameOpen] = useState(false);

    const activeTab = searchParams.get('tab') === 'staff' ? 'staff' : 'lockers';
    const isMobile = useIsMobile();
    // มุมมองมือถือมีหน้าเพิ่ม (ประวัติ/ตั้งค่า) — ใช้ ?tab= เดิม จะได้ refresh แล้วอยู่หน้าเดิม
    const MOBILE_VIEWS = ['lockers', 'history', 'staff', 'settings'];
    const mobileView = MOBILE_VIEWS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'lockers';
    const setMobileView = (v) => setSearchParams(v === 'lockers' ? {} : { tab: v }, { replace: true });

    // เรียกซ้ำได้หลังแก้ชื่อสาขา — ตัว effect ใช้โครง IIFE + cancelled ตามแบบแผนของโปรเจค
    const loadStation = useCallback(async () => {
        const result = await fetchStations();
        return (result.data || []).find((s) => String(s.station_id) === String(stationId)) || null;
    }, [stationId]);

    const applyStation = (found) => {
        if (!found) return;
        setStation(found);
        setStaffCount(Number(found.staff_count) || 0);
    };

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const found = await loadStation();
                if (!cancelled) applyStation(found);
            } catch (error) {
                console.error('Error fetching station:', error);
            }
        })();
        return () => { cancelled = true; };
    }, [loadStation]);

    const handleStationSaved = async () => {
        try {
            applyStation(await loadStation());
        } catch (error) {
            console.error('Error refreshing station:', error);
        }
    };

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

    const modals = (
        <>
            {isPasswordOpen && (
                <ChangePasswordModal
                    onClose={() => setIsPasswordOpen(false)}
                    onSuccess={() => { clearSession(); setTimeout(() => navigate('/'), 1000); }}
                />
            )}
            {isHistoryOpen && (
                <HistoryModal stationId={stationId} onClose={() => setIsHistoryOpen(false)} />
            )}
            {isRenameOpen && (
                <RenameStationModal
                    station={station}
                    stationId={stationId}
                    onClose={() => setIsRenameOpen(false)}
                    onSaved={handleStationSaved}
                />
            )}
        </>
    );

    // มุมมองแอปมือถือ: เมนูล่างแทนปุ่มแถวบนและแท็บ (จอใหญ่ใช้หน้าเดิมด้านล่าง)
    if (isMobile) {
        return (
            <div className="min-h-screen px-4 pt-4 pb-28">
                <Toaster position="top-center" />
                {mobileView !== 'settings' && (
                    <button
                        onClick={() => navigate('/ceo')}
                        className="flex items-center gap-1.5 py-1 mb-2 text-sm font-medium text-slate-500"
                    >
                        <ArrowLeft size={15} />
                        ทุกสาขา
                    </button>
                )}

                {mobileView === 'lockers' && (
                    <>
                        <div className="mb-4">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h1 className="text-xl font-extrabold text-slate-900">{stationLabel}</h1>
                                <button
                                    onClick={() => setIsRenameOpen(true)}
                                    aria-label="แก้ไขข้อมูลสาขา"
                                    className="p-1.5 rounded-lg text-slate-400"
                                >
                                    <Pencil size={15} />
                                </button>
                                {isClosed && (
                                    <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-600 text-xs font-semibold">ปิดให้บริการ</span>
                                )}
                            </div>
                            <p className="text-[13px] text-slate-500 mt-0.5">รหัสสาขา #{stationId}</p>
                        </div>
                        <LockerOverview stationId={stationId} lockerPath={`/ceo/${stationId}/locker`} />
                    </>
                )}
                {mobileView === 'history' && <HistoryList stationId={stationId} stationName={stationLabel} />}
                {mobileView === 'staff' && (
                    <StaffManagementPanel stationId={stationId} stationName={stationLabel} onCountChange={setStaffCount} />
                )}
                {mobileView === 'settings' && (
                    <SettingsView
                        username={sessionStorage.getItem('username')}
                        roleLabel="ผู้บริหาร"
                        onChangePassword={() => setIsPasswordOpen(true)}
                        onLogout={handleLogout}
                    />
                )}

                <MobileNav active={mobileView} onChange={setMobileView} showStaff />
                {modals}
            </div>
        );
    }

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
                        <button
                            onClick={() => setIsRenameOpen(true)}
                            aria-label="แก้ไขข้อมูลสาขา"
                            title="แก้ไขชื่อ/ที่ตั้งสาขา"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-brand hover:bg-white border border-transparent hover:border-slate-200 transition-colors"
                        >
                            <Pencil size={15} />
                        </button>
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

            {modals}
        </div>
    );
}

export default CeoStationPage;
