import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { changePassword } from '../api/auth';

// mustChange = ล็อกอินครั้งแรก ปิดหน้าต่างหนีไม่ได้ ต้องตั้งรหัสใหม่ก่อน
function ChangePasswordModal({ mustChange = false, onClose, onSuccess }) {
    const [data, setData] = useState({ current_password: '', new_password: '', confirm_password: '' });
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isSaving) return;
        if (data.new_password !== data.confirm_password) {
            toast.error('รหัสผ่านที่ยืนยันใหม่ ไม่ตรงกันครับ');
            return;
        }
        setIsSaving(true);
        try {
            await changePassword(data.current_password, data.new_password);
            toast.success('เปลี่ยนรหัสผ่านสำเร็จ! กรุณาล็อกอินใหม่');
            onSuccess();
        } catch (error) {
            console.error('Error changing password:', error);
            toast.error(error.message || 'เกิดข้อผิดพลาด');
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden p-6">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-bold text-slate-900">
                        {mustChange ? 'ต้องเปลี่ยนรหัสผ่านก่อนใช้งาน' : 'เปลี่ยนรหัสผ่านแอดมิน'}
                    </h3>
                    {!mustChange && (
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                    )}
                </div>
                {mustChange && (
                    <p className="text-sm text-slate-500 mb-4">
                        นี่คือการเข้าสู่ระบบครั้งแรก กรุณาตั้งรหัสผ่านใหม่ก่อนใช้งานต่อ
                    </p>
                )}
                <form onSubmit={handleSubmit} className={`space-y-4 ${mustChange ? '' : 'mt-4'}`}>
                    <input type="password" placeholder="รหัสผ่านปัจจุบัน" value={data.current_password} onChange={(e) => setData({ ...data, current_password: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 outline-none focus:border-brand focus:ring-4 focus:ring-brand/10" required />
                    <input type="password" placeholder="รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)" value={data.new_password} onChange={(e) => setData({ ...data, new_password: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 outline-none focus:border-brand focus:ring-4 focus:ring-brand/10" minLength={8} required />
                    <input type="password" placeholder="ยืนยันรหัสผ่านใหม่" value={data.confirm_password} onChange={(e) => setData({ ...data, confirm_password: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 outline-none focus:border-brand focus:ring-4 focus:ring-brand/10" required />
                    <button type="submit" disabled={isSaving} className="w-full bg-brand hover:bg-brand-dark text-white font-semibold py-2.5 rounded-lg shadow-sm mt-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                        {isSaving ? 'กำลังบันทึก...' : 'ยืนยันการตั้งรหัสผ่านใหม่'}
                    </button>
                </form>
            </div>
        </div>
    );
}

export default ChangePasswordModal;
