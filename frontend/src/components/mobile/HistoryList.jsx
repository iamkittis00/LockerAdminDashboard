import { useEffect, useMemo, useState } from 'react';
import { fetchTransactions } from '../../api/transactions';
import { formatRoom } from '../lockerLayout';
import { actionKey, attachDurations, formatDayLabel, formatDuration, formatPhone, formatTime, parseDate } from './format';

const PAGE_SIZE = 100;

const ACTION_TEXT = {
    deposit: 'ฝากของ',
    assign: 'ฝากของ',
    withdraw: 'รับของคืน',
    web_unlock: 'แอดมินสั่งเปิด',
    unlock: 'แอดมินสั่งเปิด',
    admin_clear: 'ล้างข้อมูลตู้',
    delete: 'ลบข้อมูล',
};
// การสั่งเปิดจากเว็บ ไฮไลต์ทั้งแถวให้เห็นชัด
const OPEN_ACTIONS = new Set(['web_unlock', 'unlock']);

function actorText(row) {
    if (row.staff_name) return `โดย ${row.staff_name}`;
    if (row.staff_id) return 'พนักงานที่ถูกลบ';
    return 'ลูกค้าทำเองที่ตู้';
}

// ประวัติแบบลิสต์สำหรับมือถือ — จัดกลุ่มตามวัน ไม่ต้องเลื่อนแนวนอน
function HistoryList({ stationId = null, stationName = '' }) {
    const [rows, setRows] = useState([]);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const result = await fetchTransactions(PAGE_SIZE, 0, stationId);
                const data = result.data || [];
                if (cancelled) return;
                setRows(data);
                setPage(0);
                setHasMore(data.length === PAGE_SIZE);
            } catch (error) {
                console.error('Error fetching history:', error);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [stationId]);

    const loadMore = async () => {
        if (isLoadingMore) return;
        setIsLoadingMore(true);
        try {
            const result = await fetchTransactions(PAGE_SIZE, (page + 1) * PAGE_SIZE, stationId);
            const data = result.data || [];
            setRows((prev) => [...prev, ...data]);
            setPage((p) => p + 1);
            setHasMore(data.length === PAGE_SIZE);
        } catch (error) {
            console.error('Error fetching history:', error);
        } finally {
            setIsLoadingMore(false);
        }
    };

    const groups = useMemo(() => {
        const out = [];
        for (const row of attachDurations(rows)) {
            const d = parseDate(row.timestamp);
            const label = d ? formatDayLabel(d) : 'ไม่ระบุวัน';
            const last = out[out.length - 1];
            if (last && last.label === label) last.items.push(row);
            else out.push({ label, items: [row] });
        }
        return out;
    }, [rows]);

    return (
        <div className="flex flex-col">
            <h1 className="text-xl font-extrabold text-slate-900">ประวัติการใช้งาน</h1>
            {stationName && <p className="text-[13px] text-slate-500 mt-0.5">{stationName}</p>}

            {isLoading ? (
                <p className="text-sm text-slate-400 text-center py-10">กำลังโหลด...</p>
            ) : groups.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-10">ยังไม่มีประวัติการใช้งาน</p>
            ) : (
                groups.map((g) => (
                    <section key={g.label} className="mt-4">
                        <h2 className="text-xs font-bold text-slate-500 mb-1.5">{g.label}</h2>
                        <ul className="bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                            {g.items.map((row) => (
                                <li key={row.trans_id} className={`px-4 py-3 flex flex-col gap-1 leading-snug ${OPEN_ACTIONS.has(actionKey(row.action)) ? 'bg-amber-50' : ''}`}>
                                    <div className={`text-[12.5px] font-bold ${OPEN_ACTIONS.has(actionKey(row.action)) ? 'text-amber-700' : 'text-slate-500'}`}>
                                        {ACTION_TEXT[actionKey(row.action)] || row.action || '-'}
                                    </div>
                                    <div className="flex items-baseline gap-3">
                                        <span className="text-base font-extrabold text-slate-900">ตู้ {row.locker_id}</span>
                                        {row.room_number && (
                                            <span className="text-sm font-semibold text-slate-700">ห้อง {formatRoom(row.room_number)}</span>
                                        )}
                                    </div>
                                    <div className="text-[13px] text-slate-600 tabular-nums">เบอร์โทร {formatPhone(row.phone)}</div>
                                    <div className="flex items-baseline justify-between gap-3 text-[12.5px] text-slate-500">
                                        <div className="flex gap-3 min-w-0">
                                            <span className="truncate">{actorText(row)}</span>
                                            {row.durationMs !== null && (
                                                <span className="whitespace-nowrap">ฝากไป {formatDuration(row.durationMs)}</span>
                                            )}
                                        </div>
                                        <span className="text-slate-400 whitespace-nowrap tabular-nums">{formatTime(row.timestamp)}</span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </section>
                ))
            )}

            {hasMore && (
                <div className="text-center mt-3">
                    <button
                        onClick={loadMore}
                        disabled={isLoadingMore}
                        className="bg-white border border-slate-200 rounded-full px-5 py-2 text-[13px] font-semibold text-slate-600 disabled:opacity-60"
                    >
                        {isLoadingMore ? 'กำลังโหลด...' : 'โหลดเพิ่มเติม'}
                    </button>
                </div>
            )}
        </div>
    );
}

export default HistoryList;
