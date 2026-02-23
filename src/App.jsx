import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, updateDoc, getDoc, addDoc, deleteDoc, arrayUnion } from 'firebase/firestore';
import { Calendar, Users, ChevronLeft, ChevronRight, Save, ShieldAlert, Plus, Trash2, BookOpen, LogOut, CheckCircle2, Lock, Eye, Clock, Store, Bell, ArrowRightLeft, FileBarChart, UserX, Upload, ListFilter, History, StickyNote, DollarSign, Gift, Megaphone, Send, Smartphone, X, Inbox, Repeat, MapPin, Fingerprint, Map } from 'lucide-react';

// ==========================================
// 🚀 系統設定
// ==========================================
const CURRENT_VERSION = "v5.1 (Shifts & Attendance)"; 

const UPDATE_LOGS = [
  { version: "v5.1", date: "2026-02-23", content: "差勤升級：新增「班別」排班功能(可設定上下班時間)；出勤報表會自動比對班別，標示「遲到/早退」；移除打卡LINE通知以防洗版。" },
  { version: "v5.0", date: "2026-02-23", content: "大版本更新：新增「GPS 雲端打卡」功能。" }
];

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

// 🔴 新增：預設班別設定
const DEFAULT_SHIFT_TYPES = [
  { id: '09A', label: '09A', start: '09:00', end: '17:30' },
  { id: '09O', label: '09O', start: '09:00', end: '21:00' }
];

const USER_COLORS = ['bg-yellow-100 text-yellow-900 border-yellow-300', 'bg-blue-100 text-blue-900 border-blue-300', 'bg-green-100 text-green-900 border-green-300', 'bg-purple-100 text-purple-900 border-purple-300', 'bg-orange-100 text-orange-900 border-orange-300', 'bg-pink-100 text-pink-900 border-pink-300', 'bg-teal-100 text-teal-900 border-teal-300', 'bg-red-100 text-red-900 border-red-300'];
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
    
    useEffect(() => { 
        if(isOpen && modalData) { setHours(modalData.initialHours || ''); setReason(modalData.initialReason || ''); } 
    }, [isOpen, modalData]);

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

// --- 主程式 ---
export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('calendar'); 
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState({});
  const [shifts, setShifts] = useState({});
  const [companyEvents, setCompanyEvents] = useState([]);
  const [requests, setRequests] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState(DEFAULT_LEAVE_TYPES);
  const [shiftTypes, setShiftTypes] = useState(DEFAULT_SHIFT_TYPES); // 🔴 新增：班別狀態
  const [storeConfig, setStoreConfig] = useState(null); 
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    if (!auth) { setLoading(false); return; }
    const unsubscribe = onAuthStateChanged(auth, (u) => { setUser(u); setLoading(false); });
    return () => unsubscribe();
  }, []);

  useEffect(() => { if ('Notification' in window && Notification.permission !== 'granted') Notification.requestPermission(); }, []);

  useEffect(() => {
    if (!user || !db) return;
    const unsubUsers = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'users'), (snap) => {
      const d = {}; snap.forEach(doc => d[doc.id] = doc.data());
      setUsers(d);
      if (!d[user.uid]) { setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', user.uid), { uid: user.uid, name: user.displayName || `員工`, email: user.email, isAdmin: Object.keys(d).length === 0, isResigned: false }); }
    });
    const unsubShifts = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'shifts'), (snap) => {
      const d = {}; snap.forEach(doc => d[doc.id] = doc.data()); setShifts(d);
    });
    const unsubRequests = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), (snap) => {
      const list = []; let newCount = 0;
      snap.forEach(doc => {
          const data = doc.data(); list.push({ id: doc.id, ...data });
          if (data.timestamp && (new Date() - data.timestamp.toDate()) < 10000) newCount++;
      });
      setRequests(list);
      if (newCount > 0 && Notification.permission === 'granted' && document.hidden) new Notification("TeamShift 通知", { body: `您有 ${newCount} 筆新的申請待處理！` });
    });
    const unsubSettings = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'leaves'), (snap) => {
      if (snap.exists()) setLeaveTypes(snap.data().types || DEFAULT_LEAVE_TYPES);
    });
    const unsubShiftSettings = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'shiftTypes'), (snap) => {
      if (snap.exists()) setShiftTypes(snap.data().types || DEFAULT_SHIFT_TYPES);
    });
    const unsubEvents = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'companyEvents'), (snap) => {
      const list = []; snap.forEach(doc => list.push({ id: doc.id, ...doc.data() })); setCompanyEvents(list);
    });
    const unsubStore = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'storeLocation'), (snap) => {
      if (snap.exists()) setStoreConfig(snap.data());
    });

    return () => { unsubUsers(); unsubShifts(); unsubRequests(); unsubSettings(); unsubShiftSettings(); unsubEvents(); unsubStore(); };
  }, [user]);

  useEffect(() => {
    if (!companyEvents.length || Object.keys(users).length === 0) return;
    const checkAndNotifyEvents = async () => {
        const date = new Date();
        const localTodayStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const todaysEvents = companyEvents.filter(e => checkEventOnDate(e, localTodayStr));
        for (const event of todaysEvents) {
            const notifyId = `${localTodayStr}_${event.id}`;
            const notifyRef = doc(db, 'artifacts', appId, 'public', 'data', 'notifications', notifyId);
            const snap = await getDoc(notifyRef);
            if (!snap.exists()) {
                await setDoc(notifyRef, { sentAt: new Date() });
                const allLineIds = Object.values(users).map(u => u.lineUserId).filter(id => id);
                if(allLineIds.length > 0) {
                    const msg = `🔔【公司重要通知】\n📌 ${event.title}\n📅 日期：${localTodayStr}${event.time ? `\n⏰ 時間：${event.time}` : ''}${event.note ? `\n📝 備註：${event.note}` : ''}`;
                    sendLineNotification(allLineIds, msg);
                }
            }
        }
    };
    checkAndNotifyEvents();
  }, [companyEvents, users]);

  const handleLogin = async () => { try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { alert("登入失敗: " + e.message); } };
  const handleLogout = () => { if(window.confirm("確定要登出系統嗎？")) { signOut(auth); } };

  const handleRequest = async (req, action) => {
      const targetUser = users[req.uid || req.fromUid]; 
      const targetLineId = targetUser?.lineUserId;
  
      if (action === 'reject') {
          await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.id));
          if(targetLineId) sendLineNotification([targetLineId], `❌ 您的申請 (${req.date}) 已被駁回。您可於班表上重新申請。`);
          return;
      }
  
      if (req.type === 'ot_confirm') {
          const shiftRef = doc(db, 'artifacts', appId, 'public', 'data', 'shifts', req.date);
          const shiftSnap = await getDoc(shiftRef);
          const data = shiftSnap.exists() ? shiftSnap.data() : { assignments: [] };
          let assignments = data.assignments || [];
          let userFound = false;
  
          const newAssigns = assignments.map(a => {
              if (a.uid === req.uid) { userFound = true; return { ...a, otHours: req.hours, otReason: req.reason, otConfirmed: true }; }
              return a;
          });
          if (!userFound) newAssigns.push({ uid: req.uid, type: 'WORK', otHours: req.hours, otReason: req.reason, otConfirmed: true });
          await setDoc(shiftRef, { ...data, assignments: newAssigns }, { merge: true });
          await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.id));
          
          const actionType = req.hours > 0 ? '加班' : '補休';
          if(targetLineId) sendLineNotification([targetLineId], `✅ 您的 ${actionType} 時數 (${req.date} / ${Math.abs(req.hours)}hr) 已確認並生效！`);
          alert("時數已確認並寫入統計！");
      } 
      else if (req.type === 'admin_ot_approve') {
          const shiftRef = doc(db, 'artifacts', appId, 'public', 'data', 'shifts', req.date);
          const shiftSnap = await getDoc(shiftRef);
          const data = shiftSnap.exists() ? shiftSnap.data() : { assignments: [] };
          let assignments = data.assignments || [];
          let userFound = false;
  
          const newAssigns = assignments.map(a => {
              if (a.uid === req.fromUid) { userFound = true; return { ...a, otHours: req.hours, otReason: req.reason, otConfirmed: true }; }
              return a;
          });
          if (!userFound) newAssigns.push({ uid: req.fromUid, type: 'WORK', otHours: req.hours, otReason: req.reason, otConfirmed: true });
          await setDoc(shiftRef, { ...data, assignments: newAssigns }, { merge: true });
          await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.id));
          
          const actionType = req.hours > 0 ? '加班' : '補休';
          if(targetLineId) sendLineNotification([targetLineId], `✅ 管理員已核准您的 ${actionType} 申請 (${req.date} / ${Math.abs(req.hours)}hr)！`);
          alert("已核准該申請並寫入統計！");
      }
      else if (req.type === 'swap') {
          const shiftRef = doc(db, 'artifacts', appId, 'public', 'data', 'shifts', req.date);
          const shiftSnap = await getDoc(shiftRef);
          if (shiftSnap.exists()) {
              const data = shiftSnap.data(); const assigns = [...(data.assignments || [])];
              const idxA = assigns.findIndex(a => a.uid === req.fromUid); const idxB = assigns.findIndex(a => a.uid === req.toUid);
              if (idxA >= 0 && idxB >= 0) {
                  const temp = { ...assigns[idxA], uid: req.toUid }; assigns[idxA] = { ...assigns[idxB], uid: req.fromUid }; assigns[idxB] = temp;
                  await updateDoc(shiftRef, { assignments: assigns }); await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.id));
                  const fromUserLine = users[req.fromUid]?.lineUserId; const toUserLine = users[req.toUid]?.lineUserId;
                  const msg = `🔄 換假成功！\n日期: ${req.date}\n申請人: ${users[req.fromUid]?.name}\n對象: ${users[req.toUid]?.name}`;
                  const targets = []; if(fromUserLine) targets.push(fromUserLine); if(toUserLine) targets.push(toUserLine);
                  if(targets.length > 0) sendLineNotification(targets, msg);
                  alert("換假成功！");
              } else { alert("班表狀態已變更，無法換假"); await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.id)); }
          }
      }
  };

  if (loading) return <div className="flex h-screen items-center justify-center">載入中...</div>;
  if (!user) return <div className="flex h-screen items-center justify-center p-4 bg-gray-50"><div className="bg-white p-8 rounded-xl shadow-lg text-center"><h1 className="text-2xl font-bold mb-4 text-indigo-600">TeamShift 排班系統</h1><button onClick={handleLogin} className="bg-white border px-6 py-2 rounded shadow hover:bg-gray-50 flex items-center gap-2 mx-auto"><img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5"/> Google 登入</button></div></div>;

  const currentUserInfo = users[user.uid] || {};
  const isAdmin = currentUserInfo.isAdmin || user?.email === ADMIN_EMAIL;
  
  const myNotifications = requests.filter(r => 
      r.toUid === user.uid || 
      (r.type === 'ot_confirm' && r.uid === user.uid) || 
      (r.type === 'admin_ot_approve' && isAdmin)
  );
  const activeUsers = Object.values(users).filter(u => !u.isResigned);

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-slate-800 pb-20 sm:pb-0 relative">
      <nav className="bg-white shadow-sm border-b sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xl text-indigo-600">
            <Calendar className="w-6 h-6" /> <span className="hidden sm:inline">TeamShift</span>
            <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full ml-1 hidden md:inline">{CURRENT_VERSION}</span>
          </div>
          <div className="flex gap-1 sm:gap-2 items-center overflow-x-auto">
            <NavBtn active={view==='clock'} onClick={()=>setView('clock')} icon={Fingerprint} label="打卡" />
            <NavBtn active={view==='calendar'} onClick={()=>setView('calendar')} icon={Calendar} label="月曆" />
            {/* 🔴 將 shiftTypes 傳給 AttendanceView */}
            {isAdmin && <NavBtn active={view==='attendance'} onClick={()=>setView('attendance')} icon={History} label="出勤" />}
            
            <NavBtn active={view==='salary'} onClick={()=>setView('salary')} icon={FileBarChart} label="統計" />
            {isAdmin && <NavBtn active={view==='payroll'} onClick={()=>setView('payroll')} icon={DollarSign} label="薪資" />}
            <NavBtn active={view==='settings'} onClick={()=>setView('settings')} icon={Users} label="設定" />
            
            <button onClick={() => setView('inbox')} className={`p-2 relative ${view === 'inbox' ? 'text-indigo-600 bg-indigo-50 rounded-lg' : 'text-gray-500 hover:text-indigo-600'}`}>
                <Bell className="w-5 h-5" />
                {myNotifications.length > 0 && <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-white"></span>}
            </button>
            <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-red-500" title="登出"><LogOut className="w-5 h-5"/></button>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-3 sm:p-4">
        {view === 'clock' && <ClockView currentUser={user} users={users} storeConfig={storeConfig} db={db} appId={appId} />}
        {view === 'attendance' && isAdmin && <AttendanceView users={users} currentDate={currentDate} db={db} appId={appId} shifts={shifts} shiftTypes={shiftTypes} />}
        
        {view === 'calendar' && (
            <CalendarView currentDate={currentDate} setCurrentDate={setCurrentDate} shifts={shifts} requests={requests} companyEvents={companyEvents} users={activeUsers} allUsers={users} currentUser={user} leaveTypes={leaveTypes} shiftTypes={shiftTypes} sendLineNotification={sendLineNotification} appId={appId} db={db} />
        )}
        {view === 'salary' && <SalaryView users={activeUsers} shifts={shifts} currentDate={currentDate} leaveTypes={leaveTypes} currentUser={user} />}
        {view === 'payroll' && isAdmin && <PayrollView users={users} currentDate={currentDate} />}
        {view === 'settings' && <SettingsView users={users} currentUser={user} leaveTypes={leaveTypes} shiftTypes={shiftTypes} appId={appId} storeConfig={storeConfig} db={db} />}
        
        {view === 'inbox' && (
            <div className="max-w-md mx-auto space-y-4 pb-20">
                <div className="bg-white p-4 rounded-xl border flex items-center gap-2">
                    <Bell className="text-indigo-600"/> <h2 className="font-bold text-lg">通知中心</h2>
                    <span className="bg-red-100 text-red-600 px-2 rounded-full text-xs font-bold">{myNotifications.length}</span>
                </div>
                {myNotifications.length === 0 ? (
                    <div className="text-center py-10 text-gray-400"><Inbox size={48} className="mx-auto mb-2 opacity-20"/><p>目前沒有待處理的通知</p></div>
                ) : (
                    <div className="space-y-3">
                        {myNotifications.map(req => (
                            <div key={req.id} className="bg-white p-4 rounded-xl border shadow-sm border-l-4 border-l-indigo-500">
                                {req.type === 'ot_confirm' && (
                                    <>
                                        <div className="flex justify-between items-start mb-2"><h3 className="font-bold text-lg text-gray-800">時數登錄確認</h3><span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-500">{req.date}</span></div>
                                        <p className="text-xs text-gray-500 mb-2">管理員登錄了您的時數，請確認：</p>
                                        <div className={`p-3 rounded mb-3 text-sm ${req.hours > 0 ? 'bg-orange-50' : 'bg-green-50'}`}>
                                            <div className={`font-bold ${req.hours > 0 ? 'text-orange-800' : 'text-green-800'}`}>{req.hours > 0 ? '加班' : '補休'}時數: {Math.abs(req.hours)} 小時</div>
                                            <div className={req.hours > 0 ? 'text-orange-700' : 'text-green-700'}>事由: {req.reason}</div>
                                        </div>
                                        <div className="flex gap-3"><button onClick={()=>handleRequest(req, 'reject')} className="flex-1 bg-white border border-gray-300 text-gray-700 py-2 rounded-lg font-bold hover:bg-gray-50">駁回有誤</button><button onClick={()=>handleRequest(req, 'accept')} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg font-bold shadow hover:bg-indigo-700">確認無誤</button></div>
                                    </>
                                )}
                                {req.type === 'admin_ot_approve' && (
                                    <>
                                        <div className="flex justify-between items-start mb-2"><h3 className="font-bold text-lg text-purple-800">員工加/補休申請</h3><span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-500">{req.date}</span></div>
                                        <p className="text-xs text-gray-600 mb-2"><span className="font-bold text-gray-900">{users[req.fromUid]?.name}</span> 提交了申請單：</p>
                                        <div className={`p-3 rounded mb-3 text-sm border ${req.hours > 0 ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'}`}>
                                            <div className={`font-bold ${req.hours > 0 ? 'text-orange-800' : 'text-green-800'}`}>{req.hours > 0 ? '加班' : '補休'}時數: {Math.abs(req.hours)} 小時</div>
                                            <div className={req.hours > 0 ? 'text-orange-700' : 'text-green-700'}>事由: {req.reason}</div>
                                        </div>
                                        <div className="flex gap-3"><button onClick={()=>handleRequest(req, 'reject')} className="flex-1 bg-white border border-gray-300 text-gray-700 py-2 rounded-lg font-bold hover:bg-red-50 hover:text-red-600 hover:border-red-200">駁回退件</button><button onClick={()=>handleRequest(req, 'accept')} className="flex-1 bg-purple-600 text-white py-2 rounded-lg font-bold shadow hover:bg-purple-700">核准生效</button></div>
                                    </>
                                )}
                                {req.type === 'swap' && (
                                    <>
                                        <div className="flex justify-between items-start mb-2"><h3 className="font-bold text-lg text-gray-800">收到換假邀請</h3><span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-500">{req.date}</span></div>
                                        <p className="text-gray-600 mb-3"><span className="font-bold text-gray-900">{users[req.fromUid]?.name}</span> 想要跟您交換當天的班表。</p>
                                        <div className="flex gap-3"><button onClick={()=>handleRequest(req, 'reject')} className="flex-1 bg-white border border-gray-300 text-gray-700 py-2 rounded-lg font-bold hover:bg-gray-50">婉拒</button><button onClick={()=>handleRequest(req, 'accept')} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg font-bold shadow hover:bg-indigo-700">同意交換</button></div>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )}
      </main>
    </div>
  );
}

// ==========================================
// 📍 GPS 打卡頁面 (ClockView) 🔴 已移除 LINE 通知
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
        if (!navigator.geolocation) { setLocError('您的瀏覽器不支援定位功能'); return; }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude; const lng = pos.coords.longitude;
                setLocation({ lat, lng });
                if (storeConfig && storeConfig.lat && storeConfig.lng) {
                    const dist = getDistance(lat, lng, storeConfig.lat, storeConfig.lng);
                    setDistance(dist);
                }
            },
            (err) => {
                if(err.code === 1) setLocError('請允許瀏覽器存取位置權限，否則無法打卡');
                else setLocError('無法獲取定位，請確認手機 GPS 已開啟');
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    useEffect(() => { fetchLocation(); }, [storeConfig]);

    const handlePunch = async (type) => {
        if (!storeConfig?.lat) return alert("管理員尚未設定店面座標，無法打卡！");
        if (distance === null) return alert("定位中，請稍候...");
        if (distance > (storeConfig.radius || 50)) return alert("超出允許打卡範圍，無法打卡！");

        setIsPunching(true);
        try {
            const dateStr = `${currentTime.getFullYear()}-${String(currentTime.getMonth()+1).padStart(2,'0')}`;
            const todayStr = `${currentTime.getFullYear()}-${String(currentTime.getMonth()+1).padStart(2,'0')}-${String(currentTime.getDate()).padStart(2,'0')}`;
            const timeStr = `${String(currentTime.getHours()).padStart(2,'0')}:${String(currentTime.getMinutes()).padStart(2,'0')}`;
            
            const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'clockRecords', dateStr);
            const newRecord = {
                id: `${Date.now()}_${currentUser.uid}`, uid: currentUser.uid, name: currentUserInfo.name, type: type, date: todayStr, time: timeStr, timestamp: Date.now(), distance: distance
            };

            const snap = await getDoc(docRef);
            if (!snap.exists()) { await setDoc(docRef, { records: [newRecord] }); } 
            else { await updateDoc(docRef, { records: arrayUnion(newRecord) }); }

            alert(`${type === 'IN' ? '上班' : '下班'}打卡成功！`);
            fetchLocation(); 
        } catch (e) {
            console.error(e); alert("打卡發生錯誤，請重試");
        }
        setIsPunching(false);
    };

    const isWithinRange = distance !== null && storeConfig && distance <= (storeConfig.radius || 50);

    return (
        <div className="max-w-md mx-auto bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 mt-4">
            <div className="bg-indigo-600 p-6 text-center text-white relative">
                <h2 className="text-xl font-bold opacity-90 mb-2">現在時間</h2>
                <div className="text-5xl font-mono font-bold tracking-wider drop-shadow-md">
                    {String(currentTime.getHours()).padStart(2,'0')}:{String(currentTime.getMinutes()).padStart(2,'0')}<span className="text-2xl ml-1 opacity-75">:{String(currentTime.getSeconds()).padStart(2,'0')}</span>
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
// 📋 出勤明細頁面 (AttendanceView) 🔴 遲到早退結算
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
                
                // 1. 先將打卡紀錄依據「日期+員工ID」分組，找出每天的最早(IN)與最晚(OUT)
                const grouped = {};
                records.forEach(r => {
                    const key = `${r.date}_${r.uid}`;
                    if (!grouped[key]) grouped[key] = { date: r.date, uid: r.uid, name: r.name, in: null, out: null };
                    if (r.type === 'IN') {
                        if (!grouped[key].in || r.time < grouped[key].in) grouped[key].in = r.time;
                    }
                    if (r.type === 'OUT') {
                        if (!grouped[key].out || r.time > grouped[key].out) grouped[key].out = r.time;
                    }
                });

                // 2. 比對當天班表，計算遲到早退
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
                    } else if (dayShift?.type === 'LEAVE') {
                        status.push('請假');
                    } else {
                        status.push('未排班');
                    }

                    return { ...g, shiftInfo, status };
                });

                // 依日期(新到舊)排序
                processedList.sort((a, b) => b.date.localeCompare(a.date));
                setAttendanceList(processedList);
            } else {
                setAttendanceList([]);
            }
            setLoading(false);
        });
        return () => unsub();
    }, [targetMonth, db, appId, shifts, shiftTypes]);

    return (
        <div className="space-y-4 pb-20">
            <div className="bg-white p-4 rounded-xl border flex justify-between items-center">
                <h2 className="font-bold flex gap-2 text-indigo-700"><History/> 出勤與遲到結算</h2>
                <input type="month" value={targetMonth} onChange={e=>setTargetMonth(e.target.value)} className="border rounded px-2"/>
            </div>

            <div className="bg-white rounded-xl border overflow-hidden">
                {loading ? <div className="p-8 text-center text-gray-400">載入中...</div> : 
                 attendanceList.length === 0 ? <div className="p-8 text-center text-gray-400">本月尚無打卡紀錄</div> : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-500 font-bold border-b">
                                <tr>
                                    <th className="p-3">日期</th>
                                    <th className="p-3">員工</th>
                                    <th className="p-3 text-center">班別 (應到~應退)</th>
                                    <th className="p-3 text-center">上班打卡</th>
                                    <th className="p-3 text-center">下班打卡</th>
                                    <th className="p-3">狀態</th>
                                </tr>
                            </thead>
                            <tbody>
                                {attendanceList.map((r, i) => {
                                    const isAbnormal = r.status.includes('遲到') || r.status.includes('早退') || r.status.includes('缺卡');
                                    return (
                                    <tr key={i} className="border-b hover:bg-gray-50">
                                        <td className="p-3 font-mono text-gray-600">{r.date.substring(5)}</td>
                                        <td className="p-3 font-bold">{r.name}</td>
                                        <td className="p-3 text-center text-gray-500 text-xs">
                                            {r.shiftInfo ? <span className="bg-gray-100 px-2 py-0.5 rounded">{r.shiftInfo.label} ({r.shiftInfo.start}~{r.shiftInfo.end})</span> : <span className="text-gray-300">-</span>}
                                        </td>
                                        <td className={`p-3 text-center font-bold ${r.in && r.shiftInfo && r.in > r.shiftInfo.start ? 'text-red-500' : 'text-gray-800'}`}>{r.in || '-'}</td>
                                        <td className={`p-3 text-center font-bold ${r.out && r.shiftInfo && r.out < r.shiftInfo.end ? 'text-red-500' : 'text-gray-800'}`}>{r.out || '-'}</td>
                                        <td className="p-3 font-bold">
                                            {isAbnormal ? 
                                                <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded text-xs">{r.status.join(', ')}</span> : 
                                                <span className="text-green-600 bg-green-50 px-2 py-0.5 rounded text-xs">{r.status.join(', ')}</span>
                                            }
                                        </td>
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

// --- 1. Calendar View (🔴 支援班別顯示) ---
const CalendarView = ({ currentDate, setCurrentDate, shifts, requests, companyEvents, users, allUsers, currentUser, leaveTypes, shiftTypes, sendLineNotification, appId, db }) => {
  const [selectedDate, setSelectedDate] = useState(null);
  const [editingEvent, setEditingEvent] = useState(null); 

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const { firstDay, days } = getMonthData(year, month);
  const sortedUserIds = useMemo(() => Object.keys(allUsers).sort(), [allUsers]);
  const getUserColor = (uid) => { const idx = sortedUserIds.indexOf(uid); return idx === -1 ? 'bg-gray-100 text-gray-800' : USER_COLORS[idx % USER_COLORS.length]; };

  const handleSaveEvent = async (eventData) => {
      if (eventData.id) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'companyEvents', eventData.id), eventData);
      else await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'companyEvents'), eventData);
      setEditingEvent(null);
  };

  const handleDeleteEvent = async (eventId) => {
      if(window.confirm("確定要刪除這個行程嗎？")) {
          await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'companyEvents', eventId));
          setEditingEvent(null);
      }
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
          const todaysEvents = companyEvents.filter(e => checkEventOnDate(e, dateStr));

          return (<div key={d} onClick={()=>setSelectedDate(dateStr)} className={`min-h-[150px] border-b border-r p-1 cursor-pointer transition-colors flex flex-col ${data.isClosed ? 'bg-gray-200' : 'hover:bg-indigo-50'}`}>
            <div className="flex justify-between mb-1"><span className="text-sm font-bold text-gray-700 ml-1">{d}</span>{data.note && <div className="w-0 h-0 border-t-[10px] border-r-[10px] border-t-red-500 border-r-transparent"></div>}</div>
            {todaysEvents.map(e => (
                <div key={e.id} className="bg-purple-100 text-purple-800 border-purple-300 border text-[11px] px-1 rounded mb-1 font-bold truncate flex items-center gap-1 shadow-sm"><Megaphone size={10} className="shrink-0"/> {e.time && `${e.time} `}{e.title}</div>
            ))}
            {data.isClosed ? <div className="flex-1 flex items-center justify-center"><div className="bg-gray-600 text-white text-sm px-3 py-1 rounded flex items-center gap-1 font-bold shadow"><Store size={14} /> 店休</div></div> : 
              <div className="space-y-1 overflow-y-auto flex-1">
                {data.assignments?.map((a,ix)=>{ 
                    // 🔴 讓有排班的人也顯示在月曆上
                    if (a.type === 'LEAVE') {
                        const pColor = getUserColor(a.uid); 
                        const subName = a.subUid ? allUsers[a.subUid]?.name : null;
                        return (
                            <div key={ix} className={`text-xs p-1.5 rounded border ${pColor} bg-opacity-20 mb-1`}>
                                <div className="flex justify-between items-center font-bold">
                                    <span className="truncate">{allUsers[a.uid]?.name}</span>
                                    <span className="bg-white/80 px-1 rounded text-[10px] border shadow-sm flex items-center gap-1 shrink-0">
                                        {leaveTypes.find(t=>t.id===a.leaveType)?.label} 
                                        {a.leaveHours && a.leaveType !== 'menstrual' && (
                                            <span className={`font-mono text-[9px] px-1 rounded ${a.useComp || a.leaveType === 'annual' ? 'bg-indigo-100 text-indigo-700' : 'bg-red-100 text-red-700'}`}>-{a.leaveHours}h</span>
                                        )}
                                    </span>
                                </div>
                                {subName && <div className="text-[11px] text-gray-600 mt-0.5 flex items-center gap-1 bg-white/50 px-1 rounded"><ArrowRightLeft size={10}/> {subName} 代</div>}
                            </div>
                        )
                    } else if (a.type === 'WORK' && a.shiftCode) {
                        // 🔴 顯示上班的人與班別
                        const shiftLabel = shiftTypes.find(st => st.id === a.shiftCode)?.label || a.shiftCode;
                        return (
                            <div key={ix} className="text-[11px] px-1 py-0.5 rounded border border-gray-200 bg-white text-gray-700 flex justify-between items-center shadow-sm mb-0.5">
                                <span className="font-bold truncate">{allUsers[a.uid]?.name}</span>
                                <span className="bg-gray-100 text-gray-500 px-1 rounded font-mono shrink-0">{shiftLabel}</span>
                            </div>
                        );
                    }
                    return null;
                })}
              </div>}
          </div>)
        })}
       </div>
       {selectedDate && <ShiftModal dateStr={selectedDate} onClose={()=>setSelectedDate(null)} shifts={shifts} requests={requests} companyEvents={companyEvents} setEditingEvent={setEditingEvent} users={users} currentUser={currentUser} leaveTypes={leaveTypes} shiftTypes={shiftTypes} userColors={USER_COLORS} sortedUserIds={sortedUserIds} sendLineNotification={sendLineNotification} />}
    </div>
    <CompanyEventModal isOpen={!!editingEvent} onClose={()=>setEditingEvent(null)} eventData={editingEvent} onSave={handleSaveEvent} onDelete={handleDeleteEvent} />
    </>
  );
};

// --- 排班細節 Modal ---
const ShiftModal = ({ dateStr, onClose, shifts, requests, companyEvents, setEditingEvent, users, currentUser, leaveTypes, shiftTypes, userColors, sortedUserIds, sendLineNotification }) => {
  const dayData = shifts[dateStr] || { assignments: [], note: '', isClosed: false };
  const [note, setNote] = useState(dayData.note || '');
  const [expanded, setExpanded] = useState(null);
  const [otModalData, setOtModalData] = useState(null); 

  const safeUsers = Array.isArray(users) ? users : Object.values(users || {});
  const isAdmin = safeUsers.find(u => u.uid === currentUser.uid)?.isAdmin || currentUser?.email === ADMIN_EMAIL;
  const isClosed = dayData.isClosed === true;
  const getUserColor = (uid) => { const idx = sortedUserIds.indexOf(uid); return idx === -1 ? 'bg-gray-100 text-gray-800' : userColors[idx % userColors.length]; };
  const todaysEvents = companyEvents.filter(e => checkEventOnDate(e, dateStr));

  const yearStr = dateStr.substring(0, 4);
  const monthStr = dateStr.substring(0, 7);

  const getYearlyBalance = (uid, yearToFind) => {
      let earned = 0; let used = 0;
      Object.keys(shifts).forEach(d => {
          if (!d.startsWith(yearToFind)) return;
          const data = shifts[d]; if(data.isClosed) return;
          const assign = data.assignments?.find(a => a.uid === uid);
          if (!assign) return;
          
          if (assign.type === 'LEAVE') {
              if (assign.leaveHours) {
                  if (assign.useComp || assign.leaveType === 'annual') {
                      used += parseFloat(assign.leaveHours);
                  }
              }
          }
          if (assign.otHours && assign.otConfirmed) {
              const hrs = parseFloat(assign.otHours);
              if (hrs > 0) earned += hrs;
              if (hrs < 0) used += Math.abs(hrs);
          }
      });
      return earned - used;
  };

  const update = async (newData) => { await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'shifts', dateStr), { ...dayData, ...newData }, { merge: true }); if(newData.assignments) setExpanded(null); };
  
  const toggleClosed = async () => { 
      if (!isAdmin) return; const newStatus = !isClosed; 
      if (newStatus && dayData.assignments?.length > 0) { if (!confirm("設定為店休將會清除當日所有排班紀錄，確定嗎？")) return; await update({ isClosed: true, assignments: [] }); } else { await update({ isClosed: newStatus }); } onClose(); 
  };

  const cancelLeave = (uid) => { 
      if (!isAdmin) return alert("已鎖定，無法刪除。請聯繫管理員。"); 
      let next = [...(dayData.assignments||[])]; 
      const idx = next.findIndex(a=>a.uid===uid); 
      if(idx>=0) { next.splice(idx, 1); update({ assignments: next }); } 
  };
  
  // 🔴 新增：更新員工班別
  const updateShiftCode = (uid, code) => {
      if (!isAdmin) return alert("只有管理員可以排班");
      let next = [...(dayData.assignments||[])]; 
      const idx = next.findIndex(a=>a.uid===uid);
      if (idx === -1) {
          next.push({ uid, type: 'WORK', shiftCode: code });
      } else {
          next[idx] = { ...next[idx], shiftCode: code };
      }
      update({ assignments: next });
  };

  const toggle = (uid, type, lType=null, subUid=null) => {
    const isMe = uid === currentUser.uid;
    if (!isAdmin && !isMe) return alert("無權限");
    if (isClosed) return alert("本日店休");

    let next = [...(dayData.assignments||[])]; 
    const idx = next.findIndex(a=>a.uid===uid);
    
    if (!isAdmin && next[idx]?.type === 'LEAVE') { return alert("請假已鎖定。如需修改請聯繫管理員。"); }

    if (lType === 'rostered') { const getRosteredCount = () => { const prefix = dateStr.substring(0, 7); let count = 0; Object.keys(shifts).forEach(d => { if (d.startsWith(prefix) && shifts[d].assignments?.some(a=>a.uid===uid && a.type==='LEAVE' && a.leaveType==='rostered')) count++; }); return count; }; if (!isAdmin && (!next[idx] || next[idx].leaveType !== 'rostered') && getRosteredCount() >= 3) return alert("本月自選畫休 (排休) 已達 3 天上限"); }
    
    let leaveHours = 0;
    let useComp = false; 

    if (lType === 'menstrual') { } 
    else if (['annual', 'sick', 'personal'].includes(lType)) {
        const typeInfo = leaveTypes.find(t=>t.id===lType);
        const leaveName = typeInfo?.label || '該假別';
        
        const p = prompt(`請輸入「${leaveName}」的請假時數 (純數字):`, "8");
        if (p === null) return;
        leaveHours = Math.abs(parseFloat(p));
        if (isNaN(leaveHours) || leaveHours <= 0) return alert("請輸入大於0的有效數字！");

        if (lType === 'annual') { useComp = true; } 
        else if (['sick', 'personal'].includes(lType)) {
            useComp = window.confirm(`【${leaveName} ${leaveHours}小時 扣抵方式】\n\n👉 按【確定】：使用「剩餘加/補休時數」扣抵\n👉 按【取消】：不扣時數，月底結算扣薪`);
        }
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
      if(targetUser?.lineUserId) sendLineNotification([targetUser.lineUserId], `📩 新的換假邀請！\n${safeUsers.find(u=>u.uid===fromUid)?.name} 想要跟您交換 ${dateStr} 的班表。`);
      alert("換假申請已送出！");
  };

  const handleOTSave = async (numHours, remark) => {
      const uid = otModalData.user.uid;
      const actionType = numHours > 0 ? '加班' : '補休';

      if (isAdmin && uid !== currentUser.uid) {
        const existingReq = requests?.find(r => r.date === dateStr && r.uid === uid && r.type === 'ot_confirm');
        if (existingReq) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', existingReq.id));

        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), { type: 'ot_confirm', uid, date: dateStr, hours: numHours, reason: remark || '無備註', timestamp: new Date() });
        const targetUser = safeUsers.find(u => u.uid === uid);
        if(targetUser?.lineUserId) sendLineNotification([targetUser.lineUserId], `🕒 管理員已登錄您的${actionType}時數\n日期: ${dateStr}\n時數: ${Math.abs(numHours)}hr\n請至系統確認。`);
        
        setOtModalData(null); onClose(); setTimeout(() => alert("已送出時數確認單給員工"), 100);
      } 
      else if (!isAdmin && uid === currentUser.uid) {
        const existingReq = requests?.find(r => r.date === dateStr && r.fromUid === uid && r.type === 'admin_ot_approve');
        if (existingReq) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', existingReq.id));

        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), { type: 'admin_ot_approve', fromUid: currentUser.uid, date: dateStr, hours: numHours, reason: remark || '無備註', timestamp: new Date() });
        const adminLineIds = safeUsers.filter(u => u.isAdmin || u.email === ADMIN_EMAIL).map(u => u.lineUserId).filter(id => id);
        const currentUserName = safeUsers.find(u => u.uid === currentUser.uid)?.name || '某員工';
        if(adminLineIds.length > 0) sendLineNotification(adminLineIds, `🔔【審核通知】\n員工 ${currentUserName} 申請了 ${dateStr} 的 ${actionType} (${Math.abs(numHours)}hr)\n請至系統通知中心核准。`);
        
        setOtModalData(null); onClose(); setTimeout(() => alert("已送出審核明細！請等候管理員核准。"), 100);
      } 
      else {
        let next = [...(dayData.assignments||[])]; const idx = next.findIndex(a=>a.uid===uid); 
        const newEntry = { otHours: numHours, otReason: remark || '無備註', otConfirmed: true };
        if (idx === -1) next.push({ uid, type: 'WORK', ...newEntry }); else next[idx] = { ...next[idx], ...newEntry };
        await update({ assignments: next });
        setOtModalData(null); onClose(); 
      }
  };

  const openOTModal = (user) => { 
      if(user.uid !== currentUser.uid && !isAdmin) return alert("無權限"); 
      if(isClosed) return alert("本日店休"); 

      const assign = dayData.assignments?.find(a=>a.uid===user.uid);
      const hasOT = assign?.otHours !== undefined && assign?.otHours !== null && assign?.otHours !== "" && Number(assign?.otHours) !== 0;
      const pendingApproveReq = (requests || []).find(r => r.date === dateStr && r.fromUid === user.uid && r.type === 'admin_ot_approve');
      const pendingConfirmReq = (requests || []).find(r => r.date === dateStr && r.uid === user.uid && r.type === 'ot_confirm');

      if (!isAdmin && (hasOT || pendingApproveReq || pendingConfirmReq)) {
          return alert("時數已鎖定或審核中，無法修改。請聯繫管理員。");
      }

      const balance = getYearlyBalance(user.uid, yearStr);
      let initHrs = ''; let initRsn = '';
      if (pendingApproveReq) { initHrs = pendingApproveReq.hours; initRsn = pendingApproveReq.reason; }
      else if (pendingConfirmReq) { initHrs = pendingConfirmReq.hours; initRsn = pendingConfirmReq.reason; }
      else if (assign?.otHours) { initHrs = assign.otHours; initRsn = assign.otReason; }

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
              <div className="flex justify-between items-center mb-2"><h4 className="font-bold text-purple-800 flex items-center gap-1"><Megaphone size={14}/> 公司備忘錄 / 行程</h4>{isAdmin && <button onClick={()=>setEditingEvent({ startDate: dateStr, repeatType: 'none', time: '', title: '' })} className="text-purple-600 bg-white px-2 py-0.5 rounded border border-purple-200 text-xs font-bold shadow-sm hover:bg-purple-100">+ 新增</button>}</div>
              {todaysEvents.length === 0 ? <div className="text-xs text-purple-400">今日無行程</div> : (
                  todaysEvents.map(e => (
                      <div key={e.id} className="flex justify-between items-center bg-white p-2 rounded border border-purple-100 mb-1 shadow-sm">
                          <div><div className="text-sm font-bold text-gray-800">{e.time && <span className="text-purple-600 mr-1">{e.time}</span>}{e.title}</div>{(e.repeatType !== 'none' || e.note) && (<div className="text-[10px] text-gray-500 mt-0.5 flex gap-1 items-center">{e.repeatType !== 'none' && <span className="bg-gray-100 px-1 rounded flex items-center gap-0.5"><Repeat size={8}/> {REPEAT_LABELS[e.repeatType]}</span>}{e.note && <span className="truncate max-w-[150px]">{e.note}</span>}</div>)}</div>
                          {isAdmin && <button onClick={()=>setEditingEvent(e)} className="text-indigo-500 text-xs font-bold bg-indigo-50 px-2 py-1 rounded">編輯</button>}
                      </div>
                  ))
              )}
          </div>

          {isClosed && (<div className="absolute inset-0 bg-white/95 z-10 flex flex-col items-center justify-center text-center p-4 mt-20"><Store className="w-16 h-16 text-gray-400 mb-2"/><h3 className="text-xl font-bold text-gray-600 mb-4">本日店休</h3>{isAdmin && <button onClick={toggleClosed} className="bg-gray-800 text-white px-6 py-2 rounded shadow hover:bg-gray-700 transition-colors">🔓 恢復營業 (解除店休)</button>}</div>)}
          
          {safeUsers.map(u => {
            const assign = dayData.assignments?.find(a=>a.uid===u.uid); const isRostered = assign?.type === 'LEAVE' && assign?.leaveType === 'rostered'; const userColor = getUserColor(u.uid); const isMe = u.uid === currentUser.uid; const canEdit = isMe || isAdmin; const showSwapBtn = (dayData.assignments?.some(a=>a.uid===currentUser.uid && a.type==='LEAVE')) && !isMe && assign?.type === 'WORK';
            
            const hasOT = assign?.otHours !== undefined && assign?.otHours !== null && assign?.otHours !== "" && Number(assign?.otHours) !== 0;
            const otValue = Number(assign?.otHours);
            const isOT = otValue > 0;
            const hasLeave = assign?.type === 'LEAVE';

            const pendingApproveReq = (requests || []).find(r => r.date === dateStr && r.fromUid === u.uid && r.type === 'admin_ot_approve');
            const pendingConfirmReq = (requests || []).find(r => r.date === dateStr && r.uid === u.uid && r.type === 'ot_confirm');

            const canEditLeave = isAdmin || (isMe && !hasLeave);
            const canEditOT = isAdmin || (isMe && !hasOT && !pendingApproveReq && !pendingConfirmReq);

            let otButtonUi = null;
            if (pendingApproveReq) {
                otButtonUi = <button onClick={() => isAdmin ? openOTModal(u) : alert("已送出審核，鎖定中。如需修改請聯繫管理員。")} className={`px-3 py-1.5 text-xs rounded border font-bold shadow-sm bg-blue-50 text-blue-600 border-blue-200 ${!isAdmin ? 'opacity-60 cursor-not-allowed' : 'hover:bg-blue-100'}`}><Clock className="w-3.5 h-3.5 inline mr-1" />審核中 ({pendingApproveReq.hours}h)</button>;
            } else if (pendingConfirmReq) {
                otButtonUi = <button onClick={() => isAdmin ? openOTModal(u) : alert("請至通知中心確認單據。")} className={`px-3 py-1.5 text-xs rounded border font-bold shadow-sm bg-pink-50 text-pink-600 border-pink-200 ${!isAdmin ? 'opacity-60 cursor-not-allowed' : 'hover:bg-pink-100'}`}><Clock className="w-3.5 h-3.5 inline mr-1" />待確認 ({pendingConfirmReq.hours}h)</button>;
            } else if (hasOT) {
                otButtonUi = <button onClick={() => isAdmin ? openOTModal(u) : alert("時數已生效，鎖定中。如需修改請聯繫管理員。")} className={`px-3 py-1.5 text-xs rounded border font-bold shadow-sm ${isOT ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-green-100 text-green-700 border-green-200'} ${!isAdmin ? 'opacity-60 cursor-not-allowed' : (isOT ? 'hover:bg-orange-200' : 'hover:bg-green-200')}`}><Clock className="w-3.5 h-3.5 inline mr-1" />{isOT ? `+${otValue}h` : `${otValue}h`}</button>;
            } else {
                otButtonUi = <button onClick={() => openOTModal(u)} disabled={!canEditOT} className={`px-3 py-1.5 text-xs rounded border shadow-sm ${!canEditOT ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-600 hover:bg-gray-50'}`}><Clock className="w-3.5 h-3.5 inline mr-1" />申請時數</button>;
            }

            const getLeaveCount = (leaveId, prefix) => {
                let count = 0;
                Object.keys(shifts).forEach(d => {
                    if (d.startsWith(prefix) && d !== dateStr) {
                        if (shifts[d].assignments?.some(a => a.uid === u.uid && a.type === 'LEAVE' && a.leaveType === leaveId)) count++;
                    }
                });
                return count;
            };

            return (
              <div key={u.uid} className={`border rounded-lg p-3 ${!canEdit ? 'bg-gray-50 opacity-100' : 'bg-white'}`}>
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2"><div className={`w-3 h-3 rounded-full border ${userColor.split(' ')[0]} border-gray-400`}></div><span className="font-bold">{u.name}</span>
                  {hasOT && <span className={`text-xs px-1.5 py-0.5 rounded border font-bold flex items-center gap-1 ${assign.otConfirmed ? (isOT ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-green-100 text-green-700 border-green-200') : 'bg-gray-100 text-gray-500 border-gray-200'}`}>{isOT ? `加班 +${otValue}h` : `補休 ${otValue}h`} ({assign.otReason})</span>}</div>
                  
                  <div className="flex gap-2 items-center">
                    {/* 🔴 班別選單 (如果沒有請假才顯示) */}
                    {(!hasLeave && isAdmin) ? (
                        <select 
                            value={assign?.shiftCode || ''} 
                            onChange={(e) => updateShiftCode(u.uid, e.target.value)}
                            className={`text-xs border rounded p-1 w-20 shadow-sm ${assign?.shiftCode ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold' : 'bg-white text-gray-500'}`}
                        >
                            <option value="">未排班</option>
                            {shiftTypes.map(st => <option key={st.id} value={st.id}>{st.label}</option>)}
                        </select>
                    ) : (!hasLeave && assign?.shiftCode) ? (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded font-mono border shadow-sm">
                            {shiftTypes.find(st=>st.id===assign.shiftCode)?.label || assign.shiftCode}
                        </span>
                    ) : null}

                    {showSwapBtn && <button onClick={() => requestSwap(currentUser.uid, u.uid)} className="bg-indigo-50 text-indigo-600 border border-indigo-200 px-2 py-1 rounded text-[10px] flex items-center gap-1 hover:bg-indigo-100"><ArrowRightLeft className="w-3 h-3"/> 換假</button>}
                    
                    {otButtonUi}
                    
                    {isAdmin && <button onClick={() => toggle(u.uid, 'LEAVE', 'official')} className="px-3 py-1.5 text-xs rounded border bg-gray-100 text-gray-600 hover:bg-gray-200">排休</button>}
                    <button onClick={() => canEditLeave ? toggle(u.uid, 'LEAVE', 'rostered') : alert("請假已鎖定。如需修改請聯繫管理員。")} className={`px-4 py-2 text-xs rounded font-bold ${!canEditLeave ? (isRostered ? 'bg-red-400 text-white cursor-not-allowed' : 'bg-gray-100 text-gray-400 cursor-not-allowed') : (isRostered ? 'bg-red-600 text-white ring-2 ring-red-200' : 'bg-red-500 text-white hover:bg-red-600')}`}>{isRostered ? '已排休' : '自畫假'}</button>
                    <button onClick={() => canEditLeave ? setExpanded(expanded===u.uid?null:u.uid) : alert("請假已鎖定。如需修改請聯繫管理員。")} className={`px-3 py-2 text-xs rounded border ${!canEditLeave ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{hasLeave && !isRostered ? '已請假' : '請假 ▼'}</button>
                  </div>
                </div>
                {assign?.type === 'LEAVE' && (
                    <div className={`flex items-center justify-between text-xs px-2 py-1 rounded mb-2 ${userColor} bg-opacity-30 border`}>
                        <div>
                            <span className="font-medium text-gray-900 flex items-center gap-1">
                                狀態: {leaveTypes.find(t=>t.id===assign.leaveType)?.label || '休假'}
                                {assign.leaveHours && assign.leaveType !== 'menstrual' && (
                                    <span className={`font-mono font-bold bg-white/60 px-1 rounded ${(assign.useComp || assign.leaveType === 'annual') ? 'text-indigo-600' : 'text-red-600'}`}>
                                        -{assign.leaveHours}h{(assign.useComp || assign.leaveType === 'annual') ? '抵扣' : '扣薪'}
                                    </span>
                                )}
                            </span>
                            {assign.subUid && <span className="ml-2 text-gray-600 font-bold">➤ {safeUsers.find(sub=>sub.uid===assign.subUid)?.name} 代班</span>}
                        </div>
                        {isAdmin && <button onClick={()=>cancelLeave(u.uid)} className="text-red-600 hover:underline ml-2 font-bold flex items-center gap-1"><Trash2 className="w-3 h-3"/> 取消</button>}
                    </div>
                )}
                
                {expanded===u.uid && (
                  <div className="bg-gray-50 p-2 rounded animate-fade-in border-t space-y-2">
                    <div className="text-[10px] text-gray-400">請選擇假別 (可選代班人):</div>
                    <div className="flex gap-2 items-center mb-2"><span className="text-xs text-gray-600">代班:</span><select id={`sub-select-${u.uid}`} className="text-xs border rounded p-1 flex-1"><option value="">-- 無代班人 --</option>{availableSubs.map(s => <option key={s.uid} value={s.uid}>{s.name}</option>)}</select></div>
                    
                    <div className="grid grid-cols-3 gap-2">
                        {leaveTypes.filter(lt=>lt.id!=='rostered' && lt.id!=='official' && lt.id!=='comp').map(lt => {
                            let limitReached = false;
                            let limitMsg = "";

                            if (lt.id === 'menstrual') {
                                if (getLeaveCount('menstrual', yearStr) >= 3) { limitReached = true; limitMsg = "生理假一年最多請 3 天，已達上限！"; }
                                else if (getLeaveCount('menstrual', monthStr) >= 1) { limitReached = true; limitMsg = "本月生理假已請過 1 天，已達上限！"; }
                            } else if (lt.id === 'sick') {
                                if (getLeaveCount('sick', yearStr) >= 30) { limitReached = true; limitMsg = "病假一年最多請 30 天，已達上限！"; }
                            } else if (lt.id === 'personal') {
                                if (getLeaveCount('personal', yearStr) >= 14) { limitReached = true; limitMsg = "事假一年最多請 14 天，已達上限！"; }
                            }

                            const btnClass = limitReached 
                                ? (isAdmin ? 'bg-orange-50 text-orange-700 border-orange-300 hover:bg-orange-100 shadow-sm' : 'bg-gray-100 text-gray-400 opacity-60 cursor-not-allowed')
                                : 'bg-white hover:bg-gray-100 shadow-sm';

                            return (
                                <button 
                                    key={lt.id} 
                                    onClick={() => {
                                        if (limitReached) { 
                                            if (isAdmin) {
                                                if(!window.confirm(`⚠️ 警告：${u.name} 的${limitMsg}\n\n您具有管理員權限，是否要「強制核准」此假單？`)) return;
                                            } else {
                                                alert(`🚫 拒絕：${limitMsg}`); 
                                                return; 
                                            }
                                        }
                                        const subVal = document.getElementById(`sub-select-${u.uid}`).value; 
                                        toggle(u.uid,'LEAVE',lt.id, subVal || null);
                                    }} 
                                    className={`text-xs p-2 border rounded font-bold ${btnClass}`}
                                >
                                    {limitReached && isAdmin && <span className="mr-1">⚠️</span>}
                                    {lt.label}
                                </button>
                            )
                        })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          <div className="border-t pt-3 mt-2"><div className="flex gap-2 items-center mb-1"><StickyNote className="w-4 h-4 text-gray-500" /><span className="text-xs font-bold text-gray-600">當日備註 (顯示於右上角紅點)</span></div><div className="flex gap-2"><input value={note} onChange={e=>setNote(e.target.value)} className="border flex-1 rounded px-2 py-1 text-sm" placeholder="例如: 衛生局檢查..."/><button onClick={()=>setDoc(doc(db,'artifacts',appId,'public', 'data', 'shifts',dateStr),{...dayData,note},{merge:true})} className="bg-indigo-600 text-white px-3 rounded"><Save size={16}/></button></div></div>
          {isAdmin && !isClosed && <div className="pt-2 border-t mt-2"><button onClick={toggleClosed} className="w-full bg-gray-100 text-gray-600 text-xs py-2 rounded hover:bg-gray-200 flex items-center justify-center gap-1"><Store className="w-3.5 h-3.5" /> 設為店休 (清空當日班表)</button></div>}
        </div>
      </div>
    </div>
    <OTModal isOpen={!!otModalData} onClose={()=>setOtModalData(null)} onConfirm={handleOTSave} modalData={otModalData} dateStr={dateStr} />
    </>
  );
};

// --- 2. Salary View ---
const SalaryView = ({ users, shifts, currentDate, leaveTypes, currentUser }) => {
  const [targetMonth, setTargetMonth] = useState(`${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}`);
  const safeUsers = Array.isArray(users) ? users : Object.values(users || {});
  const isAdmin = safeUsers.find(u => u.uid === currentUser.uid)?.isAdmin || currentUser?.email === ADMIN_EMAIL;
  const visibleUsers = useMemo(() => isAdmin ? safeUsers : safeUsers.filter(u => u.uid === currentUser.uid), [users, currentUser, isAdmin]);

  const calc = (uid) => {
    const targetYear = targetMonth.substring(0, 4);
    let monthStats = { ot: 0, leaves: {} };
    let yearStats = { otEarned: 0, compHoursUsed: 0 }; 
    let otHistory = []; 

    Object.keys(shifts).forEach(date => {
        if (!date.startsWith(targetYear)) return; 
        const data = shifts[date]; if(data.isClosed) return;
        const assign = data.assignments?.find(a => a.uid === uid); if(!assign) return;
        
        if(assign.type === 'LEAVE') { 
            const lType = assign.leaveType || 'unknown'; 
            const typeInfo = leaveTypes.find(t => t.id === lType);
            const hrs = assign.leaveHours ? parseFloat(assign.leaveHours) : 0;
            
            if ((assign.useComp || lType === 'annual') && hrs > 0 && lType !== 'menstrual') {
                yearStats.compHoursUsed += hrs;
                otHistory.push({ date, hours: -hrs, reason: `使用「${typeInfo?.label}」抵扣` });
            }

            if(date.startsWith(targetMonth)) {
                 if(!monthStats.leaves[lType]) monthStats.leaves[lType] = { days: 0, hours: 0, compHours: 0, deductHours: 0 };
                 monthStats.leaves[lType].days += 1;
                 if(assign.leaveHours && lType !== 'menstrual') monthStats.leaves[lType].hours += hrs;
                 
                 if (assign.useComp || lType === 'annual' || lType === 'menstrual') {
                     monthStats.leaves[lType].compHours += hrs;
                 } else {
                     monthStats.leaves[lType].deductHours += hrs; 
                 }
            }
        }
        
        if(assign.otHours && assign.otConfirmed) { 
            const hrs = parseFloat(assign.otHours);
            if (hrs > 0) yearStats.otEarned += hrs;
            if (hrs < 0) yearStats.compHoursUsed += Math.abs(hrs);

            if(date.startsWith(targetMonth)) {
                 if (hrs > 0) monthStats.ot += hrs;
            }
            otHistory.push({ date, hours: hrs, reason: assign.otReason || '無備註' });
        }
    });

    otHistory.sort((a, b) => b.date.localeCompare(a.date));
    const balance = yearStats.otEarned - yearStats.compHoursUsed;
    return { monthStats, yearStats, balance, otHistory, targetYear };
  };

  return (
    <div className="space-y-4 pb-20">
      <div className="bg-white p-4 rounded-xl border flex justify-between items-center"><h2 className="font-bold flex gap-2"><ListFilter className="text-indigo-600"/> 統計明細</h2><input type="month" value={targetMonth} onChange={e=>setTargetMonth(e.target.value)} className="border rounded px-2"/></div>
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
                
                {needsDeduction && (
                    <div className="bg-red-50 p-2.5 rounded-lg border border-red-200">
                        <div className="text-xs font-bold text-red-800 mb-1">⚠️ 本月需扣薪總計 (未用時數抵扣)：</div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-red-700 font-bold">
                            {leaveTypes.map(lt => {
                                if (lt.deduct && s.monthStats.leaves[lt.id]?.deductHours > 0) {
                                    return <span key={lt.id}>{lt.label}: <span className="text-lg">{s.monthStats.leaves[lt.id].deductHours}</span>h</span>
                                }
                                return null;
                            })}
                        </div>
                    </div>
                )}

                <div className="bg-orange-50 p-2 rounded border border-orange-100 flex justify-between text-xs text-gray-600"><span>累積加班: {s.yearStats.otEarned} hr</span><span>已扣抵(含請假): {s.yearStats.compHoursUsed} hr</span></div>
                
                {s.otHistory.length > 0 && (
                    <div className="mt-3 bg-white p-2 rounded border border-gray-200">
                        <div className="text-xs font-bold text-gray-500 mb-2 flex items-center gap-1"><History size={12}/> 加班/補休 歷年沖抵明細</div>
                        <div className="max-h-32 overflow-y-auto space-y-1">
                            {s.otHistory.map((h, i) => (
                                <div key={i} className="flex justify-between items-center text-[11px] p-1.5 border-b border-gray-50 last:border-0 hover:bg-gray-50">
                                    <span className="text-gray-500 w-16">{h.date.substring(5)}</span>
                                    <span className={`font-bold w-12 text-right ${h.hours > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                                        {h.hours > 0 ? `+${h.hours}` : h.hours} hr
                                    </span>
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
                                        {data.hours > 0 && typeInfo?.id !== 'annual' && typeInfo?.id !== 'menstrual' && (
                                            <div className="text-[10px] text-gray-500 mt-0.5">
                                                時數抵扣: {data.compHours}h / 月底扣薪: {data.deductHours}h
                                            </div>
                                        )}
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
const PayrollView = ({ users, currentDate }) => {
    const [targetMonth, setTargetMonth] = useState(`${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}`);
    const [payrollData, setPayrollData] = useState({});
    useEffect(() => { const unsub = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'payrolls', targetMonth), (docSnap) => { if (docSnap.exists()) setPayrollData(docSnap.data().records || {}); else setPayrollData({}); }); return () => unsub(); }, [targetMonth]);
    const updatePayroll = async (uid, field, value) => { const newData = { ...payrollData, [uid]: { ...(payrollData[uid] || {}), [field]: value } }; setPayrollData(newData); await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'payrolls', targetMonth), { records: newData }, { merge: true }); };
    const activeUsers = Object.values(users).filter(u => !u.isResigned);

    return (
        <div className="space-y-4 pb-20">
            <div className="bg-white p-4 rounded-xl border flex justify-between items-center"><h2 className="font-bold flex gap-2 text-indigo-700"><DollarSign/> 薪資與福利管理 (管理員)</h2><input type="month" value={targetMonth} onChange={e=>setTargetMonth(e.target.value)} className="border rounded px-2"/></div>
            <div className="bg-white rounded-xl border overflow-x-auto">
                <table className="w-full text-sm text-left"><thead className="bg-gray-50 text-gray-500 font-bold border-b"><tr><th className="p-3">姓名</th><th className="p-3 w-24">本薪</th><th className="p-3 w-24">補助/津貼</th><th className="p-3 w-24 bg-pink-50 text-pink-700">生日禮金</th><th className="p-3 w-24 bg-purple-50 text-purple-700">三節獎金</th><th className="p-3 w-24 bg-yellow-50 text-yellow-700">年終獎金</th><th className="p-3">備註</th></tr></thead><tbody>{activeUsers.map(u => { const record = payrollData[u.uid] || {}; return (<tr key={u.uid} className="border-b hover:bg-gray-50"><td className="p-3 font-bold">{u.name}</td><td className="p-3"><input type="number" placeholder="0" className="w-full border rounded px-1" value={record.base || ''} onChange={e=>updatePayroll(u.uid, 'base', e.target.value)}/></td><td className="p-3"><input type="number" placeholder="0" className="w-full border rounded px-1" value={record.subsidy || ''} onChange={e=>updatePayroll(u.uid, 'subsidy', e.target.value)}/></td><td className="p-3 bg-pink-50"><input type="number" placeholder="0" className="w-full border rounded px-1" value={record.bonus_bday || ''} onChange={e=>updatePayroll(u.uid, 'bonus_bday', e.target.value)}/></td><td className="p-3 bg-purple-50"><input type="number" placeholder="0" className="w-full border rounded px-1" value={record.bonus_festival || ''} onChange={e=>updatePayroll(u.uid, 'bonus_festival', e.target.value)}/></td><td className="p-3 bg-yellow-50"><input type="number" placeholder="0" className="w-full border rounded px-1" value={record.bonus_year || ''} onChange={e=>updatePayroll(u.uid, 'bonus_year', e.target.value)}/></td><td className="p-3"><input type="text" placeholder="..." className="w-full border rounded px-1" value={record.note || ''} onChange={e=>updatePayroll(u.uid, 'note', e.target.value)}/></td></tr>); })}</tbody></table>
            </div>
        </div>
    );
};

// --- Settings View (🔴 支援班別管理) ---
const SettingsView = ({ users, currentUser, leaveTypes, shiftTypes, appId, storeConfig, db }) => {
  const userList = Object.values(users);
  const currentUserInfo = users[currentUser.uid] || {};
  const isCurrentUserAdmin = currentUserInfo.isAdmin || currentUser?.email === ADMIN_EMAIL;
  
  const [newLeave, setNewLeave] = useState({ label: '', note: '', color: 'bg-gray-100 text-gray-700' });
  const [newShift, setNewShift] = useState({ id: '', label: '', start: '09:00', end: '18:00' });
  
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({});
  const [showResigned, setShowResigned] = useState(false);

  const [locConfig, setLocConfig] = useState(storeConfig || { lat: '', lng: '', radius: 50 });
  useEffect(() => { if (storeConfig) setLocConfig(storeConfig); }, [storeConfig]);
  
  const handleGetLocation = () => {
      if (!navigator.geolocation) return alert("您的瀏覽器不支援定位功能");
      navigator.geolocation.getCurrentPosition(
          (pos) => setLocConfig({ ...locConfig, lat: pos.coords.latitude, lng: pos.coords.longitude }),
          (err) => alert("無法獲取定位，請確認已允許權限。"),
          { enableHighAccuracy: true }
      );
  };
  const handleSaveLocation = async () => {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'storeLocation'), locConfig);
      alert("打卡座標設定已儲存！");
  };

  const addLeave = async () => { if(!newLeave.label) return; const types = [...leaveTypes, { ...newLeave, id: Math.random().toString(36).substr(2,9) }]; await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'leaves'), { types }); setNewLeave({ label: '', note: '', color: 'bg-gray-100 text-gray-700' }); };
  
  // 🔴 儲存班別
  const addShiftType = async () => { 
      if(!newShift.label || !newShift.start || !newShift.end) return alert("請填寫完整班別資訊"); 
      const id = newShift.label.trim();
      if (shiftTypes.find(st => st.id === id)) return alert("班別代號已存在");
      const types = [...shiftTypes, { ...newShift, id }]; 
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'shiftTypes'), { types }); 
      setNewShift({ id: '', label: '', start: '09:00', end: '18:00' }); 
  };
  const deleteShiftType = async (idToDelete) => {
      const types = shiftTypes.filter(t => t.id !== idToDelete);
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'shiftTypes'), { types });
  };

  const saveUser = async () => { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', editingId), formData); setEditingId(null); };
  const handleImageUpload = (e) => { const file = e.target.files[0]; if (!file) return; if (file.size > 1024 * 1024) { alert("圖片檔案過大，請使用 1MB 以下的圖片"); return; } const reader = new FileReader(); reader.onloadend = () => { setFormData({ ...formData, bankImage: reader.result }); }; reader.readAsDataURL(file); };
  const visibleUsers = useMemo(() => { let list = userList; if (!isCurrentUserAdmin) list = list.filter(u => u.uid === currentUser.uid); else if (!showResigned) list = list.filter(u => !u.isResigned); return list; }, [userList, currentUser, isCurrentUserAdmin, showResigned]);

  return (
    <div className="space-y-6 pb-20">
      <div className="bg-white p-6 rounded-xl border shadow-sm text-center">
        <h2 className="font-bold text-xl">{currentUserInfo.name}</h2>
        <div className="mt-4 bg-green-50 p-3 rounded-lg border border-green-100 text-left">
            <h4 className="text-sm font-bold text-green-800 flex items-center gap-2"><Smartphone size={16}/> LINE 通知綁定</h4>
            <p className="text-xs text-gray-600 mb-2">請在公司 LINE 官方帳號輸入 <span className="font-bold text-red-500">查ID</span>，並將回傳的代碼貼在下方：</p>
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
      
      {isCurrentUserAdmin && (
          <div className="bg-white p-4 rounded-xl border shadow-sm">
              <h3 className="font-bold mb-3 flex gap-2 text-indigo-700"><Map size={18}/> 打卡定位設定 (GPS防作弊)</h3>
              <p className="text-xs text-gray-500 mb-3">請在您的店面內按下「獲取目前位置」，系統會將此處設為打卡中心點。</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                  <div><label className="block text-xs font-bold text-gray-700 mb-1">緯度 (Latitude)</label><input type="number" value={locConfig.lat} onChange={e=>setLocConfig({...locConfig, lat: parseFloat(e.target.value)})} className="w-full border rounded px-3 py-2 text-sm bg-gray-50"/></div>
                  <div><label className="block text-xs font-bold text-gray-700 mb-1">經度 (Longitude)</label><input type="number" value={locConfig.lng} onChange={e=>setLocConfig({...locConfig, lng: parseFloat(e.target.value)})} className="w-full border rounded px-3 py-2 text-sm bg-gray-50"/></div>
              </div>
              <div className="mb-4">
                  <label className="block text-xs font-bold text-gray-700 mb-1">允許打卡半徑 (公尺)</label>
                  <input type="number" value={locConfig.radius} onChange={e=>setLocConfig({...locConfig, radius: parseInt(e.target.value)})} className="w-full border rounded px-3 py-2 text-sm" placeholder="建議設定 50~100 公尺"/>
              </div>
              <div className="flex gap-2">
                  <button onClick={handleGetLocation} className="flex-1 bg-white border border-indigo-200 text-indigo-600 font-bold py-2 rounded shadow-sm hover:bg-indigo-50 flex items-center justify-center gap-1"><MapPin size={16}/> 獲取目前位置</button>
                  <button onClick={handleSaveLocation} className="flex-1 bg-indigo-600 text-white font-bold py-2 rounded shadow hover:bg-indigo-700 flex items-center justify-center gap-1"><Save size={16}/> 儲存設定</button>
              </div>
          </div>
      )}

      {/* 🔴 班別管理區塊 */}
      {isCurrentUserAdmin && (
        <div className="bg-white p-4 rounded-xl border">
            <h3 className="font-bold mb-3 flex gap-2"><Clock size={18}/> 班別管理 (排班與遲到結算用)</h3>
            <div className="grid grid-cols-4 gap-2 mb-3">
                <input placeholder="代號 (如 09A)" value={newShift.label} onChange={e=>setNewShift({...newShift, label:e.target.value})} className="border rounded px-2 text-sm"/>
                <input type="time" value={newShift.start} onChange={e=>setNewShift({...newShift, start:e.target.value})} className="border rounded px-2 text-sm"/>
                <input type="time" value={newShift.end} onChange={e=>setNewShift({...newShift, end:e.target.value})} className="border rounded px-2 text-sm"/>
                <button onClick={addShiftType} className="bg-indigo-600 text-white rounded flex justify-center items-center"><Plus size={18}/></button>
            </div>
            <div className="space-y-2">
                {shiftTypes.map(st => (
                    <div key={st.id} className="flex justify-between items-center bg-gray-50 p-2 rounded border border-gray-100">
                        <div>
                            <span className="font-bold text-gray-700 mr-2">{st.label}</span>
                            <span className="text-xs text-gray-500 font-mono bg-white px-1 rounded border">{st.start} ~ {st.end}</span>
                        </div>
                        <button onClick={()=>deleteShiftType(st.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={16}/></button>
                    </div>
                ))}
            </div>
        </div>
      )}

      {isCurrentUserAdmin && (
        <div className="bg-white p-4 rounded-xl border"><h3 className="font-bold mb-3 flex gap-2"><BookOpen size={18}/> 假別管理</h3><div className="flex gap-2 mb-3"><input placeholder="名稱" value={newLeave.label} onChange={e=>setNewLeave({...newLeave, label:e.target.value})} className="border rounded px-2 w-20"/><input placeholder="說明" value={newLeave.note} onChange={e=>setNewLeave({...newLeave, note:e.target.value})} className="border rounded px-2 flex-1"/><button onClick={addLeave} className="bg-indigo-600 text-white px-3 rounded"><Plus/></button></div><div className="space-y-2">{leaveTypes.filter(lt=>lt.id!=='comp').map(l => (<div key={l.id} className="flex justify-between items-center bg-gray-50 p-2 rounded"><span className={`text-xs px-2 py-1 rounded ${l.color}`}>{l.label}</span><span className="text-xs text-gray-500 truncate flex-1 mx-2">{l.note}</span><button onClick={async()=>{ const types = leaveTypes.filter(t=>t.id!==l.id); await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'leaves'), { types }); }} className="text-gray-400"><Trash2 size={14}/></button></div>))}</div></div>
      )}
      <div className="bg-white p-4 rounded-xl border">
         <div className="flex justify-between items-center mb-3"><h3 className="font-bold flex gap-2"><Users size={18}/> 資料設定</h3>{isCurrentUserAdmin && (<label className="text-xs flex items-center gap-1 text-gray-500 cursor-pointer"><input type="checkbox" checked={showResigned} onChange={e=>setShowResigned(e.target.checked)} />顯示已離職</label>)}</div>
         {visibleUsers.map(u => (
           <div key={u.uid} className={`border-b py-3 last:border-0 ${u.isResigned ? 'opacity-50 bg-gray-50' : ''}`}>
             {editingId === u.uid ? (
               <div className="space-y-3 p-3 bg-gray-50 rounded">
                 <div className="grid grid-cols-2 gap-2"><div><label className="text-xs text-gray-500">姓名</label><input value={formData.name} onChange={e=>setFormData({...formData, name:e.target.value})} className="w-full border p-2 rounded"/></div>{isCurrentUserAdmin && (<div><label className="text-xs text-gray-500">在職狀態</label><select value={formData.isResigned ? 'true' : 'false'} onChange={e=>setFormData({...formData, isResigned: e.target.value === 'true'})} className="w-full border p-2 rounded bg-white"><option value="false">在職中</option><option value="true">已離職</option></select></div>)}</div>
                 {isCurrentUserAdmin && (<div className="space-y-2 border-t pt-2 mt-2"><div className="text-xs font-bold text-indigo-600 flex items-center gap-1"><Lock size={10}/> 敏感資料</div><div className="grid grid-cols-2 gap-2"><input placeholder="到職日 (YYYY-MM-DD)" value={formData.startDate || ''} onChange={e=>setFormData({...formData, startDate:e.target.value})} className="border p-2 rounded text-sm"/><input placeholder="電話" value={formData.phone || ''} onChange={e=>setFormData({...formData, phone:e.target.value})} className="border p-2 rounded text-sm"/><input placeholder="出生年月日" value={formData.birthday || ''} onChange={e=>setFormData({...formData, birthday:e.target.value})} className="border p-2 rounded text-sm"/><input placeholder="身分證字號" value={formData.nationalId || ''} onChange={e=>setFormData({...formData, nationalId:e.target.value})} className="border p-2 rounded text-sm"/></div><div><label className="text-xs text-gray-500 block mb-1">銀行存摺封面</label><div className="flex items-center gap-2"><label className="cursor-pointer bg-white border border-gray-300 text-gray-600 px-3 py-1.5 rounded text-xs hover:bg-gray-50 flex items-center gap-1"><Upload size={12}/> 上傳圖片<input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" /></label>{formData.bankImage && <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 size={12}/> 已選取</span>}</div>{formData.bankImage && (<img src={formData.bankImage} alt="Bank" className="mt-2 h-20 object-contain border rounded bg-white" />)}</div></div>)}
                 <div className="flex gap-2 justify-end mt-2"><button onClick={()=>setEditingId(null)} className="px-3 py-1 bg-gray-200 rounded">取消</button><button onClick={saveUser} className="px-3 py-1 bg-indigo-600 text-white rounded">儲存</button></div>
               </div>
             ) : (
               <div className="flex justify-between items-center"><div><div className="font-bold flex items-center gap-2">{u.name}{u.isResigned && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded flex items-center gap-0.5"><UserX size={10}/> 已離職</span>}</div>{isCurrentUserAdmin && u.startDate && <div className="text-xs text-gray-400">到職: {u.startDate}</div>}</div><button onClick={()=>{setEditingId(u.uid);setFormData(u)}} className="text-indigo-600 text-sm">編輯</button></div>
             )}
           </div>
         ))}
      </div>
    </div>
  );
};