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
// 🚀 系統設定與 Firebase 初始化
// ==========================================
const CURRENT_VERSION = "v7.3 (Stable Unified Edition)"; 
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
// 🛠️ 共用輔助函式與常數
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

const hasPerm = (userObj, permKey) => {
    if (!userObj) return false;
    if (userObj.email === ADMIN_EMAIL) return true; 
    if (userObj.isAdmin) return true; 
    return !!userObj.permissions?.[permKey];
};

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
  { id: 'i6', category: '果汁與糖漿', name: '梅果漿', spec: '包', price: 165 },
  { id: 'i11', category: '奶與粉類', name: '鮮奶', spec: '罐', price: 68 },
  { id: 'i14', category: '配料與包材', name: '大吸管(12mm)', spec: '包', price: 0 }
];

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
// 🌟 1. 系統主程式 (Main App) - Vite 進入點
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
        const handleClickOutside = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setMenuOpen(false); };
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
                if (!users[user.uid]) {
                    setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', user.uid), { 
                        uid: user.uid, name: user.displayName || `員工`, email: user.email, isAdmin: false, isManager: false, isResigned: false
                    });
                }
                setDbData(prev => ({...prev, users}));
            }),
            onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'shifts'), snap => {
                const shifts = {}; snap.forEach(doc => shifts[doc.id] = doc.data()); 
                setDbData(prev => ({...prev, shifts}));
            }),
            onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), snap => {
                const requests = []; let newCount = 0;
                snap.forEach(doc => { 
                    const d = doc.data(); requests.push({ id: doc.id, ...d }); 
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
                const events = []; snap.forEach(doc => events.push({ id: doc.id, ...doc.data() })); 
                setDbData(prev => ({...prev, events}));
            }),
            onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'signatures'), snap => {
                const signatures = []; snap.forEach(doc => signatures.push({ id: doc.id, ...doc.data() })); 
                setDbData(prev => ({...prev, signatures}));
            })
        ];
        return () => unsub.forEach(fn => fn());
    }, [user]);
  
    const { users, shifts, events, requests, leaves, shiftsDef, inventory, store, signatures } = dbData;
    const currentUserInfo = users[user?.uid] || {};
    
    // 傳統權限
    const isSuperAdmin = currentUserInfo.isAdmin || user?.email === ADMIN_EMAIL;
    const isManager = currentUserInfo.isManager || false;
    const isPrivileged = isSuperAdmin || isManager;
    
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
            if(idx >= 0) assigns[idx] = { ...assigns[idx], ...newEntry }; else assigns.push({ uid: (req.uid || req.fromUid), type: 'WORK', ...newEntry });
            await setDoc(shiftRef, { ...(shiftSnap.exists() ? shiftSnap.data() : {}), assignments: assigns }, { merge: true });
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.id));
            alert("已核准並寫入統計！");
        } 
        else if (req.type === 'swap') {
            const shiftRef = doc(db, 'artifacts', appId, 'public', 'data', 'shifts', req.date);
            const shiftSnap = await getDoc(shiftRef);
            if (shiftSnap.exists() && Array.isArray(shiftSnap.data().assignments)) {
                const assigns = [...shiftSnap.data().assignments];
                const idxA = assigns.findIndex(a => a.uid === req.fromUid); const idxB = assigns.findIndex(a => a.uid === req.toUid);
                if (idxA >= 0 && idxB >= 0) {
                    const temp = { ...assigns[idxA], uid: req.toUid }; assigns[idxA] = { ...assigns[idxB], uid: req.fromUid }; assigns[idxB] = temp;
                    await updateDoc(shiftRef, { assignments: assigns }); await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.id));
                    alert("換假成功！");
                } else { alert("班表已變更，無法換假"); await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.id)); }
            }
        }
    };
  
    if (loading) return <div className="flex h-screen items-center justify-center">載入中...</div>;
    
    if (!user) return (
        <div className="flex h-screen items-center justify-center bg-gray-50">
            <div className="bg-white p-8 rounded-xl shadow-lg text-center">
                <h1 className="text-2xl font-bold mb-4 text-indigo-600">TeamShift 雲端系統</h1>
                <button onClick={()=>signInWithPopup(auth, new GoogleAuthProvider())} className="border px-6 py-2 rounded shadow hover:bg-gray-50 font-bold">Google 登入</button>
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
                      <Settings className="w-4 h-4" /> <span className="hidden xs:inline">管理</span><ChevronDown className="w-3 h-3" />
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
                  <Bell className="w-5 h-5" />{myNotifications.length > 0 && <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 border border-white rounded-full"></span>}
              </button>
              <button onClick={()=>window.confirm("確定登出？")&&signOut(auth)} className="p-2 text-gray-400 hover:text-red-500"><LogOut className="w-5 h-5"/></button>
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
                  <div className="bg-white p-4 rounded-xl border flex items-center gap-2"><Bell className="text-indigo-600"/><h2 className="font-bold text-lg">通知中心</h2></div>
                  {myNotifications.length === 0 ? (
                      <div className="text-center py-10 text-gray-400">目前沒有通知</div>
                  ) : (
                      myNotifications.map(req => (
                          <div key={req.id} className="bg-white p-4 rounded-xl border border-l-4 border-l-indigo-500 shadow-sm mb-3">
                              <h3 className="font-bold text-gray-800">單據審核</h3>
                              <p className="text-sm">申請人：{users[req.uid || req.fromUid]?.name} | 日期：{req.date}</p>
                              <div className="bg-gray-50 p-2 my-2 text-sm rounded font-bold text-indigo-800">{req.hours > 0 ? '加班' : '補休'} {Math.abs(req.hours)} 小時 ({req.reason})</div>
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
// 🌟 2. 各子畫面模組 (Views)
// ==========================================
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
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
                <div className="bg-indigo-600 p-4 text-white flex justify-between items-center"><h3 className="font-bold flex items-center gap-2"><Clock className="w-5 h-5"/> 加班 / 補休申請</h3><button onClick={onClose} className="hover:bg-indigo-700 p-1 rounded"><X size={20}/></button></div>
                <div className="p-6 space-y-4">
                    <div className="text-sm text-gray-500">正在編輯 <span className="font-bold text-gray-800">{user?.name}</span> 於 <span className="font-bold text-gray-800">{dateStr}</span> 的時數</div>
                    <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100 flex justify-between items-center"><span className="text-sm font-bold text-indigo-900">本年度剩餘可休：</span><span className={`text-lg font-bold ${balance < 0 ? 'text-red-600' : 'text-green-600'}`}>{balance} hr</span></div>
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">增減時數 (小時)</label><input type="number" autoFocus value={hours} onChange={e=>setHours(e.target.value)} placeholder="加班正數，補休負數" className={`w-full border-2 rounded-lg px-3 py-2 text-lg font-bold ${isExceeding ? 'border-red-300 text-red-600 bg-red-50' : 'border-indigo-100 text-gray-700 focus:border-indigo-500'}`}/>{isExceeding && <p className="text-[11px] font-bold text-red-600 mt-1">⚠️ 申請補休大於剩餘時數，將扣薪！</p>}</div>
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">事由 / 備註</label><input type="text" value={reason} onChange={e=>setReason(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-indigo-500"/></div>
                    <div className="flex gap-3 pt-2"><button onClick={onClose} className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-lg font-bold hover:bg-gray-200">取消</button><button onClick={() => { if(hours === '') return alert("請輸入時數"); onConfirm(parseFloat(hours), reason); }} className="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg font-bold hover:bg-indigo-700">送出</button></div>
                </div>
            </div>
        </div>
    );
};

const CompanyEventModal = ({ isOpen, onClose, eventData, onSave, onDelete }) => {
    const [formData, setFormData] = useState({ title: '', startDate: '', time: '', repeatType: 'none', note: '' });
    useEffect(() => { if(isOpen && eventData) setFormData(eventData); }, [isOpen, eventData]);
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
                <div className="bg-purple-600 p-4 text-white flex justify-between items-center"><h3 className="font-bold flex items-center gap-2"><Megaphone className="w-5 h-5"/> 公司行程備忘錄</h3><button onClick={onClose} className="hover:bg-purple-700 p-1 rounded"><X size={20}/></button></div>
                <div className="p-6 space-y-4">
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">標題 <span className="text-red-500">*</span></label><input type="text" value={formData.title} onChange={e=>setFormData({...formData, title: e.target.value})} className="w-full border rounded-lg px-3 py-2"/></div>
                    <div className="grid grid-cols-2 gap-3"><div><label className="block text-xs font-bold text-gray-700 mb-1">日期</label><input type="date" value={formData.startDate} onChange={e=>setFormData({...formData, startDate: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm"/></div><div><label className="block text-xs font-bold text-gray-700 mb-1">時間</label><input type="time" value={formData.time} onChange={e=>setFormData({...formData, time: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm"/></div></div>
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">重複</label><select value={formData.repeatType} onChange={e=>setFormData({...formData, repeatType: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">{Object.entries(REPEAT_LABELS).map(([val, label]) => <option key={val} value={val}>{label}</option>)}</select></div>
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">備註 (選填)</label><textarea value={formData.note || ''} onChange={e=>setFormData({...formData, note: e.target.value})} rows="2" className="w-full border rounded-lg px-3 py-2 text-sm"></textarea></div>
                    <div className="flex gap-3 pt-4 border-t">{formData.id && <button onClick={()=>onDelete(formData.id)} className="p-2.5 text-red-500 bg-red-50 rounded-lg"><Trash2 size={18}/></button>}<button onClick={onClose} className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-lg font-bold">取消</button><button onClick={() => { if(!formData.title) return alert("請輸入標題"); onSave(formData); }} className="flex-1 bg-purple-600 text-white py-2.5 rounded-lg font-bold">儲存</button></div>
                </div>
            </div>
        </div>
    );
};

const SignModal = ({ formType, onClose, currentUserInfo, db, appId }) => {
    const [agree, setAgree] = useState(false);
    const [origDate, setOrigDate] = useState('');
    const [newDate, setNewDate] = useState('');

    const handleSubmit = async () => {
        if (!agree) return alert("請必須勾選最下方的同意選項才能送出！");
        if (formType === 'holiday' && (!origDate || !newDate)) return alert("請選擇完整的原假日與調移日期！");
        const docData = { uid: currentUserInfo.uid, userName: currentUserInfo.name, formType, formName: formType === 'holiday' ? '國定假日調移同意書' : '員工保密與工作守則同意書', agreedAt: Date.now(), customData: formType === 'holiday' ? { origDate, newDate } : {} };
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'signatures'), docData);
        alert("✅ 簽署完成！表單已送出保存。");
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[80] p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                <div className="bg-gray-800 p-4 text-white flex justify-between items-center"><h3 className="font-bold">{formType === 'holiday' ? '填寫：國定假日調移同意書' : '填寫：工作規則與保密同意書'}</h3><button onClick={onClose}><X size={20}/></button></div>
                <div className="p-6 overflow-y-auto flex-1 space-y-4">
                    {formType === 'holiday' && (
                        <div className="bg-orange-50 p-4 rounded-lg border border-orange-200 mb-4 space-y-3">
                            <h4 className="font-bold text-orange-800">請設定調移日期：</h4>
                            <div className="flex items-center gap-2"><label className="text-sm font-bold text-gray-700 w-20">原國定假日</label><input type="date" value={origDate} onChange={e=>setOrigDate(e.target.value)} className="border rounded px-2 py-1.5 flex-1 text-sm"/></div>
                            <div className="flex items-center gap-2"><label className="text-sm font-bold text-gray-700 w-20">調移至日期</label><input type="date" value={newDate} onChange={e=>setNewDate(e.target.value)} className="border rounded px-2 py-1.5 flex-1 text-sm"/></div>
                        </div>
                    )}
                    <div className="border border-gray-300 rounded-lg p-4 bg-gray-50 h-64 overflow-y-auto text-sm text-gray-700 leading-relaxed shadow-inner">
                        {formType === 'holiday' ? (
                            <><h4 className="font-bold text-center text-lg mb-4 text-gray-900">國定假日調移同意書</h4><p>立同意書人 <strong>{currentUserInfo.name}</strong> 茲同意雇主依勞動基準法第37條及相關施行細則規定，將原定之國定假日調移至其他工作日。</p><br/><p>雙方約定調移明細如下：</p><ul className="list-disc pl-5 my-2 space-y-1 font-bold text-indigo-700"><li>原定國定假日：{origDate || '【尚未選擇】'}</li><li>同意調移日期：{newDate || '【尚未選擇】'}</li></ul><p>說明與約定事項：</p><ol className="list-decimal pl-5 space-y-2 mt-2"><li>調移後之「原國定假日」即轉為「正常工作日」，立同意書人於該日出勤，雇主無須另加給工資。</li><li>調移後之「調移日」即轉為「休假日」，立同意書人於該日依法享有休假。如因業務需求須於該日出勤，雇主將依勞動基準法第39條規定發給出勤加倍工資。</li><li>本同意書經雙方確認簽署後生效，立書人已充分了解上述權益。</li></ol></>
                        ) : (
                            <><h4 className="font-bold text-center text-lg mb-4 text-gray-900">員工工作規則與機密保密同意書</h4><p>立同意書人 <strong>{currentUserInfo.name}</strong> 受雇於本公司，茲同意遵守以下規定：</p><ol className="list-decimal pl-5 space-y-2 mt-2"><li>本人同意嚴格遵守公司所訂定之各項工作規則、排班制度與請假辦法。</li><li>本人於任職期間及離職後，對於因職務上所知悉之公司營業機密、配方、客戶資料、財務資訊等，均負有絕對保密之義務。</li><li>未經公司書面授權，絕不以任何形式將上述機密資訊洩漏、交付或移轉予任何第三人。</li><li>若因本人違反本同意書之約定，致公司受有損害時，本人願負擔一切法律責任及損害賠償。</li><li>本同意書自線上勾選同意送出後即刻生效。</li></ol></>
                        )}
                    </div>
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 cursor-pointer hover:bg-blue-100 transition-colors" onClick={()=>setAgree(!agree)}>
                        <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={agree} onChange={()=>setAgree(!agree)} className="w-5 h-5 accent-blue-600 cursor-pointer"/><span className="font-bold text-blue-900">本人已詳細審閱、充分了解且同意上述條款，並以打勾作為電子簽名。</span></label>
                    </div>
                </div>
                <div className="p-4 border-t bg-gray-50 flex gap-3"><button onClick={onClose} className="flex-1 bg-white border border-gray-300 text-gray-600 py-3 rounded-lg font-bold hover:bg-gray-100">取消返回</button><button onClick={handleSubmit} className={`flex-1 py-3 rounded-lg font-bold shadow-lg transition-colors ${agree ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}>送出簽署表單</button></div>
            </div>
        </div>
    );
};

// ==========================================
// 📦 庫存盤點頁面 (InventoryView)
// ==========================================
const InventoryView = ({ db, appId, inventoryItems }) => {
    const items = Array.isArray(inventoryItems) && inventoryItems.length > 0 ? inventoryItems : [];
    const categories = useMemo(() => [...new Set(items.map(i => i.category))], [items]);
    const [activeTab, setActiveTab] = useState(categories[0] || '');
    const [records, setRecords] = useState({});
    
    const filteredItems = items.filter(i => i.category === activeTab);

    const totalValue = useMemo(() => {
        return items.reduce((sum, item) => sum + ((records[item.id] || 0) * item.price), 0);
    }, [items, records]);

    if (items.length === 0) {
        return (
            <div className="max-w-2xl mx-auto pb-20 text-center mt-10">
                <Package size={64} className="mx-auto text-gray-300 mb-4" />
                <h2 className="text-xl font-bold text-gray-600">目前尚無庫存品項</h2>
                <p className="text-gray-500 mt-2">請使用管理員帳號，前往系統設定新增庫存品項。</p>
            </div>
        )
    }

    const handleCountChange = (id, delta) => { setRecords(prev => { const current = prev[id] || 0; return { ...prev, [id]: Math.max(0, current + delta) }; }); };
    const handleInputChange = (id, val) => { const num = parseFloat(val); if(!isNaN(num) && num >= 0) { setRecords(prev => ({ ...prev, [id]: num })); } else if (val === '') { const newRecs = {...records}; delete newRecs[id]; setRecords(newRecs); } };

    const handleSave = async () => {
        if (Object.keys(records).length === 0) return alert("尚未填寫任何盤點數量！");
        if (window.confirm("確定要送出今日盤點結果嗎？\n\n送出後畫面將自動重置為 0。")) {
            const todayStr = new Date().toISOString().split('T')[0];
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventoryRecords', todayStr), { date: todayStr, timestamp: Date.now(), data: records }, { merge: true });
            alert("✅ 盤點資料已成功儲存至雲端！"); setRecords({}); 
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
                    <div className="flex gap-2"><button onClick={handleExportCSV} className="bg-green-50 text-green-700 border border-green-200 px-3 py-2 rounded-lg font-bold shadow-sm hover:bg-green-100 flex items-center gap-1"><Download size={16}/><span className="hidden sm:inline">匯出</span></button><button onClick={handleSave} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-indigo-700 flex items-center gap-1"><Save size={16}/> 送出</button></div>
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
const ClockView = ({ currentUser, currentUserInfo, storeConfig, db, appId }) => {
    const [currentTime, setCurrentTime] = useState(new Date());
    const [location, setLocation] = useState(null);
    const [distance, setDistance] = useState(null);
    const [locError, setLocError] = useState('');
    const [isPunching, setIsPunching] = useState(false);

    useEffect(() => { const timer = setInterval(() => setCurrentTime(new Date()), 1000); return () => clearInterval(timer); }, []);

    const fetchLocation = () => {
        setLocError(''); setLocation(null); setDistance(null);
        if (!navigator.geolocation) { setLocError('不支援定位'); return; }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude; const lng = pos.coords.longitude; setLocation({ lat, lng });
                if (storeConfig && storeConfig.lat && storeConfig.lng) { setDistance(getDistance(lat, lng, storeConfig.lat, storeConfig.lng)); }
            },
            (err) => { setLocError(err.code === 1 ? '請允許權限' : '定位失敗'); },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
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
            
            if (!snap.exists()) { await setDoc(docRef, { records: [newRecord] }); } 
            else { await updateDoc(docRef, { records: arrayUnion(newRecord) }); }
            
            alert(`${type === 'IN' ? '上班' : '下班'}打卡成功！`); fetchLocation(); 
        } catch (e) { alert("打卡失敗"); }
        setIsPunching(false);
    };

    const isWithinRange = distance !== null && storeConfig && distance <= (storeConfig.radius || 50);

    return (
        <div className="max-w-md mx-auto bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 mt-4">
            <div className="bg-indigo-600 p-6 text-center text-white relative">
                <h2 className="text-xl font-bold opacity-90 mb-2">現在時間</h2>
                <div className="text-5xl font-mono font-bold tracking-wider drop-shadow-md">
                    {String(currentTime.getHours()).padStart(2,'0')}:{String(currentTime.getMinutes()).padStart(2,'0')}
                    <span className="text-2xl ml-1 opacity-75">:{String(currentTime.getSeconds()).padStart(2,'0')}</span>
                </div>
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
            <div className="bg-white p-4 rounded-xl border flex justify-between items-center shadow-sm">
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

// ==========================================
// 📝 表單簽署中心 (FormsView)
// ==========================================
const FormsView = ({ users, currentUserInfo, db, appId, isPrivileged, signatures }) => {
    const [activeTab, setActiveTab] = useState('fill'); 
    const [signModal, setSignModal] = useState(null); 

    const userSignatures = signatures.filter(s => s.uid === currentUserInfo.uid);

    return (
        <div className="max-w-4xl mx-auto space-y-4 pb-20">
            <div className="bg-white p-4 rounded-xl border flex justify-between items-center shadow-sm">
                <h2 className="font-bold text-lg text-indigo-700 flex items-center gap-2"><FileSignature/> 表單與同意書簽署</h2>
            </div>

            <div className="flex gap-2 border-b pb-2">
                <button onClick={()=>setActiveTab('fill')} className={`px-4 py-2 font-bold rounded-t-lg ${activeTab==='fill'?'text-indigo-600 border-b-2 border-indigo-600':'text-gray-500'}`}>📝 填寫表單</button>
                {isPrivileged && <button onClick={()=>setActiveTab('records')} className={`px-4 py-2 font-bold rounded-t-lg ${activeTab==='records'?'text-indigo-600 border-b-2 border-indigo-600':'text-gray-500'}`}>🗂️ 簽署紀錄後台</button>}
            </div>

            {activeTab === 'fill' && (
                <div className="grid sm:grid-cols-2 gap-4">
                    <div className="bg-white p-5 rounded-xl border shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-2 mb-2 text-orange-600"><Calendar size={20}/><h3 className="font-bold text-lg">國定假日調移同意書</h3></div>
                        <p className="text-sm text-gray-500 mb-4 h-10">依法將特定國定假日調移至其他工作日之同意書填寫。</p>
                        <button onClick={()=>setSignModal('holiday')} className="w-full bg-orange-50 text-orange-600 font-bold py-2 rounded-lg border border-orange-200 hover:bg-orange-100">填寫與簽名</button>
                        <div className="mt-3 text-xs text-gray-400">您已簽署過 {userSignatures.filter(s=>s.formType==='holiday').length} 份</div>
                    </div>
                    <div className="bg-white p-5 rounded-xl border shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-2 mb-2 text-indigo-600"><FileText size={20}/><h3 className="font-bold text-lg">員工工作規則與保密同意書</h3></div>
                        <p className="text-sm text-gray-500 mb-4 h-10">新進員工或年度工作規範及業務機密保密協定。</p>
                        <button onClick={()=>setSignModal('nda')} className="w-full bg-indigo-50 text-indigo-600 font-bold py-2 rounded-lg border border-indigo-200 hover:bg-indigo-100">填寫與簽名</button>
                        <div className="mt-3 text-xs text-gray-400">{userSignatures.some(s=>s.formType==='nda') ? '✅ 您已簽署' : '⚠️ 尚未簽署'}</div>
                    </div>
                </div>
            )}

            {activeTab === 'records' && isPrivileged && (
                <div className="bg-white rounded-xl border overflow-hidden shadow-sm">
                    <div className="p-4 bg-gray-50 border-b font-bold text-gray-700">全體員工簽署紀錄清單</div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-100 text-gray-600">
                                <tr><th className="p-3">簽署時間</th><th className="p-3">員工</th><th className="p-3">表單名稱</th><th className="p-3">詳細內容 / 調移日期</th></tr>
                            </thead>
                            <tbody>
                                {signatures.sort((a,b)=>b.agreedAt-a.agreedAt).map(sig => (
                                    <tr key={sig.id} className="border-b hover:bg-gray-50">
                                        <td className="p-3 text-gray-500">{new Date(sig.agreedAt).toLocaleString()}</td>
                                        <td className="p-3 font-bold text-indigo-600">{sig.userName}</td>
                                        <td className="p-3 font-bold">{sig.formName}</td>
                                        <td className="p-3 text-xs">
                                            {sig.formType === 'holiday' ? 
                                                <span className="bg-orange-50 text-orange-700 px-2 py-1 rounded border border-orange-200">
                                                    原假日: {sig.customData?.origDate} ➡️ 調移至: {sig.customData?.newDate}
                                                </span> 
                                            : <span className="text-green-600 font-bold">✅ 已同意工作與保密條款</span>}
                                        </td>
                                    </tr>
                                ))}
                                {signatures.length === 0 && <tr><td colSpan="4" className="p-8 text-center text-gray-400">目前尚無任何簽署紀錄</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};