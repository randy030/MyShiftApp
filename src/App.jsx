import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, updateDoc, getDoc, addDoc, deleteDoc, arrayUnion } from 'firebase/firestore';
import { Calendar, Users, ChevronLeft, ChevronRight, Save, ShieldAlert, Plus, Trash2, BookOpen, LogOut, CheckCircle2, Lock, Eye, Clock, Store, Bell, ArrowRightLeft, FileBarChart, UserX, Upload, ListFilter, History, StickyNote, DollarSign, Gift, Megaphone, Send, Smartphone, X, Inbox, Repeat, MapPin, Fingerprint, Map, Package, Settings, ChevronDown, Minus, Download, Edit } from 'lucide-react';

// ==========================================
// 🚀 系統設定
// ==========================================
const CURRENT_VERSION = "v6.4 (Annual Stats & Fixes)"; 
const LINE_API_URL = "/api/webhook"; 
const ADMIN_EMAIL = "randy22444289@gmail.com";

// ==========================================
// 🟢 Firebase 設定
// ==========================================
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

// --- 輔助函式：匯出 Excel (CSV) 支援中文 ---
const exportToCSV = (filename, rows) => {
    const csvContent = "\uFEFF" + rows.map(row => row.map(item => `"${String(item || '').replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}.csv`;
    link.click();
};

const sendLineNotification = async (targetLineIds, messageText) => {
    if (!targetLineIds || targetLineIds.length === 0) return;
    try { await fetch(LINE_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: targetLineIds, messages: [{ type: 'text', text: messageText }] }) }); } catch (e) { console.error("LINE 通知失敗", e); }
};

const getDistance = (lat1, lon1, lat2, lon2) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    const R = 6371e3; 
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return Math.round(R * c);
};

const DEFAULT_LEAVE_TYPES = [
  { id: 'rostered', label: '自畫假', note: '自選畫休 (不扣薪)', deduct: false },
  { id: 'official', label: '排休', note: '排定休假 (管理員排)', deduct: false }, 
  { id: 'annual', label: '特休', note: '扣時數，不扣薪', deduct: false }, 
  { id: 'menstrual', label: '生理假', note: '不扣時數，不扣薪', deduct: false }, 
  { id: 'sick', label: '病假', note: '可選抵時數或扣薪', deduct: true }, 
  { id: 'personal', label: '事假', note: '可選抵時數或扣薪', deduct: true },
];

const DEFAULT_SHIFT_TYPES = [
  { id: '09A', label: '09A', start: '09:00', end: '17:30' },
  { id: '09O', label: '09O', start: '09:00', end: '21:00' }
];

const DEFAULT_INVENTORY_ITEMS = [
  { id: 'i1', category: '茶葉類', name: '高山青茶', spec: '斤', price: 370 },
  { id: 'i6', category: '果汁與糖漿', name: '梅果漿', spec: '包', price: 165 },
  { id: 'i11', category: '奶與粉類', name: '鮮奶', spec: '罐', price: 68 },
  { id: 'i14', category: '配料與包材', name: '大吸管(12mm)', spec: '包', price: 0 }
];

// 🔴 高對比十色色盤，確保員工顏色不重複且明顯區分
const USER_COLORS = [
    'bg-blue-100 text-blue-900 border-blue-400',
    'bg-orange-100 text-orange-900 border-orange-400',
    'bg-emerald-100 text-emerald-900 border-emerald-400',
    'bg-rose-100 text-rose-900 border-rose-400',
    'bg-purple-100 text-purple-900 border-purple-400',
    'bg-cyan-100 text-cyan-900 border-cyan-400',
    'bg-amber-100 text-amber-900 border-amber-400',
    'bg-fuchsia-100 text-fuchsia-900 border-fuchsia-400',
    'bg-lime-100 text-lime-900 border-lime-400',
    'bg-sky-100 text-sky-900 border-sky-400'
];
const REPEAT_LABELS = { none: '不重複', daily: '每天', weekly: '每週', monthly: '每月', yearly: '每年' };

const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
const getMonthData = (year, month) => { const firstDay = new Date(year, month, 1).getDay(); const days = daysInMonth(year, month); return { firstDay, days }; };
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

// --- OT Modal ---
const OTModal = ({ isOpen, onClose, onConfirm, modalData, dateStr }) => {
    const [hours, setHours] = useState('');
    const [reason, setReason] = useState('');
    useEffect(() => { if(isOpen && modalData) { setHours(modalData.initialHours || ''); setReason(modalData.initialReason || ''); } }, [isOpen, modalData]);
    if (!isOpen || !modalData) return null;
    const { user, balance } = modalData;
    const numHours = parseFloat(hours);
    const isExceeding = numHours < 0 && Math.abs(numHours) > balance;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden transform transition-all scale-100">
                <div className="bg-indigo-600 p-4 text-white flex justify-between items-center"><h3 className="font-bold flex items-center gap-2"><Clock className="w-5 h-5"/> 加班 / 補休申請</h3><button onClick={onClose} className="hover:bg-indigo-700 p-1 rounded"><X size={20}/></button></div>
                <div className="p-6 space-y-4">
                    <div className="text-sm text-gray-500">正在編輯 <span className="font-bold text-gray-800">{user?.name}</span> 於 <span className="font-bold text-gray-800">{dateStr}</span> 的時數</div>
                    <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100 flex justify-between items-center"><span className="text-sm font-bold text-indigo-900">本年度剩餘可休：</span><span className={`text-lg font-bold ${balance < 0 ? 'text-red-600' : 'text-green-600'}`}>{balance} hr</span></div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">增減時數 (小時)</label>
                        <input type="number" autoFocus value={hours} onChange={e=>setHours(e.target.value)} placeholder="加班請輸入正數，補休請輸入負數" className={`w-full border-2 rounded-lg px-3 py-2 focus:outline-none text-lg font-bold ${isExceeding ? 'border-red-300 text-red-600 bg-red-50 focus:border-red-500' : 'border-indigo-100 text-gray-700 focus:border-indigo-500'}`}/>
                        {isExceeding ? (<p className="text-[11px] font-bold text-red-600 mt-1 flex items-center gap-1">⚠️ 注意：申請補休大於剩餘時數，超出部分將扣薪！</p>) : (<p className="text-[10px] font-bold text-indigo-500 mt-1 flex gap-2"><span className="bg-orange-50 text-orange-600 px-1 rounded">加班範例： 4</span><span className="bg-green-50 text-green-600 px-1 rounded">補休範例： -2</span></p>)}
                    </div>
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">事由 / 備註</label><input type="text" value={reason} onChange={e=>setReason(e.target.value)} placeholder="例如: 支援活動、扣抵..." className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"/></div>
                    <div className="flex gap-3 pt-2"><button onClick={onClose} className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-lg font-bold text-sm hover:bg-gray-200">取消</button><button onClick={() => { if(hours === '') return alert("請輸入時數，若要清除請輸入 0"); onConfirm(parseFloat(hours), reason); }} className="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg font-bold text-sm hover:bg-indigo-700 shadow-lg">確認送出</button></div>
                </div>
            </div>
        </div>
    );
};

// --- 公司行程管理視窗 ---
const CompanyEventModal = ({ isOpen, onClose, eventData, onSave, onDelete }) => {
    const [formData, setFormData] = useState({ title: '', startDate: '', time: '', repeatType: 'none', note: '' });
    useEffect(() => { if(isOpen && eventData) setFormData(eventData); }, [isOpen, eventData]);
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
                <div className="bg-purple-600 p-4 text-white flex justify-between items-center"><h3 className="font-bold flex items-center gap-2"><Megaphone className="w-5 h-5"/> 公司行程備忘錄</h3><button onClick={onClose} className="hover:bg-purple-700 p-1 rounded"><X size={20}/></button></div>
                <div className="p-6 space-y-4">
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">行程標題 <span className="text-red-500">*</span></label><input type="text" value={formData.title} onChange={e=>setFormData({...formData, title: e.target.value})} placeholder="例如: 每月店務會議、衛生局檢查..." className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:border-purple-500 focus:outline-none"/></div>
                    <div className="grid grid-cols-2 gap-3"><div><label className="block text-xs font-bold text-gray-700 mb-1">起始日期</label><input type="date" value={formData.startDate} onChange={e=>setFormData({...formData, startDate: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"/></div><div><label className="block text-xs font-bold text-gray-700 mb-1">時間 (選填)</label><input type="time" value={formData.time} onChange={e=>setFormData({...formData, time: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"/></div></div>
                    <div><label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1"><Repeat size={12}/> 重複規則</label><select value={formData.repeatType} onChange={e=>setFormData({...formData, repeatType: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-purple-500 focus:outline-none bg-white">{Object.entries(REPEAT_LABELS).map(([val, label]) => <option key={val} value={val}>{label}</option>)}</select></div>
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">詳細備註 (選填)</label><textarea value={formData.note || ''} onChange={e=>setFormData({...formData, note: e.target.value})} placeholder="活動詳細說明..." rows="2" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-purple-500 focus:outline-none resize-none"></textarea></div>
                    <div className="flex gap-3 pt-4 border-t">{formData.id && <button onClick={()=>onDelete(formData.id)} className="p-2.5 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg"><Trash2 size={18}/></button>}<button onClick={onClose} className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-lg font-bold text-sm hover:bg-gray-200">取消</button><button onClick={() => { if(!formData.title) return alert("請輸入標題"); onSave(formData); }} className="flex-1 bg-purple-600 text-white py-2.5 rounded-lg font-bold text-sm hover:bg-purple-700 shadow">儲存行程</button></div>
                </div>
            </div>
        </div>
    );
};

const NavBtn = ({ active, onClick, icon: Icon, label }) => (
  <button onClick={onClick} className={`flex items-center gap-1 px-3 py-2 rounded-lg transition-colors font-bold ${active ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:bg-gray-100'}`}><Icon className="w-4 h-4" /><span className="hidden xs:inline">{label}</span></button>
);

const DropdownItem = ({ onClick, icon: Icon, label, active }) => (
    <button onClick={onClick} className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 hover:bg-indigo-50 font-bold transition-colors ${active ? 'text-indigo-600 bg-indigo-50/50' : 'text-gray-600'}`}><Icon className="w-4 h-4 opacity-70" /> {label}</button>
);

// ==========================================
// 📦 庫存盤點頁面 (InventoryView)
// ==========================================
const InventoryView = ({ db, appId, inventoryItems }) => {
    const items = Array.isArray(inventoryItems) && inventoryItems.length > 0 ? inventoryItems : [];
    if (items.length === 0) return (<div className="max-w-2xl mx-auto pb-20 text-center mt-10"><Package size={64} className="mx-auto text-gray-300 mb-4" /><h2 className="text-xl font-bold text-gray-600">目前尚無庫存品項</h2><p className="text-gray-500 mt-2">請使用「最高管理員」帳號，前往「管理 &gt; 系統設定」新增庫存品項。</p></div>);

    const categories = useMemo(() => [...new Set(items.map(i => i.category))], [items]);
    const [activeTab, setActiveTab] = useState(categories[0] || '');
    const [records, setRecords] = useState({});
    const filteredItems = items.filter(i => i.category === activeTab);

    // 即時總金額
    const totalValue = useMemo(() => items.reduce((sum, item) => sum + ((records[item.id] || 0) * item.price), 0), [items, records]);

    const handleCountChange = (id, delta) => setRecords(prev => { const current = prev[id] || 0; return { ...prev, [id]: Math.max(0, current + delta) }; });
    const handleInputChange = (id, val) => { const num = parseFloat(val); if(!isNaN(num) && num >= 0) { setRecords(prev => ({ ...prev, [id]: num })); } else if (val === '') { const newRecs = {...records}; delete newRecs[id]; setRecords(newRecs); } };

    const handleSave = async () => {
        if (Object.keys(records).length === 0) return alert("尚未填寫任何盤點數量！");
        if (window.confirm("確定要送出今日盤點結果嗎？\n\n送出後畫面將自動重置為 0。")) {
            const todayStr = new Date().toISOString().split('T')[0];
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventoryRecords', todayStr), { date: todayStr, timestamp: Date.now(), data: records }, { merge: true });
            alert("✅ 盤點資料已成功儲存至雲端！");
            setRecords({}); // 送出後自動歸零
        }
    };

    const handleExportCSV = () => {
        const todayStr = new Date().toISOString().split('T')[0];
        const rows = [['分類', '品名', '盤點單位', '數量', '單價', '總金額(估算)']];
        let exportTotal = 0;
        items.forEach(item => { const qty = records[item.id] || 0; const subtotal = qty * item.price; exportTotal += subtotal; rows.push([item.category, item.name, item.spec, qty, item.price, subtotal]); });
        rows.push(['', '', '', '', '庫存總值:', exportTotal]);
        exportToCSV(`盤點表_${todayStr}`, rows);
    };

    return (
        <div className="max-w-2xl mx-auto pb-20">
            <div className="bg-white p-4 rounded-xl border flex flex-col sm:flex-row justify-between items-center mb-4 shadow-sm gap-3">
                <h2 className="font-bold text-lg text-indigo-700 flex items-center gap-2"><Package/> 庫存盤點</h2>
                <div className="flex gap-3 items-center w-full sm:w-auto justify-between sm:justify-end">
                    <div className="font-bold text-red-600 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100">總值: ${totalValue.toLocaleString()}</div>
                    <div className="flex gap-2">
                        <button onClick={handleExportCSV} className="bg-green-50 text-green-700 border border-green-200 px-3 py-2 rounded-lg font-bold shadow-sm hover:bg-green-100 flex items-center gap-1"><Download size={16}/><span className="hidden sm:inline">匯出</span></button>
                        <button onClick={handleSave} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-indigo-700 flex items-center gap-1"><Save size={16}/> 送出</button>
                    </div>
                </div>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 mb-2 scrollbar-hide">
                {categories.map(c => (<button key={c} onClick={()=>setActiveTab(c)} className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap shadow-sm transition-all ${activeTab === c ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'}`}>{c}</button>))}
            </div>
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                {filteredItems.map((item, idx) => (
                    <div key={item.id} className={`p-4 flex justify-between items-center ${idx !== filteredItems.length - 1 ? 'border-b border-gray-100' : ''}`}>
                        <div><div className="font-bold text-gray-800 text-lg">{item.name}</div><div className="text-xs text-gray-400 font-mono">單價: ${item.price}</div></div>
                        <div className="flex items-center gap-2 sm:gap-3">
                            <span className="text-lg font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100 shadow-sm mr-1 sm:mr-3">{item.spec}</span>
                            <button onClick={()=>handleCountChange(item.id, -1)} className="w-10 h-10 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-gray-200 active:scale-90 transition-transform"><Minus size={20}/></button>
                            <input type="number" value={records[item.id] !== undefined ? records[item.id] : ''} onChange={(e)=>handleInputChange(item.id, e.target.value)} placeholder="0" className="w-16 text-center font-bold text-xl border-b-2 border-indigo-200 focus:border-indigo-600 focus:outline-none py-1 bg-transparent" />
                            <button onClick={()=>handleCountChange(item.id, 1)} className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center hover:bg-indigo-100 active:scale-90 transition-transform"><Plus size={20}/></button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ==========================================
// 📍 GPS 打卡頁面 (ClockView)
// ==========================================
const ClockView = ({ currentUser, users, storeConfig, db, appId }) => {
    const [currentTime, setCurrentTime] = useState(new Date());
    const [location, setLocation] = useState(null);
    const [distance, setDistance] = useState(null);
    const [locError, setLocError] = useState('');
    const [isPunching, setIsPunching] = useState(false);
    const currentUserInfo = users[currentUser.uid] || {};

    useEffect(() => { const timer = setInterval(() => setCurrentTime(new Date()), 1000); return () => clearInterval(timer); }, []);
    const fetchLocation = () => {
        setLocError(''); setLocation(null); setDistance(null);
        if (!navigator.geolocation) { setLocError('不支援定位'); return; }
        navigator.geolocation.getCurrentPosition((pos) => {
            const lat = pos.coords.latitude; const lng = pos.coords.longitude; setLocation({ lat, lng });
            if (storeConfig && storeConfig.lat && storeConfig.lng) { setDistance(getDistance(lat, lng, storeConfig.lat, storeConfig.lng)); }
        }, (err) => { setLocError(err.code === 1 ? '請允許權限' : '定位失敗'); }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    };
    useEffect(() => { fetchLocation(); }, [storeConfig]);

    const handlePunch = async (type) => {
        if (!storeConfig?.lat) return alert("管理員尚未設定座標！");
        if (distance === null) return alert("定位中...");
        if (distance > (storeConfig.radius || 50)) return alert("超出範圍！");
        setIsPunching(true);
        try {
            const dateStr = `${currentTime.getFullYear()}-${String(currentTime.getMonth()+1).padStart(2,'0')}`;
            const todayStr = `${currentTime.getFullYear()}-${String(currentTime.getMonth()+1).padStart(2,'0')}-${String(currentTime.getDate()).padStart(2,'0')}`;
            const timeStr = `${String(currentTime.getHours()).padStart(2,'0')}:${String(currentTime.getMinutes()).padStart(2,'0')}`;
            const newRecord = { id: `${Date.now()}_${currentUser.uid}`, uid: currentUser.uid, name: currentUserInfo.name, type: type, date: todayStr, time: timeStr, timestamp: Date.now(), distance: distance };
            const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'clockRecords', dateStr);
            const snap = await getDoc(docRef);
            if (!snap.exists()) { await setDoc(docRef, { records: [newRecord] }); } else { await updateDoc(docRef, { records: arrayUnion(newRecord) }); }
            alert(`${type === 'IN' ? '上班' : '下班'}打卡成功！`); fetchLocation(); 
        } catch (e) { alert("打卡失敗"); }
        setIsPunching(false);
    };

    const isWithinRange = distance !== null && storeConfig && distance <= (storeConfig.radius || 50);

    return (
        <div className="max-w-md mx-auto bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 mt-4">
            <div className="bg-indigo-600 p-6 text-center text-white relative">
                <h2 className="text-xl font-bold opacity-90 mb-2">現在時間</h2>
                <div className="text-5xl font-mono font-bold tracking-wider drop-shadow-md">{String(currentTime.getHours()).padStart(2,'0')}:{String(currentTime.getMinutes()).padStart(2,'0')}<span className="text-2xl ml-1 opacity-75">:{String(currentTime.getSeconds()).padStart(2,'0')}</span></div>
                <div className="text-sm mt-2 opacity-80">{currentTime.toLocaleDateString()}</div>
            </div>
            <div className="p-6 space-y-6">
                <div className="bg-gray-50 rounded-xl p-4 border relative">
                    <div className="flex justify-between items-start mb-2"><h4 className="font-bold text-gray-700 flex items-center gap-1"><MapPin size={16}/> 定位狀態</h4><button onClick={fetchLocation} className="text-xs bg-white border px-2 py-1 rounded hover:bg-gray-100 shadow-sm font-bold text-indigo-600">重新定位</button></div>
                    {!storeConfig?.lat ? (<p className="text-sm text-red-500 font-bold">⚠️ 管理員尚未設定店面座標</p>) : locError ? (<p className="text-sm text-red-500 font-bold">❌ {locError}</p>) : distance === null ? (<p className="text-sm text-gray-500 animate-pulse">正在獲取 GPS 訊號...</p>) : (
                        <div className="space-y-1">
                            <p className="text-sm text-gray-600">距離店面: <span className={`font-bold text-lg ${isWithinRange ? 'text-green-600' : 'text-red-500'}`}>{distance}</span> 公尺</p>
                            <p className="text-xs text-gray-400">允許打卡範圍: {storeConfig.radius || 50} 公尺</p>
                            {isWithinRange ? <div className="text-sm font-bold text-green-600 flex items-center gap-1 mt-1"><CheckCircle2 size={16}/> 在範圍內，可以打卡</div> : <div className="text-sm font-bold text-red-500 flex items-center gap-1 mt-1"><X size={16}/> 距離過遠，無法打卡</div>}
                        </div>
                    )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => handlePunch('IN')} disabled={!isWithinRange || isPunching} className={`py-4 rounded-xl font-bold text-lg shadow-lg flex flex-col items-center gap-1 transition-all ${isWithinRange ? 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}><Clock size={24}/> 上班打卡</button>
                    <button onClick={() => handlePunch('OUT')} disabled={!isWithinRange || isPunching} className={`py-4 rounded-xl font-bold text-lg shadow-lg flex flex-col items-center gap-1 transition-all ${isWithinRange ? 'bg-orange-500 text-white hover:bg-orange-600 active:scale-95' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}><LogOut size={24}/> 下班打卡</button>
                </div>
            </div>
        </div>
    );
};

// ==========================================
// 📋 出勤明細頁面 (AttendanceView)
// ==========================================
const AttendanceView = ({ users, currentDate, db, appId, shifts, shiftTypes }) => {
    const [targetMonth, setTargetMonth] = useState(`${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}`);
    const [attendanceList, setAttendanceList] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setLoading(true);
        const unsub = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'clockRecords', targetMonth), (snap) => {
            if (snap.exists()) {
                const records = snap.data().records || [];
                const grouped = {};
                records.forEach(r => {
                    const key = `${r.date}_${r.uid}`;
                    if (!grouped[key]) grouped[key] = { date: r.date, uid: r.uid, name: r.name, in: null, out: null };
                    if (r.type === 'IN') { if (!grouped[key].in || r.time < grouped[key].in) grouped[key].in = r.time; }
                    if (r.type === 'OUT') { if (!grouped[key].out || r.time > grouped[key].out) grouped[key].out = r.time; }
                });

                const processedList = Object.values(grouped).map(g => {
                    const dayShift = shifts[g.date]?.assignments?.find(a => a.uid === g.uid);
                    const shiftInfo = shiftTypes.find(st => st.id === dayShift?.shiftCode);
                    let status = [];
                    if (shiftInfo) {
                        if (g.in && g.in > shiftInfo.start) status.push('遲到');
                        if (g.out && g.out < shiftInfo.end) status.push('早退');
                        if (!g.in) status.push('缺卡(上)');
                        if (!g.out) status.push('缺卡(下)');
                        if (status.length === 0) status.push('正常');
                    } else if (dayShift?.type === 'LEAVE') { status.push('請假'); } 
                    else { status.push('未排班'); }
                    return { ...g, shiftInfo, status };
                });
                processedList.sort((a, b) => b.date.localeCompare(a.date));
                setAttendanceList(processedList);
            } else { setAttendanceList([]); }
            setLoading(false);
        });
        return () => unsub();
    }, [targetMonth, db, appId, shifts, shiftTypes]);

    const handleExportCSV = () => {
        const rows = [['日期', '員工', '班別', '上班打卡', '下班打卡', '狀態']];
        attendanceList.forEach(r => {
            const shiftStr = r.shiftInfo ? `${r.shiftInfo.start}~${r.shiftInfo.end}` : '-';
            rows.push([r.date, r.name, shiftStr, r.in || '', r.out || '', r.status.join(', ')]);
        });
        exportToCSV(`出勤紀錄_${targetMonth}`, rows);
    };

    return (
        <div className="space-y-4 pb-20">
            <div className="bg-white p-4 rounded-xl border flex justify-between items-center">
                <h2 className="font-bold flex gap-2 text-indigo-700"><History/> 出勤結算</h2>
                <div className="flex gap-2">
                    <input type="month" value={targetMonth} onChange={e=>setTargetMonth(e.target.value)} className="border rounded px-2"/>
                    <button onClick={handleExportCSV} className="bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded font-bold shadow-sm hover:bg-green-100 flex items-center gap-1"><Download size={16}/><span className="hidden sm:inline">匯出</span></button>
                </div>
            </div>
            <div className="bg-white rounded-xl border overflow-hidden">
                {loading ? <div className="p-8 text-center text-gray-400">載入中...</div> : 
                 attendanceList.length === 0 ? <div className="p-8 text-center text-gray-400">本月尚無打卡紀錄</div> : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-500 font-bold border-b">
                                <tr><th className="p-3">日期</th><th className="p-3">員工</th><th className="p-3 text-center">班別 (應到~應退)</th><th className="p-3 text-center">上班打卡</th><th className="p-3 text-center">下班打卡</th><th className="p-3">狀態</th></tr>
                            </thead>
                            <tbody>
                                {attendanceList.map((r, i) => {
                                    const isAbnormal = r.status.includes('遲到') || r.status.includes('早退') || r.status.includes('缺卡');
                                    return (
                                    <tr key={i} className="border-b hover:bg-gray-50">
                                        <td className="p-3 font-mono text-gray-600">{r.date.substring(5)}</td>
                                        <td className="p-3 font-bold">{r.name}</td>
                                        <td className="p-3 text-center text-gray-500 text-xs">{r.shiftInfo ? <span className="bg-gray-100 px-2 py-0.5 rounded">{r.shiftInfo.label} ({r.shiftInfo.start}~{r.shiftInfo.end})</span> : <span className="text-gray-300">-</span>}</td>
                                        <td className={`p-3 text-center font-bold ${r.in && r.shiftInfo && r.in > r.shiftInfo.start ? 'text-red-500' : 'text-gray-800'}`}>{r.in || '-'}</td>
                                        <td className={`p-3 text-center font-bold ${r.out && r.shiftInfo && r.out < r.shiftInfo.end ? 'text-red-500' : 'text-gray-800'}`}>{r.out || '-'}</td>
                                        <td className="p-3 font-bold">{isAbnormal ? <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded text-xs">{r.status.join(', ')}</span> : <span className="text-green-600 bg-green-50 px-2 py-0.5 rounded text-xs">{r.status.join(', ')}</span>}</td>
                                    </tr>
                                )})}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- 2. Salary View (加入年度統計 & 匯出 Excel) ---
const SalaryView = ({ users, shifts, currentDate, leaveTypes, currentUser, isPrivileged }) => {
  const [targetMonth, setTargetMonth] = useState(`${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}`);
  const visibleUsers = useMemo(() => isPrivileged ? users : users.filter(u => u.uid === currentUser.uid), [users, currentUser, isPrivileged]);

  const calc = (uid) => {
    const targetYear = targetMonth.substring(0, 4);
    let monthStats = { ot: 0, leaves: {} };
    // 🔴 記錄年度病假、事假、生理假天數
    let yearStats = { otEarned: 0, compHoursUsed: 0, leaves: {} }; 
    let otHistory = []; 

    Object.keys(shifts).forEach(date => {
        if (!date.startsWith(targetYear)) return; 
        const data = shifts[date]; if(data.isClosed) return;
        const assign = Array.isArray(data.assignments) ? data.assignments.find(a => a.uid === uid) : null;
        if(!assign) return;
        
        if(assign.type === 'LEAVE') { 
            const lType = assign.leaveType || 'unknown'; 
            const typeInfo = leaveTypes.find(t => t.id === lType);
            const hrs = assign.leaveHours ? parseFloat(assign.leaveHours) : 0;
            
            // 🔴 年度計算
            if(!yearStats.leaves[lType]) yearStats.leaves[lType] = { days: 0 };
            yearStats.leaves[lType].days += 1;

            if ((assign.useComp || lType === 'annual') && hrs > 0 && lType !== 'menstrual') {
                yearStats.compHoursUsed += hrs;
                otHistory.push({ date, hours: -hrs, reason: `使用「${typeInfo?.label || lType}」抵扣` });
            }

            // 🔴 月度計算
            if(date.startsWith(targetMonth)) {
                 if(!monthStats.leaves[lType]) monthStats.leaves[lType] = { days: 0, hours: 0, compHours: 0, deductHours: 0 };
                 monthStats.leaves[lType].days += 1;
                 if(assign.leaveHours && lType !== 'menstrual') monthStats.leaves[lType].hours += hrs;
                 if (assign.useComp || lType === 'annual' || lType === 'menstrual') { monthStats.leaves[lType].compHours += hrs; } else { monthStats.leaves[lType].deductHours += hrs; }
            }
        }
        
        if(assign.otHours && assign.otConfirmed) { 
            const hrs = parseFloat(assign.otHours);
            if (hrs > 0) yearStats.otEarned += hrs;
            if (hrs < 0) yearStats.compHoursUsed += Math.abs(hrs);
            if(date.startsWith(targetMonth)) { if (hrs > 0) monthStats.ot += hrs; }
            otHistory.push({ date, hours: hrs, reason: assign.otReason || '無備註' });
        }
    });

    otHistory.sort((a, b) => b.date.localeCompare(a.date));
    const balance = yearStats.otEarned - yearStats.compHoursUsed;
    return { monthStats, yearStats, balance, otHistory, targetYear };
  };

  const handleExportCSV = () => {
      const rows = [['員工姓名', '本年度剩餘可休(hr)', '本月累積加班(hr)', '本月扣抵時數(hr)', '年度累計病假(天)', '年度累計事假(天)', '年度累計生理假(天)']];
      const leaveHeaders = leaveTypes.map(lt => `${lt.label}本月(天)`);
      const deductHeaders = leaveTypes.filter(lt => lt.deduct).map(lt => `${lt.label}本月扣薪(hr)`);
      rows[0].push(...leaveHeaders, ...deductHeaders);

      visibleUsers.forEach(u => {
          const s = calc(u.uid);
          const row = [
              u.name, s.balance, s.monthStats.ot || 0, s.yearStats.compHoursUsed || 0,
              s.yearStats.leaves['sick']?.days || 0,
              s.yearStats.leaves['personal']?.days || 0,
              s.yearStats.leaves['menstrual']?.days || 0
          ];
          leaveTypes.forEach(lt => { const lData = s.monthStats.leaves[lt.id] || {days: 0}; row.push(lData.days); });
          leaveTypes.filter(lt => lt.deduct).forEach(lt => { const lData = s.monthStats.leaves[lt.id] || {deductHours: 0}; row.push(lData.deductHours); });
          rows.push(row);
      });
      exportToCSV(`統計明細_${targetMonth}`, rows);
  };

  return (
    <div className="space-y-4 pb-20">
      <div className="bg-white p-4 rounded-xl border flex justify-between items-center">
          <h2 className="font-bold flex gap-2"><ListFilter className="text-indigo-600"/> 統計明細</h2>
          <div className="flex gap-2">
              <input type="month" value={targetMonth} onChange={e=>setTargetMonth(e.target.value)} className="border rounded px-2"/>
              {isPrivileged && <button onClick={handleExportCSV} className="bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded font-bold shadow-sm hover:bg-green-100 flex items-center gap-1"><Download size={16}/><span className="hidden sm:inline">匯出</span></button>}
          </div>
      </div>
      <div className="grid gap-3">{visibleUsers.map(u => {
          const s = calc(u.uid);
          const needsDeduction = leaveTypes.some(lt => lt.deduct && s.monthStats.leaves[lt.id]?.deductHours > 0);

          return (
            <div key={u.uid} className="bg-white p-4 rounded shadow-sm border">
              <div className="flex justify-between items-start mb-2 border-b pb-2">
                  <div className="font-bold text-lg">{u.name}</div>
                  <div className="text-right">
                      <div className="text-xs text-gray-400">剩餘可休 (本年度 {s.targetYear} 累計)</div>
                      <div className={`font-bold text-xl ${s.balance < 0 ? 'text-red-600' : 'text-green-600'}`}>{s.balance} <span className="text-xs">hr</span></div>
                  </div>
              </div>
              <div className="space-y-3 text-sm">
                
                {/* 🔴 年度請假累計 */}
                <div className="bg-blue-50 p-2.5 rounded-lg border border-blue-200 mt-2">
                    <div className="text-[11px] font-bold text-blue-800 mb-1 flex items-center gap-1"><History size={12}/> 年度請假累計 (1/1~12/31)</div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-blue-700 font-bold">
                        <span>病假: {s.yearStats.leaves['sick']?.days || 0} 天 <span className="text-gray-400 text-[10px] font-normal">(上限30)</span></span>
                        <span>事假: {s.yearStats.leaves['personal']?.days || 0} 天 <span className="text-gray-400 text-[10px] font-normal">(上限14)</span></span>
                        <span>生理假: {s.yearStats.leaves['menstrual']?.days || 0} 天 <span className="text-gray-400 text-[10px] font-normal">(上限3)</span></span>
                    </div>
                </div>

                {needsDeduction && (
                    <div className="bg-red-50 p-2.5 rounded-lg border border-red-200">
                        <div className="text-xs font-bold text-red-800 mb-1">⚠️ 本月需扣薪總計 (未用時數抵扣)：</div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-red-700 font-bold">
                            {leaveTypes.map(lt => {
                                if (lt.deduct && s.monthStats.leaves[lt.id]?.deductHours > 0) return <span key={lt.id}>{lt.label}: <span className="text-lg">{s.monthStats.leaves[lt.id].deductHours}</span>h</span>
                                return null;
                            })}
                        </div>
                    </div>
                )}
                <div className="bg-orange-50 p-2 rounded border border-orange-100 flex justify-between text-xs text-gray-600"><span>本月累積加班: {s.monthStats.ot || 0} hr</span><span>年度已扣抵: {s.yearStats.compHoursUsed} hr</span></div>
                
                <div className="bg-gray-50 p-2 rounded border border-gray-100">
                    <div className="text-xs font-bold text-gray-500 mb-1">本月 ({targetMonth}) 各類請假明細</div>
                    {Object.keys(s.monthStats.leaves).length > 0 ? (
                        <div className="grid grid-cols-2 gap-2 mt-1">
                            {Object.entries(s.monthStats.leaves).map(([typeId, data]) => { 
                                const typeInfo = leaveTypes.find(t => t.id === typeId); 
                                return (
                                    <div key={typeId} className={`text-xs px-2 py-1.5 rounded bg-white border ${typeInfo?.deduct && data.deductHours > 0 ? 'border-red-200' : 'border-gray-200'}`}>
                                        <div className={`font-bold ${typeInfo?.deduct && data.deductHours > 0 ? 'text-red-600' : 'text-gray-700'}`}>{typeInfo?.label || '假'}: {data.days}天 {data.hours > 0 ? `(${data.hours}h)` : ''}</div>
                                        {data.hours > 0 && typeInfo?.id !== 'annual' && typeInfo?.id !== 'menstrual' && (<div className="text-[10px] text-gray-500 mt-0.5">時數抵扣: {data.compHours}h / 月底扣薪: {data.deductHours}h</div>)}
                                    </div>
                                ); 
                            })}
                        </div>
                    ) : <span className="text-xs text-gray-400">無請假紀錄</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  );
};
// --- 3. Payroll View ---
const PayrollView = ({ users, currentDate, db, appId }) => {
    const [targetMonth, setTargetMonth] = useState(`${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}`);
    const [payrollData, setPayrollData] = useState({});
    useEffect(() => { const unsub = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'payrolls', targetMonth), (docSnap) => { if (docSnap.exists()) setPayrollData(docSnap.data().records || {}); else setPayrollData({}); }); return () => unsub(); }, [targetMonth]);
    const updatePayroll = async (uid, field, value) => { const newData = { ...payrollData, [uid]: { ...(payrollData[uid] || {}), [field]: value } }; setPayrollData(newData); await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'payrolls', targetMonth), { records: newData }, { merge: true }); };

    return (
        <div className="space-y-4 pb-20">
            <div className="bg-white p-4 rounded-xl border flex justify-between items-center"><h2 className="font-bold flex gap-2 text-indigo-700"><DollarSign/> 薪資與福利管理 (最高管理員)</h2><input type="month" value={targetMonth} onChange={e=>setTargetMonth(e.target.value)} className="border rounded px-2"/></div>
            <div className="bg-white rounded-xl border overflow-x-auto">
                <table className="w-full text-sm text-left"><thead className="bg-gray-50 text-gray-500 font-bold border-b"><tr><th className="p-3">姓名</th><th className="p-3 w-24">本薪</th><th className="p-3 w-24">補助/津貼</th><th className="p-3 w-24 bg-pink-50 text-pink-700">生日禮金</th><th className="p-3 w-24 bg-purple-50 text-purple-700">三節獎金</th><th className="p-3 w-24 bg-yellow-50 text-yellow-700">年終獎金</th><th className="p-3">備註</th></tr></thead>
                <tbody>{users.map(u => { const record = payrollData[u.uid] || {}; return (<tr key={u.uid} className="border-b hover:bg-gray-50"><td className="p-3 font-bold">{u.name}</td><td className="p-3"><input type="number" placeholder="0" className="w-full border rounded px-1" value={record.base || ''} onChange={e=>updatePayroll(u.uid, 'base', e.target.value)}/></td><td className="p-3"><input type="number" placeholder="0" className="w-full border rounded px-1" value={record.subsidy || ''} onChange={e=>updatePayroll(u.uid, 'subsidy', e.target.value)}/></td><td className="p-3 bg-pink-50"><input type="number" placeholder="0" className="w-full border rounded px-1" value={record.bonus_bday || ''} onChange={e=>updatePayroll(u.uid, 'bonus_bday', e.target.value)}/></td><td className="p-3 bg-purple-50"><input type="number" placeholder="0" className="w-full border rounded px-1" value={record.bonus_festival || ''} onChange={e=>updatePayroll(u.uid, 'bonus_festival', e.target.value)}/></td><td className="p-3 bg-yellow-50"><input type="number" placeholder="0" className="w-full border rounded px-1" value={record.bonus_year || ''} onChange={e=>updatePayroll(u.uid, 'bonus_year', e.target.value)}/></td><td className="p-3"><input type="text" placeholder="..." className="w-full border rounded px-1" value={record.note || ''} onChange={e=>updatePayroll(u.uid, 'note', e.target.value)}/></td></tr>); })}</tbody></table>
            </div>
        </div>
    );
};

// --- Settings View ---
const SettingsView = ({ users, currentUser, isSuperAdmin, isPrivileged, leaveTypes, shiftTypes, inventoryItems, appId, storeConfig, db }) => {
  const userList = Object.values(users);
  const currentUserInfo = users[currentUser.uid] || {};
  
  const [newLeave, setNewLeave] = useState({ label: '', note: '', color: 'bg-gray-100 text-gray-700' });
  const [newShift, setNewShift] = useState({ id: '', label: '', start: '09:00', end: '18:00' });
  const [newInvItem, setNewInvItem] = useState({ category: '茶葉類', name: '', spec: '', price: '' });
  const [editingInvId, setEditingInvId] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({});
  const [showResigned, setShowResigned] = useState(false);

  const [locConfig, setLocConfig] = useState(storeConfig || { lat: '', lng: '', radius: 50 });
  useEffect(() => { if (storeConfig) setLocConfig(storeConfig); }, [storeConfig]);
  
  const handleGetLocation = () => {
      if (!navigator.geolocation) return alert("不支援定位功能");
      navigator.geolocation.getCurrentPosition((pos) => setLocConfig({ ...locConfig, lat: pos.coords.latitude, lng: pos.coords.longitude }), (err) => alert("無法獲取定位。"), { enableHighAccuracy: true });
  };
  const handleSaveLocation = async () => { await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'storeLocation'), locConfig); alert("打卡座標設定已儲存！"); };

  const addLeave = async () => { if(!newLeave.label) return; const types = [...leaveTypes, { ...newLeave, id: Math.random().toString(36).substr(2,9) }]; await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'leaves'), { types }); setNewLeave({ label: '', note: '', color: 'bg-gray-100 text-gray-700' }); };
  const addShiftType = async () => { 
      if(!newShift.label || !newShift.start || !newShift.end) return alert("請填寫完整班別資訊"); 
      const id = newShift.label.trim();
      if (shiftTypes.find(st => st.id === id)) return alert("班別代號已存在");
      const types = [...shiftTypes, { ...newShift, id }]; 
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'shiftTypes'), { types }); 
      setNewShift({ id: '', label: '', start: '09:00', end: '18:00' }); 
  };
  const deleteShiftType = async (idToDelete) => { const types = shiftTypes.filter(t => t.id !== idToDelete); await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'shiftTypes'), { types }); };

  const handleEditInventoryItem = (item) => { setNewInvItem(item); setEditingInvId(item.id); };
  const addOrUpdateInventoryItem = async () => {
      if (!newInvItem.name || !newInvItem.spec) return alert("請填寫品名與單位");
      const price = parseFloat(newInvItem.price) || 0;
      let items;
      if (editingInvId) { items = inventoryItems.map(i => i.id === editingInvId ? { ...newInvItem, price } : i); } 
      else { const newItem = { ...newInvItem, id: `i_${Date.now()}`, price }; items = [...inventoryItems, newItem]; }
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'inventoryConfig'), { items });
      setNewInvItem({ category: newInvItem.category || '茶葉類', name: '', spec: '', price: '' });
      setEditingInvId(null);
  };
  const deleteInventoryItem = async (idToDelete) => {
      if(!window.confirm("確定刪除此盤點品項？")) return;
      const items = inventoryItems.filter(i => i.id !== idToDelete);
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'inventoryConfig'), { items });
  };

  const saveUser = async () => { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', editingId), formData); setEditingId(null); };
  const handleImageUpload = (e) => { const file = e.target.files[0]; if (!file) return; if (file.size > 1024 * 1024) return alert("圖片過大"); const reader = new FileReader(); reader.onloadend = () => { setFormData({ ...formData, bankImage: reader.result }); }; reader.readAsDataURL(file); };
  
  const visibleUsers = useMemo(() => { let list = userList; if (!isPrivileged) list = list.filter(u => u.uid === currentUser.uid); else if (!showResigned) list = list.filter(u => !u.isResigned); return list; }, [userList, currentUser, isPrivileged, showResigned]);

  return (
    <div className="space-y-6 pb-20">
      <div className="bg-white p-6 rounded-xl border shadow-sm text-center">
        <h2 className="font-bold text-xl">{currentUserInfo.name}</h2>
        <div className="mt-4 bg-green-50 p-3 rounded-lg border border-green-100 text-left">
            <h4 className="text-sm font-bold text-green-800 flex items-center gap-2"><Smartphone size={16}/> LINE 通知綁定</h4>
            <p className="text-xs text-gray-600 mb-2">請輸入 <span className="font-bold text-red-500">查ID</span> 的回傳代碼：</p>
            {editingId === currentUser.uid ? (
                <div className="flex gap-2">
                    <input value={formData.lineUserId || ''} onChange={e=>setFormData({...formData, lineUserId: e.target.value})} placeholder="Uxxxxxxxx..." className="border rounded px-2 py-1 text-xs flex-1"/>
                    <button onClick={saveUser} className="bg-green-600 text-white px-3 py-1 rounded text-xs">儲存</button>
                </div>
            ) : (
                <div className="flex justify-between items-center">
                    <span className="text-xs font-mono bg-white px-2 py-1 rounded border">{currentUserInfo.lineUserId ? '✅ 已綁定' : '❌ 未綁定'}</span>
                    <button onClick={()=>{setEditingId(currentUser.uid); setFormData(currentUserInfo)}} className="text-green-600 text-xs underline">修改</button>
                </div>
            )}
        </div>
      </div>

      {isSuperAdmin && (
        <div className="bg-white p-4 rounded-xl border shadow-sm">
            <h3 className="font-bold mb-3 flex gap-2"><Package size={18}/> 庫存盤點品項管理</h3>
            <div className={`grid grid-cols-5 gap-2 mb-4 p-2 rounded border ${editingInvId ? 'bg-indigo-50 border-indigo-200' : 'bg-gray-50'}`}>
                <select value={newInvItem.category} onChange={e=>setNewInvItem({...newInvItem, category: e.target.value})} className="col-span-2 sm:col-span-1 border rounded px-2 py-1.5 text-sm bg-white"><option value="茶葉類">茶葉類</option><option value="果汁與糖漿">果汁與糖漿</option><option value="奶與粉類">奶與粉類</option><option value="配料類">配料類</option><option value="包材類">包材類</option><option value="五金與其他">五金與其他</option></select>
                <input placeholder="品名 (如: 珍珠)" value={newInvItem.name} onChange={e=>setNewInvItem({...newInvItem, name:e.target.value})} className="col-span-3 sm:col-span-2 border rounded px-2 py-1.5 text-sm"/>
                <input placeholder="單位 (包/斤)" value={newInvItem.spec} onChange={e=>setNewInvItem({...newInvItem, spec:e.target.value})} className="col-span-2 sm:col-span-1 border rounded px-2 py-1.5 text-sm"/>
                <div className="col-span-3 sm:col-span-1 flex gap-2">
                    <input type="number" placeholder="單價" value={newInvItem.price} onChange={e=>setNewInvItem({...newInvItem, price:e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm"/>
                    {editingInvId ? (
                        <><button onClick={addOrUpdateInventoryItem} className="bg-green-600 text-white rounded px-3 flex justify-center items-center shrink-0"><CheckCircle2 size={18}/></button><button onClick={()=>{setEditingInvId(null); setNewInvItem({category:'茶葉類',name:'',spec:'',price:''});}} className="bg-gray-400 text-white rounded px-3 flex justify-center items-center shrink-0"><X size={18}/></button></>
                    ) : (<button onClick={addOrUpdateInventoryItem} className="bg-indigo-600 text-white rounded px-3 flex justify-center items-center shrink-0"><Plus size={18}/></button>)}
                </div>
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1 pr-1 border-t pt-2">
                {inventoryItems.map(item => (
                    <div key={item.id} className="flex justify-between items-center bg-white p-2 rounded border border-gray-100 hover:bg-gray-50">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3"><span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-bold w-max">{item.category}</span><span className="font-bold text-gray-700 text-sm">{item.name}</span><span className="text-xs text-gray-500">({item.spec})</span></div>
                        <div className="flex items-center gap-3"><span className="text-xs font-mono text-gray-400">${item.price}</span><button onClick={()=>handleEditInventoryItem(item)} className="text-indigo-400 hover:text-indigo-600"><Edit size={16}/></button><button onClick={()=>deleteInventoryItem(item.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={16}/></button></div>
                    </div>
                ))}
            </div>
        </div>
      )}
      
      {isSuperAdmin && (
          <div className="bg-white p-4 rounded-xl border shadow-sm">
              <h3 className="font-bold mb-3 flex gap-2 text-indigo-700"><Map size={18}/> 打卡定位設定 (GPS防作弊)</h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                  <div><label className="block text-xs font-bold text-gray-700 mb-1">緯度 (Latitude)</label><input type="number" value={locConfig.lat} onChange={e=>setLocConfig({...locConfig, lat: parseFloat(e.target.value)})} className="w-full border rounded px-3 py-2 text-sm bg-gray-50"/></div>
                  <div><label className="block text-xs font-bold text-gray-700 mb-1">經度 (Longitude)</label><input type="number" value={locConfig.lng} onChange={e=>setLocConfig({...locConfig, lng: parseFloat(e.target.value)})} className="w-full border rounded px-3 py-2 text-sm bg-gray-50"/></div>
              </div>
              <div className="mb-4"><label className="block text-xs font-bold text-gray-700 mb-1">允許打卡半徑 (公尺)</label><input type="number" value={locConfig.radius} onChange={e=>setLocConfig({...locConfig, radius: parseInt(e.target.value)})} className="w-full border rounded px-3 py-2 text-sm" placeholder="建議設定 50~100 公尺"/></div>
              <div className="flex gap-2"><button onClick={handleGetLocation} className="flex-1 bg-white border border-indigo-200 text-indigo-600 font-bold py-2 rounded shadow-sm hover:bg-indigo-50 flex items-center justify-center gap-1"><MapPin size={16}/> 獲取目前位置</button><button onClick={handleSaveLocation} className="flex-1 bg-indigo-600 text-white font-bold py-2 rounded shadow hover:bg-indigo-700 flex items-center justify-center gap-1"><Save size={16}/> 儲存設定</button></div>
          </div>
      )}

      {isSuperAdmin && (
        <div className="bg-white p-4 rounded-xl border">
            <h3 className="font-bold mb-3 flex gap-2"><Clock size={18}/> 班別管理 (排班與遲到結算用)</h3>
            <div className="grid grid-cols-4 gap-2 mb-3"><input placeholder="代號 (如 09A)" value={newShift.label} onChange={e=>setNewShift({...newShift, label:e.target.value})} className="border rounded px-2 text-sm"/><input type="time" value={newShift.start} onChange={e=>setNewShift({...newShift, start:e.target.value})} className="border rounded px-2 text-sm"/><input type="time" value={newShift.end} onChange={e=>setNewShift({...newShift, end:e.target.value})} className="border rounded px-2 text-sm"/><button onClick={addShiftType} className="bg-indigo-600 text-white rounded flex justify-center items-center"><Plus size={18}/></button></div>
            <div className="space-y-2">{shiftTypes.map(st => (<div key={st.id} className="flex justify-between items-center bg-gray-50 p-2 rounded border border-gray-100"><div><span className="font-bold text-gray-700 mr-2">{st.label}</span><span className="text-xs text-gray-500 font-mono bg-white px-1 rounded border">{st.start} ~ {st.end}</span></div><button onClick={()=>deleteShiftType(st.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={16}/></button></div>))}</div>
        </div>
      )}

      {isSuperAdmin && (
        <div className="bg-white p-4 rounded-xl border"><h3 className="font-bold mb-3 flex gap-2"><BookOpen size={18}/> 假別管理</h3><div className="flex gap-2 mb-3"><input placeholder="名稱" value={newLeave.label} onChange={e=>setNewLeave({...newLeave, label:e.target.value})} className="border rounded px-2 w-20"/><input placeholder="說明" value={newLeave.note} onChange={e=>setNewLeave({...newLeave, note:e.target.value})} className="border rounded px-2 flex-1"/><button onClick={addLeave} className="bg-indigo-600 text-white px-3 rounded"><Plus/></button></div><div className="space-y-2">{leaveTypes.filter(lt=>lt.id!=='comp').map(l => (<div key={l.id} className="flex justify-between items-center bg-gray-50 p-2 rounded"><span className={`text-xs px-2 py-1 rounded ${l.color}`}>{l.label}</span><span className="text-xs text-gray-500 truncate flex-1 mx-2">{l.note}</span><button onClick={async()=>{ const types = leaveTypes.filter(t=>t.id!==l.id); await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'leaves'), { types }); }} className="text-gray-400"><Trash2 size={14}/></button></div>))}</div></div>
      )}
      
      <div className="bg-white p-4 rounded-xl border">
         <div className="flex justify-between items-center mb-3"><h3 className="font-bold flex gap-2"><Users size={18}/> 資料設定</h3>{isSuperAdmin && (<label className="text-xs flex items-center gap-1 text-gray-500 cursor-pointer"><input type="checkbox" checked={showResigned} onChange={e=>setShowResigned(e.target.checked)} />顯示已離職</label>)}</div>
         {visibleUsers.map(u => (
           <div key={u.uid} className={`border-b py-3 last:border-0 ${u.isResigned ? 'opacity-50 bg-gray-50' : ''}`}>
             {editingId === u.uid ? (
               <div className="space-y-3 p-3 bg-gray-50 rounded">
                 <div className="grid grid-cols-2 gap-2">
                     <div><label className="text-xs text-gray-500">姓名</label><input value={formData.name} onChange={e=>setFormData({...formData, name:e.target.value})} className="w-full border p-2 rounded"/></div>
                     {isSuperAdmin && (<div><label className="text-xs text-gray-500">在職狀態</label><select value={formData.isResigned ? 'true' : 'false'} onChange={e=>setFormData({...formData, isResigned: e.target.value === 'true'})} className="w-full border p-2 rounded bg-white"><option value="false">在職中</option><option value="true">已離職</option></select></div>)}
                     {isSuperAdmin && (
                        <div><label className="text-xs text-gray-500 font-bold text-indigo-600">系統權限指派</label><select value={formData.isAdmin ? 'admin' : (formData.isManager ? 'manager' : 'employee')} onChange={e=>{ const val = e.target.value; setFormData({...formData, isAdmin: val==='admin', isManager: val==='manager'}); }} className="w-full border-2 border-indigo-200 p-2 rounded bg-indigo-50 font-bold text-indigo-800"><option value="employee">一般員工</option><option value="manager">主管 (Manager)</option><option value="admin">最高管理員 (Admin)</option></select></div>
                     )}
                 </div>
                 {isSuperAdmin && (<div className="space-y-2 border-t pt-2 mt-2"><div className="text-xs font-bold text-indigo-600 flex items-center gap-1"><Lock size={10}/> 敏感資料</div><div className="grid grid-cols-2 gap-2"><input placeholder="到職日 (YYYY-MM-DD)" value={formData.startDate || ''} onChange={e=>setFormData({...formData, startDate:e.target.value})} className="border p-2 rounded text-sm"/><input placeholder="電話" value={formData.phone || ''} onChange={e=>setFormData({...formData, phone:e.target.value})} className="border p-2 rounded text-sm"/><input placeholder="出生年月日" value={formData.birthday || ''} onChange={e=>setFormData({...formData, birthday:e.target.value})} className="border p-2 rounded text-sm"/><input placeholder="身分證字號" value={formData.nationalId || ''} onChange={e=>setFormData({...formData, nationalId:e.target.value})} className="border p-2 rounded text-sm"/></div><div><label className="text-xs text-gray-500 block mb-1">銀行存摺封面</label><div className="flex items-center gap-2"><label className="cursor-pointer bg-white border border-gray-300 text-gray-600 px-3 py-1.5 rounded text-xs hover:bg-gray-50 flex items-center gap-1"><Upload size={12}/> 上傳圖片<input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" /></label>{formData.bankImage && <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 size={12}/> 已選取</span>}</div>{formData.bankImage && (<img src={formData.bankImage} alt="Bank" className="mt-2 h-20 object-contain border rounded bg-white" />)}</div></div>)}
                 <div className="flex gap-2 justify-end mt-2"><button onClick={()=>setEditingId(null)} className="px-3 py-1 bg-gray-200 rounded">取消</button><button onClick={saveUser} className="px-3 py-1 bg-indigo-600 text-white rounded">儲存</button></div>
               </div>
             ) : (
               <div className="flex justify-between items-center">
                   <div>
                       <div className="font-bold flex items-center gap-2">
                           {u.name}
                           {u.isAdmin ? <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">管理員</span> : u.isManager ? <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">主管</span> : null}
                           {u.isResigned && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded flex items-center gap-0.5"><UserX size={10}/> 已離職</span>}
                       </div>
                       {isPrivileged && u.startDate && <div className="text-xs text-gray-400">到職: {u.startDate}</div>}
                   </div>
                   {(isSuperAdmin || u.uid === currentUser.uid) && <button onClick={()=>{setEditingId(u.uid);setFormData(u)}} className="text-indigo-600 text-sm">編輯</button>}
               </div>
             )}
           </div>
         ))}
      </div>
    </div>
  );
};