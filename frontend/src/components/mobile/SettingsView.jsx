import { KeyRound, LogOut, ChevronRight, User } from 'lucide-react';

// หน้าตั้งค่าของมุมมองมือถือ — ที่อยู่ของเปลี่ยนรหัสผ่านและออกจากระบบ
function SettingsView({ username, stationName, onChangePassword, onLogout }) {
    return (
        <div className="flex flex-col gap-3">
            <h1 className="text-xl font-extrabold text-slate-900">ตั้งค่า</h1>

            <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-4">
                <div className="w-12 h-12 rounded-full bg-brand-tint text-brand flex items-center justify-center shrink-0">
                    <User size={22} />
                </div>
                <div className="min-w-0">
                    <div className="text-[15px] font-bold text-slate-800 truncate">{username || '-'}</div>
                    {stationName && <div className="text-xs text-slate-500 truncate">{stationName}</div>}
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <button
                    onClick={onChangePassword}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                >
                    <KeyRound size={17} className="text-slate-600" />
                    <span className="flex-1 text-sm font-semibold text-slate-800">เปลี่ยนรหัสผ่าน</span>
                    <ChevronRight size={16} className="text-slate-300" />
                </button>
            </div>

            <div className="bg-white border border-red-200 rounded-xl overflow-hidden">
                <button
                    onClick={onLogout}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                >
                    <LogOut size={17} className="text-red-600" />
                    <span className="flex-1 text-sm font-bold text-red-600">ออกจากระบบ</span>
                </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed px-1">
                ระบบให้เข้าใช้งานต่อเนื่องได้ครั้งละ 24 ชั่วโมง และการปิดแอปเป็นการออกจากระบบโดยอัตโนมัติ
            </p>
        </div>
    );
}

export default SettingsView;
