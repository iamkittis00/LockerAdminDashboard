import { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Clock, Settings as SettingsIcon, X, ArrowRight, AlertTriangle, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import { fetchTransactions } from '../api/transactions';
import { fetchLockers } from '../api/lockers';
import { changePassword } from '../api/auth';
import { CABINETS, getLockerPosition } from '../components/lockerLayout';

const HISTORY_PAGE_SIZE = 100;
const OVERDUE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // ค่าปริยาย 24 ชม. — ตรงกับที่ backend ตั้งไว้

// เบอร์โทร -> "063-778-2214"
function formatPhone(phone) {
    if (!phone) return '-';
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    return phone;
}

// เวลาที่ฝาก -> "22/08 16:07"
function formatShortDateTime(value) {
    if (!value) return '-';
    const d = new Date(value.replace ? value.replace(' ', 'T') : value);
    if (Number.isNaN(d.getTime())) return String(value);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm} ${hh}:${min}`;
}

// มิลลิวินาที -> "48 ชม. 36 น."
function formatHoursMinutes(ms) {
    const totalMinutes = Math.max(0, Math.floor(ms / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours} ชม. ${minutes} น.`;
}

function cabinetLabel(lockerId) {
    const pos = getLockerPosition(lockerId);
    if (!pos) return '-';
    return CABINETS.find((c) => c.key === pos.cabinet)?.title || '-';
}

function DashboardPage() {
    const navigate = useNavigate();

    const [lockers, setLockers] = useState([]);
    const [isLockersLoading, setIsLockersLoading] = useState(true);

    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [historyData, setHistoryData] = useState([]);
    const [historyPage, setHistoryPage] = useState(0);
    const [hasMoreHistory, setHasMoreHistory] = useState(true);
    const [isHistoryLoadingMore, setIsHistoryLoadingMore] = useState(false);

    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
    const [mustChangePassword, setMustChangePassword] = useState(false);
    const [passwordData, setPasswordData] = useState({ current_password: '', new_password: '', confirm_password: '' });
    const [isChangingPassword, setIsChangingPassword] = useState(false);

    // Prevent body scrolling when a modal is open
    useEffect(() => {
        const isAnyModalOpen = isHistoryModalOpen || isPasswordModalOpen;
        document.body.style.overflow = isAnyModalOpen ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [isHistoryModalOpen, isPasswordModalOpen]);

    const loadLockers = useCallback(async () => {
        setIsLockersLoading(true);
        try {
            const data = await fetchLockers();
            setLockers(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Error fetching lockers:', error);
        } finally {
            setIsLockersLoading(false);
        }
    }, []);

    const fetchHistory = useCallback(async (isLoadMore = false) => {
        const setLoading = isLoadMore ? setIsHistoryLoadingMore : () => {};
        setLoading(true);
        try {
            const offset = isLoadMore ? (historyPage + 1) * HISTORY_PAGE_SIZE : 0;
            const result = await fetchTransactions(HISTORY_PAGE_SIZE, offset);
            if (isLoadMore) {
                setHistoryData((prev) => [...prev, ...result.data]);
                setHistoryPage((prevPage) => prevPage + 1);
            } else {
                setHistoryData(result.data);
                setHistoryPage(0);
            }
            setHasMoreHistory(result.data.length === HISTORY_PAGE_SIZE);
        } catch (error) {
            console.error('Error fetching history:', error);
        } finally {
            setLoading(false);
        }
    }, [historyPage]);

    // การตรวจสิทธิ์ทำที่ <RequireAuth> ระดับ route แล้ว (ดู App.jsx)
    useEffect(() => {
        loadLockers();
        if (sessionStorage.getItem('mustChangePassword') === '1') {
            setMustChangePassword(true);
            setPasswordData({ current_password: '', new_password: '', confirm_password: '' });
            setIsPasswordModalOpen(true);
        }
    }, [navigate, loadLockers]);

    // ตู้ที่มีของฝากอยู่ เรียงตามระยะเวลาที่ฝากมากไปน้อย — ตู้เกินกำหนดจะขึ้นก่อนเองโดยธรรมชาติ
    const occupied = useMemo(() => {
        const now = Date.now();
        return lockers
            .filter((l) => Number(l.status) === 1)
            .map((l) => {
                const depositMs = l.deposit_time ? new Date(l.deposit_time.replace ? l.deposit_time.replace(' ', 'T') : l.deposit_time).getTime() : null;
                const elapsedMs = depositMs && !Number.isNaN(depositMs) ? now - depositMs : 0;
                return { ...l, elapsedMs };
            })
            .sort((a, b) => b.elapsedMs - a.elapsedMs);
    }, [lockers]);

    const overdueCount = useMemo(() => occupied.filter((l) => l.is_overdue).length, [occupied]);
    const freeCount = useMemo(() => lockers.filter((l) => Number(l.status) === 0 && Number(l.is_usable) !== 0).length, [lockers]);

    const handlePasswordSubmit = async (e) => {
        e.preventDefault();
        if (isChangingPassword) return;
        if (passwordData.new_password !== passwordData.confirm_password) {
            toast.error('รหัสผ่านที่ยืนยันใหม่ ไม่ตรงกันครับ');
            return;
        }
        setIsChangingPassword(true);
        try {
            await changePassword(passwordData.current_password, passwordData.new_password);
            toast.success('เปลี่ยนรหัสผ่านสำเร็จ! กรุณาล็อกอินใหม่');
            sessionStorage.removeItem('token');
            sessionStorage.removeItem('username');
            sessionStorage.removeItem('mustChangePassword');
            setTimeout(() => navigate('/'), 1000);
        } catch (error) {
            console.error('Error changing password:', error);
            toast.error(error.message || 'เกิดข้อผิดพลาด');
            setIsChangingPassword(false);
        }
    };

    const handleLogout = () => {
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('username');
        sessionStorage.removeItem('mustChangePassword');
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
                            onClick={() => { fetchHistory(false); setIsHistoryModalOpen(true); }}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-200 transition-colors"
                        >
                            <Clock size={16} />
                            ประวัติ
                        </button>
                        <button
                            onClick={() => { setPasswordData({ current_password: '', new_password: '', confirm_password: '' }); setIsPasswordModalOpen(true); }}
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

                {/* ทางเข้าหน้า Locker Grid — สั่งเปิด-ปิดตู้จริง ขึ้นก่อนเพราะเป็นงานหลักที่ทำบ่อยที่สุด */}
                <button
                    onClick={() => navigate('/locker')}
                    className="w-full flex items-center justify-between gap-4 px-5 py-4 mb-6 rounded-xl bg-brand text-white shadow-md shadow-brand/25 ring-1 ring-inset ring-white/10 transition-all hover:bg-brand-dark hover:shadow-lg hover:shadow-brand/30 hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm active:brightness-90 cursor-pointer group"
                >
                    <div className="flex items-center gap-3 text-left">
                        <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                            <Box size={18} />
                        </div>
                        <div>
                            <div className="font-semibold text-sm">เปิดหน้าตู้ล็อกเกอร์ทั้งหมด</div>
                            <div className="text-white/70 text-xs">สั่งเปิด-ปิดตู้แต่ละช่องได้จากตรงนี้</div>
                        </div>
                    </div>
                    <ArrowRight size={18} className="opacity-80 group-hover:translate-x-1 transition-transform shrink-0" />
                </button>

                {/* แถบสรุปสถานะ — ตัวเลขคั่นด้วยเส้น ไม่ใช่การ์ด 3 ใบซ้ำแบบ */}
                <div className="flex items-stretch divide-x divide-slate-200 border border-slate-200 rounded-xl bg-white mb-6 overflow-hidden">
                    <div className="flex-1 px-5 py-4">
                        <div className="text-2xl font-bold text-slate-900 tabular-nums">{occupied.length}</div>
                        <div className="text-xs text-slate-500 mt-0.5">ตู้มีของฝากอยู่</div>
                    </div>
                    <div className="flex-1 px-5 py-4">
                        <div className={`text-2xl font-bold tabular-nums ${overdueCount > 0 ? 'text-red-600' : 'text-slate-900'}`}>{overdueCount}</div>
                        <div className="text-xs text-slate-500 mt-0.5">เกินกำหนดฝาก</div>
                    </div>
                    <div className="flex-1 px-5 py-4">
                        <div className="text-2xl font-bold text-slate-900 tabular-nums">{freeCount}</div>
                        <div className="text-xs text-slate-500 mt-0.5">ตู้ว่าง</div>
                    </div>
                </div>

                {/* รายการตู้ที่กำลังใช้งาน */}
                <div className="border border-slate-200 rounded-xl bg-white overflow-hidden mb-6">
                    <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-slate-800">ตู้ที่กำลังใช้งาน</h2>
                        {overdueCount > 0 && (
                            <span className="flex items-center gap-1 text-xs font-medium text-red-600">
                                <AlertTriangle size={13} />
                                มี {overdueCount} ตู้เกินกำหนด
                            </span>
                        )}
                    </div>

                    {isLockersLoading ? (
                        <div className="px-5 py-10 text-center text-sm text-slate-400">กำลังโหลด...</div>
                    ) : occupied.length === 0 ? (
                        <div className="px-5 py-10 text-center">
                            <p className="text-sm font-medium text-slate-600">ยังไม่มีตู้ไหนถูกใช้งานตอนนี้</p>
                            <p className="text-xs text-slate-400 mt-1">พอมีลูกค้าฝากของ รายการจะขึ้นแสดงที่นี่</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-100 text-xs font-semibold text-slate-500">
                                        <th className="px-5 py-2.5">ตู้</th>
                                        <th className="px-5 py-2.5">ฝั่ง</th>
                                        <th className="px-5 py-2.5">ห้อง</th>
                                        <th className="px-5 py-2.5">เบอร์โทรผู้ฝาก</th>
                                        <th className="px-5 py-2.5">เวลาที่ฝาก</th>
                                        <th className="px-5 py-2.5">ระยะเวลา</th>
                                        <th className="px-5 py-2.5 text-right">สถานะ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {occupied.map((l) => (
                                        <tr
                                            key={l.locker_id}
                                            className={`text-sm ${l.is_overdue ? 'bg-red-50/50 border-l-4 border-red-500' : ''}`}
                                        >
                                            <td className="px-5 py-3 font-bold text-slate-800">{l.locker_id}</td>
                                            <td className="px-5 py-3 text-slate-600">{cabinetLabel(l.locker_id)}</td>
                                            <td className="px-5 py-3 text-slate-600">{l.room_number || '-'}</td>
                                            <td className="px-5 py-3 text-slate-600 tabular-nums">{formatPhone(l.phone_owner)}</td>
                                            <td className="px-5 py-3 text-slate-500 text-xs tabular-nums">{formatShortDateTime(l.deposit_time)}</td>
                                            <td className="px-5 py-3 text-slate-600 text-xs tabular-nums">{formatHoursMinutes(l.elapsedMs)}</td>
                                            <td className="px-5 py-3 text-right">
                                                {l.is_overdue ? (
                                                    <>
                                                        <span className="inline-flex px-2.5 py-1 rounded-md bg-red-600 text-white text-xs font-bold">
                                                            เกินกำหนด
                                                        </span>
                                                        <div className="text-[11px] text-red-600 font-medium mt-1">
                                                            เกินมา {formatHoursMinutes(l.elapsedMs - OVERDUE_THRESHOLD_MS)}
                                                        </div>
                                                    </>
                                                ) : (
                                                    <span className="inline-flex px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 text-xs font-semibold">
                                                        ปกติ
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Modals */}
            {isPasswordModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden p-6">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-lg font-bold text-slate-900">
                                {mustChangePassword ? 'ต้องเปลี่ยนรหัสผ่านก่อนใช้งาน' : 'เปลี่ยนรหัสผ่านแอดมิน'}
                            </h3>
                            {!mustChangePassword && (
                                <button onClick={() => setIsPasswordModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                            )}
                        </div>
                        {mustChangePassword && (
                            <p className="text-sm text-slate-500 mb-4">
                                นี่คือการเข้าสู่ระบบครั้งแรก กรุณาตั้งรหัสผ่านใหม่ก่อนใช้งานต่อ
                            </p>
                        )}
                        <form onSubmit={handlePasswordSubmit} className={`space-y-4 ${mustChangePassword ? '' : 'mt-4'}`}>
                            <input type="password" placeholder="รหัสผ่านปัจจุบัน" value={passwordData.current_password} onChange={(e) => setPasswordData({ ...passwordData, current_password: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 outline-none focus:border-brand focus:ring-4 focus:ring-brand/10" required />
                            <input type="password" placeholder="รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)" value={passwordData.new_password} onChange={(e) => setPasswordData({ ...passwordData, new_password: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 outline-none focus:border-brand focus:ring-4 focus:ring-brand/10" minLength={8} required />
                            <input type="password" placeholder="ยืนยันรหัสผ่านใหม่" value={passwordData.confirm_password} onChange={(e) => setPasswordData({ ...passwordData, confirm_password: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 outline-none focus:border-brand focus:ring-4 focus:ring-brand/10" required />
                            <button type="submit" disabled={isChangingPassword} className="w-full bg-brand hover:bg-brand-dark text-white font-semibold py-2.5 rounded-lg shadow-sm mt-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                                {isChangingPassword ? 'กำลังบันทึก...' : 'ยืนยันการตั้งรหัสผ่านใหม่'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {isHistoryModalOpen && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4">
                    <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-[100vw] sm:max-w-4xl overflow-hidden flex flex-col h-[90dvh] sm:max-h-[80dvh]">
                        <div className="flex justify-between items-center p-4 sm:p-6 border-b border-slate-100 shrink-0">
                            <h2 className="text-base sm:text-xl font-bold text-slate-900">ประวัติการใช้งานล็อกเกอร์</h2>
                            <button onClick={() => setIsHistoryModalOpen(false)} className="text-slate-400 hover:text-slate-600 shrink-0"><X size={22} /></button>
                        </div>
                        <div className="p-3 sm:p-6 overflow-y-auto flex-1 bg-slate-50">
                            <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto max-w-[calc(100vw-24px)] sm:max-w-full">
                                <table className="w-full text-left border-collapse whitespace-nowrap min-w-[600px]">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs sm:text-sm">
                                            <th className="p-3 sm:p-4">เวลา</th><th className="p-3 sm:p-4">ตู้</th><th className="p-3 sm:p-4">เบอร์โทร</th><th className="p-3 sm:p-4">ชื่อ</th><th className="p-3 sm:p-4">การกระทำ</th><th className="p-3 sm:p-4">รายละเอียด</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {historyData.map((row) => (
                                            <tr key={row.trans_id}>
                                                <td className="p-3 sm:p-4 text-[10px] sm:text-xs text-slate-500">{new Date(row.timestamp).toLocaleString('th-TH')}</td>
                                                <td className="p-3 sm:p-4 font-bold text-center text-sm">{row.locker_id}</td>
                                                <td className="p-3 sm:p-4 text-xs sm:text-sm">{row.phone}</td>
                                                <td className="p-3 sm:p-4 text-xs sm:text-sm">{row.fullname}</td>
                                                <td className="p-3 sm:p-4">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${row.action === 'UNLOCK' ? 'bg-emerald-100 text-emerald-700' : row.action === 'ASSIGN' ? 'bg-brand-tint text-brand' : 'bg-slate-100'}`}>{row.action}</span>
                                                </td>
                                                <td className="p-3 sm:p-4 text-[10px] sm:text-xs text-slate-400">{row.detail}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {hasMoreHistory && (
                                <div className="flex justify-center mt-4">
                                    <button
                                        onClick={() => fetchHistory(true)}
                                        disabled={isHistoryLoadingMore}
                                        className="px-5 py-2 text-sm font-bold text-brand bg-brand-tint rounded-xl hover:brightness-95 transition disabled:opacity-60"
                                    >
                                        {isHistoryLoadingMore ? 'กำลังโหลด...' : 'โหลดเพิ่มเติม'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default DashboardPage;
