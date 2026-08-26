import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ArrowRight, LogOut, AlertTriangle } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { fetchStations } from '../api/stations';
import { clearSession } from '../api/client';

function CeoStationPickerPage() {
    const navigate = useNavigate();
    const [stations, setStations] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const result = await fetchStations();
                if (!cancelled) setStations(result.data || []);
            } catch (error) {
                console.error('Error fetching stations:', error);
                if (!cancelled) toast.error(error.message || 'โหลดรายชื่อสาขาไม่สำเร็จ');
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const handleLogout = () => {
        clearSession();
        navigate('/');
    };

    return (
        <div className="min-h-screen p-4 sm:p-6 lg:p-10">
            <Toaster position="top-right" />
            <div className="max-w-3xl mx-auto flex flex-col gap-6">

                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">ภาพรวมทุกสาขา</h1>
                        <p className="text-sm text-slate-500 mt-1">
                            เลือกสาขาเพื่อดูตู้ล็อกเกอร์และจัดการพนักงาน
                        </p>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 transition-colors self-start whitespace-nowrap"
                    >
                        <LogOut size={16} />
                        ออกจากระบบ
                    </button>
                </div>

                {isLoading ? (
                    <div className="border border-slate-200 rounded-xl bg-white px-5 py-12 text-center text-sm text-slate-400">
                        กำลังโหลด...
                    </div>
                ) : stations.length === 0 ? (
                    <div className="border border-slate-200 rounded-xl bg-white px-5 py-12 text-center">
                        <p className="text-sm font-medium text-slate-600">ยังไม่มีสาขาในระบบ</p>
                        <p className="text-xs text-slate-400 mt-1">เพิ่มข้อมูลในตาราง stations ก่อน จึงจะเลือกได้</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        <div className="flex items-baseline justify-between">
                            <h2 className="text-sm font-semibold text-slate-800">สาขาทั้งหมด</h2>
                            <span className="text-xs text-slate-400">{stations.length} สาขา</span>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            {stations.map((s) => (
                                <StationCard
                                    key={s.station_id}
                                    station={s}
                                    onOpen={() => navigate(`/ceo/${s.station_id}`)}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function StationCard({ station, onOpen }) {
    const isClosed = Number(station.status) === 0;
    const overdue = Number(station.overdue_count) || 0;
    const occupied = Number(station.occupied_count) || 0;
    const staff = Number(station.staff_count) || 0;
    const needsAttention = overdue > 0 && !isClosed;

    return (
        <button
            onClick={onOpen}
            className={`flex flex-col gap-3.5 px-5 py-4 rounded-xl border text-left transition-all hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 group ${
                needsAttention
                    ? 'border-red-200 border-l-[3px] border-l-red-500 bg-white'
                    : isClosed
                        ? 'border-slate-200 bg-slate-50'
                        : 'border-slate-200 bg-white hover:border-brand'
            }`}
        >
            <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    isClosed ? 'bg-slate-200 text-slate-400' : 'bg-brand-tint text-brand'
                }`}>
                    <Building2 size={18} />
                </div>
                <div className="min-w-0 grow">
                    <div className={`font-semibold text-sm truncate ${isClosed ? 'text-slate-500' : 'text-slate-900'}`}>
                        {station.station_name || `สาขา ${station.station_id}`}
                    </div>
                    <div className={`text-xs truncate ${isClosed ? 'text-slate-400' : 'text-slate-500'}`}>
                        {station.location || `รหัสสาขา ${station.station_id}`}
                    </div>
                </div>
                <ArrowRight
                    size={18}
                    className={`shrink-0 transition-transform group-hover:translate-x-1 ${
                        isClosed ? 'text-slate-300' : 'text-slate-400'
                    }`}
                />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
                {isClosed ? (
                    <>
                        <span className="inline-flex px-2 py-1 rounded-md bg-slate-200 text-slate-600 text-xs font-semibold">
                            ปิดให้บริการ
                        </span>
                        <span className="text-xs text-slate-400">พนักงาน {staff}</span>
                    </>
                ) : (
                    <>
                        {overdue > 0 ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-50 text-red-700 text-xs font-semibold">
                                <AlertTriangle size={12} />
                                เกินกำหนด {overdue}
                            </span>
                        ) : (
                            <span className="inline-flex px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 text-xs font-semibold">
                                ปกติ
                            </span>
                        )}
                        <span className="text-xs text-slate-600">มีของฝาก {occupied}</span>
                        <span className="text-slate-300">·</span>
                        <span className="text-xs text-slate-600">พนักงาน {staff}</span>
                    </>
                )}
            </div>
        </button>
    );
}

export default CeoStationPickerPage;
