import { Box, Clock, Users, SlidersHorizontal } from 'lucide-react';

// เมนูล่างของมุมมองมือถือ — "พนักงาน" โผล่เฉพาะผู้บริหาร
const ITEMS = [
    { key: 'lockers', label: 'ตู้', icon: Box },
    { key: 'history', label: 'ประวัติ', icon: Clock },
    { key: 'staff', label: 'พนักงาน', icon: Users, ceoOnly: true },
    { key: 'settings', label: 'ตั้งค่า', icon: SlidersHorizontal },
];

function MobileNav({ active, onChange, showStaff = false }) {
    const items = ITEMS.filter((it) => !it.ceoOnly || showStaff);
    return (
        <nav
            aria-label="เมนูหลัก"
            className="fixed left-0 right-0 bottom-0 z-40 bg-white border-t border-slate-200 flex px-1.5 pt-1.5"
            style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
        >
            {items.map((it) => {
                const Icon = it.icon;
                const isActive = active === it.key;
                return (
                    <button
                        key={it.key}
                        onClick={() => onChange(it.key)}
                        aria-current={isActive ? 'page' : undefined}
                        className="flex-1 flex flex-col items-center gap-0.5 py-1"
                    >
                        <span className={`px-4 py-1 rounded-full ${isActive ? 'bg-brand-tint' : ''}`}>
                            <Icon size={19} className={isActive ? 'text-brand' : 'text-slate-400'} />
                        </span>
                        <span className={`text-[11px] ${isActive ? 'font-bold text-brand' : 'font-semibold text-slate-400'}`}>
                            {it.label}
                        </span>
                    </button>
                );
            })}
        </nav>
    );
}

export default MobileNav;
