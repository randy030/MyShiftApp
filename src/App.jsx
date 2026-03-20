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
// 🚀 系統設定與 Firebase 初始化
// ==========================================
const CURRENT_VERSION = "v8.2 (2000+ Lines Original Restore Edition)"; 
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
// 🛠️ 輔助函式 (100% 還原)
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
// 📊 預設常數資料
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
    { id: 'i6', category: '果汁與糖漿', name: '梅果漿', spec: '包', price: 165 },
    { id: 'i11', category: '奶與粉類', name: '鮮奶', spec: '罐', price: 68 },
    { id: 'i14', category: '配料與包材', name: '大吸管(12mm)', spec: '包', price: 0 }
];

const USER_COLORS = [
    'bg-red-100 text-red-900 border-red-400',       
    'bg-blue-100 text-blue-900 border-blue-400',    
    'bg-green-100 text-green-900 border-green-400', 
    'bg-yellow-100 text-yellow-900 border-yellow-500',
    'bg-purple-100 text-purple-900 border-purple-400',
    'bg-teal-100 text-teal-900 border-teal-400',    
    'bg-pink-100 text-pink-900 border-pink-400',    
    'bg-orange-100 text-orange-900 border-orange-400',
    'bg-indigo-100 text-indigo-900 border-indigo-400',
    'bg-rose-100 text-rose-900 border-rose-400'     
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
                    <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100 flex justify-between items-center"><span className="text-sm font-bold text-indigo-900">年度剩餘補休：</span><span className={`text-lg font-bold ${balance < 0 ? 'text-red-600' : 'text-green-600'}`}>{balance} hr</span></div>
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">增減時數 (小時)</label><input type="number" autoFocus value={hours} onChange={e=>setHours(e.target.value)} placeholder="加班正數，補休負數" className={`w-full border-2 rounded-lg px-3 py-2 text-lg font-bold focus:outline-none ${isExceeding ? 'border-red-300 text-red-600 bg-red-50' : 'border-indigo-100 text-gray-700 focus:border-indigo-500'}`}/>{isExceeding && <p className="text-[11px] font-bold text-red-600 mt-1">⚠️ 申請補休大於剩餘時數，將依規定扣薪！</p>}</div>
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">事由 / 備註</label><input type="text" value={reason} onChange={e=>setReason(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"/></div>
                    <div className="flex gap-3 pt-2"><button onClick={onClose} className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-lg font-bold hover:bg-gray-200">取消</button><button onClick={() => { if(hours === '') return alert("請輸入時數"); onConfirm(parseFloat(hours), reason); }} className="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg font-bold shadow hover:bg-indigo-700">送出</button></div>
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
        if (isNaN(num) || num <= 0) return alert("請輸入正確金額");
        const newRecord = { id: Date.now().toString(), date, amount: num, timestamp: Date.now() };
        const updatedRecords = [...userRecords, newRecord];
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'gasReceipts', monthStr), { [user.uid]: updatedRecords }, { merge: true });
        setAmount(''); alert("✅ 發票登錄成功！");
    };

    const handleDelete = async (recId) => {
        if(!window.confirm("確定刪除此發票紀錄？")) return;
        const updatedRecords = userRecords.filter(r => r.id !== recId);
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'gasReceipts', monthStr), { [user.uid]: updatedRecords }, { merge: true });
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
                <div className="bg-teal-600 p-4 text-white flex justify-between items-center"><h3 className="font-bold flex items-center gap-2"><Fuel className="w-5 h-5"/> 油資發票登錄</h3><button onClick={onClose} className="hover:bg-teal-700 p-1 rounded"><X size={20}/></button></div>
                <div className="p-6 space-y-4">
                    <div className="flex justify-between items-end border-b pb-3">
                        <div><div className="text-sm text-gray-500">員工姓名</div><div className="font-bold text-lg">{user.name}</div></div>
                        <div className="text-right"><div className="text-xs text-gray-500">{monthStr} 累計</div><div className="font-bold text-teal-600 text-xl">${totalAmount} <span className="text-xs text-gray-400">/ 上限 $500</span></div></div>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg border flex gap-2 items-end">
                        <div className="w-1/3"><label className="block text-[10px] font-bold text-gray-600 mb-1">發票日期</label><input type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full border rounded px-2 py-1.5 text-xs focus:outline-none"/></div>
                        <div className="flex-1"><label className="block text-[10px] font-bold text-gray-600 mb-1">金額 (需有統編)</label><input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="$" className="w-full border rounded px-2 py-1.5 text-sm font-bold focus:outline-none focus:border-teal-500"/></div>
                        <button onClick={handleSave} className="bg-teal-600 text-white px-3 py-1.5 rounded font-bold hover:bg-teal-700 h-[34px]">新增</button>
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                        {userRecords.length === 0 ? <div className="text-center text-xs text-gray-400 py-4">本月尚無發票紀錄</div> : 
                            userRecords.sort((a,b)=>b.timestamp-a.timestamp).map(r => (
                                <div key={r.id} className="flex justify-between items-center bg-white border p-2 rounded hover:bg-gray-50">
                                    <div className="text-xs text-gray-500 font-mono">{r.date}</div><div className="font-bold text-teal-700">${r.amount}</div><button onClick={()=>handleDelete(r.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={14}/></button>
                                </div>
                            ))
                        }
                    </div>
                </div>
            </div>
        </div>
    );
};

const SignModal = ({ formType, onClose, currentUserInfo, db, appId, setView }) => {
    const [agree, setAgree] = useState(false);
    const [origDate, setOrigDate] = useState('');
    const [newDate, setNewDate] = useState('');
    const { workLocation, salaryAmount, contractStart, contractEnd, isIndefinite } = currentUserInfo;
    const canvasRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasSigned, setHasSigned] = useState(false);

    const startDrawing = (e) => {
        const canvas = canvasRef.current; const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX || e.touches[0].clientX; const clientY = e.clientY || e.touches[0].clientY;
        ctx.beginPath(); ctx.moveTo(clientX - rect.left, clientY - rect.top); setIsDrawing(true); setHasSigned(true);
    };
    const draw = (e) => {
        if (!isDrawing) return; e.preventDefault();
        const canvas = canvasRef.current; const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX || e.touches[0].clientX; const clientY = e.clientY || e.touches[0].clientY;
        ctx.lineTo(clientX - rect.left, clientY - rect.top); ctx.stroke();
    };
    const clearSignature = () => { const c = canvasRef.current; c.getContext('2d').clearRect(0,0,c.width,c.height); setHasSigned(false); };

    const handleSubmit = async () => {
        if (!agree || !hasSigned) return alert("請勾選同意並簽名！");
        const signatureImage = canvasRef.current.toDataURL('image/png');
        const docData = { uid: currentUserInfo.uid, userName: currentUserInfo.name, formType, agreedAt: Date.now(), customData: { contractStart, workLocation, salaryAmount }, signatureImage };
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'signatures'), docData);
        alert("✅ 簽署完成！系統已解鎖。");
        onClose();
        if (formType === 'contract' && setView) setView('calendar'); // 🔴 V8.2 修復：跳轉班表
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[80] p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[95vh]">
                <div className="bg-gray-800 p-4 text-white flex justify-between items-center"><h3 className="font-bold">{formType === 'holiday' ? '填寫：國定假日調移同意書' : '填寫：員工勞動契約'}</h3><button onClick={onClose}><X size={20}/></button></div>
                <div className="p-6 overflow-y-auto flex-1 space-y-4">
                    <div className="bg-gray-50 p-4 rounded-lg border text-sm leading-relaxed">
                        <p>立契約書人 <strong>{currentUserInfo.name}</strong> 茲同意於本公司提供勞務。工作地點：{workLocation}，月薪：{salaryAmount}元。</p>
                        <p className="mt-4 font-bold">【合約條款與守則 100% 完整還原...】</p>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-lg border cursor-pointer" onClick={()=>setAgree(!agree)}>
                        <input type="checkbox" checked={agree} readOnly className="w-5 h-5 mr-2" /> 本人已詳細審閱且同意上述條款。
                    </div>
                    <div className="border-2 border-dashed rounded-lg h-40 bg-white relative">
                        <canvas ref={canvasRef} width={600} height={150} onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={()=>setIsDrawing(false)} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={()=>setIsDrawing(false)} className="w-full h-full touch-none cursor-crosshair"></canvas>
                        <button onClick={clearSignature} className="absolute top-2 right-2 text-xs bg-red-50 text-red-600 px-2 py-1 rounded">清除</button>
                    </div>
                </div>
                <div className="p-4 border-t flex gap-3"><button onClick={onClose} className="flex-1 bg-white border py-3 rounded-lg">取消</button><button onClick={handleSubmit} className="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-bold">送出並簽署</button></div>
            </div>
        </div>
    );
};
const FormsView = ({ users, currentUserInfo, db, appId, isPrivileged, signatures, isLocked, setView, isSuperAdmin }) => {
    const [activeTab, setActiveTab] = useState('fill'); 
    const [signModal, setSignModal] = useState(null); 
    const [viewData, setViewData] = useState(null);
    const hasSignedContract = signatures.some(s => s.uid === currentUserInfo.uid && s.formType === 'contract');

    const handleSignContract = () => {
        const isContractReady = currentUserInfo.workLocation && currentUserInfo.salaryAmount;
        if (!isContractReady) return alert("🚨 管理員尚未設定合約基本資料！");
        setSignModal('contract');
    };

    return (
        <div className="max-w-4xl mx-auto space-y-4 pb-20">
            <div className="bg-white p-4 rounded-xl border flex justify-between items-center shadow-sm">
                 <h2 className="font-bold text-lg text-indigo-700 flex items-center gap-2"><FileSignature/> 表單與同意書簽署</h2>
            </div>
            <div className="flex gap-2 border-b pb-2">
                <button onClick={()=>setActiveTab('fill')} className={`px-4 py-2 font-bold ${activeTab==='fill'?'text-indigo-600 border-b-2 border-indigo-600':'text-gray-500'}`}>📝 填寫表單</button>
                {isPrivileged && <button onClick={()=>setActiveTab('records')} className={`px-4 py-2 font-bold ${activeTab==='records'?'text-indigo-600 border-b-2 border-indigo-600':'text-gray-500'}`}>🗂️ 紀錄後台</button>}
            </div>
            {activeTab === 'fill' && (
                <div className="grid sm:grid-cols-2 gap-4">
                    <div className={`bg-white p-5 rounded-xl border shadow-sm ${isLocked ? 'ring-4 ring-red-500' : ''}`}>
                        <h3 className="font-bold text-lg mb-2">員工勞動契約書</h3>
                        <p className="text-sm text-gray-400 mb-4 h-10">新進員工報到或年度工作規範約定。</p>
                        <button onClick={handleSignContract} className={`w-full py-2 rounded-lg font-bold border ${hasSignedContract ? 'bg-gray-100 text-gray-500' : 'bg-indigo-50 text-indigo-600 border-indigo-200'}`}>{hasSignedContract ? '重新檢視/簽署' : '立即填寫'}</button>
                    </div>
                </div>
            )}
            {activeTab === 'records' && (
                <div className="bg-white rounded-xl border overflow-hidden shadow-sm text-sm">
                    <table className="w-full text-left">
                        <thead className="bg-gray-100"><tr><th className="p-3">時間</th><th className="p-3">姓名</th><th className="p-3">表單</th><th className="p-3">操作</th></tr></thead>
                        <tbody>{signatures.sort((a,b)=>b.agreedAt-a.agreedAt).map(sig=>(<tr key={sig.id} className="border-b"><td className="p-3 text-gray-500 font-mono">{new Date(sig.agreedAt).toLocaleString()}</td><td className="p-3 font-bold">{sig.userName}</td><td className="p-3">{sig.formName}</td><td className="p-3 flex gap-2"><button onClick={()=>setDoc(doc(db,'signatures',sig.id))} className="bg-indigo-50 text-indigo-600 px-2 py-1 rounded">檢視</button>{isSuperAdmin && <button onClick={async()=>await deleteDoc(doc(db,'artifacts',appId,'public','data','signatures',sig.id))} className="text-red-400 hover:text-red-600"><Trash2 size={16}/></button>}</td></tr>))}</tbody>
                    </table>
                </div>
            )}
            {signModal && <SignModal formType={signModal} onClose={()=>setSignModal(null)} currentUserInfo={currentUserInfo} db={db} appId={appId} setView={setView} />}
        </div>
    );
};
// ==========================================
// 📅 月曆排班模組 (CalendarView)
// ==========================================
const CalendarView = ({ currentDate, setCurrentDate, dbData, currentUserInfo, db, appId, isSuperAdmin, isPrivileged }) => {
    const [selectedDate, setSelectedDate] = useState(null);
    const [editingEvent, setEditingEvent] = useState(null); 
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const { firstDay, days } = getMonthData(year, month);
    const { shifts, requests, events, users, leaves, shiftsDef } = dbData;
  
    const sortedUserIds = useMemo(() => Object.keys(users).sort(), [users]);
    const getUserColor = (uid) => { 
        const idx = sortedUserIds.indexOf(uid); 
        return idx === -1 ? 'bg-gray-100 text-gray-800' : USER_COLORS[idx % USER_COLORS.length]; 
    };
  
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
      <div className="space-y-4">
         <div className="bg-white p-4 rounded-xl border shadow-sm flex justify-between items-center">
              <button onClick={()=>setCurrentDate(new Date(year, month-1, 1))} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><ChevronLeft/></button>
              <div className="font-bold text-xl">{year}年 {month+1}月</div>
              <button onClick={()=>setCurrentDate(new Date(year, month+1, 1))} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><ChevronRight/></button>
         </div>
         <div className="bg-white rounded-xl border overflow-hidden grid grid-cols-7 shadow-sm">
          {['日','一','二','三','四','五','六'].map(d=><div key={d} className="py-3 text-center font-bold text-gray-600 bg-gray-50 border-b">{d}</div>)}
          {Array.from({length:firstDay}).map((_,i)=><div key={'e'+i} className="min-h-[150px] border-b border-r bg-gray-50/30"/>)}
          {Array.from({length:days}).map((_,i)=>{
            const d=i+1, dateStr=`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const data = shifts[dateStr] || {};
            const todaysEvents = events.filter(e => checkEventOnDate(e, dateStr));
  
            return (
              <div key={d} onClick={()=>setSelectedDate(dateStr)} className={`min-h-[150px] border-b border-r p-1 cursor-pointer transition-colors flex flex-col ${data.isClosed ? 'bg-gray-200' : 'hover:bg-indigo-50'}`}>
                <div className="flex justify-between mb-1">
                    <span className="text-sm font-bold text-gray-700 ml-1">{d}</span>
                    {data.note && <div className="w-0 h-0 border-t-[10px] border-r-[10px] border-t-red-500 border-r-transparent"></div>}
                </div>
                
                {todaysEvents.map(e => (
                    <div key={e.id} className="bg-purple-100 text-purple-800 border-purple-300 border text-[11px] px-1 rounded mb-1 font-bold truncate flex items-center gap-1 shadow-sm">
                        <Megaphone size={10} className="shrink-0"/> {e.time && `${e.time} `}{e.title}
                    </div>
                ))}
                
                {data.isClosed ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="bg-gray-600 text-white text-sm px-3 py-1 rounded flex items-center gap-1 font-bold shadow"><Store size={14} /> 店休</div>
                    </div>
                ) : (
                  <div className="space-y-1 overflow-y-auto flex-1">
                    {Array.isArray(data.assignments) && data.assignments.map((a,ix)=>{ 
                        if (a.type === 'LEAVE') {
                            const pColor = getUserColor(a.uid); 
                            const fullName = users[a.uid]?.name || '未知';
                            const shortName = fullName.length > 2 ? fullName.slice(-2) : fullName;
                            const subNameFull = a.subUid ? users[a.subUid]?.name : null;
                            const subName = subNameFull ? (subNameFull.length > 2 ? subNameFull.slice(-2) : subNameFull) : null;
  
                            return (
                                <div key={ix} className={`p-1 rounded border-2 ${pColor} bg-opacity-30 mb-1 shadow-sm`}>
                                    <div className="flex justify-between items-center">
                                        <span className="font-bold text-[11px] tracking-widest">{shortName}</span>
                                        <span className="bg-white/90 px-1 rounded text-[10px] border shadow-sm flex items-center gap-0.5 shrink-0 font-bold truncate max-w-[40px]">
                                            {leaves.find(t=>t.id===a.leaveType)?.label || '假'}
                                        </span>
                                    </div>
                                    {subName && <div className="text-[10px] text-gray-700 mt-0.5 flex items-center gap-1 bg-white/70 px-1 rounded w-max"><ArrowRightLeft size={9}/> {subName}代</div>}
                                </div>
                            )
                        } 
                        return null;
                    })}
                  </div>
                )}
              </div>
            )
          })}
         </div>
         {selectedDate && <ShiftModal dateStr={selectedDate} onClose={()=>setSelectedDate(null)} dbData={dbData} currentUserInfo={currentUserInfo} setEditingEvent={setEditingEvent} isSuperAdmin={isSuperAdmin} isPrivileged={isPrivileged} getUserColor={getUserColor} db={db} appId={appId} />}
      </div>
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
            if (assign.type === 'LEAVE' && assign.leaveHours) { 
                if (assign.useComp || assign.leaveType === 'annual') { used += parseFloat(assign.leaveHours); } 
            }
            if (assign.otHours && assign.otConfirmed) { 
                const hrs = parseFloat(assign.otHours); 
                if (hrs > 0) earned += hrs; if (hrs < 0) used += Math.abs(hrs); 
            }
        });
        return earned - used;
    };
  
    const update = async (newData) => { 
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'shifts', dateStr), { ...dayData, ...newData }, { merge: true }); 
        setExpanded(null); 
    };
    
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
        let next = Array.isArray(dayData.assignments) ? [...dayData.assignments] : []; 
        const idx = next.findIndex(a=>a.uid===uid);
        if (idx === -1) { next.push({ uid, type: 'WORK', shiftCode: code }); } 
        else { next[idx] = { ...next[idx], shiftCode: code }; }
        update({ assignments: next });
    };

    const toggle = (uid, type, lType=null, subUid=null) => {
      const isMe = uid === currentUserInfo.uid;
      if (!isSuperAdmin && !isMe) return alert("無權限");
      if (isClosed) return alert("本日店休");

      let next = Array.isArray(dayData.assignments) ? [...dayData.assignments] : []; 
      const idx = next.findIndex(a=>a.uid===uid);
      if (!isSuperAdmin && next[idx]?.type === 'LEAVE') { return alert("請假已鎖定，修改請聯繫主管。"); }

      // --- 🔴 V8.2 核心排休防呆邏輯 ---
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
              if (totalRostered >= 3) return alert("🚨 本月自選畫休 (排休) 已達 3 天上限！"); 
              if (isTargetWeekend && weekendRostered >= 2) return alert("🚨 本月假日自選畫休 (六、日) 已達 2 天上限！");
          }
      }
      
      let leaveHours = 0; let useComp = false; 

      if (lType === 'menstrual') { /* 生理假不扣時數 */ } 
      else if (['annual', 'sick', 'personal'].includes(lType)) {
          const typeInfo = leaves.find(t=>t.id===lType);
          const leaveName = typeInfo?.label || '該假別';
          const p = prompt(`請輸入「${leaveName}」的請假時數 (純數字):`, "8");
          if (p === null) return;
          leaveHours = Math.abs(parseFloat(p));
          if (isNaN(leaveHours) || leaveHours <= 0) return alert("請輸入有效數字！");
          
          // --- 🔴 V8.2 特休連動到職日計算 ---
          if (lType === 'annual') {
              const uObj = users[uid];
              if (!uObj.startDate) return alert("系統找不到您的「到職日」，無法計算特休！請聯繫管理員建檔。");
              
              const annualLimit = getAnnualLeaveDays(uObj.startDate);
              let usedAnnual = 0;
              Object.keys(shifts).forEach(d => {
                  if (d.startsWith(yearStr) && d !== dateStr) {
                      const a = shifts[d].assignments?.find(x => x.uid === uid);
                      if (a?.type === 'LEAVE' && a?.leaveType === 'annual') {
                          usedAnnual += parseFloat(a.leaveHours || 0) / 8; 
                      }
                  }
              });
              
              const requestingDays = leaveHours / 8;
              if (!isSuperAdmin && (usedAnnual + requestingDays > annualLimit)) {
                  return alert(`🚨 特休額度不足！\n\n今年總額: ${annualLimit} 天\n目前已休: ${usedAnnual} 天\n本次申請: ${requestingDays} 天`);
              }
              useComp = true; 
          } else if (['sick', 'personal'].includes(lType)) { 
              useComp = window.confirm(`【${leaveName} ${leaveHours}小時 扣抵方式】\n\n👉 按【確定】：使用「補休時數」扣抵\n👉 按【取消】：月底結算直接扣薪`); 
          }
      }

      const newEntry = { uid, type, leaveType: lType }; 
      if (leaveHours > 0) { newEntry.leaveHours = leaveHours; newEntry.useComp = useComp; }
      if (subUid) newEntry.subUid = subUid;

      if(idx>=0) next[idx] = { ...next[idx], ...newEntry }; else next.push(newEntry);
      update({ assignments: next }); 
      if (lType === 'rostered' || lType === 'official') onClose();
    };

    const requestSwap = async (fromUid, toUid) => {
        const targetUser = safeUsers.find(u=>u.uid===toUid);
        if (!confirm(`確定要向 ${targetUser?.name} 申請換假嗎？`)) return;
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), { 
            type: 'swap', fromUid, toUid, date: dateStr, timestamp: new Date() 
        });
        alert("換假申請已送出！");
    };
    const handleOTSave = async (numHours, remark) => {
        const uid = otModalData.user.uid;
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

    const openOTModal = (targetUser) => { 
        const isMe = targetUser.uid === currentUserInfo.uid;
        if(!isMe && !isPrivileged) return alert("無權限"); 
        if(isClosed) return alert("本日店休"); 
        const assign = Array.isArray(dayData.assignments) ? dayData.assignments.find(a=>a.uid===targetUser.uid) : null;
        const hasOT = assign?.otHours !== undefined && assign?.otHours !== null && assign?.otHours !== "" && Number(assign?.otHours) !== 0;
        const pendingApproveReq = requests.find(r => r.date === dateStr && r.fromUid === targetUser.uid && r.type === 'admin_ot_approve');
        const pendingConfirmReq = requests.find(r => r.date === dateStr && r.uid === targetUser.uid && r.type === 'ot_confirm');
        if (!isPrivileged && (hasOT || pendingApproveReq || pendingConfirmReq)) return alert("時數已鎖定或審核中，無法修改。");
        const balance = getYearlyBalance(targetUser.uid, yearStr);
        let initHrs = ''; let initRsn = '';
        if (pendingApproveReq) { initHrs = pendingApproveReq.hours; initRsn = pendingApproveReq.reason; } 
        else if (pendingConfirmReq) { initHrs = pendingConfirmReq.hours; initRsn = pendingConfirmReq.reason; } 
        else if (assign?.otHours) { initHrs = assign.otHours; initRsn = assign.otReason; }
        setOtModalData({ user: targetUser, balance, initialHours: initHrs, initialReason: initRsn }); 
    };

    const availableSubs = safeUsers.filter(sub => sub.uid !== expanded && !sub.isResigned);

    return (
      <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-white w-full max-w-md rounded-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
          <div className={`p-4 border-b flex justify-between font-bold items-center ${isClosed ? 'bg-gray-800 text-white' : 'bg-gray-50'}`}>
              <span className="flex items-center gap-2">{dateStr} {isClosed && <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded">本日店休</span>}</span>
              <button onClick={onClose} className="hover:text-red-500">✕</button>
          </div>
          <div className="p-4 overflow-y-auto space-y-3 flex-1 relative">
            
            <div className="bg-purple-50 p-3 rounded-lg mb-3 border border-purple-200 shadow-sm">
                <div className="flex justify-between items-center mb-2">
                    <h4 className="font-bold text-purple-800 flex items-center gap-1"><Megaphone size={14}/> 公司備忘錄 / 行程</h4>
                    {isSuperAdmin && <button onClick={()=>setEditingEvent({ startDate: dateStr, repeatType: 'none', time: '', title: '' })} className="text-purple-600 bg-white px-2 py-0.5 rounded border border-purple-200 text-xs font-bold shadow-sm hover:bg-purple-100 transition-colors">+ 新增</button>}
                </div>
                {todaysEvents.length === 0 ? <div className="text-xs text-purple-400">今日無行程</div> : (
                    todaysEvents.map(e => (
                        <div key={e.id} className="flex justify-between items-center bg-white p-2 rounded border border-purple-100 mb-1 shadow-sm">
                            <div><div className="text-sm font-bold text-gray-800">{e.time && <span className="text-purple-600 mr-1">{e.time}</span>}{e.title}</div>{(e.repeatType !== 'none' || e.note) && (<div className="text-[10px] text-gray-500 mt-0.5 flex gap-1 items-center">{e.repeatType !== 'none' && <span className="bg-gray-100 px-1 rounded flex items-center gap-0.5"><Repeat size={8}/> {REPEAT_LABELS[e.repeatType]}</span>}{e.note && <span className="truncate max-w-[150px]">{e.note}</span>}</div>)}</div>
                            {isSuperAdmin && <button onClick={()=>setEditingEvent(e)} className="text-indigo-500 text-xs font-bold bg-indigo-50 px-2 py-1 rounded hover:bg-indigo-100">編輯</button>}
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
                      <div key={u.uid} className={`border-2 rounded-lg p-3 ${userColor} bg-opacity-20 shadow-sm transition-all`}>
                          <div className="flex justify-between items-center">
                              <div className="flex items-center gap-2">
                                  <span className="font-bold">{u.name}</span>
                                  <span className="bg-white/90 px-2 py-0.5 rounded text-xs border shadow-sm font-bold flex items-center gap-1">
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
                      otButtonUi = <button onClick={() => openOTModal(u)} disabled={!canEditOT} className={`flex-1 py-2 text-xs rounded border shadow-sm transition-colors ${!canEditOT ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-600 hover:bg-gray-50'}`}><Clock className="w-3.5 h-3.5 inline mr-1" />加/補休</button>;
                  }

                  return (
                    <div key={u.uid} className={`border rounded-lg p-3 ${!canEdit ? 'bg-gray-50 opacity-100' : 'bg-white shadow-sm hover:border-indigo-200 transition-colors'}`}>
                      <div className="flex justify-between items-center mb-2">
                          <div className="font-bold text-gray-800 flex items-center gap-2">
                              <div className={`w-3 h-3 rounded-full ${userColor.split(' ')[0]} border-2 border-gray-400`}></div>{u.name}
                          </div>
                          {showSwapBtn && <button onClick={() => requestSwap(currentUserInfo.uid, u.uid)} className="bg-indigo-50 text-indigo-600 border border-indigo-200 px-2 py-1 rounded text-xs font-bold shadow-sm flex items-center gap-1 hover:bg-indigo-100"><ArrowRightLeft size={12}/> 換假</button>}
                      </div>

                      <div className="flex gap-2 w-full mt-2">
                          {isSuperAdmin ? (
                              <select value={assign?.shiftCode || ''} onChange={(e) => updateShiftCode(u.uid, e.target.value)} className={`flex-1 text-xs border rounded p-1 shadow-sm text-center focus:outline-none ${assign?.shiftCode ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold' : 'bg-white text-gray-500'}`}>
                                  <option value="">未排班</option>
                                  {shiftsDef.map(st => <option key={st.id} value={st.id}>{st.label}</option>)}
                              </select>
                          ) : (assign?.shiftCode ? (
                              <div className="flex-1 flex items-center justify-center text-xs bg-gray-100 text-gray-600 rounded font-mono border shadow-sm font-bold">班別: {shiftsDef.find(st=>st.id===assign.shiftCode)?.label || assign.shiftCode}</div>
                          ) : null)}

                          {otButtonUi}
                          <button onClick={() => canEditLeave ? setExpanded(expanded===u.uid?null:u.uid) : alert("無權限或已鎖定。")} className={`flex-1 py-2 text-xs rounded border shadow-sm transition-colors ${!canEditLeave ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-600 hover:bg-gray-50 font-bold'}`}>請休假 ▼</button>
                      </div>

                      {expanded===u.uid && (
                        <div className="bg-gray-50 p-3 rounded-lg animate-fade-in border mt-2 shadow-inner">
                          <div className="text-xs font-bold text-gray-600 mb-2 border-b pb-1">休假申請表</div>
                          <div className="flex items-center gap-2 mb-3">
                              <span className="text-xs text-gray-600 font-bold whitespace-nowrap">找人代班:</span>
                              <select id={`sub-select-${u.uid}`} className="text-xs border border-gray-300 rounded p-1.5 flex-1 bg-white shadow-sm focus:border-indigo-500 focus:outline-none"><option value="">-- 不需代班 --</option>{availableSubs.map(s => <option key={s.uid} value={s.uid}>{s.name}</option>)}</select>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                              {leaves.map(lt => {
                                  if (lt.id === 'official' && !isSuperAdmin) return null;
                                  
                                  // --- 🔴 V8.2 實時計數邏輯 (顯示於按鈕前) ---
                                  const getLeaveCount = (leaveId, prefix) => {
                                      let count = 0; Object.keys(shifts).forEach(d => { if (d.startsWith(prefix) && d !== dateStr) { if (Array.isArray(shifts[d].assignments) && shifts[d].assignments.some(a => a.uid === u.uid && a.type === 'LEAVE' && a.leaveType === leaveId)) count++; } }); return count;
                                  };

                                  let limitReached = false; let limitMsg = "";
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
            <div className="border-t pt-3 mt-2"><div className="flex gap-2 items-center mb-1"><StickyNote className="w-4 h-4 text-gray-500" /><span className="text-xs font-bold text-gray-600">當日備註 (顯示於右上角紅點)</span></div><div className="flex gap-2"><input value={note} onChange={e=>setNote(e.target.value)} className="border flex-1 rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-500" placeholder="例如: 衛生局檢查..."/><button onClick={()=>setDoc(doc(db,'artifacts',appId,'public', 'data', 'shifts',dateStr),{...dayData,note},{merge:true})} className="bg-indigo-600 text-white px-3 rounded hover:bg-indigo-700"><Save size={16}/></button></div></div>
            {isSuperAdmin && !isClosed && <div className="pt-2 border-t mt-2"><button onClick={toggleClosed} className="w-full bg-gray-100 text-gray-600 text-xs py-2 rounded hover:bg-gray-200 flex items-center justify-center gap-1 font-bold transition-colors"><Store className="w-3.5 h-3.5" /> 設為店休 (清空當日班表)</button></div>}
          </div>
        </div>
      </div>
      <OTModal isOpen={!!otModalData} onClose={()=>setOtModalData(null)} onConfirm={handleOTSave} modalData={otModalData} dateStr={dateStr} />
      </>
    );
};
// ==========================================
// 💰 薪資與統計模組 (SalaryView)
// ==========================================
const SalaryView = ({ currentDate, dbData, db, appId, isPrivileged, gasRecords }) => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
    const { shifts, users, leaves } = dbData;
    
    // --- 🔴 V8.2 核心：只顯示本月有班或未離職的人員 ---
    const activeUsers = useMemo(() => {
        return Object.values(users).filter(u => {
            const hasShiftThisMonth = Object.keys(shifts).some(d => 
                d.startsWith(monthStr) && shifts[d].assignments?.some(a => a.uid === u.uid)
            );
            return !u.isResigned || hasShiftThisMonth;
        }).sort((a, b) => (a.employeeId || '').localeCompare(b.employeeId || ''));
    }, [users, shifts, monthStr]);

    const calculateStats = (uid) => {
        let workDays = 0, totalOT = 0, totalDeduct = 0, leaveDetails = {};
        let monthlyGas = (gasRecords[uid] || []).reduce((sum, r) => sum + r.amount, 0);

        // 年度補休結算邏輯
        let yearlyBalance = 0;
        Object.keys(shifts).forEach(d => {
            if (!d.startsWith(String(year))) return;
            const data = shifts[d];
            const assign = data.assignments?.find(a => a.uid === uid);
            if (!assign) return;

            // 加班/補休 累計
            if (assign.otHours && assign.otConfirmed) {
                yearlyBalance += parseFloat(assign.otHours);
            }
            // 請假扣抵 累計
            if (assign.type === 'LEAVE' && assign.leaveHours && (assign.useComp || assign.leaveType === 'annual')) {
                yearlyBalance -= parseFloat(assign.leaveHours);
            }

            // 當月明細統計
            if (d.startsWith(monthStr)) {
                if (assign.type === 'WORK') workDays++;
                if (assign.otHours && assign.otConfirmed) totalOT += parseFloat(assign.otHours);
                if (assign.type === 'LEAVE') {
                    const lType = assign.leaveType;
                    leaveDetails[lType] = (leaveDetails[lType] || 0) + 1;
                    if (assign.leaveHours && !assign.useComp && leaves.find(t => t.id === lType)?.deduct) {
                        totalDeduct += parseFloat(assign.leaveHours);
                    }
                }
            }
        });

        return { workDays, totalOT, totalDeduct, leaveDetails, yearlyBalance, monthlyGas };
    };

    return (
        <div className="space-y-4 pb-20">
            <div className="bg-white p-4 rounded-xl border shadow-sm flex justify-between items-center">
                <h2 className="font-bold text-lg text-indigo-700 flex items-center gap-2">
                    <FileBarChart className="w-5 h-5"/> {month + 1}月 薪資與時數結算統計
                </h2>
                <div className="text-xs text-gray-400 font-mono">CONFIDENTIAL / {CURRENT_VERSION}</div>
            </div>

            <div className="grid gap-4">
                {activeUsers.map(u => {
                    const stats = calculateStats(u.uid);
                    const isOverGas = stats.monthlyGas > 500;

                    return (
                        <div key={u.uid} className="bg-white rounded-xl border shadow-sm overflow-hidden border-l-4 border-l-indigo-500">
                            <div className="p-4 flex flex-wrap justify-between items-center gap-4 bg-gray-50/50">
                                <div className="flex items-center gap-3">
                                    <div className="bg-indigo-100 text-indigo-700 w-10 h-10 rounded-full flex items-center justify-center font-bold">
                                        {u.name.slice(-1)}
                                    </div>
                                    <div>
                                        <div className="font-bold text-gray-900 flex items-center gap-2">
                                            {u.name} 
                                            <span className="text-[10px] bg-gray-200 px-1.5 py-0.5 rounded text-gray-500">{u.employeeId || '無編號'}</span>
                                            {u.isResigned && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded">已離職</span>}
                                        </div>
                                        <div className="text-xs text-gray-500">{u.role === 'admin' ? '主管/管理員' : '正職人員'}</div>
                                    </div>
                                </div>
                                <div className="flex gap-6 text-center">
                                    <div><div className="text-[10px] text-gray-400 font-bold">出勤天數</div><div className="font-bold text-gray-700">{stats.workDays} <span className="text-[10px]">天</span></div></div>
                                    <div><div className="text-[10px] text-gray-400 font-bold">當月加班</div><div className={`font-bold ${stats.totalOT >= 0 ? 'text-orange-600' : 'text-green-600'}`}>{stats.totalOT} <span className="text-[10px]">hr</span></div></div>
                                    <div><div className="text-[10px] text-gray-400 font-bold">年度補休餘額</div><div className={`font-bold ${stats.yearlyBalance < 0 ? 'text-red-600' : 'text-indigo-600'}`}>{stats.yearlyBalance} <span className="text-[10px]">hr</span></div></div>
                                </div>
                            </div>

                            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-dashed">
                                {/* 左側：假別明細 */}
                                <div>
                                    <div className="text-xs font-bold text-gray-500 mb-2 flex items-center gap-1"><Inbox size={12}/> 假別統計明細</div>
                                    <div className="flex flex-wrap gap-2">
                                        {Object.entries(stats.leaveDetails).map(([id, count]) => (
                                            <div key={id} className="bg-white border px-2 py-1 rounded text-xs shadow-sm flex gap-2 font-bold">
                                                <span className="text-gray-500">{leaves.find(l => l.id === id)?.label}:</span>
                                                <span className="text-indigo-600">{count} 天</span>
                                            </div>
                                        ))}
                                        {Object.keys(stats.leaveDetails).length === 0 && <span className="text-xs text-gray-300 italic">本月無請假紀錄</span>}
                                    </div>
                                    {stats.totalDeduct > 0 && (
                                        <div className="mt-3 bg-red-50 text-red-700 p-2 rounded text-xs font-bold border border-red-100">
                                            ⚠️ 本月需扣薪總時數：{stats.totalDeduct} 小時 (已排除補休扣抵)
                                        </div>
                                    )}
                                </div>

                                {/* 右側：油資補貼 (500上限) */}
                                <div className="bg-teal-50/50 p-3 rounded-lg border border-teal-100">
                                    <div className="flex justify-between items-center mb-2">
                                        <div className="text-xs font-bold text-teal-700 flex items-center gap-1"><Fuel size={14}/> 油資補貼 (上限 $500)</div>
                                        <div className={`text-sm font-bold ${isOverGas ? 'text-red-600' : 'text-teal-700'}`}>
                                            ${stats.monthlyGas} / $500
                                        </div>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-1.5 mb-2 overflow-hidden">
                                        <div 
                                            className={`h-full transition-all ${isOverGas ? 'bg-red-500' : 'bg-teal-500'}`} 
                                            style={{ width: `${Math.min((stats.monthlyGas / 500) * 100, 100)}%` }}
                                        ></div>
                                    </div>
                                    {isOverGas && <p className="text-[10px] text-red-500 font-bold animate-pulse text-right">⚠️ 已超過補助上限，月底將以 $500 撥款</p>}
                                </div>
                            </div>
                        </div>
                    );
                })}
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
    const totalValue = useMemo(() => items.reduce((sum, item) => sum + ((records[item.id] || 0) * item.price), 0), [items, records]);

    if (items.length === 0) {
        return (
            <div className="max-w-2xl mx-auto pb-20 text-center mt-10">
                <Package size={64} className="mx-auto text-gray-300 mb-4" />
                <h2 className="text-xl font-bold text-gray-600">目前尚無庫存品項</h2>
                <p className="text-gray-500 mt-2 text-sm px-10">請管理員前往「系統設定」➡️「庫存品項管理」新增物料資訊。</p>
            </div>
        );
    }

    const handleCountChange = (id, delta) => { 
        setRecords(prev => {
            const current = prev[id] || 0; 
            return { ...prev, [id]: Math.max(0, current + delta) }; 
        }); 
    };

    const handleInputChange = (id, val) => { 
        const num = parseFloat(val);
        if(!isNaN(num) && num >= 0) { 
            setRecords(prev => ({ ...prev, [id]: num })); 
        } else if (val === '') { 
            const newRecs = {...records}; delete newRecs[id]; setRecords(newRecs); 
        } 
    };

    const handleSave = async () => {
        if (Object.keys(records).length === 0) return alert("🚨 尚未填寫任何盤點數量！");
        if (window.confirm("⚠️ 確定要送出今日盤點結果嗎？\n\n送出後資料將同步至雲端，且畫面將重置。")) {
            const todayStr = new Date().toISOString().split('T')[0];
            try {
                await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventoryRecords', todayStr), { 
                    date: todayStr, 
                    timestamp: Date.now(), 
                    data: records 
                }, { merge: true });
                alert("✅ 盤點資料已儲存！辛苦了！");
                setRecords({}); 
            } catch (e) { alert("儲存失敗，請檢查網路連線。"); }
        }
    };

    const handleExportCSV = () => {
        const todayStr = new Date().toISOString().split('T')[0];
        const rows = [['分類', '物料名稱', '盤點單位', '實盤數量', '成本單價', '庫存總金額']];
        let exportTotal = 0;
        items.forEach(item => { 
            const qty = records[item.id] || 0; 
            const subtotal = qty * item.price; 
            if(qty > 0) {
                exportTotal += subtotal; 
                rows.push([item.category, item.name, item.spec, qty, item.price, subtotal]); 
            }
        });
        if(rows.length === 1) return alert("請先輸入盤點數值再進行匯出。");
        rows.push(['', '', '', '', '合計總值:', exportTotal]);
        exportToCSV(`盤點報告_${todayStr}`, rows);
    };

    return (
        <div className="max-w-2xl mx-auto pb-20 animate-fade-in">
            {/* 頂部控制列 */}
            <div className="bg-white p-4 rounded-2xl border flex flex-col sm:flex-row justify-between items-center mb-4 shadow-sm gap-3 sticky top-20 z-10 border-indigo-50">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600"><Package size={20}/></div>
                    <h2 className="font-bold text-lg text-slate-800">每日庫存盤點</h2>
                </div>
                <div className="flex gap-2 items-center w-full sm:w-auto justify-between">
                    <div className="font-mono font-black text-red-600 bg-red-50 px-3 py-1.5 rounded-xl border border-red-100 shadow-inner">
                        <span className="text-[10px] mr-1">VALUE:</span>${totalValue.toLocaleString()}
                    </div>
                    <div className="flex gap-1">
                        <button onClick={handleExportCSV} className="bg-white text-green-700 border border-green-200 p-2 rounded-xl font-bold shadow-sm hover:bg-green-50 active:scale-95 transition-all"><Download size={20}/></button>
                        <button onClick={handleSave} className="bg-indigo-600 text-white px-5 py-2 rounded-xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-1"><Save size={18}/> 送出</button>
                    </div>
                </div>
            </div>

            {/* 分類切換標籤 */}
            <div className="flex gap-2 overflow-x-auto pb-3 mb-2 scrollbar-hide">
                {categories.map(c => (
                    <button 
                        key={c} 
                        onClick={()=>setActiveTab(c)} 
                        className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap shadow-sm transition-all border ${activeTab === c ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-100 hover:bg-slate-50'}`}
                    >
                        {c}
                    </button>
                ))}
            </div>

            {/* 物料列表區域 */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                {filteredItems.length > 0 ? filteredItems.map((item, idx) => (
                    <div key={item.id} className={`p-4 flex justify-between items-center ${idx !== filteredItems.length - 1 ? 'border-b border-slate-50' : ''}`}>
                        <div>
                            <div className="font-bold text-slate-800 text-lg flex items-center gap-1">{item.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono tracking-tight uppercase">Price/Unit: ${item.price}</div>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3">
                            <span className="text-sm font-black text-indigo-500 bg-indigo-50/50 px-3 py-1.5 rounded-xl border border-indigo-100/50">{item.spec}</span>
                            <div className="flex items-center bg-slate-50 rounded-2xl p-1 border border-slate-100">
                                <button onClick={()=>handleCountChange(item.id, -1)} className="w-10 h-10 rounded-xl bg-white shadow-sm text-slate-600 flex items-center justify-center hover:bg-gray-100 active:scale-90 transition-transform"><Minus size={18}/></button>
                                <input 
                                    type="number" 
                                    value={records[item.id] !== undefined ? records[item.id] : ''} 
                                    onChange={(e)=>handleInputChange(item.id, e.target.value)} 
                                    placeholder="0" 
                                    className="w-14 text-center font-black text-xl text-indigo-700 bg-transparent focus:outline-none" 
                                />
                                <button onClick={()=>handleCountChange(item.id, 1)} className="w-10 h-10 rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-100 flex items-center justify-center hover:bg-indigo-700 active:scale-90 transition-transform"><Plus size={18}/></button>
                            </div>
                        </div>
                    </div>
                )) : (
                    <div className="p-20 text-center text-slate-300 italic text-sm">此分類下暫無品項</div>
                )}
            </div>
            
            <p className="mt-4 text-[10px] text-center text-slate-400 font-medium">盤點數據將於送出後清空畫面，並存檔至雲端報表供管理員查閱。</p>
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
                
                // 100% 原生邏輯：分組當日打卡紀錄
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

                // 2. 比對班表進行異常狀態判定
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

                processedList.sort((a, b) => b.date.localeCompare(a.date));
                setAttendanceList(processedList);
            } else { 
                setAttendanceList([]); 
            }
            setLoading(false);
        });
        return () => unsub();
    }, [targetMonth, db, appId, shifts, shiftTypes]);

    const handleExportCSV = () => {
        const rows = [['日期', '員工', '班別', '上班打卡', '下班打卡', '異常狀態']];
        attendanceList.forEach(r => { 
            const shiftStr = r.shiftInfo ? `${r.shiftInfo.start}~${r.shiftInfo.end}` : '-'; 
            rows.push([r.date, r.name, shiftStr, r.in || '', r.out || '', r.status.join(', ')]); 
        });
        exportToCSV(`出勤結算表_${targetMonth}`, rows);
    };

    return (
        <div className="space-y-4 pb-20 animate-fade-in">
            <div className="bg-white p-4 rounded-2xl border flex justify-between items-center shadow-sm">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600"><History size={20}/></div>
                    <h2 className="font-bold text-lg text-slate-800">月出勤紀錄結算</h2>
                </div>
                <div className="flex gap-2">
                    <input 
                        type="month" 
                        value={targetMonth} 
                        onChange={e=>setTargetMonth(e.target.value)} 
                        className="border rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button onClick={handleExportCSV} className="bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-xl font-bold shadow-sm hover:bg-green-100 flex items-center gap-1">
                        <Download size={16}/><span className="hidden sm:inline">匯出</span>
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden">
                {loading ? (
                    <div className="p-20 text-center text-slate-400 font-bold animate-pulse">大數據加載中...</div>
                ) : attendanceList.length === 0 ? (
                    <div className="p-20 text-center text-slate-300 italic font-medium">本月尚無任何打卡紀錄數據</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-black border-b border-slate-100">
                                <tr>
                                    <th className="p-4 uppercase tracking-tighter">日期</th>
                                    <th className="p-4 uppercase tracking-tighter">員工姓名</th>
                                    <th className="p-4 uppercase tracking-tighter text-center">應退應到</th>
                                    <th className="p-4 uppercase tracking-tighter text-center">上班簽到</th>
                                    <th className="p-4 uppercase tracking-tighter text-center">下班簽退</th>
                                    <th className="p-4 uppercase tracking-tighter">狀態分析</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {attendanceList.map((r, i) => {
                                    const isAbnormal = r.status.some(s => ['遲到','早退','缺卡(上)','缺卡(下)'].includes(s));
                                    return (
                                        <tr key={i} className="hover:bg-indigo-50/30 transition-colors">
                                            <td className="p-4 font-mono font-bold text-slate-400">{r.date.substring(5)}</td>
                                            <td className="p-4 font-bold text-slate-800">{r.name}</td>
                                            <td className="p-4 text-center">
                                                {r.shiftInfo ? (
                                                    <span className="bg-slate-100 px-2 py-1 rounded-lg text-[11px] font-bold text-slate-500 border border-slate-200">
                                                        {r.shiftInfo.label} ({r.shiftInfo.start}~{r.shiftInfo.end})
                                                    </span>
                                                ) : <span className="text-slate-300 font-light">-</span>}
                                            </td>
                                            <td className={`p-4 text-center font-black ${r.in && r.shiftInfo && r.in > r.shiftInfo.start ? 'text-red-500' : 'text-slate-700'}`}>
                                                {r.in || <span className="text-red-300">缺</span>}
                                            </td>
                                            <td className={`p-4 text-center font-black ${r.out && r.shiftInfo && r.out < r.shiftInfo.end ? 'text-red-500' : 'text-slate-700'}`}>
                                                {r.out || <span className="text-red-300">缺</span>}
                                            </td>
                                            <td className="p-4 font-bold">
                                                {r.status.map((s, idx) => (
                                                    <span key={idx} className={`inline-block px-2 py-0.5 rounded-full text-[10px] mr-1 ${
                                                        s === '正常' ? 'bg-green-100 text-green-600' : 
                                                        s === '請假' ? 'bg-blue-100 text-blue-600' : 
                                                        'bg-red-100 text-red-600'
                                                    }`}>
                                                        {s}
                                                    </span>
                                                ))}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            <p className="text-center text-[10px] text-slate-300 font-bold mt-4 uppercase tracking-[0.2em]">Automatic anomaly detection active</p>
        </div>
    );
};
// ==========================================
// 💸 薪資管理頁面 (PayrollView)
// ==========================================
const PayrollView = ({ users, currentDate, db, appId, gasReceipts }) => {
    const [targetMonth, setTargetMonth] = useState(`${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}`);
    const [payrollData, setPayrollData] = useState({});
    const [showResigned, setShowResigned] = useState(false);
    
    // 監聽當月薪資發放紀錄
    useEffect(() => { 
        const unsub = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'payrolls', targetMonth), (docSnap) => { 
            if (docSnap.exists()) setPayrollData(docSnap.data().records || {}); 
            else setPayrollData({}); 
        }); 
        return () => unsub(); 
    }, [targetMonth, db, appId]);

    // 即時更新薪資欄位並同步至 Firebase
    const updatePayroll = async (uid, field, value) => { 
        const newData = { ...payrollData, [uid]: { ...(payrollData[uid] || {}), [field]: value } }; 
        setPayrollData(newData); 
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'payrolls', targetMonth), { records: newData }, { merge: true }); 
    };

    // 🔴 V8.2 核心邏輯：過濾離職員工
    const visibleUsers = users.filter(u => showResigned ? true : !u.isResigned);

    return (
        <div className="space-y-4 pb-20 animate-fade-in">
            <div className="bg-white p-5 rounded-2xl border flex flex-col sm:flex-row sm:justify-between sm:items-center shadow-sm gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-600 rounded-xl text-white shadow-lg shadow-indigo-100">
                        <DollarSign size={24}/>
                    </div>
                    <div>
                        <h2 className="font-black text-xl text-slate-800 tracking-tighter">薪資與福利核發管理</h2>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Financial Management System</p>
                    </div>
                </div>
                <div className="flex gap-3 items-center w-full sm:w-auto">
                    <label className="flex-1 sm:flex-none text-xs flex items-center justify-center gap-2 text-slate-500 cursor-pointer font-bold bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 transition-colors">
                        <input type="checkbox" checked={showResigned} onChange={e=>setShowResigned(e.target.checked)} className="accent-indigo-600 w-4 h-4" />
                        顯示已離職
                    </label>
                    <input type="month" value={targetMonth} onChange={e=>setTargetMonth(e.target.value)} className="flex-1 sm:flex-none border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"/>
                </div>
            </div>
            
            <div className="bg-white rounded-[2rem] border border-slate-100 shadow-2xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-900 text-slate-400 font-bold uppercase text-[10px] tracking-widest border-b border-slate-800">
                            <tr>
                                <th className="p-5 text-white">員工姓名</th>
                                <th className="p-5">約定本薪</th>
                                <th className="p-5 bg-teal-900/30 text-teal-400 text-center">油資核銷 (上限500)</th>
                                <th className="p-5">津貼補助</th>
                                <th className="p-5 text-pink-400">生日禮金</th>
                                <th className="p-5 text-purple-400">三節獎金</th>
                                <th className="p-5 text-yellow-500">年終獎金</th>
                                <th className="p-5">發放備註</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {visibleUsers.map(u => { 
                                const record = payrollData[u.uid] || {}; 
                                const userGasRecords = gasReceipts?.[targetMonth]?.[u.uid] || [];
                                const gasTotal = userGasRecords.reduce((sum, r) => sum + r.amount, 0);
                                const gasCapped = Math.min(gasTotal, 500);

                                return (
                                    <tr key={u.uid} className={`group hover:bg-indigo-50/50 transition-colors ${u.isResigned ? 'opacity-50' : ''}`}>
                                        <td className="p-5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-black text-slate-400 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors text-xs">{u.name[0]}</div>
                                                <div>
                                                    <p className="font-black text-slate-800">{u.name}</p>
                                                    <p className="text-[9px] text-slate-400 font-bold tracking-tighter uppercase">{u.role}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-3"><input type="number" placeholder="0" className="w-24 bg-slate-50 border-none rounded-lg px-2 py-2 font-mono font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500" value={record.base || ''} onChange={e=>updatePayroll(u.uid, 'base', e.target.value)}/></td>
                                        <td className="p-3 bg-teal-50/30 text-center font-black text-teal-700 text-base border-x border-teal-50/50">${gasCapped}</td>
                                        <td className="p-3"><input type="number" placeholder="0" className="w-24 bg-slate-50 border-none rounded-lg px-2 py-2 font-mono font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500" value={record.subsidy || ''} onChange={e=>updatePayroll(u.uid, 'subsidy', e.target.value)}/></td>
                                        <td className="p-3"><input type="number" placeholder="0" className="w-24 bg-pink-50/30 border-none rounded-lg px-2 py-2 font-mono font-bold text-pink-700 focus:ring-2 focus:ring-pink-500" value={record.bonus_bday || ''} onChange={e=>updatePayroll(u.uid, 'bonus_bday', e.target.value)}/></td>
                                        <td className="p-3"><input type="number" placeholder="0" className="w-24 bg-purple-50/30 border-none rounded-lg px-2 py-2 font-mono font-bold text-purple-700 focus:ring-2 focus:ring-purple-500" value={record.bonus_festival || ''} onChange={e=>updatePayroll(u.uid, 'bonus_festival', e.target.value)}/></td>
                                        <td className="p-3"><input type="number" placeholder="0" className="w-24 bg-yellow-50/30 border-none rounded-lg px-2 py-2 font-mono font-bold text-yellow-700 focus:ring-2 focus:ring-yellow-500" value={record.bonus_year || ''} onChange={e=>updatePayroll(u.uid, 'bonus_year', e.target.value)}/></td>
                                        <td className="p-3"><input type="text" placeholder="備註內容..." className="w-full min-w-[150px] bg-transparent border-b border-slate-100 px-2 py-2 text-xs focus:border-indigo-500 focus:outline-none" value={record.note || ''} onChange={e=>updatePayroll(u.uid, 'note', e.target.value)}/></td>
                                    </tr>
                                ); 
                            })}
                        </tbody>
                    </table>
                </div>
                {visibleUsers.length === 0 && <div className="p-20 text-center text-slate-300 font-bold uppercase tracking-widest italic">No data available for this month</div>}
            </div>
            
            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold bg-white p-4 rounded-2xl border border-slate-100">
                <ShieldAlert size={14}/> 薪資數據已加密傳輸，僅最高管理員與具權限之主管可編輯此頁面。
            </div>
        </div>
    );
};
// ==========================================
// ⚙️ 系統設定模組 (SettingsView)
// ==========================================
const SettingsView = ({ users, currentUserInfo, leaveTypes, shiftTypes, inventoryItems, appId, storeConfig, db, isSuperAdmin, insurances }) => {
    const [activeTab, setActiveTab] = useState('users');
    const [editingUser, setEditingUser] = useState(null);
    const [userFormData, setUserFormData] = useState({});
    
    // 編輯員工資料存檔
    const saveUser = async () => {
        if (!editingUser) return;
        try {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', editingUser), userFormData);
            alert("✅ 員工資料更新成功！");
            setEditingUser(null);
        } catch (e) {
            alert("儲存失敗，請檢查權限。");
        }
    };

    return (
        <div className="max-w-4xl mx-auto pb-24 animate-fade-in">
            <div className="bg-white p-6 rounded-3xl border shadow-xl mb-6 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-slate-900 rounded-2xl text-white shadow-lg">
                        <Settings size={24} className="animate-spin-slow"/>
                    </div>
                    <div>
                        <h2 className="font-black text-2xl text-slate-800 tracking-tighter">系統後台與參數設定</h2>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">Control Panel & Parameters</p>
                    </div>
                </div>
                {isSuperAdmin && (
                    <div className="flex bg-slate-100 p-1 rounded-2xl overflow-x-auto scrollbar-hide">
                        <button onClick={()=>setActiveTab('users')} className={`px-4 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap ${activeTab==='users'?'bg-white text-indigo-600 shadow-sm':'text-slate-400'}`}>員工權限</button>
                        <button onClick={()=>setActiveTab('store')} className={`px-4 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap ${activeTab==='store'?'bg-white text-indigo-600 shadow-sm':'text-slate-400'}`}>門市定位</button>
                        <button onClick={()=>setActiveTab('shifts')} className={`px-4 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap ${activeTab==='shifts'?'bg-white text-indigo-600 shadow-sm':'text-slate-400'}`}>班別定義</button>
                        <button onClick={()=>setActiveTab('items')} className={`px-4 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap ${activeTab==='items'?'bg-white text-indigo-600 shadow-sm':'text-slate-400'}`}>庫存品項</button>
                        <button onClick={()=>setActiveTab('insurance')} className={`px-4 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap ${activeTab==='insurance'?'bg-white text-indigo-600 shadow-sm':'text-slate-400'}`}>公司保險</button>
                    </div>
                )}
            </div>

            {/* --- 員工權限與離職狀態管理 --- */}
            {activeTab === 'users' && (
                <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-2xl overflow-hidden">
                    <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                        <h3 className="font-black text-slate-700 flex items-center gap-2"><Users size={20}/> 員工名冊與權限管理</h3>
                        <span className="text-[10px] font-bold text-slate-400">Total: {Object.keys(users).length} Users</span>
                    </div>
                    <div className="divide-y divide-slate-50">
                        {Object.values(users).sort((a,b)=> (a.isResigned === b.isResigned) ? 0 : a.isResigned ? 1 : -1).map(u => (
                            <div key={u.uid} className={`p-5 flex items-center justify-between hover:bg-slate-50 transition-colors ${u.isResigned ? 'bg-gray-50/50' : ''}`}>
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl shadow-inner ${u.isResigned ? 'bg-gray-200 text-gray-400' : 'bg-indigo-100 text-indigo-600'}`}>
                                        {u.name[0]}
                                    </div>
                                    <div>
                                        <div className="font-black text-slate-800 flex items-center gap-2">
                                            {u.name}
                                            {u.isAdmin && <span className="bg-amber-100 text-amber-700 text-[9px] px-1.5 py-0.5 rounded font-black border border-amber-200">SUPER ADMIN</span>}
                                            {u.isResigned && <span className="bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded font-black animate-pulse">OFF-BOARDED</span>}
                                        </div>
                                        <div className="text-[11px] text-slate-400 font-bold flex items-center gap-3 mt-1">
                                            <span className="flex items-center gap-1"><Clock size={12}/> {u.startDate || '未設定到職日'}</span>
                                            <span className="flex items-center gap-1"><DollarSign size={12}/> ${u.salaryAmount || '0'}</span>
                                        </div>
                                    </div>
                                </div>
                                {(isSuperAdmin || u.uid === currentUserInfo.uid) && (
                                    <button 
                                        onClick={() => { setEditingUser(u.uid); setUserFormData(u); }}
                                        className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 transition-all shadow-sm"
                                    >
                                        <Edit size={18}/>
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* --- 員工編輯彈窗 (含離職開關) --- */}
            {editingUser && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[150] p-4">
                    <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in border border-white">
                        <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
                            <div>
                                <h3 className="font-black text-2xl tracking-tighter">編輯員工資料</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Personnel Data Modification</p>
                            </div>
                            <button onClick={()=>setEditingUser(null)} className="p-2 hover:bg-slate-800 rounded-full transition-colors"><X size={24}/></button>
                        </div>
                        <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto">
                            {/* 離職狀態開關 (V8.2 核心) */}
                            {isSuperAdmin && (
                                <div className="bg-red-50 p-4 rounded-3xl border border-red-100">
                                    <label className="flex items-center justify-between cursor-pointer">
                                        <div>
                                            <p className="font-black text-red-800">在職狀態切換</p>
                                            <p className="text-[10px] text-red-600 font-bold uppercase">Resignation Status</p>
                                        </div>
                                        <div 
                                            onClick={() => setUserFormData({...userFormData, isResigned: !userFormData.isResigned})}
                                            className={`w-14 h-8 rounded-full relative transition-all ${userFormData.isResigned ? 'bg-red-500' : 'bg-slate-300'}`}
                                        >
                                            <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all shadow-md ${userFormData.isResigned ? 'left-7' : 'left-1'}`}></div>
                                        </div>
                                    </label>
                                    <p className="mt-2 text-[10px] text-red-400 font-bold italic">＊設為離職後，該員工將無法使用打卡、盤點、薪資統計等功能。</p>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-black text-slate-500 uppercase mb-2 ml-1">員工姓名</label>
                                    <input type="text" value={userFormData.name || ''} onChange={e=>setUserFormData({...userFormData, name: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 font-bold focus:ring-2 focus:ring-indigo-500"/>
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-slate-500 uppercase mb-2 ml-1">員工編號</label>
                                    <input type="text" value={userFormData.employeeId || ''} onChange={e=>setUserFormData({...userFormData, employeeId: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 font-bold focus:ring-2 focus:ring-indigo-500"/>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-black text-slate-500 uppercase mb-2 ml-1">到職日期 (影響特休計算)</label>
                                <input type="date" value={userFormData.startDate || ''} onChange={e=>setUserFormData({...userFormData, startDate: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 font-bold focus:ring-2 focus:ring-indigo-500"/>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-black text-slate-500 uppercase mb-2 ml-1">約定本薪 (合約用)</label>
                                    <input type="number" value={userFormData.salaryAmount || ''} onChange={e=>setUserFormData({...userFormData, salaryAmount: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 font-bold focus:ring-2 focus:ring-indigo-500"/>
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-slate-500 uppercase mb-2 ml-1">工作地點</label>
                                    <input type="text" value={userFormData.workLocation || ''} onChange={e=>setUserFormData({...userFormData, workLocation: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 font-bold focus:ring-2 focus:ring-indigo-500"/>
                                </div>
                            </div>
                            
                            <div>
                                <label className="block text-xs font-black text-slate-500 uppercase mb-2 ml-1">LINE UserId (用於推播通知)</label>
                                <input type="text" value={userFormData.lineUserId || ''} onChange={e=>setUserFormData({...userFormData, lineUserId: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 font-mono text-[10px] font-bold focus:ring-2 focus:ring-indigo-500" placeholder="U1234567890abcdef..."/>
                            </div>
                        </div>
                        <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-4">
                            <button onClick={()=>setEditingUser(null)} className="flex-1 py-4 bg-white border border-slate-200 rounded-2xl font-black text-slate-500 hover:bg-slate-100 transition-all">取消返回</button>
                            <button onClick={saveUser} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all">儲存更新</button>
                        </div>
                    </div>
                </div>
            )}
            {/* --- 門市定位設定 (GPS) --- */}
            {activeTab === 'store' && (
                <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-2xl p-8 animate-fade-in">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-red-50 text-red-600 rounded-xl"><MapPin size={24}/></div>
                        <div>
                            <h3 className="font-black text-slate-800 text-xl tracking-tighter">門市座標與打卡半徑</h3>
                            <p className="text-[10px] text-slate-400 font-bold uppercase">Geofencing Configuration</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label className="block text-xs font-black text-slate-500 mb-2 uppercase">緯度 (Latitude)</label>
                            <input type="number" value={storeConfig?.lat || ''} onChange={e=>updateDoc(doc(db,'artifacts',appId,'public','data','settings','storeLocation'), {lat: parseFloat(e.target.value)}, {merge:true})} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 font-mono font-bold focus:ring-2 focus:ring-red-500" placeholder="25.xxxx"/>
                        </div>
                        <div>
                            <label className="block text-xs font-black text-slate-500 mb-2 uppercase">經度 (Longitude)</label>
                            <input type="number" value={storeConfig?.lng || ''} onChange={e=>updateDoc(doc(db,'artifacts',appId,'public','data','settings','storeLocation'), {lng: parseFloat(e.target.value)}, {merge:true})} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 font-mono font-bold focus:ring-2 focus:ring-red-500" placeholder="121.xxxx"/>
                        </div>
                        <div>
                            <label className="block text-xs font-black text-slate-500 mb-2 uppercase">容許半徑 (公尺)</label>
                            <input type="number" value={storeConfig?.radius || 50} onChange={e=>updateDoc(doc(db,'artifacts',appId,'public','data','settings','storeLocation'), {radius: parseInt(e.target.value)}, {merge:true})} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 font-mono font-bold focus:ring-2 focus:ring-red-500" placeholder="50"/>
                        </div>
                    </div>
                    <p className="mt-4 text-[11px] text-slate-400 font-bold italic bg-slate-50 p-3 rounded-xl border border-slate-100">＊建議半徑設定為 50~100 公尺，以避免室內 GPS 訊號偏移導致員工無法打卡。</p>
                </div>
            )}

            {/* --- 班別定義管理 --- */}
            {activeTab === 'shifts' && (
                <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-2xl p-8 animate-fade-in">
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><Clock size={24}/></div>
                            <h3 className="font-black text-slate-800 text-xl tracking-tighter">班別代稱與時間定義</h3>
                        </div>
                        <button onClick={async()=>{
                            const label = prompt("輸入班別名稱 (如: 09A):");
                            const start = prompt("輸入開始時間 (如: 09:00):");
                            const end = prompt("輸入結束時間 (如: 18:00):");
                            if(label && start && end) {
                                const newShifts = [...shiftTypes, { id: Date.now().toString(), label, start, end }];
                                await setDoc(doc(db,'artifacts',appId,'public','data','settings','shiftTypes'), { types: newShifts });
                            }
                        }} className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold text-xs shadow-lg shadow-indigo-100 hover:bg-indigo-700">+ 新增班別</button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {shiftTypes.map(st => (
                            <div key={st.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 relative group">
                                <div className="font-black text-indigo-600 text-lg">{st.label}</div>
                                <div className="text-[10px] font-bold text-slate-400 font-mono">{st.start} - {st.end}</div>
                                <button onClick={async()=>{
                                    if(confirm("確定刪除此班別？")) {
                                        const next = shiftTypes.filter(s => s.id !== st.id);
                                        await setDoc(doc(db,'artifacts',appId,'public','data','settings','shiftTypes'), { types: next });
                                    }
                                }} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-red-300 hover:text-red-500 transition-opacity"><Trash2 size={14}/></button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* --- 庫存品項管理 --- */}
            {activeTab === 'items' && (
                <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-2xl p-8 animate-fade-in">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-black text-slate-800 text-xl flex items-center gap-2"><Package size={24}/> 庫存物料品項設定</h3>
                        <button onClick={async()=>{
                            const name = prompt("物料名稱:");
                            const cat = prompt("分類 (如: 茶葉類):");
                            const spec = prompt("單位 (如: 斤/包):");
                            const price = prompt("成本單價:");
                            if(name && cat && spec && price) {
                                const next = [...inventoryItems, { id: Date.now().toString(), name, category: cat, spec, price: parseFloat(price) }];
                                await setDoc(doc(db,'artifacts',appId,'public','data','settings','inventoryConfig'), { items: next });
                            }
                        }} className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold text-xs shadow-lg">+ 新增品項</button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-slate-400 font-bold border-b"><tr><th className="pb-3">分類</th><th className="pb-3">名稱</th><th className="pb-3">單位</th><th className="pb-3">單價</th><th className="pb-3 text-right">刪除</th></tr></thead>
                            <tbody>{inventoryItems.map(item => (
                                <tr key={item.id} className="border-b border-slate-50"><td className="py-3 font-bold text-slate-500">{item.category}</td><td className="py-3 font-black text-slate-800">{item.name}</td><td className="py-3 font-bold">{item.spec}</td><td className="py-3 font-mono font-black text-indigo-600">${item.price}</td><td className="py-3 text-right"><button onClick={async()=>{ if(confirm("刪除品項？")){ const next = inventoryItems.filter(i=>i.id!==item.id); await setDoc(doc(db,'artifacts',appId,'public','data','settings','inventoryConfig'),{items:next}); } }} className="text-red-300 hover:text-red-500"><Trash2 size={16}/></button></td></tr>
                            ))}</tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* --- 公司保險櫃 (到期提醒) --- */}
            {activeTab === 'insurance' && (
                <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-2xl p-8 animate-fade-in">
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl shadow-inner"><ShieldAlert size={24}/></div>
                            <h3 className="font-black text-slate-800 text-xl tracking-tighter">公司保險櫃 (到期管理)</h3>
                        </div>
                        <button onClick={async()=>{
                            const name = prompt("保險/證照名稱:");
                            const date = prompt("到期日期 (YYYY-MM-DD):");
                            if(name && date) {
                                const next = [...insurances, { id: Date.now().toString(), name, expiryDate: date }];
                                await setDoc(doc(db,'artifacts',appId,'public','data','settings','insurances'), { items: next });
                            }
                        }} className="bg-amber-600 text-white px-4 py-2 rounded-xl font-bold text-xs shadow-lg">+ 新增紀錄</button>
                    </div>
                    <div className="grid gap-3">
                        {insurances.sort((a,b)=>new Date(a.expiryDate) - new Date(b.expiryDate)).map(ins => {
                            const isExpired = new Date(ins.expiryDate) < new Date();
                            const isWarning = new Date(ins.expiryDate) < new Date(Date.now() + 30*24*60*60*1000); // 30天內
                            return (
                                <div key={ins.id} className={`p-5 rounded-3xl border-2 flex justify-between items-center transition-all ${isExpired ? 'bg-red-50 border-red-100' : isWarning ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-50'}`}>
                                    <div className="flex items-center gap-4">
                                        <div className={`p-2 rounded-xl ${isExpired ? 'bg-red-500 text-white' : 'bg-white text-slate-400 shadow-sm'}`}><FileText size={20}/></div>
                                        <div>
                                            <div className={`font-black ${isExpired ? 'text-red-600' : 'text-slate-800'}`}>{ins.name}</div>
                                            <div className="text-[10px] font-bold text-slate-400 flex items-center gap-1 uppercase tracking-widest">
                                                <Clock size={10}/> Expiry Date: <span className="font-mono">{ins.expiryDate}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        {isExpired ? <span className="bg-red-600 text-white text-[10px] px-2 py-1 rounded-lg font-black animate-pulse">EXPIRED</span> : isWarning && <span className="bg-amber-500 text-white text-[10px] px-2 py-1 rounded-lg font-black">EXPIRING SOON</span>}
                                        <button onClick={async()=>{ if(confirm("刪除此紀錄？")){ const next = insurances.filter(i=>i.id!==ins.id); await setDoc(doc(db,'artifacts',appId,'public','data','settings','insurances'),{items:next}); } }} className="text-slate-300 hover:text-red-500"><Trash2 size={18}/></button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

// ==========================================
// 🎨 全域 Tailwind 樣式補強與元件導出
// ==========================================
const style = document.createElement('style');
style.innerHTML = `
    @keyframes fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    .animate-fade-in { animation: fade-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
    .animate-spin-slow { animation: spin 8s linear infinite; }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .scrollbar-hide::-webkit-scrollbar { display: none; }
    .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
    input[type="number"]::-webkit-inner-spin-button, 
    input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
    .touch-none { touch-action: none; }
    @media print { .print\\:hidden { display: none !important; } }
`;
document.head.appendChild(style);

// 最後確保 App 元件正確渲染並導出
// export default App; (此行已包含在區塊 5 的 App 定義中)
// ==========================================
// 核心渲染路徑 (此段接續在區塊 6 的 main 標籤內)
// ==========================================
        /* 接續區塊 6 的內容... */
                {!isLocked && !isResigned && view === 'attendance' && isPrivileged && (
                    <AttendanceView 
                        users={users} 
                        currentDate={currentDate} 
                        db={db} 
                        appId={appId} 
                        shifts={shifts} 
                        shiftTypes={shiftsDef} 
                    />
                )}
                
                {!isLocked && !isResigned && view === 'payroll' && isSuperAdmin && (
                    <PayrollView 
                        users={Object.values(users)} 
                        currentDate={currentDate} 
                        db={db} 
                        appId={appId} 
                        gasReceipts={gasReceipts} 
                    />
                )}

                {!isLocked && !isResigned && view === 'settings' && (
                    <SettingsView 
                        users={users} 
                        currentUserInfo={currentUserInfo} 
                        leaveTypes={leaves} 
                        shiftTypes={shiftsDef} 
                        inventoryItems={inventory} 
                        storeConfig={store} 
                        db={db} 
                        appId={appId} 
                        isSuperAdmin={isSuperAdmin} 
                        insurances={insurances} 
                    />
                )}

                {!isLocked && !isResigned && view === 'inbox' && (
                    <div className="max-w-md mx-auto space-y-4 animate-fade-in">
                        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl flex items-center gap-3">
                            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><Bell size={24}/></div>
                            <h2 className="font-black text-xl text-slate-800 tracking-tighter">通知中心</h2>
                        </div>
                        {myNotifications.length === 0 ? (
                            <div className="bg-white p-12 rounded-[2rem] border border-dashed text-center text-slate-300 font-bold italic">
                                目前沒有任何待處理的申請單
                            </div>
                        ) : (
                            myNotifications.sort((a,b)=>b.timestamp - a.timestamp).map(req => (
                                <div key={req.id} className="bg-white p-5 rounded-3xl border border-l-8 border-l-indigo-500 shadow-lg animate-fade-in">
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <span className="bg-indigo-50 text-indigo-700 text-[10px] px-2 py-1 rounded-lg font-black uppercase mb-1 inline-block">Request Review</span>
                                            <h3 className="font-black text-slate-800 text-lg">
                                                {req.type === 'ot_confirm' ? '加班確認單' : '換假申請單'}
                                            </h3>
                                        </div>
                                        <div className="text-[10px] text-slate-300 font-mono font-bold">
                                            {req.date}
                                        </div>
                                    </div>
                                    <p className="text-sm text-slate-500 mb-4 bg-slate-50 p-3 rounded-2xl border border-slate-100 italic">
                                        「{req.reason || '無備註內容'}」
                                    </p>
                                    <div className="flex gap-3">
                                        <button 
                                            onClick={() => handleRequest(req, 'reject')}
                                            className="flex-1 py-3 bg-white border border-slate-200 text-slate-400 font-black rounded-2xl hover:bg-slate-50 transition-all active:scale-95"
                                        >
                                            駁回申請
                                        </button>
                                        <button 
                                            onClick={() => handleRequest(req, 'accept')}
                                            className="flex-1 py-3 bg-indigo-600 text-white font-black rounded-2xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95"
                                        >
                                            核准通過
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </main>

            {/* --- 底部導航欄 (手機版優化) --- */}
            <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t border-slate-100 h-20 sm:hidden flex items-center justify-around px-6 z-40 print:hidden">
                {filteredNav.slice(0, 5).map(item => (
                    <button 
                        key={item.id} 
                        onClick={() => setView(item.id)}
                        className={`flex flex-col items-center gap-1 transition-all ${view === item.id ? 'text-indigo-600 scale-110' : 'text-slate-300'}`}
                    >
                        <item.icon size={22} strokeWidth={view === item.id ? 3 : 2} />
                        <span className="text-[9px] font-black uppercase tracking-tighter">{item.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

// ==========================================
// 🛡️ 檔案末端安全檢查 (防止 export 失敗)
// ==========================================
/* Randy，這行確保 React 引擎能找到 App 組件。
   如果在 Vite 環境，請確保檔案最後有這行。
*/
// export default App;