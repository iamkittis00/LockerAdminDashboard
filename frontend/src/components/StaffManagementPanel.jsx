import { useState, useEffect, useCallback, useRef } from 'react';
import { UserPlus, KeyRound, X, Users, Building2, Clock, Copy, Check, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchStaff, createStaff, updateStaff, resetStaffPassword } from '../api/staff';

// "วันนี้ 09:14" / "12/08 17:22" — ให้อ่านเร็วกว่าวันที่เต็ม
function formatLastLogin(value) {
    if (!value) return null;
    const d = new Date(value.replace ? value.replace(' ', 'T') : value);
    if (Number.isNaN(d.getTime())) return String(value);

    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const today = new Date();
    const sameDay =
        d.getDate() === today.getDate() &&
        d.getMonth() === today.getMonth() &&
        d.getFullYear() === today.getFullYear();

    if (sameDay) return `วันนี้ ${hh}:${mm}`;
    const dd = String(d.getDate()).padStart(2, '0');
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mo} ${hh}:${mm}`;
}

// รหัสผ่านโชว์ครั้งเดียวจริงๆ ปิดแล้วดูซ้ำไม่ได้ ต้องรีเซ็ตใหม่ทั้งรอบ
function PasswordResultModal({ result, onClose }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(result.password);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error('Clipboard error:', error);
            toast.error('คัดลอกไม่สำเร็จ กรุณาเลือกข้อความแล้วคัดลอกเอง');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div
                role="dialog"
                aria-modal="true"
                aria-label="รหัสผ่านใหม่ของพนักงาน"
                className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 flex flex-col gap-4"
            >

                <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-brand-tint text-brand flex items-center justify-center shrink-0">
                        <KeyRound size={18} />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-lg font-bold text-slate-900 leading-snug">
                            รหัสผ่านของ {result.fullname || result.username}
                        </h3>
                        <p className="text-sm text-slate-500 mt-0.5">
                            ชื่อผู้ใช้ <span className="font-semibold text-slate-600">{result.username}</span>
                        </p>
                    </div>
                </div>

                <div className="flex items-stretch gap-2">
                    <div className="grow bg-slate-50 border border-slate-200 rounded-lg px-4 py-3.5 font-mono text-xl font-semibold tracking-widest text-slate-900 text-center select-all">
                        {result.password}
                    </div>
                    <button
                        onClick={handleCopy}
                        className="flex flex-col items-center justify-center gap-1 w-[68px] border border-slate-200 rounded-lg bg-white text-xs font-semibold text-slate-600 hover:border-brand hover:text-brand transition-colors"
                    >
                        {copied ? <Check size={16} /> : <Copy size={16} />}
                        {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
                    </button>
                </div>

                <div className="flex flex-col gap-2 px-4 py-3.5 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-start gap-2">
                        <AlertTriangle size={15} className="text-amber-700 shrink-0 mt-0.5" />
                        <p className="text-sm font-semibold text-amber-800 leading-snug">
                            รหัสนี้จะแสดงแค่ครั้งเดียว
                        </p>
                    </div>
                    <p className="text-sm text-amber-700 leading-snug ml-[23px]">
                        ปิดหน้าต่างแล้วดูซ้ำไม่ได้ ถ้าทำหาย ต้องกดรีเซ็ตใหม่ทั้งรอบ
                    </p>
                </div>

                <p className="text-sm text-slate-500 leading-snug">
                    ส่งรหัสนี้ให้พนักงาน ระบบจะบังคับให้ตั้งรหัสใหม่ทันทีที่เข้าครั้งแรก
                </p>

                <button
                    onClick={onClose}
                    className="w-full bg-brand hover:bg-brand-dark text-white font-semibold py-2.5 rounded-lg transition-colors"
                >
                    ส่งให้พนักงานแล้ว ปิดหน้าต่าง
                </button>
            </div>
        </div>
    );
}

function StaffManagementPanel({ stationId, stationName, onCountChange }) {
    const [staff, setStaff] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [form, setForm] = useState({ username: '', fullname: '', phone: '' });
    const [passwordResult, setPasswordResult] = useState(null);
    const [busyUserId, setBusyUserId] = useState(null);

    // เก็บใน ref เพื่อไม่ให้ load() เปลี่ยน identity ทุกครั้งที่ parent re-render
    const onCountChangeRef = useRef(onCountChange);
    onCountChangeRef.current = onCountChange;

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            const result = await fetchStaff(stationId);
            const list = result.data || [];
            setStaff(list);
            onCountChangeRef.current?.(list.filter((m) => m.is_active).length);
        } catch (error) {
            console.error('Error fetching staff:', error);
            toast.error(error.message || 'โหลดรายชื่อพนักงานไม่สำเร็จ');
        } finally {
            setIsLoading(false);
        }
    }, [stationId]);

    useEffect(() => { load(); }, [load]);

    const handleCreate = async (e) => {
        e.preventDefault();
        if (isSaving) return;
        setIsSaving(true);
        try {
            const result = await createStaff({ ...form, station_id: Number(stationId) });
            setPasswordResult({ ...result.data, fullname: form.fullname });
            setForm({ username: '', fullname: '', phone: '' });
            setIsAddOpen(false);
            toast.success('เพิ่มพนักงานสำเร็จ');
            load();
        } catch (error) {
            console.error('Error creating staff:', error);
            toast.error(error.message || 'เพิ่มพนักงานไม่สำเร็จ');
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggleActive = async (member) => {
        if (busyUserId) return;
        setBusyUserId(member.user_id);
        try {
            await updateStaff(member.user_id, { is_active: !member.is_active });
            toast.success(member.is_active ? 'ปิดการใช้งานบัญชีแล้ว' : 'เปิดการใช้งานบัญชีแล้ว');
            load();
        } catch (error) {
            console.error('Error updating staff:', error);
            toast.error(error.message || 'แก้ไขไม่สำเร็จ');
        } finally {
            setBusyUserId(null);
        }
    };

    const handleResetPassword = async (member) => {
        if (busyUserId) return;
        setBusyUserId(member.user_id);
        try {
            const result = await resetStaffPassword(member.user_id);
            setPasswordResult({ ...result.data, fullname: member.fullname });
        } catch (error) {
            console.error('Error resetting password:', error);
            toast.error(error.message || 'รีเซ็ตรหัสผ่านไม่สำเร็จ');
        } finally {
            setBusyUserId(null);
        }
    };

    const stationLabel = stationName || `สาขา ${stationId}`;

    return (
        <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Users size={15} className="text-slate-400" />
                    <h2 className="text-sm font-semibold text-slate-800">พนักงานของสาขานี้</h2>
                    {!isLoading && <span className="text-xs text-slate-400">{staff.length} คน</span>}
                </div>
                <button
                    onClick={() => setIsAddOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-brand hover:bg-brand-dark transition-colors whitespace-nowrap"
                >
                    <UserPlus size={14} />
                    เพิ่มพนักงาน
                </button>
            </div>

            {isLoading ? (
                <div className="px-5 py-10 text-center text-sm text-slate-400">กำลังโหลด...</div>
            ) : staff.length === 0 ? (
                <div className="px-5 py-10 text-center">
                    <p className="text-sm font-medium text-slate-600">ยังไม่มีพนักงานในสาขานี้</p>
                    <p className="text-xs text-slate-400 mt-1">กด "เพิ่มพนักงาน" เพื่อสร้างบัญชีให้พนักงานเข้าใช้ระบบ</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-100 text-xs font-semibold text-slate-500">
                                <th className="px-4 sm:px-5 py-2.5">พนักงาน</th>
                                <th className="px-3 py-2.5">สาขา</th>
                                <th className="px-3 py-2.5">เบอร์โทร</th>
                                <th className="px-3 py-2.5">เข้าใช้ล่าสุด</th>
                                <th className="px-3 py-2.5">สถานะ</th>
                                <th className="px-4 sm:px-5 py-2.5 text-right">จัดการ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {staff.map((m) => {
                                const lastLogin = formatLastLogin(m.last_login);
                                return (
                                    <tr key={m.user_id} className={m.is_active ? '' : 'bg-slate-50/60'}>
                                        <td className="px-4 sm:px-5 py-3">
                                            <div className={`text-sm font-semibold ${m.is_active ? 'text-slate-800' : 'text-slate-500'}`}>
                                                {m.fullname || '-'}
                                            </div>
                                            <div className={`text-xs ${m.is_active ? 'text-slate-400' : 'text-slate-300'}`}>
                                                {m.username}
                                            </div>
                                        </td>
                                        <td className="px-3 py-3">
                                            <span className={`inline-flex items-center gap-1.5 text-[13px] ${m.is_active ? 'text-slate-600' : 'text-slate-400'}`}>
                                                <Building2 size={13} className={m.is_active ? 'text-slate-400' : 'text-slate-300'} />
                                                {stationLabel}
                                            </span>
                                        </td>
                                        <td className={`px-3 py-3 text-[13px] tabular-nums whitespace-nowrap ${m.is_active ? 'text-slate-600' : 'text-slate-400'}`}>
                                            {m.phone || '-'}
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap">
                                            {lastLogin ? (
                                                <span className={`text-xs tabular-nums ${m.is_active ? 'text-slate-500' : 'text-slate-400'}`}>
                                                    {lastLogin}
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
                                                    <Clock size={12} />
                                                    ยังไม่เคยเข้า
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-3 py-3">
                                            {m.is_active ? (
                                                <span className="inline-flex px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 text-xs font-semibold whitespace-nowrap">
                                                    ใช้งานอยู่
                                                </span>
                                            ) : (
                                                <span className="inline-flex px-2.5 py-1 rounded-md bg-slate-200 text-slate-600 text-xs font-semibold whitespace-nowrap">
                                                    ปิดใช้งาน
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 sm:px-5 py-3">
                                            <div className="flex items-center justify-end gap-1.5">
                                                {m.is_active ? (
                                                    <>
                                                        <button
                                                            onClick={() => handleResetPassword(m)}
                                                            disabled={busyUserId === m.user_id}
                                                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:border-brand hover:text-brand transition-colors disabled:opacity-50 whitespace-nowrap"
                                                        >
                                                            <KeyRound size={13} />
                                                            รีเซ็ตรหัส
                                                        </button>
                                                        <button
                                                            onClick={() => handleToggleActive(m)}
                                                            disabled={busyUserId === m.user_id}
                                                            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 whitespace-nowrap"
                                                        >
                                                            ปิดใช้งาน
                                                        </button>
                                                    </>
                                                ) : (
                                                    <button
                                                        onClick={() => handleToggleActive(m)}
                                                        disabled={busyUserId === m.user_id}
                                                        className="px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-white text-xs font-medium text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-50 whitespace-nowrap"
                                                    >
                                                        เปิดใช้งานอีกครั้ง
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {isAddOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label="เพิ่มพนักงานใหม่"
                        className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6"
                    >
                        <div className="flex justify-between items-center mb-1">
                            <h3 className="text-lg font-bold text-slate-900">เพิ่มพนักงาน</h3>
                            <button onClick={() => setIsAddOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </button>
                        </div>
                        <p className="text-sm text-slate-500 mb-4">
                            เพิ่มเข้าสาขา <span className="font-semibold text-slate-600">{stationLabel}</span> —
                            ระบบจะสุ่มรหัสผ่านให้ และบังคับให้ตั้งรหัสใหม่ตอนเข้าครั้งแรก
                        </p>
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div>
                                <label htmlFor="staff-username" className="block text-sm font-medium text-slate-700 mb-1.5">
                                    ชื่อผู้ใช้ (สำหรับล็อกอิน)
                                </label>
                                <input
                                    id="staff-username"
                                    value={form.username}
                                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                                    minLength={3}
                                    required
                                    autoComplete="off"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
                                />
                            </div>
                            <div>
                                <label htmlFor="staff-fullname" className="block text-sm font-medium text-slate-700 mb-1.5">
                                    ชื่อ-นามสกุล
                                </label>
                                <input
                                    id="staff-fullname"
                                    value={form.fullname}
                                    onChange={(e) => setForm({ ...form, fullname: e.target.value })}
                                    required
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
                                />
                            </div>
                            <div>
                                <label htmlFor="staff-phone" className="block text-sm font-medium text-slate-700 mb-1.5">
                                    เบอร์โทร
                                </label>
                                <input
                                    id="staff-phone"
                                    value={form.phone}
                                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                                    required
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isSaving}
                                className="w-full bg-brand hover:bg-brand-dark text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {isSaving ? 'กำลังบันทึก...' : 'เพิ่มพนักงาน'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {passwordResult && (
                <PasswordResultModal result={passwordResult} onClose={() => setPasswordResult(null)} />
            )}
        </div>
    );
}

export default StaffManagementPanel;
