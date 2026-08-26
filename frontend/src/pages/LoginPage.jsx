import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { login } from '../api/auth';
import { saveSession } from '../api/client';

function LoginPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await login(formData.username, formData.password);
      toast.success('เข้าสู่ระบบสำเร็จ');
      saveSession(result);
      // ceo เริ่มที่หน้าเลือกสาขา ส่วน admin เข้าสาขาตัวเองเลย
      const home = result.role === 'ceo' ? '/ceo' : '/dashboard';
      setTimeout(() => navigate(home), 600);
    } catch (error) {
      console.error('Login error:', error);
      toast.error(error.message || 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 relative overflow-hidden bg-canvas">
      <Toaster position="top-right" />

      <div className="w-full max-w-sm">
        {/* Wordmark — เลิกใช้วงกลมไอคอนกลางจอ ใช้ lockup แนวนอนแทน */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-md bg-brand flex items-center justify-center shrink-0">
            <div className="w-3.5 h-3.5 rounded-[2px] border-2 border-white" />
          </div>
          <div className="leading-tight">
            <div className="font-bold text-slate-900 text-lg tracking-tight">Locker Admin</div>
            <div className="text-xs text-slate-500">ระบบจัดการล็อกเกอร์ · เฉพาะพนักงาน</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_16px_40px_-16px_rgba(0,50,104,0.25)] p-7 sm:p-8">
          <h1 className="text-xl font-bold text-slate-900 mb-1">เข้าสู่ระบบ</h1>
          <p className="text-sm text-slate-500 mb-6">กรอกบัญชีพนักงานเพื่อจัดการระบบล็อกเกอร์</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-slate-700 mb-1.5">
                ชื่อผู้ใช้งาน
              </label>
              <input
                id="username"
                type="text"
                name="username"
                autoComplete="off"
                value={formData.username}
                onChange={handleChange}
                placeholder="เช่น admin"
                required
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 outline-none transition-colors focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/10"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
                รหัสผ่าน
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="off"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  required
                  className="w-full px-3.5 py-2.5 pr-10 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 tracking-wide outline-none transition-colors focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-white bg-brand shadow-sm shadow-brand/25 transition-all hover:bg-brand-dark hover:shadow-md hover:shadow-brand/30 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100"
            >
              {isLoading ? 'กำลังตรวจสอบ...' : (
                <>
                  เข้าสู่ระบบ
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          ระบบภายใน · ติดต่อผู้ดูแลระบบหากลืมรหัสผ่าน
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
