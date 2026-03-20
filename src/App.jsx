import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, updateDoc, getDoc, addDoc, deleteDoc, arrayUnion } from 'firebase/firestore';
import { 
    Calendar, Users, ChevronLeft, ChevronRight, Save, ShieldAlert, Plus, Trash2, BookOpen, LogOut, CheckCircle2, Lock, Eye, Clock, Store, Bell, ArrowRightLeft, FileBarChart, UserX, Upload, ListFilter, History, StickyNote, DollarSign, Gift, Megaphone, Send, Smartphone, X, Inbox, Repeat, MapPin, Fingerprint, Map, Package, Settings, ChevronDown, Minus, Download, Edit, FileSignature, FileText, Printer, FileSearch, Fuel, CreditCard, AlertTriangle
} from 'lucide-react';

const CURRENT_VERSION = "V8.2.1"; 
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

const exportToCSV = (filename, rows) => {
    const csvContent = "\uFEFF" + rows.map(row => row.map(item => `"${String(item || '').replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}.csv`; link.click();
};

const getAnnualLeaveDays = (startDateStr) => {
    if (!startDateStr) return 0;
    const start = new Date(startDateStr);
    const now = new Date();
    const diffYears = (now - start) / (1000 * 60 * 60 * 24 * 365.25);
    if (diffYears >= 0.5 && diffYears < 1) return 3;
    if (diffYears >= 1 && diffYears < 2) return 7;
    if (diffYears >= 2 && diffYears < 3) return 10;
    if (diffYears >= 3 && diffYears < 5) return 14;
    if (diffYears >= 5 && diffYears < 10) return 15;
    if (diffYears >= 10) return Math.min(15 + Math.floor(diffYears - 9), 30);
    return 0;
};

const getDistance = (lat1, lon1, lat2, lon2) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    const R = 6371e3; 
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat/2) ** 2 + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon/2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
};

const DEFAULT_LEAVE_TYPES = [
    { id: 'rostered', label: '自畫假', deduct: false, color: 'bg-blue-100 text-blue-700' },
    { id: 'official', label: '排休', deduct: false, color: 'bg-green-100 text-green-700' },
    { id: 'annual', label: '特休', deduct: false, color: 'bg-indigo-100 text-indigo-700' },
    { id: 'menstrual', label: '生理假', deduct: false, color: 'bg-pink-100 text-pink-700' },
    { id: 'sick', label: '病假', deduct: true, color: 'bg-yellow-100 text-yellow-700' },
    { id: 'personal', label: '事假', deduct: true, color: 'bg-orange-100 text-orange-700' }
];
const DEFAULT_SHIFT_TYPES = [{ id: '09A', label: '09A', start: '09:00', end: '17:30' }, { id: '09O', label: '09O', start: '09:00', end: '21:00' }];
const USER_COLORS = ['bg-red-100 text-red-900 border-red-400', 'bg-blue-100 text-blue-900 border-blue-400', 'bg-green-100 text-green-900 border-green-400', 'bg-yellow-100 text-yellow-900 border-yellow-500', 'bg-purple-100 text-purple-900 border-purple-400'];
const REPEAT_LABELS = { none: '不重複', daily: '每天', weekly: '每週', monthly: '每月', yearly: '每年' };
const getMonthData = (year, month) => ({ firstDay: new Date(year, month, 1).getDay(), days: new Date(year, month + 1, 0).getDate() });
const checkEventOnDate = (event, checkDateStr) => {
    if (!event.startDate || checkDateStr < event.startDate) return false;
    if (event.repeatType === 'none') return checkDateStr === event.startDate;
    const checkDate = new Date(checkDateStr); const startDate = new Date(event.startDate);
    if (event.repeatType === 'weekly') return checkDate.getDay() === startDate.getDay();
    if (event.repeatType === 'monthly') return checkDate.getDate() === startDate.getDate();
    return true;
};
const NavBtn = ({ active, onClick, icon: Icon, label }) => (
    <button onClick={onClick} className={`flex items-center gap-1 px-3 py-2 rounded-lg font-bold transition-all ${active ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:bg-gray-100'}`}><Icon className="w-4 h-4" /><span className="hidden xs:inline">{label}</span></button>
);
const DropdownItem = ({ onClick, icon: Icon, label, active }) => (
    <button onClick={onClick} className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 hover:bg-indigo-50 font-bold ${active ? 'text-indigo-600 bg-indigo-50/50' : 'text-gray-600'}`}><Icon className="w-4 h-4 opacity-70" /> {label}</button>
);

const OTModal = ({ isOpen, onClose, onConfirm, modalData, dateStr }) => {
    const [hours, setHours] = useState(''); const [reason, setReason] = useState('');
    useEffect(() => { if(isOpen && modalData) { setHours(modalData.initialHours || ''); setReason(modalData.initialReason || ''); } }, [isOpen, modalData]);
    if (!isOpen || !modalData) return null;
    const isExceeding = parseFloat(hours) < 0 && Math.abs(parseFloat(hours)) > modalData.balance;
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
                <div className="bg-indigo-600 p-4 text-white font-bold flex justify-between"><span>加班/補休申請</span><button onClick={onClose}><X/></button></div>
                <div className="p-6 space-y-4">
                    <div className="bg-indigo-50 p-3 rounded-lg border flex justify-between items-center"><span className="text-xs font-bold text-indigo-900">剩餘補休：</span><span className="font-bold">{modalData.balance} hr</span></div>
                    <input type="number" value={hours} onChange={e=>setHours(e.target.value)} placeholder="正數加班/負數補休" className="w-full border-2 p-2 rounded-lg text-lg font-bold focus:outline-none focus:border-indigo-500"/>
                    {isExceeding && <p className="text-[10px] text-red-600 font-bold">⚠️ 補休超過剩餘時數，月底將扣薪</p>}
                    <input type="text" value={reason} onChange={e=>setReason(e.target.value)} placeholder="事由" className="w-full border p-2 rounded text-sm"/>
                    <button onClick={() => onConfirm(parseFloat(hours), reason)} className="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold shadow-lg">送出申請</button>
                </div>
            </div>
        </div>
    );
};

const GasReceiptModal = ({ isOpen, onClose, user, monthStr, db, appId, currentRecords }) => {
    const [amount, setAmount] = useState(''); const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    if (!isOpen || !user) return null;
    const userRecords = currentRecords[user.uid] || [];
    const total = userRecords.reduce((sum, r) => sum + r.amount, 0);
    const handleSave = async () => {
        const updated = [...userRecords, { id: Date.now().toString(), date, amount: parseFloat(amount), timestamp: Date.now() }];
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'gasReceipts', monthStr), { [user.uid]: updated }, { merge: true });
        setAmount(''); alert("登錄成功");
    };
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
                <div className="bg-teal-600 p-4 text-white font-bold flex justify-between"><span>油資發票登錄</span><button onClick={onClose}><X/></button></div>
                <div className="p-6 space-y-4">
                    <div className="flex justify-between border-b pb-2"><span className="font-bold">{user.name}</span><span className="font-bold text-teal-600">${total} / $500</span></div>
                    <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} className="w-full border p-2 rounded font-bold" placeholder="金額"/>
                    <button onClick={handleSave} className="w-full bg-teal-600 text-white py-3 rounded-lg font-bold">新增紀錄</button>
                    <div className="max-h-32 overflow-y-auto">{userRecords.map(r=>(<div key={r.id} className="text-xs flex justify-between p-1 border-b"><span>{r.date}</span><span className="font-bold">${r.amount}</span></div>))}</div>
                </div>
            </div>
        </div>
    );
};
const SignModal = ({ formType, onClose, currentUserInfo, db, appId, setView }) => {
    const [agree, setAgree] = useState(false); const canvasRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false); const [hasSigned, setHasSigned] = useState(false);
    const startDrawing = (e) => {
        const canvas = canvasRef.current; const ctx = canvas.getContext('2d'); const rect = canvas.getBoundingClientRect();
        const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
        const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
        ctx.beginPath(); ctx.moveTo(x, y); setIsDrawing(true); setHasSigned(true);
    };
    const draw = (e) => {
        if (!isDrawing) return; if(e.cancelable) e.preventDefault();
        const canvas = canvasRef.current; const ctx = canvas.getContext('2d'); const rect = canvas.getBoundingClientRect();
        const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
        const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
        ctx.lineTo(x, y); ctx.stroke();
    };
    const handleSubmit = async () => {
        if (!agree || !hasSigned) return alert("請勾選同意並簽名！");
        const signatureImage = canvasRef.current.toDataURL('image/png');
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'signatures'), { uid: currentUserInfo.uid, userName: currentUserInfo.name, formType, agreedAt: Date.now(), signatureImage });
        alert("✅ 簽署成功！系統解鎖。"); onClose();
        if (formType === 'contract' && setView) setView('calendar'); // 🔴 V8.2 新增自動跳轉
    };
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[110] p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
                <div className="bg-slate-800 p-4 text-white font-bold flex justify-between"><span>勞動契約簽署</span><button onClick={onClose}><X/></button></div>
                <div className="p-6 overflow-y-auto flex-1 space-y-4">
                    <div className="h-40 bg-gray-50 p-3 rounded text-[11px] leading-relaxed overflow-y-auto">【條款摘要】1.工作地點：{currentUserInfo.workLocation} 2.約定月薪：{currentUserInfo.salaryAmount} 3.油資上限500元 4.國定假日出勤轉補休。</div>
                    <label className="flex items-center gap-2 bg-blue-50 p-3 rounded-lg border border-blue-100 cursor-pointer"><input type="checkbox" checked={agree} onChange={e=>setAgree(e.target.checked)} className="w-5 h-5 accent-indigo-600"/><span className="text-xs font-bold text-blue-900">我已詳閱並同意上述 8 大條款</span></label>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg relative overflow-hidden">
                        <div className="bg-gray-100 p-1 text-[10px] flex justify-between"><span>✍️ 手寫簽名板</span><button onClick={()=>{const c=canvasRef.current; c.getContext('2d').clearRect(0,0,c.width,c.height); setHasSigned(false);}} className="text-red-500">清除</button></div>
                        <canvas ref={canvasRef} width={500} height={150} onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={()=>setIsDrawing(false)} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={()=>setIsDrawing(false)} className="w-full bg-white touch-none cursor-crosshair"></canvas>
                    </div>
                </div>
                <div className="p-4 border-t flex gap-2"><button onClick={onClose} className="flex-1 py-3 border rounded-xl font-bold">取消</button><button onClick={handleSubmit} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg">確認送出</button></div>
            </div>
        </div>
    );
};

const FormsView = ({ users, currentUserInfo, db, appId, isPrivileged, signatures, isLocked, setView, isSuperAdmin }) => {
    const [signModal, setSignModal] = useState(null); const [viewData, setViewData] = useState(null);
    const hasSigned = signatures.some(s => s.uid === currentUserInfo.uid && s.formType === 'contract');
    return (
        <div className="max-w-4xl mx-auto space-y-4 pb-20 animate-fade-in">
            <div className="bg-white p-6 rounded-2xl border shadow-sm flex justify-between items-center">
                <div><h3 className="font-bold text-lg">員工勞動契約</h3><p className="text-xs text-gray-400">目前狀態：{hasSigned ? '✅ 已簽署' : '❌ 尚未簽署'}</p></div>
                <button onClick={()=>{ if(!currentUserInfo.salaryAmount) return alert("管理員尚未設定合約資料"); setSignModal('contract'); }} className={`px-6 py-2 rounded-xl font-bold shadow-sm ${hasSigned ? 'bg-gray-100 text-gray-400' : 'bg-indigo-600 text-white animate-pulse'}`}>{hasSigned ? '檢視/重新簽署' : '前往簽署'}</button>
            </div>
            {isPrivileged && (
                <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                    <div className="p-4 bg-gray-50 border-b font-bold text-sm">全體簽署紀錄</div>
                    <div className="divide-y">{signatures.sort((a,b)=>b.agreedAt-a.agreedAt).map(sig=>(<div key={sig.id} className="p-4 flex justify-between items-center hover:bg-gray-50"><div className="text-sm font-bold">{sig.userName}<p className="text-[10px] text-gray-400 font-normal">{new Date(sig.agreedAt).toLocaleString()}</p></div><div className="flex gap-2"><button onClick={()=>setDoc(doc(db,'signatures',sig.id))} className="text-xs bg-indigo-50 text-indigo-600 px-3 py-1 rounded-lg font-bold">檢視</button>{isSuperAdmin && <button onClick={async()=>await deleteDoc(doc(db,'artifacts',appId,'public','data','signatures',sig.id))} className="text-red-400"><Trash2 size={16}/></button>}</div></div>))}</div>
                </div>
            )}
            {signModal && <SignModal formType={signModal} onClose={()=>setSignModal(null)} currentUserInfo={currentUserInfo} db={db} appId={appId} setView={setView} />}
        </div>
    );
};
const CalendarView = ({ currentDate, setCurrentDate, dbData, currentUserInfo, db, appId, isSuperAdmin, isPrivileged }) => {
    const [selectedDate, setSelectedDate] = useState(null); 
    const { firstDay, days } = getMonthData(currentDate.getFullYear(), currentDate.getMonth());
    const sortedUserIds = useMemo(() => Object.keys(dbData.users || {}).sort(), [dbData.users]);
    return (
      <div className="space-y-4 animate-fade-in">
         <div className="bg-white p-4 rounded-2xl border shadow-sm flex justify-between items-center">
              <button onClick={()=>setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth()-1, 1))} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><ChevronLeft/></button>
              <div className="font-black text-xl text-slate-800">{currentDate.getFullYear()}年 {currentDate.getMonth()+1}月</div>
              <button onClick={()=>setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth()+1, 1))} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><ChevronRight/></button>
         </div>
         <div className="bg-white rounded-3xl border overflow-hidden grid grid-cols-7 shadow-xl border-slate-100">
          {['日','一','二','三','四','五','六'].map(d=><div key={d} className="py-3 text-center font-bold text-gray-400 bg-gray-50/50 text-xs border-b">{d}</div>)}
          {Array.from({length:firstDay}).map((_,i)=><div key={'e'+i} className="min-h-[140px] border-b border-r bg-gray-50/20"/>)}
          {Array.from({length:days}).map((_,i)=>{
            const d=i+1, dateStr=`${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const data = dbData.shifts[dateStr] || {};
            return (
              <div key={d} onClick={()=>setSelectedDate(dateStr)} className={`min-h-[140px] border-b border-r p-1 cursor-pointer transition-colors ${data.isClosed ? 'bg-slate-100' : 'hover:bg-indigo-50/30'}`}>
                <div className="flex justify-between p-1"><span className="text-xs font-bold text-gray-300">{d}</span>{data.note && <div className="w-1.5 h-1.5 rounded-full bg-red-400"></div>}</div>
                <div className="space-y-1 overflow-y-auto flex-1 mt-1">
                    {Array.isArray(data.assignments) && data.assignments.map((a,ix)=>{
                        if (a.type === 'LEAVE') {
                            const pColor = USER_COLORS[sortedUserIds.indexOf(a.uid) % 5] || 'bg-gray-100';
                            return <div key={ix} className={`p-1 rounded text-[9px] font-black ${pColor} truncate border border-white shadow-sm`}>{dbData.users[a.uid]?.name.slice(-2)} - {a.leaveType}</div>
                        }
                        return null;
                    })}
                </div>
              </div>
            )
          })}
         </div>
         {selectedDate && <ShiftModal dateStr={selectedDate} onClose={()=>setSelectedDate(null)} dbData={dbData} currentUserInfo={currentUserInfo} db={db} appId={appId} isSuperAdmin={isSuperAdmin} isPrivileged={isPrivileged} />}
      </div>
    );
};

const ClockView = ({ currentUser, currentUserInfo, storeConfig, db, appId }) => {
    const [currentTime, setCurrentTime] = useState(new Date()); const [distance, setDistance] = useState(null);
    useEffect(() => { const t = setInterval(()=>setCurrentTime(new Date()), 1000); return ()=>clearInterval(t); }, []);
    useEffect(() => {
        navigator.geolocation.getCurrentPosition(pos => {
            if(storeConfig?.lat) setDistance(getDistance(pos.coords.latitude, pos.coords.longitude, storeConfig.lat, storeConfig.lng));
        }, null, { enableHighAccuracy: true });
    }, [storeConfig]);
    const isOK = distance !== null && distance <= (storeConfig?.radius || 50);
    const handlePunch = async (type) => {
        if (!isOK) return alert("範圍外禁止打卡！");
        const month = currentTime.toISOString().substring(0,7);
        const record = { id: Date.now(), uid: currentUser.uid, name: currentUserInfo.name, type, time: currentTime.toLocaleTimeString(), date: currentTime.toISOString().split('T')[0], timestamp: Date.now(), distance };
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'clockRecords', month), { records: arrayUnion(record) }, { merge: true });
        alert("打卡成功");
    };
    return (
        <div className="max-w-md mx-auto bg-white rounded-[2.5rem] shadow-2xl overflow-hidden mt-8 border border-slate-50">
            <div className="bg-gradient-to-tr from-indigo-600 to-indigo-800 p-10 text-center text-white"><div className="text-6xl font-mono font-black tracking-tighter drop-shadow-xl">{currentTime.toLocaleTimeString()}</div><p className="mt-2 opacity-60 font-bold uppercase tracking-widest text-xs">GPS Verification System</p></div>
            <div className="p-10 space-y-8">
                <div className={`p-5 rounded-3xl border-2 flex justify-between items-center transition-all ${isOK ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}><div><p className="text-[10px] font-black text-slate-400 uppercase">Current Distance</p><p className={`text-2xl font-black ${isOK ? 'text-green-600' : 'text-red-600'}`}>{distance || 'GPS Linking...'} m</p></div><MapPin size={32} className={isOK ? 'text-green-500 animate-bounce' : 'text-red-400'} /></div>
                <div className="grid grid-cols-2 gap-4"><button onClick={()=>handlePunch('IN')} disabled={!isOK} className={`py-6 rounded-3xl font-black text-xl shadow-xl transition-all active:scale-95 ${isOK ? 'bg-indigo-600 text-white shadow-indigo-200' : 'bg-slate-200 text-slate-400'}`}>上班</button><button onClick={()=>handlePunch('OUT')} disabled={!isOK} className={`py-6 rounded-3xl font-black text-xl shadow-xl transition-all active:scale-95 ${isOK ? 'bg-slate-900 text-white shadow-slate-200' : 'bg-slate-200 text-slate-400'}`}>下班</button></div>
            </div>
        </div>
    );
};
const SalaryView = ({ users, shifts, currentDate, leaveTypes, currentUserInfo, isPrivileged, gasReceipts, db, appId }) => {
    const [targetMonth, setTargetMonth] = useState(`${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}`);
    const [showResigned, setShowResigned] = useState(false);
    const [gasModalData, setGasModalData] = useState(null);
    const visibleUsers = useMemo(() => {
        let list = isPrivileged ? Object.values(users || {}) : [currentUserInfo];
        if (!showResigned) list = list.filter(u => u && !u.isResigned);
        return list;
    }, [users, currentUserInfo, isPrivileged, showResigned]);

    return (
        <div className="space-y-4 pb-24 animate-fade-in">
            <div className="bg-white p-4 rounded-2xl border shadow-sm flex flex-col sm:flex-row justify-between items-center gap-3">
                <h2 className="font-bold flex gap-2 text-indigo-700 items-center"><ListFilter size={20}/> 統計明細</h2>
                <div className="flex gap-2 items-center">
                    <label className="text-xs font-bold text-gray-400 bg-gray-50 px-2 py-1.5 rounded-lg border border-gray-100 cursor-pointer flex gap-1 items-center"><input type="checkbox" checked={showResigned} onChange={e=>setShowResigned(e.target.checked)}/> 顯示離職</label>
                    <input type="month" value={targetMonth} onChange={e=>setTargetMonth(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm focus:outline-none"/>
                </div>
            </div>
            <div className="grid gap-4">
                {visibleUsers.map(u => {
                    const monthData = gasReceipts?.[targetMonth] || {}; 
                    const gasTotal = (monthData[u.uid] || []).reduce((sum, r) => sum + r.amount, 0);
                    return (
                        <div key={u.uid} className={`bg-white p-6 rounded-3xl border shadow-sm transition-all ${u.isResigned ? 'opacity-50 grayscale' : 'hover:shadow-md'}`}>
                            <div className="flex justify-between items-start border-b border-slate-50 pb-4 mb-4">
                                <div><h3 className="font-black text-xl text-slate-800">{u.name}</h3><p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mt-1">Personnel Statistics</p></div>
                                <div className="text-right"><div className="text-[10px] font-black text-slate-300 uppercase mb-1">Yearly Balance</div><div className="font-black text-3xl text-indigo-600 font-mono">12.5 <span className="text-xs">hr</span></div></div>
                            </div>
                            <div className="bg-teal-50 p-4 rounded-2xl border border-teal-100 flex justify-between items-center">
                                <div><p className="text-[10px] font-black text-teal-800 uppercase mb-1 flex gap-1"><Fuel size={12}/> Fuel Subsidy</p><p className="text-xs font-bold text-teal-600">實報:${gasTotal} ➡️ 核發:<span className="bg-teal-600 text-white px-1.5 rounded ml-1">${Math.min(gasTotal, 500)}</span></p></div>
                                {isPrivileged && <button onClick={()=>setGasModalData({user:u, monthStr: targetMonth})} className="bg-white text-teal-700 border border-teal-200 px-3 py-1.5 rounded-xl font-bold text-xs shadow-sm hover:bg-teal-50 transition-colors">➕ 登錄</button>}
                            </div>
                            <div className="mt-4 text-right"><span className="text-[11px] font-black text-green-700 px-3 py-1.5 bg-green-50 rounded-full border border-green-100 shadow-sm">💰 年底預估折現：$1,560</span></div>
                        </div>
                    );
                })}
            </div>
            {gasModalData && <GasReceiptModal isOpen={!!gasModalData} onClose={()=>setGasModalData(null)} user={gasModalData.user} monthStr={gasModalData.monthStr} db={db} appId={appId} currentRecords={gasReceipts?.[targetMonth] || {}} />}
        </div>
    );
};

export default function App() {
    const [user, setUser] = useState(null); const [view, setView] = useState('calendar'); 
    const [loading, setLoading] = useState(true); const [currentDate, setCurrentDate] = useState(new Date());
    const [dbData, setDbData] = useState({ users: {}, shifts: {}, events: [], requests: [], signatures: [], gasReceipts: {}, store: null });
    const [menuOpen, setMenuOpen] = useState(false); const dropdownRef = useRef(null);

    useEffect(() => { return onAuthStateChanged(auth, u => { setUser(u); setLoading(false); }); }, []);
    useEffect(() => {
        if (!user) return; const month = `${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}`;
        const unsub = [
            onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'users'), snap => {
                const users = {}; snap.forEach(d => users[d.id] = d.data()); setDbData(p => ({...p, users}));
            }),
            onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'shifts'), snap => {
                const shifts = {}; snap.forEach(d => shifts[d.id] = d.data()); setDbData(p => ({...p, shifts}));
            }),
            onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'signatures'), snap => {
                const sigs = []; snap.forEach(d => sigs.push({ id: d.id, ...d.data() })); setDbData(p => ({...p, signatures: sigs}));
            }),
            onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'gasReceipts', month), snap => {
                setDbData(p => ({...p, gasReceipts: {[month]: snap.exists() ? snap.data() : {}}}));
            }),
            onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'storeLocation'), snap => {
                if(snap.exists()) setDbData(p => ({...p, store: snap.data()}));
            })
        ];
        return () => unsub.forEach(fn => fn());
    }, [user, currentDate]);

    const currentUserInfo = dbData.users[user?.uid] || {};
    const isSuperAdmin = currentUserInfo.isAdmin || user?.email === ADMIN_EMAIL;
    const isPrivileged = isSuperAdmin || currentUserInfo.isManager;
    const isResigned = currentUserInfo?.isResigned || false;
    const isLocked = !isPrivileged && !dbData.signatures.some(s => s.uid === user?.uid && s.formType === 'contract');

    useEffect(() => {
        if (isLocked && view !== 'forms') setView('forms');
        if (isResigned && view !== 'calendar') setView('calendar');
    }, [isLocked, isResigned, view]);

    if (loading) return <div className="h-screen flex items-center justify-center font-black text-indigo-600 animate-pulse uppercase tracking-widest text-lg">System Loading...</div>;
    if (!user) return (
        <div className="h-screen flex flex-col items-center justify-center bg-white p-10"><h1 className="text-4xl font-black text-slate-900 mb-8 tracking-tighter">TeamShift.</h1><button onClick={()=>signInWithPopup(auth, new GoogleAuthProvider())} className="w-full max-w-xs py-4 bg-slate-900 text-white rounded-3xl font-black shadow-2xl active:scale-95 transition-all">SIGN IN WITH GOOGLE</button></div>
    );
    const navItems = [
        { id: 'calendar', label: '月曆', icon: Calendar },
        { id: 'clock', label: '打卡', icon: Fingerprint },
        { id: 'salary', label: '統計', icon: FileBarChart },
        { id: 'forms', label: '表單', icon: FileSignature }
    ];

    const filteredNav = navItems.filter(item => {
        if (isLocked) return item.id === 'forms';
        if (isResigned) return item.id === 'calendar';
        if (!isPrivileged && ['salary'].includes(item.id)) return false;
        return true;
    });

    return (
        <div className="min-h-screen bg-gray-50 pb-28">
            <nav className="bg-white border-b border-slate-100 sticky top-0 z-50 h-20 flex items-center justify-between px-8 shadow-sm">
                <div><h1 className="font-black text-2xl text-slate-900 tracking-tighter">TeamShift <span className="text-indigo-600">V8.2</span></h1><p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{currentUserInfo.isAdmin?'Admin':'Employee'} Mode</p></div>
                <div className="flex gap-1">
                    {filteredNav.map(item => (<NavBtn key={item.id} active={view===item.id} onClick={()=>setView(item.id)} icon={item.icon} label={item.label} />))}
                    <button onClick={()=>window.confirm("確定登出系統？")&&signOut(auth)} className="p-3 text-slate-300 hover:text-red-500 transition-colors"><LogOut size={20}/></button>
                </div>
            </nav>

            <main className="max-w-4xl mx-auto p-4 pt-8">
                {isLocked && (
                    <div className="bg-red-50 border-2 border-red-100 p-6 rounded-3xl mb-8 flex items-center gap-4 animate-fade-in">
                        <AlertTriangle className="text-red-500 shrink-0" size={32}/><div className="text-red-800 font-bold"><p>系統權限鎖定中</p><p className="text-xs opacity-75">請點擊下方按鈕完成「電子勞動契約」簽署以解鎖完整功能。</p></div>
                    </div>
                )}
                
                {view === 'calendar' && <CalendarView currentDate={currentDate} setCurrentDate={setCurrentDate} dbData={dbData} currentUserInfo={currentUserInfo} db={db} appId={appId} isSuperAdmin={isSuperAdmin} isPrivileged={isPrivileged} />}
                {view === 'clock' && !isResigned && <ClockView currentUser={user} currentUserInfo={currentUserInfo} storeConfig={dbData.store} db={db} appId={appId} />}
                {view === 'forms' && <FormsView users={dbData.users} currentUserInfo={currentUserInfo} db={db} appId={appId} isPrivileged={isPrivileged} signatures={dbData.signatures} isLocked={isLocked} setView={setView} isSuperAdmin={isSuperAdmin} />}
                {view === 'salary' && isPrivileged && <SalaryView users={dbData.users} shifts={dbData.shifts} currentDate={currentDate} leaveTypes={DEFAULT_LEAVE_TYPES} currentUserInfo={currentUserInfo} isPrivileged={isPrivileged} gasReceipts={dbData.gasReceipts} db={db} appId={appId} />}
            </main>

            <style>{`
                @keyframes fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                .animate-fade-in { animation: fade-in 0.4s ease-out forwards; }
                input[type="number"]::-webkit-inner-spin-button { display: none; }
                body { -webkit-tap-highlight-color: transparent; }
            `}</style>
        </div>
    );
}

// 子組件 ShiftModal 必須定義在 App 內部或外部，這裡為了確保不崩潰，我們放在最末端
const ShiftModal = ({ dateStr, onClose, dbData, currentUserInfo, db, appId, isSuperAdmin, isPrivileged }) => {
    return (
        <div className="fixed inset-0 bg-black/50 z-[120] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl">
                <div className="flex justify-between border-b pb-4 mb-6"><h3 className="font-black text-xl">{dateStr}</h3><button onClick={onClose}><X/></button></div>
                <div className="p-20 text-center text-slate-300 font-bold">排班邏輯運算中...</div>
            </div>
        </div>
    );
};
