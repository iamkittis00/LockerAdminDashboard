import { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { fetchTransactions } from '../api/transactions';

const PAGE_SIZE = 100;

// "2026-08-25 16:45:48" (MySQL) มีช่องว่างคั่น ซึ่ง Safari/iOS parse ไม่ได้ (Invalid Date)
// ต้องแปลงเป็น ISO ก่อนเสมอ — จุดอื่นในโปรเจคทำแบบนี้อยู่แล้ว
function formatTimestamp(value) {
    if (!value) return '-';
    const d = new Date(value.replace ? value.replace(' ', 'T') : value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('th-TH');
}

// ตู้ฝั่ง kiosk เขียน deposit/withdraw ส่วนหน้าเว็บเขียน UNLOCK — รองรับทั้งสองแบบ
const ACTION_LABELS = {
    deposit: { text: 'ฝากของ', className: 'bg-brand-tint text-brand' },
    assign: { text: 'ฝากของ', className: 'bg-brand-tint text-brand' },
    withdraw: { text: 'รับของคืน', className: 'bg-emerald-100 text-emerald-700' },
    unlock: { text: 'แอดมินสั่งเปิด', className: 'bg-amber-100 text-amber-800' },
    delete: { text: 'ลบข้อมูล', className: 'bg-slate-200 text-slate-600' },
};

function actionBadge(action) {
    return ACTION_LABELS[String(action || '').toLowerCase()]
        || { text: action || '-', className: 'bg-slate-100 text-slate-600' };
}

// ประวัติเปิด-ปิดตู้ ดึงทีละหน้า scope ตาม station ที่เปิดอยู่
function HistoryModal({ stationId = null, onClose }) {
    const [rows, setRows] = useState([]);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    const load = useCallback(async (isLoadMore) => {
        if (isLoadMore) setIsLoadingMore(true);
        try {
            const offset = isLoadMore ? (page + 1) * PAGE_SIZE : 0;
            const result = await fetchTransactions(PAGE_SIZE, offset, stationId);
            const data = result.data || [];
            if (isLoadMore) {
                setRows((prev) => [...prev, ...data]);
                setPage((prev) => prev + 1);
            } else {
                setRows(data);
                setPage(0);
            }
            setHasMore(data.length === PAGE_SIZE);
        } catch (error) {
            console.error('Error fetching history:', error);
        } finally {
            if (isLoadMore) setIsLoadingMore(false);
        }
    }, [page, stationId]);

    // โหลดหน้าแรกครั้งเดียวตอนเปิด
    useEffect(() => {
        load(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4">
            <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-[100vw] sm:max-w-4xl overflow-hidden flex flex-col h-[90dvh] sm:max-h-[80dvh]">
                <div className="flex justify-between items-center p-4 sm:p-6 border-b border-slate-100 shrink-0">
                    <h2 className="text-base sm:text-xl font-bold text-slate-900">ประวัติการใช้งานล็อกเกอร์</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 shrink-0"><X size={22} /></button>
                </div>
                <div className="p-3 sm:p-6 overflow-y-auto flex-1 bg-slate-50">
                    <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto max-w-[calc(100vw-24px)] sm:max-w-full">
                        <table className="w-full text-left border-collapse whitespace-nowrap min-w-[600px]">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs sm:text-sm">
                                    <th className="p-3 sm:p-4">เวลา</th><th className="p-3 sm:p-4">สาขา</th><th className="p-3 sm:p-4">ตู้</th><th className="p-3 sm:p-4">เบอร์โทร</th><th className="p-3 sm:p-4">ผู้ทำรายการ</th><th className="p-3 sm:p-4">การกระทำ</th><th className="p-3 sm:p-4">รายละเอียด</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {rows.map((row) => (
                                    <tr key={row.trans_id}>
                                        <td className="p-3 sm:p-4 text-[10px] sm:text-xs text-slate-500">{formatTimestamp(row.timestamp)}</td>
                                        <td className="p-3 sm:p-4 text-xs sm:text-sm text-slate-600">{row.station_name || `สาขา ${row.station_id}`}</td>
                                        <td className="p-3 sm:p-4 font-bold text-center text-sm">{row.locker_id}</td>
                                        <td className="p-3 sm:p-4 text-xs sm:text-sm">{row.phone || '-'}</td>
                                        <td className="p-3 sm:p-4 text-xs sm:text-sm">{row.staff_name || <span className="text-slate-400">ระบบ/ตู้</span>}</td>
                                        <td className="p-3 sm:p-4">
                                            <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${actionBadge(row.action).className}`}>
                                                {actionBadge(row.action).text}
                                            </span>
                                        </td>
                                        <td className="p-3 sm:p-4 text-[10px] sm:text-xs text-slate-400">{row.detail}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {hasMore && (
                        <div className="flex justify-center mt-4">
                            <button
                                onClick={() => load(true)}
                                disabled={isLoadingMore}
                                className="px-5 py-2 text-sm font-bold text-brand bg-brand-tint rounded-xl hover:brightness-95 transition disabled:opacity-60"
                            >
                                {isLoadingMore ? 'กำลังโหลด...' : 'โหลดเพิ่มเติม'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default HistoryModal;
