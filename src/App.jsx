import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, updateDoc, getDoc, addDoc, deleteDoc, arrayUnion } from 'firebase/firestore';
import { 
  Calendar, Users, ChevronLeft, ChevronRight, Save, ShieldAlert, Plus, Trash2, 
  BookOpen, LogOut, CheckCircle2, Lock, Eye, Clock, Store, Bell, ArrowRightLeft, 
  FileBarChart, UserX, Upload, ListFilter, History, StickyNote, DollarSign, Gift, 
  Megaphone, Send, Smartphone, X, Inbox, Repeat, MapPin, Fingerprint, Map, Package, 
  Settings, ChevronDown, Minus, Download, Edit, FileSignature, FileText 
} from 'lucide-react';

// ==========================================
// 🚀 系統設定
// ==========================================
const CURRENT_VERSION = "v7.1 (Signatures & Classic Roles)"; 
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

// --- 輔助函式 ---
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
    } catch (e) { 
        console.error("LINE 通知失敗", e); 
    }
};

const getDistance = (lat1, lon1, lat2, lon2) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    const R = 6371e3; 
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat/2) ** 2 + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon/2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
};

// 預設資料
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

// 高對比 10 色色盤
const USER_COLORS = [
    'bg-red-200 text-red-900 border-red-500',       
    'bg-blue-200 text-blue-900 border-blue-500',    
    'bg-green-200 text-green-900 border-green-500', 
    'bg-yellow-200 text-yellow-900 border-yellow-600',
    'bg-purple-200 text-purple-900 border-purple-500',
    'bg-teal-200 text-teal-900 border-teal-500',    
    'bg-pink-200 text-pink-900 border-pink-500',    
    'bg-orange-200 text-orange-900 border-orange-500',
    'bg-indigo-200 text-indigo-900 border-indigo-500',
    'bg-rose-200 text-rose-900 border-rose-500'     
];

const REPEAT_LABELS = { none: '不重複', daily: '每天', weekly: '每週', monthly: '每月', yearly: '每年' };

const getMonthData = (year, month) => ({ 
    firstDay: new Date(year, month, 1).getDay(), 
    days: new Date(year, month + 1, 0).getDate() 
});

const getLocalDate = (dateStr) => { 
    const [y, m, d] = dateStr.split('-'); 
    return new Date(y, m - 1, d); 
};

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
    
    useEffect(() => { 
        if(isOpen && modalData) { 
            setHours(modalData.initialHours || ''); 
            setReason(modalData.initialReason || ''); 
        } 
    }, [isOpen, modalData]);

    if (!isOpen || !modalData) return null;

    const { user, balance } = modalData;
    const numHours = parseFloat(hours);
    const isExceeding = numHours < 0 && Math.abs(numHours) > balance;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
                <div className="bg-indigo-600 p-4 text-white flex justify-between items-center">
                    <h3 className="font-bold flex items-center gap-2"><Clock className="w-5 h-5"/> 加班 / 補休申請</h3>
                    <button onClick={onClose} className="hover:bg-indigo-700 p-1 rounded"><X size={20}/></button>
                </div>
                <div className="p-6 space-y-4">
                    <div className="text-sm text-gray-500">正在編輯 <span className="font-bold text-gray-800">{user?.name}</span> 於 <span className="font-bold text-gray-800">{dateStr}</span> 的時數</div>
                    <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100 flex justify-between items-center">
                        <span className="text-sm font-bold text-indigo-900">本年度剩餘可休：</span>
                        <span className={`text-lg font-bold ${balance < 0 ? 'text-red-600' : 'text-green-600'}`}>{balance} hr</span>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">增減時數 (小時)</label>
                        <input type="number" autoFocus value={hours} onChange={e=>setHours(e.target.value)} placeholder="加班正數，補休負數" className={`w-full border-2 rounded-lg px-3 py-2 text-lg font-bold ${isExceeding ? 'border-red-300 text-red-600 bg-red-50' : 'border-indigo-100 text-gray-700 focus:border-indigo-500'}`}/>
                        {isExceeding && <p className="text-[11px] font-bold text-red-600 mt-1">⚠️ 申請補休大於剩餘時數，將扣薪！</p>}
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">事由 / 備註</label>
                        <input type="text" value={reason} onChange={e=>setReason(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-indigo-500"/>
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button onClick={onClose} className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-lg font-bold hover:bg-gray-200">取消</button>
                        <button onClick={() => { if(hours === '') return alert("請輸入時數"); onConfirm(parseFloat(hours), reason); }} className="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg font-bold hover:bg-indigo-700">送出</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- 公司行程管理視窗 ---
const CompanyEventModal = ({ isOpen, onClose, eventData, onSave, onDelete }) => {
    const [formData, setFormData] = useState({ title: '', startDate: '', time: '', repeatType: 'none', note: '' });
    
    useEffect(() => { 
        if(isOpen && eventData) setFormData(eventData); 
    }, [isOpen, eventData]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
                <div className="bg-purple-600 p-4 text-white flex justify-between items-center">
                    <h3 className="font-bold flex items-center gap-2"><Megaphone className="w-5 h-5"/> 公司行程備忘錄</h3>
                    <button onClick={onClose} className="hover:bg-purple-700 p-1 rounded"><X size={20}/></button>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">標題 <span className="text-red-500">*</span></label>
                        <input type="text" value={formData.title} onChange={e=>setFormData({...formData, title: e.target.value})} className="w-full border rounded-lg px-3 py-2"/>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">日期</label>
                            <input type="date" value={formData.startDate} onChange={e=>setFormData({...formData, startDate: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm"/>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">時間</label>
                            <input type="time" value={formData.time} onChange={e=>setFormData({...formData, time: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm"/>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">重複</label>
                        <select value={formData.repeatType} onChange={e=>setFormData({...formData, repeatType: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                            {Object.entries(REPEAT_LABELS).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">備註 (選填)</label>
                        <textarea value={formData.note || ''} onChange={e=>setFormData({...formData, note: e.target.value})} rows="2" className="w-full border rounded-lg px-3 py-2 text-sm"></textarea>
                    </div>
                    <div className="flex gap-3 pt-4 border-t">
                        {formData.id && <button onClick={()=>onDelete(formData.id)} className="p-2.5 text-red-500 bg-red-50 rounded-lg"><Trash2 size={18}/></button>}
                        <button onClick={onClose} className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-lg font-bold">取消</button>
                        <button onClick={() => { if(!formData.title) return alert("請輸入標題"); onSave(formData); }} className="flex-1 bg-purple-600 text-white py-2.5 rounded-lg font-bold">儲存</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// UI 元件
const NavBtn = ({ active, onClick, icon: Icon, label }) => (
    <button onClick={onClick} className={`flex items-center gap-1 px-3 py-2 rounded-lg font-bold ${active ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:bg-gray-100'}`}>
        <Icon className="w-4 h-4" /><span className="hidden xs:inline">{label}</span>
    </button>
);

const DropdownItem = ({ onClick, icon: Icon, label, active }) => (
    <button onClick={onClick} className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 hover:bg-indigo-50 font-bold ${active ? 'text-indigo-600 bg-indigo-50' : 'text-gray-600'}`}>
        <Icon className="w-4 h-4 opacity-70" /> {label}
    </button>
);

// ==========================================
// 主程式 Main App
// ==========================================
export default function App() {
    const [user, setUser] = useState(null);
    const [view, setView] = useState('calendar'); 
    const [loading, setLoading] = useState(true);
    const [dbData, setDbData] = useState({ 
        users: {}, shifts: {}, events: [], requests: [], 
        leaves: DEFAULT_LEAVE_TYPES, shiftsDef: DEFAULT_SHIFT_TYPES, 
        inventory: DEFAULT_INVENTORY_ITEMS, store: null, signatures: []
    });
    
    const [currentDate, setCurrentDate] = useState(new Date());
    const [menuOpen, setMenuOpen] = useState(false);
    const dropdownRef = useRef(null);
  
    useEffect(() => {
        const handleClickOutside = (e) => { 
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setMenuOpen(false); 
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);
  
    useEffect(() => {
        if ('Notification' in window && Notification.permission !== 'granted') Notification.requestPermission();
        return onAuthStateChanged(auth, (u) => { setUser(u); setLoading(false); });
    }, []);
  
    useEffect(() => {
        if (!user) return;
        const unsub = [
            onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'users'), snap => {
                const users = {}; 
                snap.forEach(doc => users[doc.id] = doc.data());
                
                // 新員工建檔 (恢復為傳統角色架構)
                if (!users[user.uid]) {
                    setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', user.uid), { 
                        uid: user.uid, 
                        name: user.displayName || `員工`, 
                        email: user.email, 
                        isAdmin: false,
                        isManager: false,
                        isResigned: false
                    });
                }
                setDbData(prev => ({...prev, users}));
            }),
            onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'shifts'), snap => {
                const shifts = {}; 
                snap.forEach(doc => shifts[doc.id] = doc.data()); 
                setDbData(prev => ({...prev, shifts}));
            }),
            onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), snap => {
                const requests = []; let newCount = 0;
                snap.forEach(doc => { 
                    const d = doc.data(); 
                    requests.push({ id: doc.id, ...d }); 
                    if (d.timestamp && (new Date() - d.timestamp.toDate()) < 10000) newCount++; 
                });
                if (newCount > 0 && Notification.permission === 'granted' && document.hidden) {
                    new Notification("通知", { body: `您有 ${newCount} 筆新申請待處理！` });
                }
                setDbData(prev => ({...prev, requests}));
            }),
            onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'leaves'), snap => { 
                if(snap.exists() && snap.data().types) setDbData(prev => ({...prev, leaves: snap.data().types})); 
            }),
            onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'shiftTypes'), snap => { 
                if(snap.exists() && snap.data().types) setDbData(prev => ({...prev, shiftsDef: snap.data().types})); 
            }),
            onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'inventoryConfig'), snap => { 
                if(snap.exists() && snap.data().items) setDbData(prev => ({...prev, inventory: snap.data().items})); 
            }),
            onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'storeLocation'), snap => { 
                if(snap.exists()) setDbData(prev => ({...prev, store: snap.data()})); 
            }),
            onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'companyEvents'), snap => {
                const events = []; 
                snap.forEach(doc => events.push({ id: doc.id, ...doc.data() })); 
                setDbData(prev => ({...prev, events}));
            }),
            // 🔴 載入表單簽署紀錄
            onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'signatures'), snap => {
                const signatures = []; 
                snap.forEach(doc => signatures.push({ id: doc.id, ...doc.data() })); 
                setDbData(prev => ({...prev, signatures}));
            })
        ];
        return () => unsub.forEach(fn => fn());
    }, [user]);
  
    const { users, shifts, events, requests, leaves, shiftsDef, inventory, store, signatures } = dbData;
    const currentUserInfo = users[user?.uid] || {};
    
    // 🔴 傳統三級權限驗證
    const isSuperAdmin = currentUserInfo.isAdmin || user?.email === ADMIN_EMAIL;
    const isManager = currentUserInfo.isManager || false;
    const isPrivileged = isSuperAdmin || isManager;
    
    // 通知判斷
    const myNotifications = requests.filter(r => 
        r.toUid === user?.uid || 
        (r.type === 'ot_confirm' && r.uid === user?.uid) || 
        (r.type === 'admin_ot_approve' && isPrivileged)
    );
  
    const handleRequest = async (req, action) => {
        const targetUser = users[req.uid || req.fromUid]; 
        if (action === 'reject') {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.id));
            if(targetUser?.lineUserId) sendLineNotification([targetUser.lineUserId], `❌ 申請 (${req.date}) 已被駁回。`);
            return;
        }

        if (['ot_confirm', 'admin_ot_approve'].includes(req.type)) {
            if (req.type === 'admin_ot_approve' && !isPrivileged) return alert("無權限核准單據"); 
            
            const shiftRef = doc(db, 'artifacts', appId, 'public', 'data', 'shifts', req.date);
            const shiftSnap = await getDoc(shiftRef);
            let assigns = shiftSnap.exists() && Array.isArray(shiftSnap.data().assignments) ? [...shiftSnap.data().assignments] : [];
            const idx = assigns.findIndex(a => a.uid === (req.uid || req.fromUid));
            const newEntry = { otHours: req.hours, otReason: req.reason, otConfirmed: true };
            
            if(idx >= 0) assigns[idx] = { ...assigns[idx], ...newEntry }; 
            else assigns.push({ uid: (req.uid || req.fromUid), type: 'WORK', ...newEntry });
            
            await setDoc(shiftRef, { ...(shiftSnap.exists() ? shiftSnap.data() : {}), assignments: assigns }, { merge: true });
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.id));
            
            if(targetUser?.lineUserId) sendLineNotification([targetUser.lineUserId], `✅ ${req.hours>0?'加班':'補休'}申請 (${req.date}) 已核准！`);
            alert("已核准並寫入統計！");
        } 
        else if (req.type === 'swap') {
            const shiftRef = doc(db, 'artifacts', appId, 'public', 'data', 'shifts', req.date);
            const shiftSnap = await getDoc(shiftRef);
            if (shiftSnap.exists() && Array.isArray(shiftSnap.data().assignments)) {
                const assigns = [...shiftSnap.data().assignments];
                const idxA = assigns.findIndex(a => a.uid === req.fromUid); 
                const idxB = assigns.findIndex(a => a.uid === req.toUid);
                
                if (idxA >= 0 && idxB >= 0) {
                    const temp = { ...assigns[idxA], uid: req.toUid }; 
                    assigns[idxA] = { ...assigns[idxB], uid: req.fromUid }; 
                    assigns[idxB] = temp;
                    await updateDoc(shiftRef, { assignments: assigns }); 
                    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.id));
                    alert("換假成功！");
                } else { 
                    alert("班表已變更，無法換假"); 
                    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.id)); 
                }
            }
        }
    };
  
    if (loading) return <div className="flex h-screen items-center justify-center">載入中...</div>;
    
    if (!user) return (
        <div className="flex h-screen items-center justify-center bg-gray-50">
            <div className="bg-white p-8 rounded-xl shadow-lg text-center">
                <h1 className="text-2xl font-bold mb-4 text-indigo-600">TeamShift 雲端系統</h1>
                <button onClick={()=>signInWithPopup(auth, new GoogleAuthProvider())} className="border px-6 py-2 rounded shadow hover:bg-gray-50 font-bold">
                    Google 登入
                </button>
            </div>
        </div>
    );
  
    return (
      <div className="min-h-screen bg-gray-50 font-sans text-slate-800 pb-20 sm:pb-0">
        <nav className="bg-white shadow-sm border-b sticky top-0 z-20">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-xl text-indigo-600">
              <Calendar className="w-6 h-6" /> <span className="hidden sm:inline">TeamShift</span>
              <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full ml-1 hidden md:inline">{CURRENT_VERSION}</span>
            </div>
            
            <div className="flex gap-1 sm:gap-2 items-center">
              <NavBtn active={view==='calendar'} onClick={()=>setView('calendar')} icon={Calendar} label="月曆" />
              <NavBtn active={view==='clock'} onClick={()=>setView('clock')} icon={Fingerprint} label="打卡" />
              <NavBtn active={view==='inventory'} onClick={()=>setView('inventory')} icon={Package} label="盤點" />
              
              <div className="relative" ref={dropdownRef}>
                  <button onClick={() => setMenuOpen(!menuOpen)} className={`flex items-center gap-1 px-3 py-2 rounded-lg font-bold ${['salary','attendance','payroll','settings','forms'].includes(view) ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:bg-gray-100'}`}>
                      <Settings className="w-4 h-4" /> <span className="hidden xs:inline">管理</span>
                      <ChevronDown className="w-3 h-3" />
                  </button>
                  {menuOpen && (
                      <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-2xl z-50 overflow-hidden py-1 animate-fade-in">
                          {isPrivileged && <DropdownItem onClick={()=>{setView('salary'); setMenuOpen(false);}} icon={FileBarChart} label="統計明細" active={view==='salary'} />}
                          {isPrivileged && <DropdownItem onClick={()=>{setView('attendance'); setMenuOpen(false);}} icon={History} label="出勤結算" active={view==='attendance'} />}
                          {isSuperAdmin && <DropdownItem onClick={()=>{setView('payroll'); setMenuOpen(false);}} icon={DollarSign} label="薪資管理" active={view==='payroll'} />}
                          <DropdownItem onClick={()=>{setView('forms'); setMenuOpen(false);}} icon={FileSignature} label="表單與簽署" active={view==='forms'} />
                          <div className="border-t my-1 border-gray-100"></div>
                          <DropdownItem onClick={()=>{setView('settings'); setMenuOpen(false);}} icon={Users} label="系統設定" active={view==='settings'} />
                      </div>
                  )}
              </div>
              <button onClick={()=>setView('inbox')} className={`p-2 relative rounded-lg ${view==='inbox'?'bg-indigo-50 text-indigo-600':'text-gray-500 hover:text-indigo-600'}`}>
                  <Bell className="w-5 h-5" />
                  {myNotifications.length > 0 && <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 border border-white rounded-full"></span>}
              </button>
              <button onClick={()=>window.confirm("確定登出？")&&signOut(auth)} className="p-2 text-gray-400 hover:text-red-500">
                  <LogOut className="w-5 h-5"/>
              </button>
            </div>
          </div>
        </nav>
  
        <main className="max-w-6xl mx-auto p-3 sm:p-4">
          {view === 'calendar' && <CalendarView currentDate={currentDate} setCurrentDate={setCurrentDate} dbData={dbData} currentUserInfo={currentUserInfo} db={db} appId={appId} isSuperAdmin={isSuperAdmin} isPrivileged={isPrivileged} />}
          {view === 'clock' && <ClockView currentUser={user} currentUserInfo={currentUserInfo} storeConfig={store} db={db} appId={appId} />}
          {view === 'inventory' && <InventoryView inventoryItems={inventory} db={db} appId={appId} />}
          {view === 'attendance' && isPrivileged && <AttendanceView users={users} currentDate={currentDate} shifts={shifts} shiftTypes={shiftsDef} db={db} appId={appId} />}
          {view === 'salary' && isPrivileged && <SalaryView users={users} shifts={shifts} currentDate={currentDate} leaveTypes={leaves} currentUserInfo={currentUserInfo} isPrivileged={isPrivileged} />}
          {view === 'payroll' && isSuperAdmin && <PayrollView users={Object.values(users).filter(u=>!u.isResigned)} currentDate={currentDate} db={db} appId={appId} />}
          {view === 'settings' && <SettingsView users={users} currentUserInfo={currentUserInfo} leaveTypes={leaves} shiftTypes={shiftsDef} inventoryItems={inventory} storeConfig={store} db={db} appId={appId} isSuperAdmin={isSuperAdmin} />}
          {view === 'forms' && <FormsView users={users} currentUserInfo={currentUserInfo} db={db} appId={appId} isPrivileged={isPrivileged} signatures={signatures} />}
          
          {view === 'inbox' && (
              <div className="max-w-md mx-auto space-y-4">
                  <div className="bg-white p-4 rounded-xl border flex items-center gap-2">
                      <Bell className="text-indigo-600"/><h2 className="font-bold text-lg">通知中心</h2>
                  </div>
                  {myNotifications.length === 0 ? (
                      <div className="text-center py-10 text-gray-400">目前沒有通知</div>
                  ) : (
                      myNotifications.map(req => (
                          <div key={req.id} className="bg-white p-4 rounded-xl border border-l-4 border-l-indigo-500 shadow-sm mb-3">
                              <h3 className="font-bold text-gray-800">單據審核</h3>
                              <p className="text-sm">申請人：{users[req.uid || req.fromUid]?.name} | 日期：{req.date}</p>
                              <div className="bg-gray-50 p-2 my-2 text-sm rounded font-bold text-indigo-800">
                                  {req.hours > 0 ? '加班' : '補休'} {Math.abs(req.hours)} 小時 ({req.reason})
                              </div>
                              <div className="flex gap-2">
                                  <button onClick={()=>handleRequest(req, 'reject')} className="flex-1 bg-white border py-2 rounded-lg font-bold hover:bg-gray-50">駁回</button>
                                  <button onClick={()=>handleRequest(req, 'accept')} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg font-bold shadow hover:bg-indigo-700">核准</button>
                              </div>
                          </div>
                      ))
                  )}
              </div>
          )}
        </main>
      </div>
    );
}
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
            <div className="bg-white p-4 rounded-xl border flex justify-between items-center"><h2 className="font-bold flex gap-2 text-indigo-700"><History/> 出勤結算</h2><div className="flex gap-2"><input type="month" value={targetMonth} onChange={e=>setTargetMonth(e.target.value)} className="border rounded px-2"/><button onClick={handleExportCSV} className="bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded font-bold shadow-sm hover:bg-green-100 flex items-center gap-1"><Download size={16}/><span className="hidden sm:inline">匯出</span></button></div></div>
            <div className="bg-white rounded-xl border overflow-hidden">
                {loading ? <div className="p-8 text-center text-gray-400">載入中...</div> : 
                 attendanceList.length === 0 ? <div className="p-8 text-center text-gray-400">本月尚無打卡紀錄</div> : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-500 font-bold border-b"><tr><th className="p-3">日期</th><th className="p-3">員工</th><th className="p-3 text-center">班別 (應到~應退)</th><th className="p-3 text-center">上班打卡</th><th className="p-3 text-center">下班打卡</th><th className="p-3">狀態</th></tr></thead>
                            <tbody>{attendanceList.map((r, i) => { const isAbnormal = r.status.includes('遲到') || r.status.includes('早退') || r.status.includes('缺卡'); return (<tr key={i} className="border-b hover:bg-gray-50"><td className="p-3 font-mono text-gray-600">{r.date.substring(5)}</td><td className="p-3 font-bold">{r.name}</td><td className="p-3 text-center text-gray-500 text-xs">{r.shiftInfo ? <span className="bg-gray-100 px-2 py-0.5 rounded">{r.shiftInfo.label} ({r.shiftInfo.start}~{r.shiftInfo.end})</span> : <span className="text-gray-300">-</span>}</td><td className={`p-3 text-center font-bold ${r.in && r.shiftInfo && r.in > r.shiftInfo.start ? 'text-red-500' : 'text-gray-800'}`}>{r.in || '-'}</td><td className={`p-3 text-center font-bold ${r.out && r.shiftInfo && r.out < r.shiftInfo.end ? 'text-red-500' : 'text-gray-800'}`}>{r.out || '-'}</td><td className="p-3 font-bold">{isAbnormal ? <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded text-xs">{r.status.join(', ')}</span> : <span className="text-green-600 bg-green-50 px-2 py-0.5 rounded text-xs">{r.status.join(', ')}</span>}</td></tr>)})}</tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

// ==========================================
// 📅 月曆與排班細節 Modal (CalendarView / ShiftModal)
// ==========================================
const CalendarView = ({ currentDate, setCurrentDate, dbData, currentUserInfo, db, appId, isSuperAdmin, isPrivileged }) => {
  const [selectedDate, setSelectedDate] = useState(null);
  const [editingEvent, setEditingEvent] = useState(null); 
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const { firstDay, days } = getMonthData(year, month);
  const { shifts, requests, events, users, leaves, shiftsDef } = dbData;

  const sortedUserIds = useMemo(() => Object.keys(users).sort(), [users]);
  const getUserColor = (uid) => { const idx = sortedUserIds.indexOf(uid); return idx === -1 ? 'bg-gray-100 text-gray-800' : USER_COLORS[idx % USER_COLORS.length]; };

  const handleSaveEvent = async (eventData) => {
      if (eventData.id) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'companyEvents', eventData.id), eventData);
      else await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'companyEvents'), eventData);
      setEditingEvent(null);
  };
  const handleDeleteEvent = async (eventId) => {
      if(window.confirm("確定要刪除這個行程嗎？")) { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'companyEvents', eventId)); setEditingEvent(null); }
  };

  return (
    <>
    <div className="space-y-4">
       <div className="bg-white p-4 rounded-xl border shadow-sm flex justify-between items-center md:col-span-1">
            <button onClick={()=>setCurrentDate(new Date(year, month-1, 1))} className="p-2 hover:bg-gray-100 rounded-full"><ChevronLeft/></button>
            <div className="font-bold text-xl">{year}年 {month+1}月</div>
            <button onClick={()=>setCurrentDate(new Date(year, month+1, 1))} className="p-2 hover:bg-gray-100 rounded-full"><ChevronRight/></button>
       </div>
       <div className="bg-white rounded-xl border overflow-hidden grid grid-cols-7 shadow-sm">
        {['日','一','二','三','四','五','六'].map(d=><div key={d} className="py-3 text-center font-bold text-gray-600 bg-gray-50 border-b">{d}</div>)}
        {Array.from({length:firstDay}).map((_,i)=><div key={'e'+i} className="min-h-[150px] border-b border-r bg-gray-50/30"/>)}
        {Array.from({length:days}).map((_,i)=>{
          const d=i+1, dateStr=`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          const data = shifts[dateStr] || {};
          const todaysEvents = events.filter(e => checkEventOnDate(e, dateStr));

          return (<div key={d} onClick={()=>setSelectedDate(dateStr)} className={`min-h-[150px] border-b border-r p-1 cursor-pointer transition-colors flex flex-col ${data.isClosed ? 'bg-gray-200' : 'hover:bg-indigo-50'}`}>
            <div className="flex justify-between mb-1"><span className="text-sm font-bold text-gray-700 ml-1">{d}</span>{data.note && <div className="w-0 h-0 border-t-[10px] border-r-[10px] border-t-red-500 border-r-transparent"></div>}</div>
            {todaysEvents.map(e => (
                <div key={e.id} className="bg-purple-100 text-purple-800 border-purple-300 border text-[11px] px-1 rounded mb-1 font-bold truncate flex items-center gap-1 shadow-sm"><Megaphone size={10} className="shrink-0"/> {e.time && `${e.time} `}{e.title}</div>
            ))}
            {data.isClosed ? <div className="flex-1 flex items-center justify-center"><div className="bg-gray-600 text-white text-sm px-3 py-1 rounded flex items-center gap-1 font-bold shadow"><Store size={14} /> 店休</div></div> : 
              <div className="space-y-1 overflow-y-auto flex-1">
                {Array.isArray(data.assignments) && data.assignments.map((a,ix)=>{ 
                    if (a.type === 'LEAVE') {
                        const pColor = getUserColor(a.uid); 
                        const fullName = users[a.uid]?.name || '未知';
                        const shortName = fullName.length > 2 ? fullName.slice(-2) : fullName;
                        const subNameFull = a.subUid ? users[a.subUid]?.name : null;
                        const subName = subNameFull ? (subNameFull.length > 2 ? subNameFull.slice(-2) : subNameFull) : null;

                        return (
                            <div key={ix} className={`p-1 rounded border ${pColor} bg-opacity-30 mb-1`}>
                                <div className="flex justify-between items-center">
                                    <span className="font-bold text-[11px] tracking-widest">{shortName}</span>
                                    <span className="bg-white/90 px-1 rounded text-[10px] border shadow-sm flex items-center gap-0.5 shrink-0 font-bold truncate max-w-[40px]">
                                        {leaves.find(t=>t.id===a.leaveType)?.label} 
                                    </span>
                                </div>
                                {subName && <div className="text-[10px] text-gray-700 mt-0.5 flex items-center gap-1 bg-white/70 px-1 rounded w-max"><ArrowRightLeft size={9}/> {subName}代</div>}
                            </div>
                        )
                    } return null;
                })}
              </div>}
          </div>)
        })}
       </div>
       {selectedDate && <ShiftModal dateStr={selectedDate} onClose={()=>setSelectedDate(null)} dbData={dbData} currentUserInfo={currentUserInfo} setEditingEvent={setEditingEvent} isSuperAdmin={isSuperAdmin} isPrivileged={isPrivileged} getUserColor={getUserColor} db={db} appId={appId} />}
    </div>
    <CompanyEventModal isOpen={!!editingEvent} onClose={()=>setEditingEvent(null)} eventData={editingEvent} onSave={handleSaveEvent} onDelete={handleDeleteEvent} />
    </>
  );
};

const ShiftModal = ({ dateStr, onClose, dbData, currentUserInfo, setEditingEvent, isSuperAdmin, isPrivileged, getUserColor, db, appId }) => {
  const { shifts, requests, events, users, leaves, shiftsDef } = dbData;
  const dayData = shifts[dateStr] || { assignments: [], note: '', isClosed: false };
  const [note, setNote] = useState(dayData.note || '');
  const [expanded, setExpanded] = useState(null);
  const [otModalData, setOtModalData] = useState(null); 

  const safeUsers = Object.values(users).filter(u => !u.isResigned || dayData.assignments?.some(a=>a.uid===u.uid));
  const isClosed = dayData.isClosed === true;
  const todaysEvents = events.filter(e => checkEventOnDate(e, dateStr));

  const yearStr = dateStr.substring(0, 4);
  const monthStr = dateStr.substring(0, 7);

  const getYearlyBalance = (uid, yearToFind) => {
      let earned = 0; let used = 0;
      Object.keys(shifts).forEach(d => {
          if (!d.startsWith(yearToFind)) return;
          const data = shifts[d]; if(data.isClosed) return;
          const assign = Array.isArray(data.assignments) ? data.assignments.find(a => a.uid === uid) : null;
          if (!assign) return;
          if (assign.type === 'LEAVE' && assign.leaveHours) { if (assign.useComp || assign.leaveType === 'annual') { used += parseFloat(assign.leaveHours); } }
          if (assign.otHours && assign.otConfirmed) { const hrs = parseFloat(assign.otHours); if (hrs > 0) earned += hrs; if (hrs < 0) used += Math.abs(hrs); }
      });
      return earned - used;
  };

  const update = async (newData) => { await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'shifts', dateStr), { ...dayData, ...newData }, { merge: true }); if(newData.assignments) setExpanded(null); };
  
  const toggleClosed = async () => { 
      if (!isSuperAdmin) return; 
      const newStatus = !isClosed; 
      if (newStatus && Array.isArray(dayData.assignments) && dayData.assignments.length > 0) { 
          if (!confirm("設定為店休將清除當日所有排班，確定嗎？")) return; 
          await update({ isClosed: true, assignments: [] }); 
      } else { await update({ isClosed: newStatus }); } 
      onClose(); 
  };
  
  const cancelLeave = (uid) => { 
      if (!isSuperAdmin) return alert("已鎖定，無法刪除。請聯繫管理員。"); 
      let next = Array.isArray(dayData.assignments) ? [...dayData.assignments] : []; 
      const idx = next.findIndex(a=>a.uid===uid); 
      if(idx>=0) { next.splice(idx, 1); update({ assignments: next }); } 
  };

  const updateShiftCode = (uid, code) => {
      if (!isSuperAdmin) return alert("只有最高管理員可以排班");
      let next = Array.isArray(dayData.assignments) ? [...dayData.assignments] : []; const idx = next.findIndex(a=>a.uid===uid);
      if (idx === -1) { next.push({ uid, type: 'WORK', shiftCode: code }); } else { next[idx] = { ...next[idx], shiftCode: code }; }
      update({ assignments: next });
  };

  const toggle = (uid, type, lType=null, subUid=null) => {
    const isMe = uid === currentUserInfo.uid;
    if (!isSuperAdmin && !isMe) return alert("無權限");
    if (isClosed) return alert("本日店休");

    let next = Array.isArray(dayData.assignments) ? [...dayData.assignments] : []; 
    const idx = next.findIndex(a=>a.uid===uid);
    if (!isSuperAdmin && next[idx]?.type === 'LEAVE') { return alert("請假已鎖定。"); }

    // 🔴 核心防呆：假日畫假限制 (2天) & 月畫假限制 (3天)
    if (lType === 'rostered') { 
        let totalRostered = 0; let weekendRostered = 0;
        Object.keys(shifts).forEach(d => { 
            if (d.startsWith(monthStr) && d !== dateStr) {
                if (Array.isArray(shifts[d].assignments) && shifts[d].assignments.some(a=>a.uid===uid && a.type==='LEAVE' && a.leaveType==='rostered')) {
                    totalRostered++;
                    const dObj = new Date(d);
                    if (dObj.getDay() === 0 || dObj.getDay() === 6) weekendRostered++;
                }
            } 
        }); 

        const targetDateObj = new Date(dateStr);
        const isTargetWeekend = targetDateObj.getDay() === 0 || targetDateObj.getDay() === 6;

        if (!isSuperAdmin) {
            if (totalRostered >= 3) return alert("本月自選畫休 (排休) 已達 3 天上限"); 
            if (isTargetWeekend && weekendRostered >= 2) return alert("🚨 本月假日自選畫休 (六、日) 已達 2 天上限！無法再畫假日！");
        }
    }
    
    let leaveHours = 0; let useComp = false; 

    if (lType === 'menstrual') { } 
    else if (['annual', 'sick', 'personal'].includes(lType)) {
        const typeInfo = leaves.find(t=>t.id===lType);
        const leaveName = typeInfo?.label || '該假別';
        const p = prompt(`請輸入「${leaveName}」的請假時數 (純數字):`, "8");
        if (p === null) return;
        leaveHours = Math.abs(parseFloat(p));
        if (isNaN(leaveHours) || leaveHours <= 0) return alert("請輸入有效數字！");
        if (lType === 'annual') { useComp = true; } else if (['sick', 'personal'].includes(lType)) { useComp = window.confirm(`【${leaveName} ${leaveHours}小時 扣抵方式】\n\n👉 按【確定】：使用「剩餘加/補休時數」扣抵\n👉 按【取消】：不扣時數，月底結算扣薪`); }
    }

    const newEntry = { uid, type, leaveType: lType }; 
    if (leaveHours > 0) { newEntry.leaveHours = leaveHours; newEntry.useComp = useComp; }
    if (subUid) newEntry.subUid = subUid;

    if(idx>=0) next[idx] = { ...next[idx], ...newEntry }; else next.push(newEntry);
    update({ assignments: next }); if (lType === 'rostered' || lType === 'official') onClose();
  };

  const requestSwap = async (fromUid, toUid) => {
      const targetUser = safeUsers.find(u=>u.uid===toUid);
      if (!confirm(`確定要向 ${targetUser?.name || '對方'} 申請換假嗎？`)) return;
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), { type: 'swap', fromUid, toUid, date: dateStr, timestamp: new Date() });
      alert("換假申請已送出！");
  };

  const handleOTSave = async (numHours, remark) => {
      const uid = otModalData.user.uid; const actionType = numHours > 0 ? '加班' : '補休';
      if (isPrivileged && uid !== currentUserInfo.uid) {
        const existingReq = requests.find(r => r.date === dateStr && r.uid === uid && r.type === 'ot_confirm');
        if (existingReq) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', existingReq.id));
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), { type: 'ot_confirm', uid, date: dateStr, hours: numHours, reason: remark || '無備註', timestamp: new Date() });
        setOtModalData(null); onClose(); setTimeout(() => alert("已送出時數確認單給員工"), 100);
      } else if (!isPrivileged && uid === currentUserInfo.uid) {
        const existingReq = requests.find(r => r.date === dateStr && r.fromUid === uid && r.type === 'admin_ot_approve');
        if (existingReq) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', existingReq.id));
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), { type: 'admin_ot_approve', fromUid: currentUserInfo.uid, date: dateStr, hours: numHours, reason: remark || '無備註', timestamp: new Date() });
        setOtModalData(null); onClose(); setTimeout(() => alert("已送出審核明細！請等候主管核准。"), 100);
      } else {
        let next = Array.isArray(dayData.assignments) ? [...dayData.assignments] : []; const idx = next.findIndex(a=>a.uid===uid); 
        const newEntry = { otHours: numHours, otReason: remark || '無備註', otConfirmed: true };
        if (idx === -1) next.push({ uid, type: 'WORK', ...newEntry }); else next[idx] = { ...next[idx], ...newEntry };
        await update({ assignments: next }); setOtModalData(null); onClose(); 
      }
  };

  const openOTModal = (user) => { 
      const isMe = user.uid === currentUserInfo.uid;
      if(!isMe && !isPrivileged) return alert("無權限"); 
      if(isClosed) return alert("本日店休"); 
      const assign = Array.isArray(dayData.assignments) ? dayData.assignments.find(a=>a.uid===user.uid) : null;
      const hasOT = assign?.otHours !== undefined && assign?.otHours !== null && assign?.otHours !== "" && Number(assign?.otHours) !== 0;
      const pendingApproveReq = requests.find(r => r.date === dateStr && r.fromUid === user.uid && r.type === 'admin_ot_approve');
      const pendingConfirmReq = requests.find(r => r.date === dateStr && r.uid === user.uid && r.type === 'ot_confirm');
      if (!isPrivileged && (hasOT || pendingApproveReq || pendingConfirmReq)) return alert("時數已鎖定或審核中，無法修改。");
      const balance = getYearlyBalance(user.uid, yearStr);
      let initHrs = ''; let initRsn = '';
      if (pendingApproveReq) { initHrs = pendingApproveReq.hours; initRsn = pendingApproveReq.reason; } else if (pendingConfirmReq) { initHrs = pendingConfirmReq.hours; initRsn = pendingConfirmReq.reason; } else if (assign?.otHours) { initHrs = assign.otHours; initRsn = assign.otReason; }
      setOtModalData({ user, balance, initialHours: initHrs, initialReason: initRsn }); 
  }

  const availableSubs = safeUsers.filter(sub => sub.uid !== expanded && !sub.isResigned);

  return (
    <>
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white w-full max-w-md rounded-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className={`p-4 border-b flex justify-between font-bold items-center ${isClosed ? 'bg-gray-800 text-white' : 'bg-gray-50'}`}><span className="flex items-center gap-2">{dateStr} {isClosed && <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded">本日店休</span>}</span><button onClick={onClose}>✕</button></div>
        <div className="p-4 overflow-y-auto space-y-3 flex-1 relative">
          
          <div className="bg-purple-50 p-3 rounded-lg mb-3 border border-purple-200">
              <div className="flex justify-between items-center mb-2"><h4 className="font-bold text-purple-800 flex items-center gap-1"><Megaphone size={14}/> 公司備忘錄 / 行程</h4>{isSuperAdmin && <button onClick={()=>setEditingEvent({ startDate: dateStr, repeatType: 'none', time: '', title: '' })} className="text-purple-600 bg-white px-2 py-0.5 rounded border border-purple-200 text-xs font-bold shadow-sm hover:bg-purple-100">+ 新增</button>}</div>
              {todaysEvents.length === 0 ? <div className="text-xs text-purple-400">今日無行程</div> : (
                  todaysEvents.map(e => (
                      <div key={e.id} className="flex justify-between items-center bg-white p-2 rounded border border-purple-100 mb-1 shadow-sm">
                          <div><div className="text-sm font-bold text-gray-800">{e.time && <span className="text-purple-600 mr-1">{e.time}</span>}{e.title}</div>{(e.repeatType !== 'none' || e.note) && (<div className="text-[10px] text-gray-500 mt-0.5 flex gap-1 items-center">{e.repeatType !== 'none' && <span className="bg-gray-100 px-1 rounded flex items-center gap-0.5"><Repeat size={8}/> {REPEAT_LABELS[e.repeatType]}</span>}{e.note && <span className="truncate max-w-[150px]">{e.note}</span>}</div>)}</div>
                          {isSuperAdmin && <button onClick={()=>setEditingEvent(e)} className="text-indigo-500 text-xs font-bold bg-indigo-50 px-2 py-1 rounded">編輯</button>}
                      </div>
                  ))
              )}
          </div>

          {isClosed && (<div className="absolute inset-0 bg-white/95 z-10 flex flex-col items-center justify-center text-center p-4 mt-20"><Store className="w-16 h-16 text-gray-400 mb-2"/><h3 className="text-xl font-bold text-gray-600 mb-4">本日店休</h3>{isSuperAdmin && <button onClick={toggleClosed} className="bg-gray-800 text-white px-6 py-2 rounded shadow hover:bg-gray-700 transition-colors">🔓 恢復營業 (解除店休)</button>}</div>)}
          
          {safeUsers.map(u => {
            const assign = Array.isArray(dayData.assignments) ? dayData.assignments.find(a=>a.uid===u.uid) : null; 
            const userColor = getUserColor(u.uid); 
            const isMe = u.uid === currentUserInfo.uid; 
            const canEdit = isMe || isSuperAdmin; 

            const showSwapBtn = (Array.isArray(dayData.assignments) && dayData.assignments.some(a=>a.uid===currentUserInfo.uid && a.type==='LEAVE')) && !isMe && assign?.type === 'WORK';
            const hasOT = assign?.otHours !== undefined && assign?.otHours !== null && assign?.otHours !== "" && Number(assign?.otHours) !== 0;
            const otValue = Number(assign?.otHours);
            const isOT = otValue > 0;
            const hasLeave = assign?.type === 'LEAVE';

            const pendingApproveReq = requests.find(r => r.date === dateStr && r.fromUid === u.uid && r.type === 'admin_ot_approve');
            const pendingConfirmReq = requests.find(r => r.date === dateStr && r.uid === u.uid && r.type === 'ot_confirm');

            const canEditLeave = isSuperAdmin || (isMe && !hasLeave);
            const canEditOT = isPrivileged || (isMe && !hasOT && !pendingApproveReq && !pendingConfirmReq);

            if (hasLeave) {
                return (
                    <div key={u.uid} className={`border rounded-lg p-3 ${userColor} bg-opacity-20`}>
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <span className="font-bold">{u.name}</span>
                                <span className="bg-white/80 px-2 py-0.5 rounded text-xs border shadow-sm font-bold flex items-center gap-1">
                                    🌴 {leaves.find(t=>t.id===assign.leaveType)?.label || '休假'}
                                    {assign.leaveHours && assign.leaveType !== 'menstrual' && (<span className={`font-mono ${assign.useComp || assign.leaveType === 'annual' ? 'text-indigo-600' : 'text-red-600'}`}>(-{assign.leaveHours}h{assign.useComp || assign.leaveType === 'annual' ? '抵' : '扣'})</span>)}
                                </span>
                                {assign.subUid && <span className="text-[11px] text-gray-600 font-bold flex items-center gap-1 bg-white/60 px-1 rounded"><ArrowRightLeft size={10}/> {users[assign.subUid]?.name} 代</span>}
                            </div>
                            {isSuperAdmin && <button onClick={()=>cancelLeave(u.uid)} className="text-red-500 hover:text-red-700 bg-white/80 px-2 py-1 rounded text-xs font-bold shadow-sm border border-red-100 flex items-center gap-1"><Trash2 size={12}/> 取消</button>}
                        </div>
                    </div>
                );
            } else {
                let otButtonUi = null;
                if (pendingApproveReq) {
                    otButtonUi = <button onClick={() => isPrivileged ? openOTModal(u) : alert("已送出審核，鎖定中。")} className={`flex-1 py-2 text-xs rounded border font-bold shadow-sm bg-blue-50 text-blue-600 border-blue-200 ${!isPrivileged ? 'opacity-60 cursor-not-allowed' : 'hover:bg-blue-100'}`}><Clock className="w-3.5 h-3.5 inline mr-1" />審核中 ({pendingApproveReq.hours}h)</button>;
                } else if (pendingConfirmReq) {
                    otButtonUi = <button onClick={() => isPrivileged ? openOTModal(u) : alert("請至通知中心確認單據。")} className={`flex-1 py-2 text-xs rounded border font-bold shadow-sm bg-pink-50 text-pink-600 border-pink-200 ${!isPrivileged ? 'opacity-60 cursor-not-allowed' : 'hover:bg-pink-100'}`}><Clock className="w-3.5 h-3.5 inline mr-1" />待確認 ({pendingConfirmReq.hours}h)</button>;
                } else if (hasOT) {
                    otButtonUi = <button onClick={() => isPrivileged ? openOTModal(u) : alert("時數已生效，鎖定中。")} className={`flex-1 py-2 text-xs rounded border font-bold shadow-sm ${isOT ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-green-100 text-green-700 border-green-200'} ${!isPrivileged ? 'opacity-60 cursor-not-allowed' : (isOT ? 'hover:bg-orange-200' : 'hover:bg-green-200')}`}><Clock className="w-3.5 h-3.5 inline mr-1" />{isOT ? `+${otValue}h` : `${otValue}h`}</button>;
                } else {
                    otButtonUi = <button onClick={() => openOTModal(u)} disabled={!canEditOT} className={`flex-1 py-2 text-xs rounded border shadow-sm ${!canEditOT ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-600 hover:bg-gray-50'}`}><Clock className="w-3.5 h-3.5 inline mr-1" />加/補休</button>;
                }

                return (
                  <div key={u.uid} className={`border rounded-lg p-3 ${!canEdit ? 'bg-gray-50 opacity-100' : 'bg-white'}`}>
                    <div className="flex justify-between items-center mb-2">
                        <div className="font-bold text-gray-800 flex items-center gap-2"><div className={`w-2.5 h-2.5 rounded-full ${userColor.split(' ')[0]} border border-gray-400`}></div>{u.name}</div>
                        {showSwapBtn && <button onClick={() => requestSwap(currentUserInfo.uid, u.uid)} className="bg-indigo-50 text-indigo-600 border border-indigo-200 px-2 py-1 rounded text-xs font-bold shadow-sm flex items-center gap-1 hover:bg-indigo-100"><ArrowRightLeft size={12}/> 換假</button>}
                    </div>

                    <div className="flex gap-2 w-full mt-2">
                        {isSuperAdmin ? (
                            <select value={assign?.shiftCode || ''} onChange={(e) => updateShiftCode(u.uid, e.target.value)} className={`flex-1 text-xs border rounded p-1 shadow-sm text-center ${assign?.shiftCode ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold' : 'bg-white text-gray-500'}`}>
                                <option value="">未排班</option>
                                {shiftsDef.map(st => <option key={st.id} value={st.id}>{st.label}</option>)}
                            </select>
                        ) : (assign?.shiftCode ? (
                            <div className="flex-1 flex items-center justify-center text-xs bg-gray-100 text-gray-600 rounded font-mono border shadow-sm font-bold">班別: {shiftsDef.find(st=>st.id===assign.shiftCode)?.label || assign.shiftCode}</div>
                        ) : null)}

                        {otButtonUi}
                        <button onClick={() => canEditLeave ? setExpanded(expanded===u.uid?null:u.uid) : alert("無權限或已鎖定。")} className={`flex-1 py-2 text-xs rounded border shadow-sm ${!canEditLeave ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-600 hover:bg-gray-50 font-bold'}`}>請休假 ▼</button>
                    </div>

                    {expanded===u.uid && (
                      <div className="bg-gray-50 p-3 rounded-lg animate-fade-in border mt-2">
                        <div className="text-xs font-bold text-gray-600 mb-2 border-b pb-1">休假申請表</div>
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-xs text-gray-600 font-bold whitespace-nowrap">找人代班:</span>
                            <select id={`sub-select-${u.uid}`} className="text-xs border border-gray-300 rounded p-1.5 flex-1 bg-white shadow-sm focus:border-indigo-500 focus:outline-none"><option value="">-- 不需代班 --</option>{availableSubs.map(s => <option key={s.uid} value={s.uid}>{s.name}</option>)}</select>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            {leaves.map(lt => {
                                if (lt.id === 'official' && !isSuperAdmin) return null;
                                let limitReached = false; let limitMsg = "";
                                
                                const getLeaveCount = (leaveId, prefix) => {
                                    let count = 0; Object.keys(shifts).forEach(d => { if (d.startsWith(prefix) && d !== dateStr) { if (Array.isArray(shifts[d].assignments) && shifts[d].assignments.some(a => a.uid === u.uid && a.type === 'LEAVE' && a.leaveType === leaveId)) count++; } }); return count;
                                };

                                if (lt.id === 'menstrual') {
                                    if (getLeaveCount('menstrual', yearStr) >= 3) { limitReached = true; limitMsg = "生理假一年最多請 3 天！"; } else if (getLeaveCount('menstrual', monthStr) >= 1) { limitReached = true; limitMsg = "本月生理假已請過 1 天！"; }
                                } else if (lt.id === 'sick') { if (getLeaveCount('sick', yearStr) >= 30) { limitReached = true; limitMsg = "病假一年最多請 30 天！"; }
                                } else if (lt.id === 'personal') { if (getLeaveCount('personal', yearStr) >= 14) { limitReached = true; limitMsg = "事假一年最多請 14 天！"; }
                                } else if (lt.id === 'rostered') { 
                                    let totalRostered = 0; let weekendRostered = 0;
                                    Object.keys(shifts).forEach(d => {
                                        if (d.startsWith(monthStr) && d !== dateStr) {
                                            if (Array.isArray(shifts[d].assignments) && shifts[d].assignments.some(a => a.uid === u.uid && a.type === 'LEAVE' && a.leaveType === 'rostered')) {
                                                totalRostered++;
                                                const dObj = new Date(d);
                                                if (dObj.getDay() === 0 || dObj.getDay() === 6) weekendRostered++;
                                            }
                                        }
                                    });
                                    const targetDateObj = new Date(dateStr);
                                    const isTargetWeekend = targetDateObj.getDay() === 0 || targetDateObj.getDay() === 6;

                                    if (!isSuperAdmin) { 
                                        if (totalRostered >= 3) { limitReached = true; limitMsg = "本月自畫假已達 3 天上限！"; }
                                        else if (isTargetWeekend && weekendRostered >= 2) { limitReached = true; limitMsg = "本月假日(六日)畫假已達 2 天上限！"; }
                                    } 
                                }

                                const btnClass = limitReached ? (isSuperAdmin ? 'bg-orange-50 text-orange-700 border-orange-300 hover:bg-orange-100 shadow-sm' : 'bg-gray-100 text-gray-400 opacity-60 cursor-not-allowed') : (lt.id === 'rostered' || lt.id === 'official' ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 shadow-sm' : 'bg-white hover:bg-gray-100 shadow-sm');
                                return (
                                    <button key={lt.id} onClick={() => { if (limitReached) { if (isSuperAdmin) { if(!window.confirm(`⚠️ 警告：${u.name} 的${limitMsg}\n\n您具有管理員權限，是否要「強制核准」此假單？`)) return; } else { alert(`🚫 拒絕：${limitMsg}`); return; } } const subVal = document.getElementById(`sub-select-${u.uid}`).value; toggle(u.uid,'LEAVE',lt.id, subVal || null); }} className={`text-xs p-2 border rounded font-bold transition-all ${btnClass}`}>
                                        {limitReached && isSuperAdmin && <span className="mr-1">⚠️</span>}{lt.label}
                                    </button>
                                )
                            })}
                        </div>
                      </div>
                    )}
                  </div>
                );
            }
          })}
          <div className="border-t pt-3 mt-2"><div className="flex gap-2 items-center mb-1"><StickyNote className="w-4 h-4 text-gray-500" /><span className="text-xs font-bold text-gray-600">當日備註 (顯示於右上角紅點)</span></div><div className="flex gap-2"><input value={note} onChange={e=>setNote(e.target.value)} className="border flex-1 rounded px-2 py-1 text-sm" placeholder="例如: 衛生局檢查..."/><button onClick={()=>setDoc(doc(db,'artifacts',appId,'public', 'data', 'shifts',dateStr),{...dayData,note},{merge:true})} className="bg-indigo-600 text-white px-3 rounded"><Save size={16}/></button></div></div>
          {isSuperAdmin && !isClosed && <div className="pt-2 border-t mt-2"><button onClick={toggleClosed} className="w-full bg-gray-100 text-gray-600 text-xs py-2 rounded hover:bg-gray-200 flex items-center justify-center gap-1 font-bold"><Store className="w-3.5 h-3.5" /> 設為店休 (清空當日班表)</button></div>}
        </div>
      </div>
    </div>
    <OTModal isOpen={!!otModalData} onClose={()=>setOtModalData(null)} onConfirm={handleOTSave} modalData={otModalData} dateStr={dateStr} />
    </>
  );
};

// ==========================================
// 📊 統計明細 (SalaryView) - 包含年度報表
// ==========================================
const SalaryView = ({ users, shifts, currentDate, leaveTypes, currentUserInfo, isPrivileged }) => {
    const [targetMonth, setTargetMonth] = useState(`${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}`);
    
    const visibleUsers = useMemo(() => isPrivileged ? Object.values(users) : [currentUserInfo], [users, currentUserInfo, isPrivileged]);
  
    const calc = (uid) => {
      const targetYear = targetMonth.substring(0, 4);
      let monthStats = { ot: 0, leaves: {} };
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
              
              if(!yearStats.leaves[lType]) yearStats.leaves[lType] = { days: 0 };
              yearStats.leaves[lType].days += 1;
  
              if ((assign.useComp || lType === 'annual') && hrs > 0 && lType !== 'menstrual') {
                  yearStats.compHoursUsed += hrs;
                  otHistory.push({ date, hours: -hrs, reason: `使用「${typeInfo?.label || lType}」抵扣` });
              }
  
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
                  
                  <div className="bg-blue-50 p-2.5 rounded-lg border border-blue-200 mt-2">
                      <div className="text-[11px] font-bold text-blue-800 mb-1 flex items-center gap-1"><History size={12}/> 年度請假累計 (1/1~12/31)</div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-blue-700 font-bold">
                          <span>病假: <span className="text-lg">{s.yearStats.leaves['sick']?.days || 0}</span> 天 <span className="text-gray-400 text-[10px] font-normal">(上限30)</span></span>
                          <span>事假: <span className="text-lg">{s.yearStats.leaves['personal']?.days || 0}</span> 天 <span className="text-gray-400 text-[10px] font-normal">(上限14)</span></span>
                          <span>生理假: <span className="text-lg">{s.yearStats.leaves['menstrual']?.days || 0}</span> 天 <span className="text-gray-400 text-[10px] font-normal">(上限3)</span></span>
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
                  
                  {s.otHistory.length > 0 && (
                      <div className="mt-3 bg-white p-2 rounded border border-gray-200">
                          <div className="text-xs font-bold text-gray-500 mb-2 flex items-center gap-1"><History size={12}/> 加班/補休 歷年沖抵明細</div>
                          <div className="max-h-32 overflow-y-auto space-y-1">
                              {s.otHistory.map((h, i) => (
                                  <div key={i} className="flex justify-between items-center text-[11px] p-1.5 border-b border-gray-50 last:border-0 hover:bg-gray-50">
                                      <span className="text-gray-500 w-16">{h.date.substring(5)}</span>
                                      <span className={`font-bold w-12 text-right ${h.hours > 0 ? 'text-orange-600' : 'text-green-600'}`}>{h.hours > 0 ? `+${h.hours}` : h.hours} hr</span>
                                      <span className="text-gray-400 flex-1 ml-2 truncate">{h.reason}</span>
                                  </div>
                              ))}
                          </div>
                      </div>
                  )}
  
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
  
  // --- 薪資管理 (PayrollView) ---
  const PayrollView = ({ users, currentDate, db, appId }) => {
      const [targetMonth, setTargetMonth] = useState(`${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}`);
      const [payrollData, setPayrollData] = useState({});
      useEffect(() => { 
          const unsub = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'payrolls', targetMonth), (docSnap) => { 
              if (docSnap.exists()) setPayrollData(docSnap.data().records || {}); else setPayrollData({}); 
          }); 
          return () => unsub(); 
      }, [targetMonth, db, appId]);

      const updatePayroll = async (uid, field, value) => { 
          const newData = { ...payrollData, [uid]: { ...(payrollData[uid] || {}), [field]: value } }; 
          setPayrollData(newData); 
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'payrolls', targetMonth), { records: newData }, { merge: true }); 
      };
  
      return (
          <div className="space-y-4 pb-20">
              <div className="bg-white p-4 rounded-xl border flex justify-between items-center"><h2 className="font-bold flex gap-2 text-indigo-700"><DollarSign/> 薪資與福利管理 (機密)</h2><input type="month" value={targetMonth} onChange={e=>setTargetMonth(e.target.value)} className="border rounded px-2"/></div>
              <div className="bg-white rounded-xl border overflow-x-auto">
                  <table className="w-full text-sm text-left"><thead className="bg-gray-50 text-gray-500 font-bold border-b"><tr><th className="p-3">姓名</th><th className="p-3 w-24">本薪</th><th className="p-3 w-24">補助/津貼</th><th className="p-3 w-24 bg-pink-50 text-pink-700">生日禮金</th><th className="p-3 w-24 bg-purple-50 text-purple-700">三節獎金</th><th className="p-3 w-24 bg-yellow-50 text-yellow-700">年終獎金</th><th className="p-3">備註</th></tr></thead>
                  <tbody>{users.map(u => { 
                      const record = payrollData[u.uid] || {}; 
                      return (
                          <tr key={u.uid} className="border-b hover:bg-gray-50">
                              <td className="p-3 font-bold">{u.name}</td>
                              <td className="p-3"><input type="number" placeholder="0" className="w-full border rounded px-1" value={record.base || ''} onChange={e=>updatePayroll(u.uid, 'base', e.target.value)}/></td>
                              <td className="p-3"><input type="number" placeholder="0" className="w-full border rounded px-1" value={record.subsidy || ''} onChange={e=>updatePayroll(u.uid, 'subsidy', e.target.value)}/></td>
                              <td className="p-3 bg-pink-50"><input type="number" placeholder="0" className="w-full border rounded px-1" value={record.bonus_bday || ''} onChange={e=>updatePayroll(u.uid, 'bonus_bday', e.target.value)}/></td>
                              <td className="p-3 bg-purple-50"><input type="number" placeholder="0" className="w-full border rounded px-1" value={record.bonus_festival || ''} onChange={e=>updatePayroll(u.uid, 'bonus_festival', e.target.value)}/></td>
                              <td className="p-3 bg-yellow-50"><input type="number" placeholder="0" className="w-full border rounded px-1" value={record.bonus_year || ''} onChange={e=>updatePayroll(u.uid, 'bonus_year', e.target.value)}/></td>
                              <td className="p-3"><input type="text" placeholder="..." className="w-full border rounded px-1" value={record.note || ''} onChange={e=>updatePayroll(u.uid, 'note', e.target.value)}/></td>
                          </tr>
                      ); 
                  })}</tbody></table>
              </div>
          </div>
      );
  };
  
  // --- Settings View ---
  const SettingsView = ({ users, currentUserInfo, leaveTypes, shiftTypes, inventoryItems, appId, storeConfig, db, isSuperAdmin }) => {
    const userList = Object.values(users);
    
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
    
    const visibleUsers = useMemo(() => { 
        let list = userList; 
        if (!isSuperAdmin) list = list.filter(u => u.uid === currentUserInfo.uid); 
        else if (!showResigned) list = list.filter(u => !u.isResigned); 
        return list; 
    }, [userList, currentUserInfo, isSuperAdmin, showResigned]);
  
    return (
      <div className="space-y-6 pb-20">
        <div className="bg-white p-6 rounded-xl border shadow-sm text-center">
          <h2 className="font-bold text-xl">{currentUserInfo.name}</h2>
          <div className="mt-4 bg-green-50 p-3 rounded-lg border border-green-100 text-left">
              <h4 className="text-sm font-bold text-green-800 flex items-center gap-2"><Smartphone size={16}/> LINE 通知綁定</h4>
              <p className="text-xs text-gray-600 mb-2">請輸入 <span className="font-bold text-red-500">查ID</span> 的回傳代碼：</p>
              {editingId === currentUserInfo.uid ? (
                  <div className="flex gap-2">
                      <input value={formData.lineUserId || ''} onChange={e=>setFormData({...formData, lineUserId: e.target.value})} placeholder="Uxxxxxxxx..." className="border rounded px-2 py-1 text-xs flex-1"/>
                      <button onClick={saveUser} className="bg-green-600 text-white px-3 py-1 rounded text-xs">儲存</button>
                  </div>
              ) : (
                  <div className="flex justify-between items-center">
                      <span className="text-xs font-mono bg-white px-2 py-1 rounded border">{currentUserInfo.lineUserId ? '✅ 已綁定' : '❌ 未綁定'}</span>
                      <button onClick={()=>{setEditingId(currentUserInfo.uid); setFormData(currentUserInfo)}} className="text-green-600 text-xs underline">修改</button>
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
           <div className="flex justify-between items-center mb-3"><h3 className="font-bold flex gap-2"><Users size={18}/> 員工角色與資料</h3>{isSuperAdmin && (<label className="text-xs flex items-center gap-1 text-gray-500 cursor-pointer"><input type="checkbox" checked={showResigned} onChange={e=>setShowResigned(e.target.checked)} />顯示已離職</label>)}</div>
           {visibleUsers.map(u => (
             <div key={u.uid} className={`border-b py-3 last:border-0 ${u.isResigned ? 'opacity-50 bg-gray-50' : ''}`}>
               {editingId === u.uid ? (
                 <div className="space-y-3 p-3 bg-gray-50 rounded">
                   <div className="grid grid-cols-2 gap-2">
                       <div><label className="text-xs text-gray-500">姓名</label><input value={formData.name} onChange={e=>setFormData({...formData, name:e.target.value})} className="w-full border p-2 rounded"/></div>
                       {isSuperAdmin && (<div><label className="text-xs text-gray-500">在職狀態</label><select value={formData.isResigned ? 'true' : 'false'} onChange={e=>setFormData({...formData, isResigned: e.target.value === 'true'})} className="w-full border p-2 rounded bg-white"><option value="false">在職中</option><option value="true">已離職</option></select></div>)}
                   </div>

                   {/* 🔴 傳統三級角色設定 */}
                   {isSuperAdmin && (
                        <div className="p-3 bg-indigo-50 rounded border border-indigo-100">
                            <label className="text-xs font-bold text-indigo-700 mb-2 block">系統角色指派 (RBAC)</label>
                            <select value={formData.isAdmin ? 'admin' : (formData.isManager ? 'manager' : 'employee')} onChange={e=>{
                                const val = e.target.value;
                                setFormData({...formData, isAdmin: val==='admin', isManager: val==='manager'});
                            }} className="w-full border-2 border-indigo-200 p-2 rounded bg-white font-bold text-indigo-800">
                                <option value="employee">一般員工 (僅能操作個人功能)</option>
                                <option value="manager">主管 Manager (可看報表/審核排班)</option>
                                <option value="admin">最高管理員 Admin (擁有所有權限)</option>
                            </select>
                        </div>
                   )}

                   {isSuperAdmin && (<div className="space-y-2 border-t pt-2 mt-2"><div className="text-xs font-bold text-indigo-600 flex items-center gap-1"><Lock size={10}/> 敏感資料</div><div className="grid grid-cols-2 gap-2"><input placeholder="到職日 (YYYY-MM-DD)" value={formData.startDate || ''} onChange={e=>setFormData({...formData, startDate:e.target.value})} className="border p-2 rounded text-sm"/><input placeholder="電話" value={formData.phone || ''} onChange={e=>setFormData({...formData, phone:e.target.value})} className="border p-2 rounded text-sm"/><input placeholder="出生年月日" value={formData.birthday || ''} onChange={e=>setFormData({...formData, birthday:e.target.value})} className="border p-2 rounded text-sm"/><input placeholder="身分證字號" value={formData.nationalId || ''} onChange={e=>setFormData({...formData, nationalId:e.target.value})} className="border p-2 rounded text-sm"/></div><div><label className="text-xs text-gray-500 block mb-1">銀行存摺封面</label><div className="flex items-center gap-2"><label className="cursor-pointer bg-white border border-gray-300 text-gray-600 px-3 py-1.5 rounded text-xs hover:bg-gray-50 flex items-center gap-1"><Upload size={12}/> 上傳圖片<input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" /></label>{formData.bankImage && <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 size={12}/> 已選取</span>}</div>{formData.bankImage && (<img src={formData.bankImage} alt="Bank" className="mt-2 h-20 object-contain border rounded bg-white" />)}</div></div>)}
                   <div className="flex gap-2 justify-end mt-2"><button onClick={()=>setEditingId(null)} className="px-3 py-1 bg-gray-200 rounded">取消</button><button onClick={saveUser} className="px-3 py-1 bg-indigo-600 text-white rounded">儲存</button></div>
                 </div>
               ) : (
                 <div className="flex justify-between items-center">
                     <div>
                         <div className="font-bold flex items-center gap-2">
                             {u.name}
                             {u.isAdmin ? <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded">管理員</span> : u.isManager ? <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">主管</span> : <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">員工</span>}
                             {u.isResigned && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded flex items-center gap-0.5"><UserX size={10}/> 已離職</span>}
                         </div>
                         {isSuperAdmin && u.startDate && <div className="text-xs text-gray-400">到職: {u.startDate}</div>}
                     </div>
                     {(isSuperAdmin || u.uid === currentUserInfo.uid) && <button onClick={()=>{setEditingId(u.uid);setFormData(u)}} className="text-indigo-600 text-sm font-bold">編輯資料</button>}
                 </div>
               )}
             </div>
           ))}
        </div>
      </div>
    );
  };
  