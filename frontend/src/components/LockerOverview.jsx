import { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, ArrowRight, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchLockers } from '../api/lockers';
import { CABINETS, getLockerPosition, getLockerSlot, isScreenSlot } from './lockerLayout';

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

function cabinetLabel(slot) {
    const pos = getLockerPosition(slot);
    if (!pos) return '-';
    return CABINETS.find((c) => c.key === pos.cabinet)?.title || '-';
}

// ส่วนเนื้อหาหลักของการจัดการตู้ — ใช้ร่วมกันทั้งหน้าแอดมินและหน้า CEO รายสาขา
function LockerOverview({ stationId = null, lockerPath = '/locker' }) {
    const navigate = useNavigate();
    const [lockers, setLockers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await fetchLockers(stationId);
            setLockers(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Error fetching lockers:', error);
        } finally {
            setIsLoading(false);
        }
    }, [stationId]);

    useEffect(() => { load(); }, [load]);

    // ตู้ที่มีของฝากอยู่ เรียงตามระยะเวลาที่ฝากมากไปน้อย — ตู้เกินกำหนดจะขึ้นก่อนเองโดยธรรมชาติ
    const occupied = useMemo(() => {
        const now = Date.now();
        return lockers
            .filter((l) => Number(l.status) === 1)
            .map((l) => {
                const depositMs = l.deposit_time ? new Date(l.deposit_time.replace ? l.deposit_time.replace(' ', 'T') : l.deposit_time).getTime() : null;
                const elapsedMs = depositMs && !Number.isNaN(depositMs) ? now - depositMs : 0;
                return { ...l, elapsedMs, slot: getLockerSlot(l) };
            })
            .sort((a, b) => b.elapsedMs - a.elapsedMs);
    }, [lockers]);

    const overdueCount = useMemo(() => occupied.filter((l) => l.is_overdue).length, [occupied]);
    const freeCount = useMemo(
        () => lockers.filter((l) => Number(l.status) === 0 && !isScreenSlot(l)).length,
        [lockers]
    );

    return (
        <div>
            {/* ทางเข้าหน้า Locker Grid — สั่งเปิด-ปิดตู้จริง ขึ้นก่อนเพราะเป็นงานหลักที่ทำบ่อยที่สุด */}
            <button
                onClick={() => navigate(lockerPath)}
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

            {/* รายการตู้ที่กำลังใช้งาน — ยาวแค่ไหนก็ scroll ในกล่อง ไม่ดันเนื้อหาอื่นหลุดจอ */}
            <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <h2 className="text-sm font-semibold text-slate-800">ตู้ที่กำลังใช้งาน</h2>
                        {!isLoading && occupied.length > 0 && (
                            <span className="text-xs text-slate-400">{occupied.length} รายการ</span>
                        )}
                    </div>
                    {overdueCount > 0 && (
                        <span className="flex items-center gap-1 text-xs font-medium text-red-600">
                            <AlertTriangle size={13} />
                            มี {overdueCount} ตู้เกินกำหนด
                        </span>
                    )}
                </div>

                {isLoading ? (
                    <div className="px-5 py-10 text-center text-sm text-slate-400">กำลังโหลด...</div>
                ) : occupied.length === 0 ? (
                    <div className="px-5 py-10 text-center">
                        <p className="text-sm font-medium text-slate-600">ยังไม่มีตู้ไหนถูกใช้งานตอนนี้</p>
                        <p className="text-xs text-slate-400 mt-1">พอมีลูกค้าฝากของ รายการจะขึ้นแสดงที่นี่</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto overflow-y-auto max-h-[26rem]">
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 z-10">
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
                                        <td className="px-5 py-3 font-bold text-slate-800">{l.slot}</td>
                                        <td className="px-5 py-3 text-slate-600">{cabinetLabel(l.slot)}</td>
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
    );
}

export default LockerOverview;
