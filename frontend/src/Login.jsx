import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Lock, ArrowRight } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const Login = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [isLoading, setIsLoading] = useState(false);

  // ฟังก์ชันอัปเดตค่าเมื่อพิมพ์
  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const result = await response.json();

      if (response.ok && result.status === 'success') {
        toast.success('เข้าสู่ระบบสำเร็จ!');
        sessionStorage.setItem('token', result.access_token);
        sessionStorage.setItem('username', result.username);

        setTimeout(() => navigate('/dashboard'), 1000);
      } else {
        toast.error(result.detail || 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง');
      }
    } catch (error) {
      console.error('Login error:', error);
      toast.error('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-3 sm:p-4 font-sans">
      <Toaster position="top-right" />

      {/* กล่อง Login */}
      <div className="max-w-md w-full bg-white rounded-2xl sm:rounded-3xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] p-6 sm:p-8 border border-gray-100">

        {/* หัวข้อ */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-indigo-50 mb-3 sm:mb-4">
            <Lock className="w-6 h-6 sm:w-8 sm:h-8 text-indigo-600" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Locker Admin</h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-1 sm:mt-2">เข้าสู่ระบบเพื่อจัดการระบบล็อกเกอร์</p>
        </div>

        {/* ฟอร์ม */}
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">

          {/* ช่อง Username */}
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5 sm:mb-2 ml-1">ชื่อผู้ใช้งาน</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <User className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                name="username"
                autoComplete="off"
                value={formData.username}
                onChange={handleChange}
                placeholder="กรอกชื่อผู้ใช้งาน"
                required
                className="w-full pl-11 pr-4 py-2.5 sm:py-3 bg-slate-50 border border-gray-200 rounded-xl text-sm sm:text-base text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
              />
            </div>
          </div>

          {/* ช่อง Password */}
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5 sm:mb-2 ml-1">รหัสผ่าน</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="password"
                name="password"
                autoComplete="off"
                value={formData.password}
                onChange={handleChange}
                placeholder="กรอกรหัสผ่าน"
                required
                className="w-full pl-11 pr-4 py-2.5 sm:py-3 bg-slate-50 border border-gray-200 rounded-xl text-sm sm:text-base text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all font-mono tracking-wider"
              />
            </div>
          </div>

          {/* ปุ่ม Login */}
          <button
            type="submit"
            disabled={isLoading}
            className={`w-full flex items-center justify-center gap-2 py-3 sm:py-3.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all mt-3 sm:mt-4 ${isLoading ? 'opacity-70 cursor-not-allowed' : ''
              }`}
          >
            {isLoading ? (
              'กำลังตรวจสอบ...'
            ) : (
              <>
                เข้าสู่ระบบ
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

      </div>
    </div>
  );
};

export default Login;
