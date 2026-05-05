import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, updateDoc, getDoc, addDoc, deleteDoc, arrayUnion } from 'firebase/firestore';
import { 
    Calendar, Users, ChevronLeft, ChevronRight, Save, ShieldAlert, Plus, Trash2, 
    BookOpen, LogOut, CheckCircle2, Lock, Eye, Clock, Store, Bell, ArrowRightLeft, 
    FileBarChart, UserX, Upload, ListFilter, History, StickyNote, DollarSign, Gift, 
    Megaphone, Send, Smartphone, X, Inbox, Repeat, MapPin, Fingerprint, Map, Package, 
    Settings, ChevronDown, Minus, Download, Edit, FileSignature, FileText, Printer, FileSearch, Fuel, CreditCard, AlertTriangle
} from 'lucide-react';

// ==========================================
// 📌 系統全域配置
// ==========================================
const CURRENT_VERSION = "V10.0 (Ultimate Stable Edition)"; 
const LINE_API_URL = "/api/webhook"; 
const ADMIN_EMAIL = "randy22444289@gmail.com";

const firebaseConfig = {
    apiKey: "AIzaSyAr_07n-yBWElUDJk0C1nobLm67XRPgX4w",
    authDomain: "our-company-d1ef6.firebaseapp.com",
    projectId: "our-company-d1ef6",
    storageBucket: "our-company-d1ef6.firebasestorage.app",
    messagingSenderId: "354573964228",
    appId: "1:354573964228:web:2133ba855b7eedda9c0a91",
    measurementId: "G-FDNMNT7QQ6"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'team-shift-pc-v1'; 

// ==========================================
// 🛠️ 工具函數 (Utilities)
// ==========================================
const exportToCSV = (filename, rows) => {
    const csvContent = "\uFEFF" + rows.map(row => 
        row.map(item => `"${String(item || '').replace(/"/g, '""')}"`).join(",")
    ).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}.csv`;
    link.click();
};

const sendLineNotification = async (targetLineIds, messageText) => {
    if (!targetLineIds || targetLineIds.length === 0) return;
    try {
        await fetch(LINE_API_URL, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ to: targetLineIds, messages: [{ type: 'text', text: messageText }] }) 
        });
    } catch (e) { console.error("LINE 通知失敗", e); }
};

const getDistance = (lat1, lon1, lat2, lon2) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    const R = 6371e3; 
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat/2) ** 2 + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon/2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
};

const getAnnualLeaveDays = (startDateStr) => {
    if (!startDateStr) return 0;
    const start = new Date(startDateStr);
    const now = new Date();
    const diffTime = Math.abs(now - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const diffYears = diffDays / 365.25;
    if (diffYears >= 0.5 && diffYears < 1) return 3;
    if (diffYears >= 1 && diffYears < 2) return 7;
    if (diffYears >= 2 && diffYears < 3) return 10;
    if (diffYears >= 3 && diffYears < 5) return 14;
    if (diffYears >= 5 && diffYears < 10) return 15;
    if (diffYears >= 10) return Math.min(15 + Math.floor(diffYears - 9), 30);
    return 0;
};
// ==========================================
// 📋 常數與日期運算
// ==========================================
const DEFAULT_LEAVE_TYPES = [
    { id: 'rostered', label: '自畫假', deduct: false },
    { id: 'official', label: '排休', deduct: false }, 
    { id: 'annual', label: '特休', deduct: false }, 
    { id: 'menstrual', label: '生理假', deduct: false }, 
    { id: 'sick', label: '病假', deduct: true }, 
    { id: 'personal', label: '事假', deduct: true },
];

const DEFAULT_SHIFT_TYPES = [
    { id: '09A', label: '09A', start: '09:00', end: '17:30' }, 
    { id: '09O', label: '09O', start: '09:00', end: '21:00' }
];

const DEFAULT_INVENTORY_ITEMS = [
    { id: 'i1', category: '茶葉類', name: '高山青茶', spec: '斤', price: 370 },
    { id: 'i11', category: '奶與粉類', name: '鮮奶', spec: '罐', price: 68 }
];

const USER_COLORS = [
    'bg-red-100 text-red-900 border-red-400', 'bg-blue-100 text-blue-900 border-blue-400', 
    'bg-green-100 text-green-900 border-green-400', 'bg-yellow-100 text-yellow-900 border-yellow-500', 
    'bg-purple-100 text-purple-900 border-purple-400', 'bg-teal-100 text-teal-900 border-teal-400'
];

const REPEAT_LABELS = { none: '不重複', daily: '每天', weekly: '每週', monthly: '每月', yearly: '每年' };
const getMonthData = (year, month) => ({ firstDay: new Date(year, month, 1).getDay(), days: new Date(year, month + 1, 0).getDate() });
const getLocalDate = (dateStr) => { const [y, m, d] = dateStr.split('-'); return new Date(y, m - 1, d); };

const checkEventOnDate = (event, checkDateStr) => {
    if (!event.startDate) return false;
    if (checkDateStr < event.startDate) return false;
    if (event.repeatType === 'none') return checkDateStr === event.startDate;
    const checkDate = getLocalDate(checkDateStr);
    const startDate = getLocalDate(event.startDate);
    if (event.repeatType === 'daily') return true;
    if (event.repeatType === 'weekly') return checkDate.getDay() === startDate.getDay();
    if (event.repeatType === 'monthly') return checkDate.getDate() === startDate.getDate();
    if (event.repeatType === 'yearly') return checkDate.getMonth() === startDate.getMonth() && checkDate.getDate() === startDate.getDate();
    return false;
};

// ==========================================
// 🪟 共用組件 (Shared Components)
// ==========================================
const NavBtn = ({ active, onClick, icon: Icon, label }) => (
    <button onClick={onClick} className={`flex items-center gap-1 px-3 py-2 rounded-lg font-bold transition-colors ${active ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:bg-gray-100'}`}>
        <Icon className="w-4 h-4" /><span className="hidden xs:inline">{label}</span>
    </button>
);

const DropdownItem = ({ onClick, icon: Icon, label, active }) => (
    <button onClick={onClick} className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 hover:bg-indigo-50 font-bold transition-colors ${active ? 'text-indigo-600 bg-indigo-50/50' : 'text-gray-600'}`}>
        <Icon className="w-4 h-4 opacity-70" /> {label}
    </button>
);
// ==========================================
// 🚀 核心彈窗組件 (Modals)
// ==========================================
const OTModal = ({ isOpen, onClose, onConfirm, modalData, dateStr }) => {
    const [hours, setHours] = useState('');
    const [reason, setReason] = useState('');
    useEffect(() => { if(isOpen && modalData) { setHours(modalData.initialHours || ''); setReason(modalData.initialReason || ''); } }, [isOpen, modalData]);
    if (!isOpen || !modalData) return null;
    const { user, balance } = modalData;
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
                <div className="bg-indigo-600 p-4 text-white flex justify-between items-center"><h3 className="font-bold">加班 / 補休申請</h3><button onClick={onClose}><X size={20}/></button></div>
                <div className="p-6 space-y-4">
                    <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100 flex justify-between items-center"><span className="text-sm font-bold">剩餘補休：</span><span className="text-lg font-bold">{balance} hr</span></div>
                    <input type="number" autoFocus value={hours} onChange={e=>setHours(e.target.value)} placeholder="正數加班，負數補休" className="w-full border-2 rounded-lg px-3 py-2 text-lg font-bold"/>
                    <input type="text" value={reason} onChange={e=>setReason(e.target.value)} placeholder="事由" className="w-full border rounded-lg px-3 py-2 text-sm"/>
                    <div className="flex gap-3"><button onClick={onClose} className="flex-1 bg-gray-100 py-2.5 rounded-lg">取消</button><button onClick={() => onConfirm(parseFloat(hours), reason)} className="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg shadow">送出</button></div>
                </div>
            </div>
        </div>
    );
};

const GasReceiptModal = ({ isOpen, onClose, user, monthStr, db, appId, currentRecords }) => {
    const [amount, setAmount] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    if (!isOpen || !user) return null;
    const userRecords = currentRecords[user.uid] || [];
    const totalAmount = userRecords.reduce((sum, r) => sum + r.amount, 0);
    const handleSave = async () => {
        const num = parseFloat(amount);
        if (isNaN(num) || num <= 0) return alert("請輸入金額");
        const updatedRecords = [...userRecords, { id: Date.now().toString(), date, amount: num, timestamp: Date.now() }];
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'gasReceipts', monthStr), { [user.uid]: updatedRecords }, { merge: true });
        setAmount(''); alert("✅ 已登錄");
    };
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
                <div className="bg-teal-600 p-4 text-white flex justify-between items-center"><h3 className="font-bold flex items-center gap-2"><Fuel size={18}/> 油資登錄</h3><button onClick={onClose}><X size={20}/></button></div>
                <div className="p-6 space-y-4">
                    <div className="flex justify-between items-end border-b pb-3"><div><div className="text-sm text-gray-500">員工</div><div className="font-bold text-lg">{user.name}</div></div><div className="font-bold text-teal-600">${totalAmount} / 500</div></div>
                    <div className="flex gap-2 items-end">
                        <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="border rounded px-2 py-1 text-xs w-1/3"/>
                        <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="$" className="w-full border rounded px-2 py-1 text-sm font-bold"/>
                        <button onClick={handleSave} className="bg-teal-600 text-white px-3 py-1 rounded font-bold">新增</button>
                    </div>
                </div>
            </div>
        </div>
    );
};
// ==========================================
// ✍️ 簽署系統 (Sign & View)
// ==========================================
const SignModal = ({ formType, onClose, currentUserInfo, db, appId, setView }) => {
    const [agree, setAgree] = useState(false);
    const canvasRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasSigned, setHasSigned] = useState(false);

    const startDrawing = (e) => {
        const ctx = canvasRef.current.getContext('2d');
        const rect = canvasRef.current.getBoundingClientRect();
        const x = (e.clientX || e.touches[0].clientX) - rect.left;
        const y = (e.clientY || e.touches[0].clientY) - rect.top;
        ctx.beginPath(); ctx.moveTo(x, y); setIsDrawing(true); setHasSigned(true);
    };
    const draw = (e) => {
        if (!isDrawing) return; e.preventDefault();
        const ctx = canvasRef.current.getContext('2d');
        const rect = canvasRef.current.getBoundingClientRect();
        const x = (e.clientX || e.touches[0].clientX) - rect.left;
        const y = (e.clientY || e.touches[0].clientY) - rect.top;
        ctx.lineTo(x, y); ctx.stroke();
    };
    const stopDrawing = () => setIsDrawing(false);

    const handleSubmit = async () => {
        if (!agree || !hasSigned) return alert("請勾選同意並簽名！");
        const signatureImage = canvasRef.current.toDataURL('image/png');
        const docData = { uid: currentUserInfo.uid, userName: currentUserInfo.name, formType, agreedAt: Date.now(), signatureImage };
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'signatures'), docData);
        alert("✅ 簽署成功"); onClose(); if (formType === 'contract') setView('calendar');
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[80] p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="bg-gray-800 p-4 text-white font-bold flex justify-between"><h3>文件簽署</h3><button onClick={onClose}><X/></button></div>
                <div className="p-6 overflow-y-auto flex-1 space-y-4">
                    <div className="border p-5 bg-gray-50 h-48 overflow-y-auto text-xs leading-loose shadow-inner">【系統合約條款載入中...】</div>
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 cursor-pointer" onClick={()=>setAgree(!agree)}>
                        <label className="flex items-center gap-3"><input type="checkbox" checked={agree} readOnly/><span className="font-bold text-blue-900">我已閱讀並同意以上條款。</span></label>
                    </div>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg overflow-hidden bg-white">
                        <div className="bg-gray-100 p-2 text-[10px] font-bold text-gray-500">✍️ 請在下方親筆簽名</div>
                        <canvas ref={canvasRef} width={600} height={150} onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} className="w-full touch-none cursor-crosshair"></canvas>
                    </div>
                </div>
                <div className="p-4 border-t bg-gray-50 flex gap-3"><button onClick={onClose} className="flex-1 bg-white border py-3 rounded-lg">取消</button><button onClick={handleSubmit} className={`flex-1 py-3 rounded-lg font-bold text-white shadow ${agree && hasSigned ? 'bg-indigo-600' : 'bg-gray-300'}`}>確認送出</button></div>
            </div>
        </div>
    );
};
// ==========================================
// 📍 打卡視圖
// ==========================================
const ClockView = ({ currentUser, currentUserInfo, storeConfig, db, appId }) => {
    const [currentTime, setCurrentTime] = useState(new Date());
    const [distance, setDistance] = useState(null);
    useEffect(() => { const timer = setInterval(() => setCurrentTime(new Date()), 1000); return () => clearInterval(timer); }, []);
    useEffect(() => {
        navigator.geolocation.getCurrentPosition((pos) => {
            if (storeConfig?.lat) setDistance(getDistance(pos.coords.latitude, pos.coords.longitude, storeConfig.lat, storeConfig.lng));
        }, null, { enableHighAccuracy: true });
    }, [storeConfig]);

    const handlePunch = async (type) => {
        if (distance > (storeConfig?.radius || 50)) return alert("超出範圍！");
        const dateStr = `${currentTime.getFullYear()}-${String(currentTime.getMonth()+1).padStart(2,'0')}`;
        const newRecord = { id: `${Date.now()}_${currentUser.uid}`, uid: currentUser.uid, name: currentUserInfo.name, type, time: `${String(currentTime.getHours()).padStart(2,'0')}:${String(currentTime.getMinutes()).padStart(2,'0')}`, date: currentTime.toISOString().split('T')[0], timestamp: Date.now() };
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'clockRecords', dateStr), { records: arrayUnion(newRecord) }, { merge: true });
        alert("打卡成功！");
    };

    return (
        <div className="max-w-md mx-auto bg-white rounded-2xl shadow-xl border mt-4 overflow-hidden">
            <div className="bg-indigo-600 p-8 text-center text-white"><h2 className="font-bold opacity-80 mb-2">現在時間</h2><div className="text-5xl font-mono font-bold tracking-widest">{String(currentTime.getHours()).padStart(2,'0')}:{String(currentTime.getMinutes()).padStart(2,'0')}<span className="text-2xl opacity-60">:{String(currentTime.getSeconds()).padStart(2,'0')}</span></div></div>
            <div className="p-6 space-y-6"><div className="bg-gray-50 rounded-xl p-4 border text-center font-bold">{distance !== null ? `距離店面: ${distance} 公尺` : "定位中..."}</div><div className="grid grid-cols-2 gap-4"><button onClick={()=>handlePunch('IN')} className="bg-indigo-600 text-white py-4 rounded-xl font-bold">上班</button><button onClick={()=>handlePunch('OUT')} className="bg-orange-500 text-white py-4 rounded-xl font-bold">下班</button></div></div>
        </div>
    );
};

// ==========================================
// 📝 表單視圖
// ==========================================
const FormsView = ({ currentUserInfo, db, appId, isPrivileged, signatures, setView, isLocked }) => {
    const [signModal, setSignModal] = useState(null);
    const hasSigned = signatures.some(s => s.uid === currentUserInfo.uid && s.formType === 'contract');
    return (
        <div className="max-w-4xl mx-auto space-y-4 pb-20">
            <div className="bg-white p-4 rounded-xl border font-bold text-indigo-700 flex items-center gap-2"><FileSignature/> 表單簽署中心</div>
            <div className="grid sm:grid-cols-2 gap-4">
                <div className={`bg-white p-6 rounded-xl border shadow-sm ${isLocked ? 'ring-4 ring-red-500' : ''}`}><h3 className="font-bold text-lg mb-2">員工勞動契約</h3><p className="text-xs text-gray-400 mb-6">入職或年度規範簽署。</p><button onClick={()=>setSignModal('contract')} className={`w-full py-2 rounded-lg font-bold ${hasSigned ? 'bg-gray-100' : 'bg-indigo-50 text-indigo-600'}`}>{hasSigned ? '已完成' : '立即簽署'}</button></div>
                <div className="bg-white p-6 rounded-xl border shadow-sm"><h3 className="font-bold text-lg mb-2">國定假日調移</h3><p className="text-xs text-gray-400 mb-6">特定假日班別調整。</p><button onClick={()=>setSignModal('holiday')} className="w-full py-2 rounded-lg font-bold bg-orange-50 text-orange-600">填寫</button></div>
            </div>
            {signModal && <SignModal formType={signModal} onClose={()=>setSignModal(null)} currentUserInfo={currentUserInfo} db={db} appId={appId} setView={setView} />}
        </div>
    );
};

// ==========================================
// 📦 盤點視圖
// ==========================================
const InventoryView = ({ db, appId, inventoryItems }) => {
    const [records, setRecords] = useState({});
    const handleSave = async () => {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventoryRecords', new Date().toISOString().split('T')[0]), { date: new Date().toISOString().split('T')[0], data: records, timestamp: Date.now() }, { merge: true });
        alert("已送出"); setRecords({});
    };
    return (
        <div className="max-w-2xl mx-auto space-y-4 pb-20">
            <div className="bg-white p-4 rounded-xl border font-bold text-indigo-700 flex items-center gap-2"><Package/> 庫存盤點</div>
            <div className="bg-white rounded-xl border shadow-sm p-4 space-y-4">
                {inventoryItems.map(item => (<div key={item.id} className="flex justify-between items-center border-b pb-2"><div><div className="font-bold">{item.name}</div><div className="text-xs text-gray-400">{item.spec}</div></div><input type="number" value={records[item.id]||''} onChange={e=>setRecords({...records, [item.id]:parseFloat(e.target.value)})} className="w-24 border rounded p-1 text-center font-bold"/></div>))}
                <button onClick={handleSave} className="w-full bg-indigo-600 text-white font-bold py-3 rounded-lg shadow-lg">送出盤點報表</button>
            </div>
        </div>
    );
};
// ==========================================
// 📅 月曆排班與出勤
// ==========================================
const AttendanceView = ({ currentDate, db, appId }) => {
    const [targetMonth, setTargetMonth] = useState(`${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}`);
    const [list, setList] = useState([]);
    useEffect(() => {
        onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'clockRecords', targetMonth), (snap) => {
            if (snap.exists()) {
                const records = snap.data().records || [];
                const grouped = {};
                records.forEach(r => {
                    const key = `${r.date}_${r.uid}`;
                    if (!grouped[key]) grouped[key] = { date: r.date, name: r.name, in: null, out: null };
                    if (r.type === 'IN') grouped[key].in = r.time;
                    if (r.type === 'OUT') grouped[key].out = r.time;
                });
                setList(Object.values(grouped).sort((a,b)=>b.date.localeCompare(a.date)));
            }
        });
    }, [targetMonth]);
    return (
        <div className="space-y-4 pb-20">
            <div className="bg-white p-4 rounded-xl border flex justify-between items-center shadow-sm"><h2 className="font-bold text-indigo-700">出勤結算</h2><input type="month" value={targetMonth} onChange={e=>setTargetMonth(e.target.value)} className="border rounded px-2"/></div>
            <div className="bg-white rounded-xl border overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 border-b"><tr><th className="p-3 text-left">日期</th><th className="p-3 text-left">姓名</th><th className="p-3">上班</th><th className="p-3">下班</th></tr></thead><tbody>{list.map((r,i)=>(<tr key={i} className="border-b"><td className="p-3 font-mono">{r.date.substring(5)}</td><td className="p-3 font-bold">{r.name}</td><td className="p-3 text-center">{r.in || '-'}</td><td className="p-3 text-center">{r.out || '-'}</td></tr>))}</tbody></table></div>
        </div>
    );
};

const CalendarView = ({ currentDate, setCurrentDate, dbData, currentUserInfo, db, appId, isSuperAdmin, isPrivileged }) => {
    const [selectedDate, setSelectedDate] = useState(null);
    const { firstDay, days } = getMonthData(currentDate.getFullYear(), currentDate.getMonth());
    const sortedUserIds = Object.keys(dbData.users).sort();
    const getUserColor = (uid) => USER_COLORS[sortedUserIds.indexOf(uid) % USER_COLORS.length];

    return (
        <div className="space-y-4">
            <div className="bg-white p-4 rounded-xl border shadow-sm flex justify-between items-center">
                <div className="flex items-center gap-4"><button onClick={()=>setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth()-1, 1))}><ChevronLeft/></button><div className="font-bold text-xl">{currentDate.getFullYear()}年 {currentDate.getMonth()+1}月</div><button onClick={()=>setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth()+1, 1))}><ChevronRight/></button></div>
            </div>
            <div className="bg-white rounded-xl border grid grid-cols-7 shadow-sm overflow-hidden">
                {['日','一','二','三','四','五','六'].map(d=><div key={d} className="py-2 text-center font-bold text-gray-400 bg-gray-50 border-b text-xs">{d}</div>)}
                {Array.from({length:firstDay}).map((_,i)=><div key={i} className="min-h-[120px] border-b border-r bg-gray-50/20"/>)}
                {Array.from({length:days}).map((_,i)=>{
                    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`;
                    const dayShifts = dbData.shifts[dateStr]?.assignments || [];
                    return (
                        <div key={i} onClick={()=>setSelectedDate(dateStr)} className="min-h-[120px] border-b border-r p-1 cursor-pointer hover:bg-indigo-50/50">
                            <span className="text-xs font-bold text-gray-400">{i+1}</span>
                            <div className="mt-1 space-y-1">
                                {dayShifts.filter(a=>a.type==='LEAVE').map((a,idx)=>(<div key={idx} className={`text-[9px] font-bold px-1 rounded truncate ${getUserColor(a.uid)}`}>{dbData.users[a.uid]?.name.slice(-2)} {dbData.leaves.find(l=>l.id===a.leaveType)?.label}</div>))}
                            </div>
                        </div>
                    );
                })}
            </div>
            {selectedDate && <ShiftModal dateStr={selectedDate} onClose={()=>setSelectedDate(null)} dbData={dbData} currentUserInfo={currentUserInfo} isSuperAdmin={isSuperAdmin} isPrivileged={isPrivileged} getUserColor={getUserColor} db={db} appId={appId} />}
        </div>
    );
};

const ShiftModal = ({ dateStr, onClose, dbData, currentUserInfo, isSuperAdmin, isPrivileged, getUserColor, db, appId }) => {
    const { shifts, users, leaves } = dbData;
    const dayData = shifts[dateStr] || { assignments: [] };
    const update = async (newData) => await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'shifts', dateStr), { ...dayData, ...newData }, { merge: true });
    
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-white w-full max-w-md rounded-xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
                <div className="p-4 bg-gray-50 border-b flex justify-between font-bold"><span>{dateStr}</span><button onClick={onClose}><X/></button></div>
                <div className="p-4 overflow-y-auto space-y-3">
                    {Object.values(users).filter(u=>!u.isResigned).map(u => {
                        const assign = dayData.assignments.find(a=>a.uid===u.uid);
                        return (
                            <div key={u.uid} className="flex justify-between items-center p-3 border rounded-lg">
                                <div className="font-bold flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${getUserColor(u.uid).split(' ')[0]}`}></div>{u.name}</div>
                                {assign?.type === 'LEAVE' ? <div className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded font-bold">休: {leaves.find(l=>l.id===assign.leaveType)?.label} <button onClick={()=>{update({assignments: dayData.assignments.filter(x=>x.uid!==u.uid)})}} className="ml-1">✕</button></div> : (
                                    <select onChange={(e)=>{if(e.target.value) update({assignments: [...dayData.assignments, {uid:u.uid, type:'LEAVE', leaveType:e.target.value, leaveHours:8}]})}} className="text-xs border rounded p-1"><option value="">-- 請假 --</option>{leaves.map(l=><option key={l.id} value={l.id}>{l.label}</option>)}</select>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    );
};

// ==========================================
// 📊 統計視圖 (SalaryView)
// ==========================================
const SalaryView = ({ users, shifts, currentDate, leaveTypes, currentUserInfo, isPrivileged, gasReceipts }) => {
    const [targetMonth, setTargetMonth] = useState(`${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}`);
    const visibleUsers = isPrivileged ? Object.values(users).filter(u=>!u.isResigned) : [currentUserInfo];
    
    const calc = (uid) => {
        const u = users[uid];
        let stats = { usedAnnual: 0, balance: 0, gas: Math.min((gasReceipts?.[targetMonth]?.[uid] || []).reduce((s,r)=>s+r.amount,0), 500) };
        Object.keys(shifts).forEach(d => {
            const a = (shifts[d]?.assignments||[]).find(x=>x.uid===uid);
            if(a?.leaveType==='annual') stats.usedAnnual += 1;
            if(a?.otHours) stats.balance += parseFloat(a.otHours);
        });
        return { ...stats, limit: getAnnualLeaveDays(u?.startDate) };
    };

    return (
        <div className="space-y-4 pb-20">
            <div className="bg-white p-4 rounded-xl border flex justify-between items-center shadow-sm"><h2 className="font-bold text-indigo-700 flex items-center gap-2"><ListFilter /> 統計明細 (特休履歷)</h2><input type="month" value={targetMonth} onChange={e=>setTargetMonth(e.target.value)} className="border rounded px-2 font-bold"/></div>
            {visibleUsers.map(u => {
                const s = calc(u.uid);
                return (
                    <div key={u.uid} className="bg-white p-5 rounded-xl border shadow-sm space-y-4">
                        <div className="flex justify-between border-b pb-3 font-bold text-lg"><span>{u.name}</span><span className={`text-indigo-600`}>補休: {s.balance} hr</span></div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100 flex justify-between items-center">
                                <div><div className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">法定特休帳戶</div><div className="text-sm font-bold text-indigo-900">本年已休: {s.usedAnnual} 天 / 總額: {s.limit} 天</div></div>
                                <div className="bg-white px-3 py-1 rounded shadow-sm text-xs font-black text-indigo-600">剩餘 {Math.max(0, s.limit - s.usedAnnual)} 天</div>
                            </div>
                            <div className="bg-teal-50 p-3 rounded-lg border border-teal-100"><div className="text-[10px] text-teal-400 font-bold">油資核銷 (實報實銷)</div><div className="text-sm font-bold text-teal-900">核發金額: ${s.gas} <span className="text-[10px] text-gray-400 font-normal ml-1">/ 上限 500</span></div></div>
                        </div>
                    </div>
                )
            })}
        </div>
    );
};
// ==========================================
// 💰 薪資與設定
// ==========================================
const PayrollView = ({ users, currentDate, db, appId, gasReceipts }) => {
    const [targetMonth, setTargetMonth] = useState(`${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}`);
    const [payroll, setPayroll] = useState({});
    useEffect(() => { const unsub = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'payrolls', targetMonth), (snap) => setPayroll(snap.exists() ? snap.data().records : {})); return () => unsub(); }, [targetMonth]);
    const update = async (uid, f, v) => await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'payrolls', targetMonth), { records: { ...payroll, [uid]: { ...payroll[uid], [f]: v } } }, { merge: true });
    return (
        <div className="space-y-4 pb-20">
            <div className="bg-white p-4 rounded-xl border flex justify-between items-center shadow-sm"><h2 className="font-bold text-indigo-700 flex items-center gap-2"><DollarSign/> 薪資管理 (老闆專屬)</h2><input type="month" value={targetMonth} onChange={e=>setTargetMonth(e.target.value)} className="border rounded px-2"/></div>
            <div className="bg-white rounded-xl border overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-gray-50 border-b"><tr><th className="p-3">姓名</th><th className="p-3">本薪</th><th className="p-3 text-teal-700">油資</th><th className="p-3">備註</th></tr></thead><tbody>{users.filter(u=>!u.isResigned).map(u=>(<tr key={u.uid} className="border-b"><td className="p-3 font-bold">{u.name}</td><td className="p-3"><input type="number" value={payroll[u.uid]?.base||''} onChange={e=>update(u.uid, 'base', e.target.value)} className="w-24 border rounded px-1"/></td><td className="p-3 font-bold text-teal-700 text-center">${Math.min((gasReceipts?.[targetMonth]?.[u.uid] || []).reduce((s,r)=>s+r.amount,0), 500)}</td><td className="p-3"><input type="text" value={payroll[u.uid]?.note||''} onChange={e=>update(u.uid, 'note', e.target.value)} className="w-full border rounded px-1"/></td></tr>))}</tbody></table></div>
        </div>
    );
};

const SettingsView = ({ users, currentUserInfo, appId, db, isSuperAdmin, storeConfig }) => {
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({});
    const [loc, setLoc] = useState(storeConfig || { lat: 24.1, lng: 120.6, radius: 50 });
    const compressImage = (file) => new Promise((res) => { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = (e) => { const img = new Image(); img.src = e.target.result; img.onload = () => { const canvas = document.createElement('canvas'); const MAX = 1200; let w = img.width, h = img.height; if(w>h){if(w>MAX){h*=MAX/w;w=MAX}}else{if(h>MAX){w*=MAX/h;h=MAX}} canvas.width=w; canvas.height=h; canvas.getContext('2d').drawImage(img,0,0,w,h); res(canvas.toDataURL('image/jpeg', 0.7)); } } });
    const handleUp = async (e, f) => setFormData({...formData, [f]: await compressImage(e.target.files[0])});
    return (
        <div className="space-y-6 pb-20">
            <div className="bg-white p-6 rounded-xl border text-center shadow-sm"><h2 className="text-xl font-bold">{currentUserInfo.name}</h2><div className="mt-4 bg-green-50 p-4 rounded-lg border border-green-100 text-left flex justify-between items-center"><span className="text-sm font-bold text-green-800">LINE 通知: {currentUserInfo.lineUserId ? '✅ 已綁定' : '❌ 未綁定'}</span><button onClick={()=>{setEditingId(currentUserInfo.uid); setFormData(currentUserInfo)}} className="text-xs font-black underline text-green-600">修改</button></div></div>
            {isSuperAdmin && (
                <div className="bg-white p-4 rounded-xl border shadow-sm"><h3 className="font-bold mb-3 text-indigo-700 flex items-center gap-2"><MapPin size={18}/> 打卡座標</h3><div className="grid grid-cols-2 gap-3 mb-3"><input type="number" placeholder="緯度" value={loc.lat} onChange={e=>setLoc({...loc, lat:parseFloat(e.target.value)})} className="border p-2 rounded"/><input type="number" placeholder="經度" value={loc.lng} onChange={e=>setLoc({...loc, lng:parseFloat(e.target.value)})} className="border p-2 rounded"/></div><button onClick={()=>setDoc(doc(db,'artifacts',appId,'public','data','settings','storeLocation'), loc)} className="w-full bg-indigo-600 text-white font-bold py-2 rounded-lg">儲存定位設定</button></div>
            )}
            <div className="bg-white p-4 rounded-xl border shadow-sm"><h3 className="font-bold mb-3 flex items-center gap-2"><Users size={18}/> 員工管理</h3>{Object.values(users).filter(u=>!u.isResigned).map(u=>(<div key={u.uid} className="border-b py-3 last:border-0">{editingId===u.uid ? <div className="space-y-2 bg-gray-50 p-2 rounded"><input value={formData.name} onChange={e=>setFormData({...formData, name:e.target.value})} className="border p-1 w-full"/><input type="date" value={formData.startDate||''} onChange={e=>setFormData({...formData, startDate:e.target.value})} className="border p-1 w-full"/><div className="text-[10px]">存摺: <input type="file" onChange={e=>handleUp(e,'bankImage')}/></div><div className="flex gap-2 justify-end"><button onClick={()=>setEditingId(null)} className="text-xs">取消</button><button onClick={async ()=>{await updateDoc(doc(db,'artifacts',appId,'public','data','users',editingId),formData); setEditingId(null)}} className="bg-indigo-600 text-white px-3 py-1 rounded text-xs font-bold">儲存</button></div></div> : <div className="flex justify-between items-center"><div><div className="font-bold">{u.name}</div><div className="text-[10px] text-gray-400">到職: {u.startDate||'未填'}</div></div>{(isSuperAdmin || u.uid===currentUserInfo.uid) && <button onClick={()=>{setEditingId(u.uid);setFormData(u)}} className="text-indigo-600 text-xs font-bold">編輯資料</button>}</div>}</div>))}</div>
        </div>
    );
};

// ==========================================
// 🌟 系統主程式 (Main App) - V10.0
// ==========================================
function App() {
    const [user, setUser] = useState(null);
    const [currentUserInfo, setCurrentUserInfo] = useState(null);
    const [dbData, setDbData] = useState({ users: {}, shifts: {}, events: [], signatures: [], gasReceipts: {}, storeLocation: null, inventoryItems: DEFAULT_INVENTORY_ITEMS, leaves: DEFAULT_LEAVE_TYPES });
    const [view, setView] = useState('calendar');
    const [loading, setLoading] = useState(true);
    const [menuOpen, setMenuOpen] = useState(false);
    const [currentDate, setCurrentDate] = useState(new Date());

    useEffect(() => {
        const unsubAuth = onAuthStateChanged(auth, async (u) => {
            if (u) {
                setUser(u);
                const userDoc = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', u.uid));
                if (!userDoc.exists()) {
                    const initial = { uid: u.uid, name: u.displayName || '新員工', email: u.email, isAdmin: u.email === ADMIN_EMAIL, isResigned: false, startDate: '' };
                    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', u.uid), initial);
                    setCurrentUserInfo(initial);
                } else { setCurrentUserInfo(userDoc.data()); }
            } else { setUser(null); }
            setLoading(false);
        });
        return () => unsubAuth();
    }, []);

    useEffect(() => {
        if (!user) return;
        const unsubUsers = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'users'), (snap) => { const map = {}; snap.forEach(d => map[d.id] = d.data()); setDbData(prev => ({ ...prev, users: map })); });
        const unsubShifts = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'shifts'), (snap) => { const map = {}; snap.forEach(d => map[d.id] = d.data()); setDbData(prev => ({ ...prev, shifts: map })); });
        const unsubSigs = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'signatures'), (snap) => { const list = []; snap.forEach(d => list.push({ id: d.id, ...d.data() })); setDbData(prev => ({ ...prev, signatures: list })); });
        const unsubGas = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'gasReceipts'), (snap) => { const map = {}; snap.forEach(d => map[d.id] = d.data()); setDbData(prev => ({ ...prev, gasReceipts: map })); });
        const unsubLoc = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'storeLocation'), (snap) => setDbData(prev => ({ ...prev, storeLocation: snap.data() })));
        return () => { unsubUsers(); unsubShifts(); unsubSigs(); unsubGas(); unsubLoc(); };
    }, [user]);

    const isSuperAdmin = currentUserInfo?.isAdmin === true;
    const isLocked = !isSuperAdmin && !dbData.signatures.some(s => s.uid === user?.uid && s.formType === 'contract');

    if (loading) return <div className="h-screen flex items-center justify-center font-bold text-indigo-600 animate-pulse">系統啟動中...</div>;
    if (!user) return <div className="h-screen flex flex-col items-center justify-center p-6 bg-gray-50"><h1 className="text-3xl font-black text-indigo-600 mb-8">排班薪資系統 V10</h1><button onClick={() => signInWithPopup(auth, new GoogleAuthProvider())} className="bg-white border-2 border-indigo-600 text-indigo-600 px-8 py-4 rounded-2xl font-bold shadow-xl flex items-center gap-3 transition-all"><Fingerprint size={24}/> Google 帳號登入</button></div>;

    const renderView = () => {
        if (isLocked && view !== 'forms') return <FormsView {...dbData} currentUserInfo={currentUserInfo} setView={setView} isLocked={isLocked} />;
        switch (view) {
            case 'calendar': return <CalendarView currentDate={currentDate} setCurrentDate={setCurrentDate} dbData={dbData} currentUserInfo={currentUserInfo} db={db} appId={appId} isSuperAdmin={isSuperAdmin} />;
            case 'clock': return <ClockView currentUser={user} currentUserInfo={currentUserInfo} storeConfig={dbData.storeLocation} db={db} appId={appId} />;
            case 'inventory': return <InventoryView db={db} appId={appId} inventoryItems={dbData.inventoryItems} />;
            case 'forms': return <FormsView {...dbData} currentUserInfo={currentUserInfo} setView={setView} isLocked={isLocked} isPrivileged={isSuperAdmin} />;
            case 'salary': return <SalaryView {...dbData} currentDate={currentDate} currentUserInfo={currentUserInfo} isPrivileged={isSuperAdmin} />;
            case 'payroll': return <PayrollView users={Object.values(dbData.users)} currentDate={currentDate} db={db} appId={appId} gasReceipts={dbData.gasReceipts} />;
            case 'attendance': return <AttendanceView currentDate={currentDate} db={db} appId={appId} />;
            case 'settings': return <SettingsView {...dbData} currentUserInfo={currentUserInfo} appId={appId} db={db} isSuperAdmin={isSuperAdmin} />;
            default: return null;
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <header className="bg-white border-b shadow-sm sticky top-0 z-40 px-4 py-3 flex justify-between items-center">
                <div className="flex items-center gap-2"><div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center"><Calendar className="text-white w-5 h-5"/></div><h1 className="font-black text-gray-800 hidden xs:block">排班系統 <span className="text-[10px] text-indigo-400">V10.0</span></h1></div>
                <nav className="flex items-center gap-1">
                    <NavBtn active={view==='calendar'} onClick={()=>setView('calendar')} icon={Calendar} label="班表" />
                    <NavBtn active={view==='clock'} onClick={()=>setView('clock')} icon={Fingerprint} label="打卡" />
                    <NavBtn active={view==='inventory'} onClick={()=>setView('inventory')} icon={Package} label="盤點" />
                    <div className="relative">
                        <button onClick={()=>setMenuOpen(!menuOpen)} className="flex items-center gap-1 px-3 py-2 rounded-lg font-bold text-gray-500 hover:bg-gray-100"><Settings className="w-4 h-4"/><span className="hidden xs:inline">管理</span><ChevronDown size={14}/></button>
                        {menuOpen && (
                            <div className="absolute right-0 mt-2 w-48 bg-white border rounded-xl shadow-2xl z-50 overflow-hidden py-1">
                                <DropdownItem onClick={()=>{setView('salary'); setMenuOpen(false);}} icon={FileBarChart} label="統計明細" active={view==='salary'} />
                                {isSuperAdmin && <DropdownItem onClick={()=>{setView('attendance'); setMenuOpen(false);}} icon={History} label="出勤結算" active={view==='attendance'} />}
                                {isSuperAdmin && <DropdownItem onClick={()=>{setView('payroll'); setMenuOpen(false);}} icon={DollarSign} label="薪資管理" active={view==='payroll'} />}
                                <DropdownItem onClick={()=>{setView('forms'); setMenuOpen(false);}} icon={FileSignature} label="表單簽署" active={view==='forms'} />
                                <DropdownItem onClick={()=>{setView('settings'); setMenuOpen(false);}} icon={Users} label="系統設定" active={view==='settings'} />
                                <button onClick={()=>signOut(auth)} className="w-full text-left px-4 py-2.5 text-sm text-red-500 font-bold border-t"><LogOut size={14} className="inline mr-2"/>登出</button>
                            </div>
                        )}
                    </div>
                </nav>
            </header>
            <main className="flex-1 p-4 max-w-7xl mx-auto w-full">{renderView()}</main>
            {isLocked && <div className="fixed top-14 left-0 right-0 bg-red-600 text-white text-xs py-1.5 px-4 z-30 flex items-center justify-center gap-2 font-bold animate-pulse"><Lock size={12}/> 系統鎖定：請完成員工合約簽署以解鎖完整功能！</div>}
        </div>
    );
}

export { App as default };