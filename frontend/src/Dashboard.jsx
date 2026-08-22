import React, { useState, useEffect } from 'react';
import { Search, Plus, Edit2, Trash2, Box, X, Clock, BarChart3, Settings as SettingsIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const Dashboard = () => {
    const navigate = useNavigate();

    const [users, setUsers] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    // Modal States
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState('add'); // 'add' or 'edit'
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
    const [historyData, setHistoryData] = useState([]);
    const [historyPage, setHistoryPage] = useState(0);
    const [hasMoreHistory, setHasMoreHistory] = useState(true);

    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
    const [passwordData, setPasswordData] = useState({ current_password: '', new_password: '', confirm_password: '' });

    const [currentUser, setCurrentUser] = useState(null);
    const [formData, setFormData] = useState({ room_number: '', fullname: '', phone: '', custom_max_days: '' });

    const [statsData, setStatsData] = useState([]);
    const [chartRange, setChartRange] = useState(7);
    const [chartType, setChartType] = useState('bar');
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [globalSettings, setGlobalSettings] = useState({ max_deposit_days: 1 });
    const [isSavingSettings, setIsSavingSettings] = useState(false);
    const [settingsSaveSuccess, setSettingsSaveSuccess] = useState(false);
    const [chartHeight, setChartHeight] = useState(300);

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth < 640) setChartHeight(220);
            else if (window.innerWidth < 1024) setChartHeight(280);
            else setChartHeight(350);
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Prevent body scrolling when any modal is open
    useEffect(() => {
        const isAnyModalOpen = isModalOpen || isSearchModalOpen || isHistoryModalOpen || isPasswordModalOpen || isSettingsModalOpen || isDeleteModalOpen;
        if (isAnyModalOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isModalOpen, isSearchModalOpen, isHistoryModalOpen, isPasswordModalOpen, isSettingsModalOpen, isDeleteModalOpen]);

    const fetchHistory = async (isLoadMore = false) => {
        try {
            const token = sessionStorage.getItem('token');
            const limit = 100;
            const offset = isLoadMore ? (historyPage + 1) * limit : 0;

            const response = await fetch(`${API_BASE_URL}/transactions?limit=${limit}&offset=${offset}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.status === 401) {
                sessionStorage.removeItem('token');
                navigate('/');
                return;
            }
            const result = await response.json();
            if (result.status === 'success') {
                if (isLoadMore) {
                    setHistoryData(prev => [...prev, ...result.data]);
                    setHistoryPage(prevPage => prevPage + 1);
                } else {
                    setHistoryData(result.data);
                    setHistoryPage(0);
                }
                setHasMoreHistory(result.data.length === limit);
            }
        } catch (error) {
            console.error('Error fetching history:', error);
        }
    };

    const fetchUsers = async (overrideSearch = null) => {
        setIsLoading(true);
        try {
            const token = sessionStorage.getItem('token');
            const response = await fetch(`${API_BASE_URL}/users`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.status === 401) {
                sessionStorage.removeItem('token');
                navigate('/');
                return;
            }
            const result = await response.json();
            if (result.status === 'success') {
                let data = result.data;
                const activeSearch = typeof overrideSearch === 'string' ? overrideSearch : searchTerm;
                if (activeSearch) {
                    const s = activeSearch.toLowerCase();
                    data = data.filter(u =>
                        (u.fullname || '').toLowerCase().includes(s) ||
                        (u.phone || '').toLowerCase().includes(s) ||
                        (u.room_number || '').toLowerCase().includes(s)
                    );
                }
                // เรียงตามเลขห้องอัตโนมัติ (1, 2, 10, 11)
                data.sort((a, b) => {
                    const roomA = a.room_number || '';
                    const roomB = b.room_number || '';
                    return roomA.localeCompare(roomB, undefined, { numeric: true, sensitivity: 'base' });
                });
                
                setUsers(data);
            }
        } catch (error) {
            console.error('Error fetching users:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            const token = sessionStorage.getItem('token');
            const response = await fetch(`${API_BASE_URL}/stats/daily?days=${chartRange}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await response.json();
            if (result.status === 'success') {
                setStatsData(result.data);
            }
        } catch (error) {
            console.error('Error fetching stats:', error);
        }
    };

    const fetchSettings = async () => {
        try {
            const token = sessionStorage.getItem('token');
            const response = await fetch(`${API_BASE_URL}/settings`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await response.json();
            setGlobalSettings(result);
        } catch (error) {
            console.error('Error fetching settings:', error);
        }
    };

    const handleUpdateSettings = async (e) => {
        e.preventDefault();
        setIsSavingSettings(true);
        try {
            const token = sessionStorage.getItem('token');
            const response = await fetch(`${API_BASE_URL}/settings`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(globalSettings)
            });
            if (response.ok) {
                setSettingsSaveSuccess(true);
                setTimeout(() => {
                    setSettingsSaveSuccess(false);
                    setIsSavingSettings(false);
                    setIsSettingsModalOpen(false);
                    fetchUsers();
                }, 1000);
            } else {
                setIsSavingSettings(false);
            }
        } catch (error) {
            console.error('Error updating settings:', error);
            setIsSavingSettings(false);
        }
    };

    useEffect(() => {
        if (!sessionStorage.getItem('token')) {
            navigate('/');
            return;
        }
        fetchUsers();
        fetchSettings();
    }, [navigate]);

    useEffect(() => {
        if (sessionStorage.getItem('token')) {
            fetchStats();
        }
    }, [chartRange]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const openAddModal = () => {
        setModalMode('add');
        setFormData({ room_number: '', fullname: '', phone: '', custom_max_days: '' });
        setIsModalOpen(true);
    };

    const openEditModal = (user) => {
        setModalMode('edit');
        setCurrentUser(user);
        setFormData({
            room_number: user.room_number,
            fullname: user.fullname,
            phone: user.phone,
            custom_max_days: user.custom_max_days || ''
        });
        setIsModalOpen(true);
    };

    const closeFormModal = () => {
        setIsModalOpen(false);
        setCurrentUser(null);
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        if (!formData.room_number || !formData.fullname || !formData.phone) {
            alert('กรุณากรอกข้อมูลให้ครบถ้วน');
            return;
        }

        const payload = {
            room_number: formData.room_number,
            fullname: formData.fullname,
            phone: formData.phone
        };
        
        if (formData.custom_max_days !== '') {
            payload.custom_max_days = parseInt(formData.custom_max_days);
        }

        try {
            const url = modalMode === 'add'
                ? `${API_BASE_URL}/users`
                : `${API_BASE_URL}/users/${currentUser.user_id}`;
            const token = sessionStorage.getItem('token');

            const response = await fetch(url, {
                method: modalMode === 'add' ? 'POST' : 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                fetchUsers();
                closeFormModal();
            } else {
                const errorData = await response.json();
                let errMsg = 'เกิดข้อผิดพลาดในการบันทึกข้อมูล';
                if (typeof errorData.detail === 'string') {
                    errMsg = errorData.detail;
                } else if (Array.isArray(errorData.detail)) {
                    errMsg = errorData.detail.map(e => e.msg).join(', ');
                } else if (errorData.detail) {
                    errMsg = JSON.stringify(errorData.detail);
                } else if (errorData.message) {
                    errMsg = errorData.message;
                }
                alert(errMsg);
            }
        } catch (error) {
            console.error('Error saving user:', error);
        }
    };

    const handlePasswordSubmit = async (e) => {
        e.preventDefault();
        if (passwordData.new_password !== passwordData.confirm_password) {
            alert('รหัสผ่านที่ยืนยันใหม่ ไม่ตรงกันครับ');
            return;
        }
        try {
            const token = sessionStorage.getItem('token');
            const response = await fetch(`${API_BASE_URL}/admin/password`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    current_password: passwordData.current_password,
                    new_password: passwordData.new_password
                })
            });
            if (response.ok) {
                alert('✅ เปลี่ยนรหัสผ่านสำเร็จ! กรุณาล็อกอินใหม่');
                sessionStorage.removeItem('token');
                navigate('/');
            } else {
                const errorData = await response.json();
                alert(errorData.detail || 'เกิดข้อผิดพลาด');
            }
        } catch (error) {
            console.error('Error changing password:', error);
        }
    };

    const openDeleteModal = (user) => {
        setCurrentUser(user);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        try {
            const token = sessionStorage.getItem('token');
            const response = await fetch(`${API_BASE_URL}/users/${currentUser.user_id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                fetchUsers();
            }
        } catch (error) {
            console.error('Error deleting user:', error);
        }
        setIsDeleteModalOpen(false);
    };

    return (
        <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans">
            <div className="max-w-7xl mx-auto">
                {/* Header Section */}
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-4">
                    <div className="w-full lg:w-auto">
                        <h1 className="text-xl md:text-2xl font-bold text-gray-800">จัดการผู้ใช้งาน</h1>
                        <p className="text-xs md:text-sm text-gray-500 mt-1">เพิ่ม แก้ไข หรือลบข้อมูลในระบบ</p>
                    </div>

                    <div className="grid grid-cols-2 md:flex md:flex-row gap-2 md:gap-3 w-full lg:w-auto">
                        <button
                            onClick={() => setIsSearchModalOpen(true)}
                            className="flex items-center gap-2 bg-indigo-600 text-white px-3 md:px-4 py-2.5 rounded-xl hover:bg-indigo-700 transition shadow-sm font-medium text-sm md:text-base justify-center"
                        >
                            <Search size={18} />
                            ค้นหา
                        </button>

                        <button
                            onClick={() => navigate('/locker')}
                            className="flex items-center gap-2 bg-white text-gray-700 border-2 border-gray-200 px-3 md:px-4 py-2.5 rounded-xl hover:bg-gray-50 transition shadow-sm font-bold text-sm md:text-base justify-center"
                        >
                            <Box size={18} />
                            ล็อกเกอร์
                        </button>

                        <button
                            onClick={() => { fetchHistory(false); setIsHistoryModalOpen(true); }}
                            className="flex items-center gap-2 bg-white text-gray-700 border-2 border-gray-200 px-3 md:px-4 py-2.5 rounded-xl hover:bg-gray-50 transition shadow-sm font-bold text-sm md:text-base justify-center"
                        >
                            <Clock size={18} />
                            ประวัติ
                        </button>

                        <button
                            onClick={() => { setPasswordData({ current_password: '', new_password: '', confirm_password: '' }); setIsPasswordModalOpen(true); }}
                            className="flex items-center gap-2 bg-white text-gray-600 border-2 border-gray-200 px-3 md:px-4 py-2.5 rounded-xl hover:bg-gray-50 transition shadow-sm font-bold text-sm md:text-base justify-center"
                        >
                            <SettingsIcon size={18} />
                            ตั้งค่า
                        </button>

                        <button
                            onClick={openAddModal}
                            className="flex items-center gap-2 bg-indigo-600 text-white px-3 md:px-4 py-2.5 rounded-xl hover:bg-indigo-700 transition shadow-sm font-medium text-sm md:text-base justify-center col-span-2 md:col-span-1"
                        >
                            <Plus size={18} />
                            เพิ่มผู้ใช้งาน
                        </button>
                    </div>
                </div>

                {/* Statistics Chart Section */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                    <div className="lg:col-span-2 bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100 min-h-[300px]">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
                            <h3 className="text-base md:text-lg font-bold text-gray-800 flex items-center gap-2">
                                <BarChart3 size={20} className="text-indigo-600" />
                                สถิติการฝากตู้ล็อกเกอร์
                            </h3>
                            <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto pb-1 sm:pb-0">
                                <div className="flex bg-slate-100 p-1 rounded-lg shrink-0">
                                    <button onClick={() => setChartType('bar')} className={`px-2 md:px-3 py-1.5 text-[10px] md:text-xs font-bold rounded-md transition-all ${chartType === 'bar' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>📊 แท่ง</button>
                                    <button onClick={() => setChartType('line')} className={`px-2 md:px-3 py-1.5 text-[10px] md:text-xs font-bold rounded-md transition-all ${chartType === 'line' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>📈 เส้น</button>
                                </div>
                                <div className="flex bg-slate-100 p-1 rounded-lg shrink-0">
                                    <button onClick={() => setChartRange(7)} className={`px-2 md:px-3 py-1.5 text-[10px] md:text-xs font-bold rounded-md transition-all ${chartRange === 7 ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>7 วัน</button>
                                    <button onClick={() => setChartRange(30)} className={`px-2 md:px-3 py-1.5 text-[10px] md:text-xs font-bold rounded-md transition-all ${chartRange === 30 ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>1 เดือน</button>
                                    <button onClick={() => setChartRange(180)} className={`px-2 md:px-3 py-1.5 text-[10px] md:text-xs font-bold rounded-md transition-all ${chartRange === 180 ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>6 เดือน</button>
                                    <button onClick={() => setChartRange(0)} className={`px-2 md:px-3 py-1.5 text-[10px] md:text-xs font-bold rounded-md transition-all ${chartRange === 0 ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>ทั้งหมด</button>
                                </div>
                            </div>
                        </div>
                        <div className="w-full">
                            <ResponsiveContainer width="100%" height={chartHeight}>
                                {chartType === 'bar' ? (
                                    <BarChart data={statsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis
                                            dataKey="date"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: '#94a3b8', fontSize: 10 }}
                                            tickFormatter={(date) => {
                                                const d = new Date(date);
                                                return window.innerWidth < 640
                                                    ? d.toLocaleDateString('th-TH', { day: 'numeric', month: 'numeric' })
                                                    : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
                                            }}
                                            minTickGap={window.innerWidth < 640 ? 10 : 20}
                                        />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} allowDecimals={false} />
                                        <Tooltip
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                                            cursor={{ fill: '#f8fafc' }}
                                        />
                                        <Bar dataKey="deposits" name="จำนวนตู้" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={window.innerWidth < 640 ? 15 : 30} />
                                    </BarChart>
                                ) : (
                                    <LineChart data={statsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis
                                            dataKey="date"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: '#94a3b8', fontSize: 10 }}
                                            tickFormatter={(date) => {
                                                const d = new Date(date);
                                                return window.innerWidth < 640
                                                    ? d.toLocaleDateString('th-TH', { day: 'numeric', month: 'numeric' })
                                                    : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
                                            }}
                                            minTickGap={window.innerWidth < 640 ? 10 : 20}
                                        />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} allowDecimals={false} />
                                        <Tooltip
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                                        />
                                        <Line type="monotone" dataKey="deposits" name="จำนวนตู้" stroke="#6366f1" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: '#4f46e5' }} />
                                    </LineChart>
                                )}
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-indigo-600 to-violet-700 p-6 rounded-2xl shadow-lg text-white flex flex-col justify-between">
                        <div>
                            <h3 className="text-lg font-bold opacity-90 mb-1">กฎการฝากของส่วนกลาง</h3>
                            <p className="text-indigo-100 text-sm mb-6">ตั้งระยะเวลาปลอดภัยก่อนแจ้งเตือน</p>

                            <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/10">
                                <div className="text-3xl font-bold mb-1">{globalSettings.max_deposit_days} วัน</div>
                                <div className="text-indigo-200 text-xs uppercase tracking-wider font-semibold">ระยะเวลาฝากสูงสุด</div>
                            </div>
                        </div>

                        <div className="mt-6">
                            <p className="text-indigo-100 text-sm leading-relaxed mb-4">
                                ระบบจะแสดง <span className="bg-red-500 px-1.5 rounded text-xs font-bold">จุดสีแดง</span> บนหน้าจอ หากตู้ถูกใช้งานเกินกำหนด
                            </p>
                            <button
                                onClick={() => setIsSettingsModalOpen(true)}
                                className="w-full py-3 bg-white text-indigo-600 rounded-xl font-bold hover:bg-indigo-50 transition-colors shadow-sm"
                            >
                                ปรับเปลี่ยนเวลาส่วนกลาง
                            </button>
                        </div>
                    </div>
                </div>

                {/* Active Search Term (If Any) */}
                {searchTerm && (
                    <div className="mb-4 flex items-center gap-2 bg-indigo-50 text-indigo-700 px-4 py-2.5 rounded-xl font-medium w-fit">
                        <Search size={16} />
                        กำลังค้นหา: {searchTerm}
                        <button onClick={() => { setSearchTerm(''); fetchUsers(''); }} className="ml-2 bg-indigo-200 hover:bg-indigo-300 rounded-full p-0.5 text-indigo-700 transition">
                            <X size={14} />
                        </button>
                    </div>
                )}

                {/* User Table */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-10">
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b border-gray-100 text-gray-500 text-[10px] md:text-sm uppercase tracking-wider font-bold">
                                    <th className="p-3 md:p-4 whitespace-nowrap">ห้อง</th>
                                    <th className="p-3 md:p-4">ชื่อ - นามสกุล</th>
                                    <th className="p-3 md:p-4 hidden md:table-cell">เบอร์โทรศัพท์</th>
                                    <th className="p-3 md:p-4 text-center">สถานะ</th>
                                    <th className="p-3 md:p-4 text-center">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {isLoading ? (
                                    <tr><td colSpan="5" className="p-8 text-center text-gray-400">กำลังโหลด...</td></tr>
                                ) : users.length > 0 ? (
                                    users.map((user) => (
                                        <tr key={user.user_id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="p-3 md:p-4 text-gray-700 font-bold text-sm md:text-xl">
                                                {user.room_number || '-'}
                                            </td>
                                            <td className="p-3 md:p-4 font-bold text-gray-800 text-xs md:text-base">{user.fullname}</td>
                                            <td className="p-3 md:p-4 text-gray-500 text-[10px] md:text-sm hidden md:table-cell">{user.phone || '-'}</td>
                                            <td className="p-3 md:p-4 text-center">
                                                <div className="flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2.5">
                                                    <div
                                                        className={`w-2.5 h-2.5 md:w-3.5 md:h-3.5 rounded-full shrink-0 border-2 border-white shadow-sm ${user.locker_status === 1
                                                            ? (user.is_overdue ? 'bg-red-500' : 'bg-green-500')
                                                            : 'bg-gray-300'
                                                            }`}
                                                    ></div>
                                                    {user.locker_status === 1 ? (
                                                        <span className={`px-2 py-0.5 md:px-3 md:py-1.5 rounded-full text-[9px] md:text-xs font-bold ${user.is_overdue ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                                                            {user.is_overdue ? (window.innerWidth < 640 ? 'Over' : 'เลยกำหนด') : (window.innerWidth < 640 ? 'Used' : 'ฝากของ')}
                                                        </span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 md:px-3 md:py-1.5 rounded-full bg-gray-100 text-gray-500 text-[9px] md:text-xs font-bold">ว่าง</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-3 md:p-4">
                                                <div className="flex items-center justify-center gap-1 md:gap-2">
                                                    <button onClick={() => openEditModal(user)} className="p-1.5 md:p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"><Edit2 size={window.innerWidth < 640 ? 14 : 18} /></button>
                                                    <button onClick={() => openDeleteModal(user)} className="p-1.5 md:p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={window.innerWidth < 640 ? 14 : 18} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr><td colSpan="5" className="p-8 text-center text-gray-400">ไม่พบข้อมูล</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Modals */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
                    <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md overflow-hidden max-h-[90dvh] sm:max-h-[85dvh] flex flex-col">
                        <div className="flex justify-between items-center p-4 sm:p-6 border-b border-gray-100 shrink-0">
                            <h2 className="text-base sm:text-xl font-bold text-gray-800">{modalMode === 'add' ? 'เพิ่มผู้ใช้งาน' : 'แก้ไขผู้ใช้งาน'}</h2>
                            <button onClick={closeFormModal} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleFormSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1" autoComplete="off">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">หมายเลขห้อง</label>
                                <input type="text" name="room_number" value={formData.room_number} onChange={handleInputChange} className="w-full bg-slate-50 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-800" required />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">ระยะเวลาฝากสูงสุดของห้องนี้ (วัน)</label>
                                <input type="number" name="custom_max_days" placeholder="เว้นว่างเพื่อใช้ค่าส่วนกลาง" value={formData.custom_max_days} onChange={handleInputChange} className="w-full bg-slate-50 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-800" />
                                <p className="text-[10px] text-gray-400 mt-1">* หากระบุ ค่านี้จะถูกนำมาใช้แทนค่าส่วนกลาง</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อ - นามสกุล</label>
                                <input type="text" name="fullname" value={formData.fullname} onChange={handleInputChange} className="w-full bg-slate-50 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-800" required />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">เบอร์โทรศัพท์</label>
                                <input type="text" name="phone" value={formData.phone} onChange={handleInputChange} className="w-full bg-slate-50 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-800" required />
                            </div>
                            <div className="pt-4 flex justify-end gap-3">
                                <button type="button" onClick={closeFormModal} className="px-5 py-2.5 text-gray-600 bg-gray-100 rounded-xl">ยกเลิก</button>
                                <button type="submit" className="px-5 py-2.5 text-white bg-indigo-600 rounded-xl shadow-sm">บันทึก</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isDeleteModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden p-6 text-center">
                        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4"><Trash2 className="h-6 w-6 text-red-600" /></div>
                        <h3 className="text-lg font-bold text-gray-900 mb-1">ลบผู้ใช้งาน</h3>
                        <p className="text-sm text-gray-500 mb-6">ต้องการลบ "{currentUser?.fullname}" ใช่หรือไม่?</p>
                        <div className="flex gap-3">
                            <button onClick={() => setIsDeleteModalOpen(false)} className="px-5 py-2.5 text-gray-600 bg-gray-100 rounded-xl w-full font-bold">ยกเลิก</button>
                            <button onClick={confirmDelete} className="px-5 py-2.5 text-white bg-red-600 rounded-xl shadow-sm w-full font-bold">ลบ</button>
                        </div>
                    </div>
                </div>
            )}

            {isPasswordModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-gray-900">เปลี่ยนรหัสผ่านแอดมิน</h3>
                            <button onClick={() => setIsPasswordModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                        </div>
                        <form onSubmit={handlePasswordSubmit} className="space-y-4">
                            <input type="password" placeholder="รหัสผ่านปัจจุบัน" value={passwordData.current_password} onChange={(e) => setPasswordData({ ...passwordData, current_password: e.target.value })} className="w-full bg-slate-50 border border-gray-200 rounded-xl px-4 py-2.5" required />
                            <input type="password" placeholder="รหัสผ่านใหม่" value={passwordData.new_password} onChange={(e) => setPasswordData({ ...passwordData, new_password: e.target.value })} className="w-full bg-slate-50 border border-gray-200 rounded-xl px-4 py-2.5" required />
                            <input type="password" placeholder="ยืนยันรหัสผ่านใหม่" value={passwordData.confirm_password} onChange={(e) => setPasswordData({ ...passwordData, confirm_password: e.target.value })} className="w-full bg-slate-50 border border-gray-200 rounded-xl px-4 py-2.5" required />
                            <button type="submit" className="w-full bg-orange-600 text-white font-bold py-3 rounded-xl shadow-sm mt-4">ยืนยันการตั้งรหัสผ่านใหม่</button>
                        </form>
                    </div>
                </div>
            )}

            {isHistoryModalOpen && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
                    <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-[100vw] sm:max-w-4xl overflow-hidden flex flex-col h-[90dvh] sm:max-h-[80dvh]">
                        <div className="flex justify-between items-center p-4 sm:p-6 border-b border-gray-100 shrink-0">
                            <h2 className="text-base sm:text-xl font-bold text-gray-800">ประวัติการใช้งานล็อกเกอร์</h2>
                            <button onClick={() => setIsHistoryModalOpen(false)} className="text-gray-400 hover:text-gray-600 shrink-0"><X size={22} /></button>
                        </div>
                        <div className="p-3 sm:p-6 overflow-y-auto flex-1 bg-gray-50">
                            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto max-w-[calc(100vw-24px)] sm:max-w-full">
                                <table className="w-full text-left border-collapse whitespace-nowrap min-w-[600px]">
                                    <thead>
                                        <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 text-xs sm:text-sm">
                                            <th className="p-3 sm:p-4">เวลา</th><th className="p-3 sm:p-4">ตู้</th><th className="p-3 sm:p-4">เบอร์โทร</th><th className="p-3 sm:p-4">ชื่อ</th><th className="p-3 sm:p-4">การกระทำ</th><th className="p-3 sm:p-4">รายละเอียด</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {historyData.map((row) => (
                                            <tr key={row.trans_id}>
                                                <td className="p-3 sm:p-4 text-[10px] sm:text-xs text-gray-500">{new Date(row.timestamp).toLocaleString('th-TH')}</td>
                                                <td className="p-3 sm:p-4 font-bold text-center text-sm">{row.locker_id}</td>
                                                <td className="p-3 sm:p-4 text-xs sm:text-sm">{row.phone}</td>
                                                <td className="p-3 sm:p-4 text-xs sm:text-sm">{row.fullname}</td>
                                                <td className="p-3 sm:p-4">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${row.action === 'UNLOCK' ? 'bg-green-100 text-green-700' : row.action === 'ASSIGN' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100'}`}>{row.action}</span>
                                                </td>
                                                <td className="p-3 sm:p-4 text-[10px] sm:text-xs text-gray-400">{row.detail}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}


            {isSettingsModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
                        <div className="flex justify-between items-center p-6 border-b border-gray-100">
                            <h3 className="text-lg font-bold text-gray-900">ตั้งค่าเวลาฝากส่วนกลาง</h3>
                            <button onClick={() => setIsSettingsModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleUpdateSettings} className="p-6">
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 mb-2 text-center">จำนวนวันที่อนุญาตให้ฝากสูงสุด (ส่วนกลาง)</label>
                                <input type="number" min="1" value={globalSettings.max_deposit_days} onChange={(e) => setGlobalSettings({ max_deposit_days: parseInt(e.target.value) || 1 })} className="w-full bg-slate-50 border border-gray-200 rounded-2xl px-4 py-4 text-center text-4xl font-bold text-indigo-600 focus:ring-2 focus:ring-indigo-500 outline-none" />
                            </div>
                            <button
                                type="submit"
                                disabled={isSavingSettings}
                                className={`w-full py-3 text-white rounded-xl font-bold shadow-lg transition-all duration-300 flex items-center justify-center gap-2 ${settingsSaveSuccess ? 'bg-green-500 scale-105' : isSavingSettings ? 'bg-indigo-400' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                            >
                                {settingsSaveSuccess ? (
                                    <>✅ บันทึกสำเร็จ</>
                                ) : isSavingSettings ? (
                                    <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> กำลังบันทึก...</>
                                ) : (
                                    <>บันทึกเวลาส่วนกลาง</>
                                )}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {isSearchModalOpen && (
                <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[20vh]">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden p-6 animate-in slide-in-from-top-4 duration-200">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-900">ค้นหาในระบบ</h3>
                            <button onClick={() => setIsSearchModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                        </div>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Search className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                    type="text"
                                    placeholder="หมายเลขห้อง, ชื่อ, เบอร์โทร..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { fetchUsers(); setIsSearchModalOpen(false); } }}
                                    className="pl-10 w-full bg-slate-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                                    autoFocus
                                />
                            </div>
                            <button
                                onClick={() => { fetchUsers(); setIsSearchModalOpen(false); }}
                                className="bg-indigo-600 text-white px-6 py-3 rounded-xl hover:bg-indigo-700 font-bold shadow-sm"
                            >
                                ค้นหา
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;
