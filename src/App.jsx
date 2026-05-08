import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, updateDoc, getDoc, addDoc, deleteDoc, arrayUnion } from 'firebase/firestore';
import { 
    Calendar, Users, ChevronLeft, ChevronRight, Save, ShieldAlert, Plus, Trash2, 
    BookOpen, LogOut, CheckCircle2, Lock, Eye, Clock, Store, Bell, ArrowRightLeft, 
    FileBarChart, UserX, Upload, ListFilter, History, StickyNote, DollarSign, Gift, 
    Megaphone, Send, Smartphone, X, Inbox, Repeat, MapPin, Fingerprint, Map, Package, 
    Settings, ChevronDown, Minus, Download, Edit, FileSignature, FileText, Printer, 
    FileSearch, Fuel, CreditCard, AlertTriangle, Wallet, FileCheck, PieChart
} from 'lucide-react';
const CURRENT_VERSION = "v11 (Master Integration Edition)"; 
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
const provider = new GoogleAuthProvider(); // 補上 Google 登入 Provider
const db = getFirestore(app);
const appId = 'team-shift-pc-v1'; 
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
    'bg-red-100 text-red-900 border-red-400', 'bg-blue-100 text-blue-900 border-blue-400', 'bg-green-100 text-green-900 border-green-400', 
    'bg-yellow-100 text-yellow-900 border-yellow-500', 'bg-purple-100 text-purple-900 border-purple-400', 'bg-teal-100 text-teal-900 border-teal-400',    
    'bg-pink-100 text-pink-900 border-pink-400', 'bg-orange-100 text-orange-900 border-orange-400', 'bg-indigo-100 text-indigo-900 border-indigo-400', 'bg-rose-100 text-rose-900 border-rose-400'     
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
// 🪟 共用組件與各類 Modal
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
const CompanyEventModal = ({ isOpen, onClose, eventData, onSave, onDelete }) => {
    const [formData, setFormData] = useState({ title: '', startDate: '', time: '', repeatType: 'none', note: '' });
    useEffect(() => { if(isOpen && eventData) setFormData(eventData); }, [isOpen, eventData]);
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
                <div className="bg-purple-600 p-4 text-white flex justify-between items-center"><h3 className="font-bold flex items-center gap-2"><Megaphone className="w-5 h-5"/> 公司行程備忘錄</h3><button onClick={onClose} className="hover:bg-purple-700 p-1 rounded"><X size={20}/></button></div>
                <div className="p-6 space-y-4">
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">標題 <span className="text-red-500">*</span></label><input type="text" value={formData.title} onChange={e=>setFormData({...formData, title: e.target.value})} className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500"/></div>
                    <div className="grid grid-cols-2 gap-3"><div><label className="block text-xs font-bold text-gray-700 mb-1">日期</label><input type="date" value={formData.startDate} onChange={e=>setFormData({...formData, startDate: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"/></div><div><label className="block text-xs font-bold text-gray-700 mb-1">時間</label><input type="time" value={formData.time} onChange={e=>setFormData({...formData, time: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"/></div></div>
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">重複</label><select value={formData.repeatType} onChange={e=>setFormData({...formData, repeatType: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none">{Object.entries(REPEAT_LABELS).map(([val, label]) => <option key={val} value={val}>{label}</option>)}</select></div>
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">備註 (選填)</label><textarea value={formData.note || ''} onChange={e=>setFormData({...formData, note: e.target.value})} rows="2" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"></textarea></div>
                    <div className="flex gap-3 pt-4 border-t">{formData.id && <button onClick={()=>onDelete(formData.id)} className="p-2.5 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg"><Trash2 size={18}/></button>}<button onClick={onClose} className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-lg font-bold hover:bg-gray-200">取消</button><button onClick={() => { if(!formData.title) return alert("請輸入標題"); onSave(formData); }} className="flex-1 bg-purple-600 text-white py-2.5 rounded-lg font-bold shadow hover:bg-purple-700">儲存</button></div>
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
const SignModal = ({ formType, onClose, currentUserInfo, db, appId, setView, storeConfig }) => {
    const [agree, setAgree] = useState(false);
    const [origDate, setOrigDate] = useState('');
    const [newDate, setNewDate] = useState('');
    
    const { workLocation, salaryAmount, contractStart, contractEnd, isIndefinite } = currentUserInfo;
    const resolvedWorkLocation = workLocation || storeConfig?.name || storeConfig?.address || '台中東山店';
    const canvasRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasSigned, setHasSigned] = useState(false);
    const startDrawing = (e) => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX || e.touches[0].clientX;
        const clientY = e.clientY || e.touches[0].clientY;
        ctx.beginPath();
        ctx.moveTo(clientX - rect.left, clientY - rect.top);
        setIsDrawing(true); setHasSigned(true);
    };
    const draw = (e) => {
        if (!isDrawing) return;
        e.preventDefault(); 
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX || e.touches[0].clientX;
        const clientY = e.clientY || e.touches[0].clientY;
        ctx.lineTo(clientX - rect.left, clientY - rect.top);
        ctx.stroke();
    };
    const stopDrawing = () => { setIsDrawing(false); };
    const clearSignature = () => {
        const canvas = canvasRef.current; const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height); setHasSigned(false);
    };
    const handleSubmit = async () => {
        if (!agree) return alert("請勾選同意條款！");
        if (!hasSigned) return alert("請在白色方框內親筆簽名！");
        
        let customData = {}; let formName = '';
        if (formType === 'holiday') {
            if (!origDate || !newDate) return alert("請完整選擇原假日與調移日期！");
            formName = '國定假日調移同意書'; customData = { origDate, newDate };
        } else if (formType === 'contract') {
            formName = '員工勞動契約暨保密與工作守則同意書'; 
            customData = { contractStart, contractEnd: isIndefinite ? '不定期契約' : contractEnd, workLocation: resolvedWorkLocation, salaryAmount };
        }
        
        const signatureImage = canvasRef.current.toDataURL('image/png');
        const docData = { uid: currentUserInfo.uid, userName: currentUserInfo.name, formType, formName, agreedAt: Date.now(), customData, signatureImage };
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'signatures'), docData);
        alert("✅ 簽署完成！系統已解鎖並自動跳轉至班表頁面。"); 
        
        onClose();
        if (formType === 'contract' && setView) { setTimeout(() => setView('calendar'), 100); }
    };
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[80] p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[95vh]">
                <div className="bg-gray-800 p-4 text-white flex justify-between items-center"><h3 className="font-bold">{formType === 'holiday' ? '填寫：國定假日調移同意書' : '填寫：員工勞動契約暨保密與工作守則同意書'}</h3><button onClick={onClose}><X size={20}/></button></div>
                <div className="p-6 overflow-y-auto flex-1 space-y-4">
                    
                    {formType === 'holiday' && (
                        <div className="bg-orange-50 p-4 rounded-lg border border-orange-200 mb-4 space-y-3 shadow-sm">
                            <h4 className="font-bold text-orange-800">請設定調移日期：</h4>
                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2"><label className="text-sm font-bold text-gray-700 w-24">原國定假日</label><input type="date" value={origDate} onChange={e=>setOrigDate(e.target.value)} className="border rounded px-3 py-2 flex-1 w-full text-sm focus:outline-none"/></div>
                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2"><label className="text-sm font-bold text-gray-700 w-24">調移至日期</label><input type="date" value={newDate} onChange={e=>setNewDate(e.target.value)} className="border rounded px-3 py-2 flex-1 w-full text-sm focus:outline-none"/></div>
                        </div>
                    )}
                    <div className="border border-gray-300 rounded-lg p-5 bg-gray-50 h-72 overflow-y-auto text-sm text-gray-700 leading-relaxed shadow-inner">
                        {formType === 'holiday' ? (
                            <>
                                <h4 className="font-bold text-center text-lg mb-4 text-gray-900">國定假日調移同意書</h4>
                                <p>立同意書人 <strong>{currentUserInfo.name}</strong> 茲同意雇主依勞動基準法第 37 條及相關施行細則規定，將原定之國定假日調移至其他工作日。</p><br/>
                                <p>雙方約定調移明細如下：</p>
                                <ul className="list-disc pl-5 my-2 space-y-1 font-bold text-indigo-700"><li>原定國定假日：{origDate || '【尚未填寫】'}</li><li>同意調移日期：{newDate || '【尚未填寫】'}</li></ul><br/>
                                <p>說明與約定事項：</p>
                                <ol className="list-decimal pl-5 space-y-2 mt-2"><li>調移後之「原國定假日」即轉為「正常工作日」，立同意書人於該日出勤，雇主無須另加給工資。</li><li>調移後之「調移日」即轉為「休假日」，立同意書人依法享有休假。如因業務需求於該「調移日」出勤，雇主將依法發給出勤加倍工資。</li><li>本同意書經雙方確認於系統打勾並親筆簽署後生效。</li></ol>
                            </>
                        ) : (
                            <>
                                <h4 className="font-bold text-center text-xl mb-4 text-gray-900">員工勞動契約暨保密與工作守則同意書</h4>
                                <p className="mb-4">立契約書人 <strong>{currentUserInfo.name}</strong> (以下簡稱乙方)，受雇於本公司 (以下簡稱甲方)，雙方同意訂定本勞動契約，共同遵守約定條款如下：</p>
                                <p className="font-bold text-gray-900 mt-4 bg-indigo-50 px-2 py-1 rounded inline-block">第一條：契約起訖與工作場所</p>
                                <ol className="list-decimal pl-8 space-y-1 mt-2">
                                    <li>契約期間：自 <span className="text-indigo-600 font-bold">{contractStart}</span> 起至 <span className="text-indigo-600 font-bold">{isIndefinite ? '不定期契約' : contractEnd}</span> 止。</li>
                                    <li>工作地點：乙方應於甲方指定地點（<span className="text-indigo-600 font-bold">{resolvedWorkLocation}</span>）提供勞務，負責相關門市工作。</li>
                                </ol>
                                <p className="font-bold text-gray-900 mt-4 bg-indigo-50 px-2 py-1 rounded inline-block">第二條：出勤、請假與排班制度</p>
                                <ol className="list-decimal pl-8 space-y-1 mt-2">
                                    <li>採排班制與變形工時，確實透過 APP 打卡。</li>
                                    <li>換假與換班需於 <strong>3 天前</strong> 經雙方確認並送交店長審核核准。未經核准擅自不到班者，依曠職論處。</li>
                                    <li><strong>特休</strong>：依勞動基準法第 38 條規定，由系統按到職日自動計算發放。</li>
                                    <li><strong>自畫假/排休</strong>：每月自畫休假上限 3 天，且逢星期六、日之假日最多僅能畫休 2 天。</li>
                                    <li><strong>生理假/病假/事假</strong>：依法與公司內部規定辦理，全年事假上限 14 日、病假上限 30 日。</li>
                                </ol>
                                <p className="font-bold text-gray-900 mt-4 bg-indigo-50 px-2 py-1 rounded inline-block">第三條：寒暑假旺季特別約定</p>
                                <ol className="list-decimal pl-8 space-y-1 mt-2">
                                    <li>因應門市寒暑假之營運高峰，乙方同意配合延長工時，正常與延長工時合計單日最長不超過 12 小時。</li>
                                    <li>針對旺季配合排班衍生之額外工時，甲方得視營運績效另行核發特別獎金。</li>
                                </ol>
                                <p className="font-bold text-gray-900 mt-4 bg-indigo-50 px-2 py-1 rounded inline-block">第四條：薪資、油資與補休結算</p>
                                <ol className="list-decimal pl-8 space-y-1 mt-2">
                                    <li><strong>本薪發放</strong>：甲方每月給付乙方本薪新台幣 <span className="text-indigo-600 font-bold">{salaryAmount}</span> 元整。統一於 <strong>次月 5 日</strong> 轉帳發放。</li>
                                    <li><strong>油資補貼約定</strong>：每月最高補貼 500 元。採實報實銷，須提交甲方統編發票核銷。未達 500 元以實際發票核發，未核銷額度不得遞延。</li>
                                    <li><strong>國定假日出勤</strong>：乙方同意若於國定假日出勤，當日出勤工時全數轉換為「補休時數」，不另計發加倍工資。</li>
                                    <li><strong>年度結算</strong>：至當年 12/31 止，未休畢之補休時數依法折發工資。</li>
                                </ol>
                                <p className="font-bold text-gray-900 mt-4 bg-indigo-50 px-2 py-1 rounded inline-block">第五條：離職與交接</p>
                                <p className="pl-4 mt-2">乙方自請離職須依勞基法提前預告，並確實辦理交接。未依規定致甲方受損害者須負賠償責任。</p>
                                <p className="font-bold text-gray-900 mt-4 bg-indigo-50 px-2 py-1 rounded inline-block">第六條：法定保障與福利</p>
                                <p className="pl-4 mt-2">甲方依法提撥 6% 勞退、提供勞保。乙方須嚴格遵守餐飲業食品良好衛生規範（GHP）。</p>
                                <p className="font-bold text-gray-900 mt-4 bg-indigo-50 px-2 py-1 rounded inline-block">第七條：懲處與賠償制度</p>
                                <p className="pl-4 mt-2">嚴禁代打卡、偷料。若因乙方重大過失造成損失，應負損害賠償責任（依法甲方不得預扣薪資）。</p>
                                <p className="font-bold text-gray-900 mt-4 bg-indigo-50 px-2 py-1 rounded inline-block">第八條：機密保密</p>
                                <p className="pl-4 mt-2">乙方對職務上知悉之營業機密負絕對保密義務，離職後亦同。如有違反願負一切法律責任。</p>
                            </>
                        )}
                    </div>
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 cursor-pointer hover:bg-blue-100 transition-colors" onClick={()=>setAgree(!agree)}>
                        <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={agree} onChange={()=>setAgree(!agree)} className="w-5 h-5 accent-blue-600 cursor-pointer"/><span className="font-bold text-blue-900 leading-tight">本人已詳細審閱、充分了解且同意上述條款，並以下方親筆簽名為憑。</span></label>
                    </div>
                    <div className="border-2 border-gray-300 rounded-lg overflow-hidden relative">
                        <div className="bg-gray-100 p-2 text-xs font-bold text-gray-600 flex justify-between items-center border-b border-gray-300">
                            <span>✍️ 請在下方空白處親筆簽名</span><button onClick={clearSignature} className="bg-white border px-2 py-1 rounded shadow-sm hover:bg-gray-50 text-red-600">清除重寫</button>
                        </div>
                        <canvas ref={canvasRef} width={600} height={150} onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} className="w-full bg-white touch-none cursor-crosshair"></canvas>
                    </div>
                </div>
                <div className="p-4 border-t bg-gray-50 flex gap-3"><button onClick={onClose} className="flex-1 bg-white border border-gray-300 text-gray-600 py-3 rounded-lg font-bold hover:bg-gray-100 transition-colors">取消</button><button onClick={handleSubmit} className={`flex-1 py-3 rounded-lg font-bold shadow-lg transition-colors ${agree && hasSigned ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}>送出同意並簽署</button></div>
            </div>
        </div>
    );
};
const ViewSignatureModal = ({ sigData, onClose }) => {
    if (!sigData) return null;
    const handlePrint = () => { window.print(); };
    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[90] p-4 animate-fade-in print:bg-white print:p-0">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[95vh] print:shadow-none print:max-h-none print:h-auto">
                <div className="bg-gray-800 p-4 text-white flex justify-between items-center print:hidden">
                    <h3 className="font-bold flex items-center gap-2"><FileSearch size={18}/> 檢視電子簽署紀錄</h3>
                    <div className="flex gap-2"><button onClick={handlePrint} className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded text-sm font-bold flex items-center gap-1"><Printer size={14}/> 列印 / 轉 PDF</button><button onClick={onClose} className="hover:bg-red-500 p-1 rounded"><X size={20}/></button></div>
                </div>
                <div className="p-8 overflow-y-auto print:overflow-visible text-gray-800 space-y-6">
                    <div className="border-b-2 border-gray-800 pb-4 mb-4 text-center">
                        <h1 className="text-2xl font-black">{sigData.formName}</h1>
                        <p className="text-gray-500 mt-2 font-mono">文件編號: {sigData.id} | 簽署日期: {new Date(sigData.agreedAt).toLocaleString()}</p>
                    </div>
                    <div className="text-sm leading-loose space-y-4">
                        {sigData.formType === 'holiday' ? (
                            <>
                                <p>立同意書人 <strong>{sigData.userName}</strong> 茲同意雇主依勞動基準法第 37 條及相關施行細則規定，將原定之國定假日調移至其他工作日。</p>
                                <ul className="list-disc pl-5 font-bold text-lg my-4"><li>原定國定假日：{sigData.customData?.origDate}</li><li>同意調移日期：{sigData.customData?.newDate}</li></ul>
                                <p>說明與約定事項：<br/>1. 調移後之「原國定假日」轉為「正常工作日」，立同意書人於該日出勤，雇主無須加給工資。<br/>2. 調移後之「調移日」轉為「休假日」，立同意書人依法享有休假。如因業務需求於該「調移日」出勤，發給加倍工資。</p>
                            </>
                        ) : (
                            <>
                                <p>立契約書人 <strong>{sigData.userName}</strong> (以下簡稱乙方)，受雇於本公司 (以下簡稱甲方)，雙方同意訂定本勞動契約，共同遵守約定條款如下：</p>
                                <p><strong>第一條：契約起訖與工作地點</strong><br/>契約期間自 {sigData.customData?.contractStart} 至 {sigData.customData?.contractEnd}。乙方應於甲方指定地點（{sigData.customData?.workLocation}）提供勞務，負責相關門市工作。</p>
                                <p><strong>第二條：出勤、請假與排班制度</strong><br/>採排班制與變形工時。請換假需於 3 天前審核。特休依勞基法發放；每月自畫休假上限 3 天（含假日最多 2 天）。</p>
                                <p><strong>第三條：寒暑假旺季與工時</strong><br/>因應寒暑假（1,2月及7,8月）營運高峰，乙方同意配合延長工時，合計單日最長不超過 12 小時。甲方得視營運績效另行核發「旺季特別獎金」。</p>
                                <p><strong>第四條：薪資、油資與補休結算</strong><br/>甲方每月給付乙方本薪新台幣 <strong>{sigData.customData?.salaryAmount}</strong> 元整。每月最高 500 元油資補貼（憑統編發票實報實銷）。乙方同意若於國定假日出勤，當日出勤工時全數轉換為「補休時數」存入系統，不另計發加倍工資。年度終結未休畢之補休時數，依法或獎金辦法結算發放。</p>
                                <p><strong>第五條：離職與交接</strong><br/>乙方自請離職須依法預告並交接。未依規定致甲方受有損害者，須負損害賠償責任。</p>
                                <p><strong>第六條：法定保障與福利</strong><br/>甲方依法提撥 6% 勞工退休金、提供勞保及職災協助。乙方須嚴格遵守餐飲業食品良好衛生規範（GHP）。</p>
                                <p><strong>第七條：懲處與賠償制度</strong><br/>嚴禁代打卡、偷料。若因乙方個人重大過失造成具體財物損失，乙方應負損害賠償責任（甲方不得自薪資預扣）。</p>
                                <p><strong>第八條：機密保密</strong><br/>乙方對職務上知悉之營業機密負絕對保密義務，違者願負法律責任與損害賠償。</p>
                            </>
                        )}
                        <div className="bg-gray-100 p-3 text-sm font-bold text-center border mt-6">☑️ 本人已詳細審閱、充分了解且同意上述條款，並以下方親筆簽名為憑。</div>
                    </div>
                    <div className="mt-8 flex justify-end">
                        <div className="text-center">
                            <p className="text-gray-500 mb-2 font-bold">立同意書人 (親筆簽名)</p>
                            <div className="border-b-2 border-gray-800 pb-2 mb-2 w-64 min-h-[100px] flex items-end justify-center">
                                {sigData.signatureImage && <img src={sigData.signatureImage} alt="Signature" className="max-h-24 object-contain mix-blend-multiply" />}
                            </div>
                            <p className="font-mono text-xs text-gray-400">Timestamp: {sigData.agreedAt}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
// ==========================================
// 📝 表單簽署中心 (FormsView) 
// ==========================================
const FormsView = ({ users, currentUserInfo, db, appId, isPrivileged, signatures, isLocked, setView, isSuperAdmin, storeConfig }) => {
    const [activeTab, setActiveTab] = useState('fill'); 
    const [signModal, setSignModal] = useState(null); 
    const [viewData, setViewData] = useState(null);
    const userSignatures = signatures.filter(s => s.uid === currentUserInfo.uid);
    const hasSignedContract = userSignatures.some(s=>s.formType==='contract');
    const handleSignContract = () => {
        const resolvedWorkLocation = currentUserInfo.workLocation || storeConfig?.name || storeConfig?.address || '台中東山店';
        const isContractReady = currentUserInfo.salaryAmount && currentUserInfo.contractStart && (currentUserInfo.isIndefinite || currentUserInfo.contractEnd);
        if (!isContractReady) {
            return alert("🚨 管理員尚未設定您的「約定薪資」與「合約日期」！\n\n請先通知店長至【系統設定】完成您的合約基本資料設定，才能進行簽署。");
        }
        if (!resolvedWorkLocation) {
            return alert("🚨 尚未設定工作地點，請先補上門市資訊後再簽署。");
        }
        setSignModal('contract');
    };
    return (
        <div className="max-w-4xl mx-auto space-y-4 pb-20">
            <div className="bg-white p-4 rounded-xl border flex justify-between items-center shadow-sm">
                <h2 className="font-bold text-lg text-indigo-700 flex items-center gap-2"><FileSignature/> 表單與同意書簽署</h2>
            </div>
            <div className="flex gap-2 border-b pb-2">
                <button onClick={()=>setActiveTab('fill')} className={`px-4 py-2 font-bold rounded-t-lg transition-colors ${activeTab==='fill'?'text-indigo-600 border-b-2 border-indigo-600 bg-white':'text-gray-500 hover:bg-gray-50'}`}>📝 填寫表單</button>
                {isPrivileged && <button onClick={()=>setActiveTab('records')} className={`px-4 py-2 font-bold rounded-t-lg transition-colors ${activeTab==='records'?'text-indigo-600 border-b-2 border-indigo-600 bg-white':'text-gray-500 hover:bg-gray-50'}`}>🗂️ 簽署紀錄後台</button>}
            </div>
            {activeTab === 'fill' && (
                <div className="grid sm:grid-cols-2 gap-4">
                    <div className={`bg-white p-5 rounded-xl border shadow-sm transition-all ${isLocked ? 'ring-4 ring-red-500 ring-opacity-50' : 'hover:shadow-md'}`}>
                        <div className="flex items-center gap-2 mb-2 text-indigo-600"><FileText size={20}/><h3 className="font-bold text-lg">員工勞動契約暨保密與工作守則同意書</h3></div>
                        <p className="text-sm text-gray-500 mb-4 h-10">新進員工報到或年度工作規範及業務機密保密約定。</p>
                        <button onClick={handleSignContract} className={`w-full font-bold py-2 rounded-lg border transition-colors ${hasSignedContract ? 'bg-gray-100 text-gray-500 border-gray-200' : 'bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100 shadow-sm'}`}>
                            {hasSignedContract ? '重新檢視/簽署' : '立即填寫與簽名'}
                        </button>
                        <div className="mt-3 text-xs text-gray-400 font-bold">{hasSignedContract ? '✅ 您已完成簽署' : <span className="text-red-500">⚠️ 尚未簽署 (請盡速完成以解鎖系統)</span>}</div>
                    </div>
                    <div className={`bg-white p-5 rounded-xl border shadow-sm transition-all ${isLocked ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-md'}`}>
                        <div className="flex items-center gap-2 mb-2 text-orange-600"><Calendar size={20}/><h3 className="font-bold text-lg">國定假日調移同意書</h3></div>
                        <p className="text-sm text-gray-500 mb-4 h-10">依法將特定國定假日調移至其他工作日之同意書填寫。</p>
                        <button onClick={()=> !isLocked && setSignModal('holiday')} disabled={isLocked} className={`w-full font-bold py-2 rounded-lg border transition-colors ${isLocked ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100'}`}>填寫與簽名</button>
                        <div className="mt-3 text-xs text-gray-400">您已累計簽署 {userSignatures.filter(s=>s.formType==='holiday').length} 份</div>
                    </div>
                </div>
            )}
            {activeTab === 'records' && isPrivileged && (
                <div className="bg-white rounded-xl border overflow-hidden shadow-sm">
                    <div className="p-4 bg-gray-50 border-b font-bold text-gray-700">全體員工簽署紀錄清單</div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-100 text-gray-600"><tr><th className="p-3">簽署時間</th><th className="p-3">員工</th><th className="p-3">表單名稱</th><th className="p-3">操作</th></tr></thead>
                            <tbody>
                                {signatures.sort((a,b)=>b.agreedAt-a.agreedAt).map(sig => (
                                    <tr key={sig.id} className="border-b hover:bg-gray-50">
                                        <td className="p-3 text-gray-500 font-mono">{new Date(sig.agreedAt).toLocaleString()}</td>
                                        <td className="p-3 font-bold text-indigo-600">{sig.userName}</td>
                                        <td className="p-3 font-bold">
                                            {sig.formName}
                                            <div className="text-xs text-gray-500 font-normal mt-1">
                                                {sig.formType === 'holiday' ? `原: ${sig.customData?.origDate} ➡️ 調: ${sig.customData?.newDate}` : `月薪: $${sig.customData?.salaryAmount} / 地點: ${sig.customData?.workLocation}`}
                                            </div>
                                        </td>
                                        <td className="p-3 flex items-center gap-2">
                                            <button onClick={()=>setViewData(sig)} className="text-gray-600 hover:text-indigo-600 bg-white border px-2 py-1.5 rounded shadow-sm text-xs font-bold flex items-center gap-1"><Eye size={14}/> 檢視</button>
                                            {isSuperAdmin && (
                                                <button onClick={async () => {
                                                    if(window.confirm("⚠️ 確定要刪除這筆簽署紀錄嗎？刪除後無法復原！")) {
                                                        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'signatures', sig.id));
                                                    }
                                                }} className="text-gray-400 hover:text-red-500 bg-white border px-2 py-1.5 rounded shadow-sm text-xs font-bold flex items-center gap-1"><Trash2 size={14}/> 刪除</button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {signatures.length === 0 && <tr><td colSpan="4" className="p-8 text-center text-gray-400">目前尚無任何簽署紀錄</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            
            {signModal && <SignModal formType={signModal} onClose={()=>setSignModal(null)} currentUserInfo={currentUserInfo} db={db} appId={appId} setView={setView} storeConfig={storeConfig} />}
            {viewData && <ViewSignatureModal sigData={viewData} onClose={()=>setViewData(null)} />}
        </div>
    );
};
// ==========================================
// 📦 庫存盤點頁面 (InventoryView) - 🔴 V8.6 歷史紀錄查詢功能
// ==========================================
const InventoryView = ({ db, appId, inventoryItems }) => {
    const items = Array.isArray(inventoryItems) && inventoryItems.length > 0 ? inventoryItems : [];
    const categories = useMemo(() => [...new Set(items.map(i => i.category))], [items]);
    
    const [mode, setMode] = useState('count'); // 'count' 或 'history'
    const [activeTab, setActiveTab] = useState(categories[0] || '');
    const [records, setRecords] = useState({});
    const [historyList, setHistoryList] = useState([]);
    const [selectedHistory, setSelectedHistory] = useState(null);
    // 🔴 載入歷史紀錄
    useEffect(() => {
        if (mode === 'history') {
            const unsub = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'inventoryRecords'), (snap) => {
                const list = [];
                snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
                // 依日期由新到舊排序
                list.sort((a, b) => b.date.localeCompare(a.date));
                setHistoryList(list);
            });
            return () => unsub();
        }
    }, [mode, db, appId]);
    const filteredItems = items.filter(i => i.category === activeTab);
    const totalValue = useMemo(() => items.reduce((sum, item) => sum + ((records[item.id] || 0) * item.price), 0), [items, records]);
    if (items.length === 0) {
        return (
            <div className="max-w-2xl mx-auto pb-20 text-center mt-10">
                <Package size={64} className="mx-auto text-gray-300 mb-4" />
                <h2 className="text-xl font-bold text-gray-600">目前尚無庫存品項</h2>
                <p className="text-gray-500 mt-2">請使用管理員帳號，前往「管理」➡️「系統設定」新增庫存品項。</p>
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
    // 匯出「當前填寫中」的報表
    const handleExportCSV = () => {
        const todayStr = new Date().toISOString().split('T')[0];
        const rows = [['分類', '品名', '盤點單位', '數量', '單價', '總金額(估算)']];
        let exportTotal = 0;
        items.forEach(item => { const qty = records[item.id] || 0; const subtotal = qty * item.price; exportTotal += subtotal; rows.push([item.category, item.name, item.spec, qty, item.price, subtotal]); });
        rows.push(['', '', '', '', '庫存總值:', exportTotal]);
        exportToCSV(`當前盤點表_${todayStr}`, rows);
    };
    // 🔴 匯出「指定歷史紀錄」的報表
    const handleExportHistoryCSV = (hist) => {
        const rows = [['分類', '品名', '盤點單位', '數量', '單價', '總金額(估算)']];
        let exportTotal = 0;
        items.forEach(item => { 
            const qty = hist.data[item.id] || 0; 
            const subtotal = qty * item.price; 
            exportTotal += subtotal; 
            rows.push([item.category, item.name, item.spec, qty, item.price, subtotal]); 
        });
        rows.push(['', '', '', '', '庫存總值:', exportTotal]);
        exportToCSV(`歷史盤點紀錄_${hist.date}`, rows);
    };
    return (
        <div className="max-w-2xl mx-auto pb-20">
            <div className="bg-white p-4 rounded-xl border flex flex-col sm:flex-row justify-between items-center mb-4 shadow-sm gap-3">
                <h2 className="font-bold text-lg text-indigo-700 flex items-center gap-2"><Package/> 庫存盤點</h2>
                <div className="flex gap-2 bg-gray-100 p-1 rounded-lg w-full sm:w-auto">
                    <button onClick={()=>{setMode('count'); setSelectedHistory(null);}} className={`flex-1 sm:flex-none px-4 py-1.5 rounded text-sm font-bold transition-colors ${mode==='count'?'bg-white shadow text-indigo-600':'text-gray-500 hover:text-gray-700'}`}>新增盤點</button>
                    <button onClick={()=>setMode('history')} className={`flex-1 sm:flex-none px-4 py-1.5 rounded text-sm font-bold transition-colors ${mode==='history'?'bg-white shadow text-indigo-600':'text-gray-500 hover:text-gray-700'}`}>歷史紀錄</button>
                </div>
            </div>
            {mode === 'count' ? (
                <>
                    <div className="flex justify-between items-center mb-2 px-1">
                        <div className="font-bold text-red-600 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100">總值: ${totalValue.toLocaleString()}</div>
                        <div className="flex gap-2"><button onClick={handleExportCSV} className="bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded font-bold shadow-sm hover:bg-green-100 flex items-center gap-1"><Download size={16}/><span className="hidden sm:inline">匯出</span></button><button onClick={handleSave} className="bg-indigo-600 text-white px-4 py-1.5 rounded font-bold shadow hover:bg-indigo-700 flex items-center gap-1"><Save size={16}/> 送出</button></div>
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
                </>
            ) : (
                <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                    {selectedHistory ? (
                        <div className="p-4">
                            <div className="flex justify-between items-center mb-4 border-b pb-3">
                                <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2"><Calendar size={18}/> {selectedHistory.date} 盤點明細</h3>
                                <div className="flex gap-2">
                                    <button onClick={()=>handleExportHistoryCSV(selectedHistory)} className="bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded text-sm font-bold shadow-sm hover:bg-green-100 flex items-center gap-1"><Download size={14}/> 匯出</button>
                                    <button onClick={()=>setSelectedHistory(null)} className="bg-gray-100 text-gray-600 px-3 py-1.5 rounded text-sm font-bold hover:bg-gray-200">返回列表</button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                {items.map(item => {
                                    const qty = selectedHistory.data[item.id];
                                    if (qty === undefined || qty === 0) return null;
                                    return (
                                        <div key={item.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                                            <div>
                                                <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-bold mr-2">{item.category}</span>
                                                <span className="font-bold text-gray-700 text-sm">{item.name}</span>
                                            </div>
                                            <div className="font-mono font-bold text-indigo-600 text-lg">{qty} <span className="text-xs text-gray-500">{item.spec}</span></div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    ) : (
                        <div>
                            <div className="bg-gray-50 p-3 border-b font-bold text-gray-700">歷次盤點紀錄清單</div>
                            {historyList.length === 0 ? (
                                <div className="p-8 text-center text-gray-400">目前尚無歷史紀錄</div>
                            ) : (
                                <div className="divide-y">
                                    {historyList.map(hist => {
                                        const totalCost = items.reduce((sum, item) => sum + ((hist.data[item.id] || 0) * item.price), 0);
                                        return (
                                            <div key={hist.id} onClick={()=>setSelectedHistory(hist)} className="p-4 hover:bg-indigo-50 cursor-pointer flex justify-between items-center transition-colors">
                                                <div>
                                                    <div className="font-bold text-gray-800 text-lg flex items-center gap-2"><Calendar size={16} className="text-indigo-500"/> {hist.date}</div>
                                                    <div className="text-xs text-gray-400 mt-1">送出時間: {new Date(hist.timestamp).toLocaleString()}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-xs text-gray-500">當次庫存總值</div>
                                                    <div className="font-bold text-red-600">${totalCost.toLocaleString()}</div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
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
            (err) => { setLocError(err.code === 1 ? '請允許權限' : '定位失敗'); }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
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
                    } else if (dayShift?.type === 'LEAVE') { status.push('請假'); } else { status.push('未排班'); }
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
        attendanceList.forEach(r => { const shiftStr = r.shiftInfo ? `${r.shiftInfo.start}~${r.shiftInfo.end}` : '-'; rows.push([r.date, r.name, shiftStr, r.in || '', r.out || '', r.status.join(', ')]); });
        exportToCSV(`出勤紀錄_${targetMonth}`, rows);
    };
    return (
        <div className="space-y-4 pb-20">
            <div className="bg-white p-4 rounded-xl border flex justify-between items-center shadow-sm"><h2 className="font-bold flex gap-2 text-indigo-700"><History/> 出勤結算</h2><div className="flex gap-2"><input type="month" value={targetMonth} onChange={e=>setTargetMonth(e.target.value)} className="border rounded px-2 focus:outline-none"/><button onClick={handleExportCSV} className="bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded font-bold shadow-sm hover:bg-green-100 flex items-center gap-1"><Download size={16}/><span className="hidden sm:inline">匯出</span></button></div></div>
            <div className="bg-white rounded-xl border overflow-hidden">
                {loading ? <div className="p-8 text-center text-gray-400">載入中...</div> : attendanceList.length === 0 ? <div className="p-8 text-center text-gray-400">本月尚無打卡紀錄</div> : (
                    <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-gray-50 text-gray-500 font-bold border-b"><tr><th className="p-3">日期</th><th className="p-3">員工</th><th className="p-3 text-center">班別 (應到~應退)</th><th className="p-3 text-center">上班打卡</th><th className="p-3 text-center">下班打卡</th><th className="p-3">狀態</th></tr></thead><tbody>
                                {attendanceList.map((r, i) => {
                                    const isAbnormal = r.status.includes('遲到') || r.status.includes('早退') || r.status.includes('缺卡');
                                    return (
                                    <tr key={i} className="border-b hover:bg-gray-50"><td className="p-3 font-mono text-gray-600">{r.date.substring(5)}</td><td className="p-3 font-bold">{r.name}</td><td className="p-3 text-center text-gray-500 text-xs">{r.shiftInfo ? <span className="bg-gray-100 px-2 py-0.5 rounded">{r.shiftInfo.label} ({r.shiftInfo.start}~{r.shiftInfo.end})</span> : <span className="text-gray-300">-</span>}</td><td className={`p-3 text-center font-bold ${r.in && r.shiftInfo && r.in > r.shiftInfo.start ? 'text-red-500' : 'text-gray-800'}`}>{r.in || '-'}</td><td className={`p-3 text-center font-bold ${r.out && r.shiftInfo && r.out < r.shiftInfo.end ? 'text-red-500' : 'text-gray-800'}`}>{r.out || '-'}</td><td className="p-3 font-bold">{isAbnormal ? <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded text-xs">{r.status.join(', ')}</span> : <span className="text-green-600 bg-green-50 px-2 py-0.5 rounded text-xs">{r.status.join(', ')}</span>}</td></tr>
                                )})}
                    </tbody></table></div>
                )}
            </div>
        </div>
    );
};
// ==========================================
// 📅 月曆排班模組 (CalendarView)
// ==========================================
const CalendarView = ({ currentDate, setCurrentDate, dbData, currentUserInfo, db, appId, isSuperAdmin, isPrivileged, isReadOnly }) => {
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
    // 自動排班邏輯 (週末 09O 規則)
    const handleAutoSchedule = async () => {
        if (!isSuperAdmin) return;
        if(!window.confirm(`🤖 【一鍵自動排班】\n即將自動將「${year}年${month+1}月」整個月，尚未排班的員工補上預設班別。\n\n(規則：週六、週日一律 09O；平日主管 09O、一般員工 09A)\n確定執行嗎？`)) return;
        
        for(let i=1; i<=days; i++) {
            const dStr = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
            const dayData = shifts[dStr] || { assignments: [] };
            if (dayData.isClosed) continue;
            
            let changed = false;
            const newAssigns = Array.isArray(dayData.assignments) ? [...dayData.assignments] : [];
            const dObj = new Date(year, month, i);
            const isWeekend = dObj.getDay() === 0 || dObj.getDay() === 6;
            Object.values(users).forEach(u => {
                if (u.isResigned || u.isViewer) return; 
                const exist = newAssigns.find(a => a.uid === u.uid);
                
                if (!exist || (!exist.shiftCode && exist.type !== 'LEAVE')) {
                    const isMgmt = u.isAdmin || u.isManager;
                    const tShift = isWeekend ? '09O' : (isMgmt ? '09O' : '09A');
                    
                    if(exist) {
                        exist.shiftCode = tShift;
                        exist.type = 'WORK';
                    } else {
                        newAssigns.push({ uid: u.uid, type: 'WORK', shiftCode: tShift });
                    }
                    changed = true;
                }
            });
            if (changed) { await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'shifts', dStr), { ...dayData, assignments: newAssigns }, { merge: true }); }
        }
        alert("✅ 自動排班完成！未排班人員已全數補上預設班別。");
    };
  
    return (
      <>
      <div className="space-y-4">
         <div className="bg-white p-4 rounded-xl border shadow-sm grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="hidden sm:block"></div>
              <div className="flex items-center justify-center gap-3 sm:justify-self-center">
                  <button onClick={()=>setCurrentDate(new Date(year, month-1, 1))} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><ChevronLeft/></button>
                  <div className="font-bold text-xl text-center min-w-[140px]">{year}年 {month+1}月</div>
                  <button onClick={()=>setCurrentDate(new Date(year, month+1, 1))} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><ChevronRight/></button>
              </div>
              <div className="flex justify-center sm:justify-end">
              {!isReadOnly && isSuperAdmin && (
                  <button onClick={handleAutoSchedule} className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-200 px-3 py-1.5 rounded items-center gap-1 font-bold shadow-sm hover:bg-indigo-100 transition-colors flex">
                      🤖 自動填補當月空班
                  </button>
              )}
              </div>
         </div>
         <div className="bg-white rounded-xl border overflow-hidden grid grid-cols-7 shadow-sm">
          {['日','一','二','三','四','五','六'].map(d=><div key={d} className="py-3 text-center font-bold text-gray-600 bg-gray-50 border-b">{d}</div>)}
          {Array.from({length:firstDay}).map((_,i)=><div key={'e'+i} className="min-h-[150px] border-b border-r bg-gray-50/30"/>)}
          {Array.from({length:days}).map((_,i)=>{
            const d=i+1, dateStr=`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const data = shifts[dateStr] || {};
            const todaysEvents = events.filter(e => checkEventOnDate(e, dateStr));
  
            return (
              <div key={d} onClick={()=>setSelectedDate(dateStr)} title={data.note || ''} className={`min-h-[150px] border-b border-r p-1 cursor-pointer transition-colors flex flex-col ${data.isClosed ? 'bg-gray-200' : 'hover:bg-indigo-50'}`}>
                <div className="flex justify-between mb-1"><span className="text-sm font-bold text-gray-700 ml-1">{d}</span>{data.note && <div className="w-0 h-0 border-t-[10px] border-r-[10px] border-t-red-500 border-r-transparent"></div>}</div>
                
                {todaysEvents.map(e => (
                    <div key={e.id} className="bg-purple-100 text-purple-800 border-purple-300 border text-[11px] px-1 rounded mb-1 font-bold truncate flex items-center gap-1 shadow-sm"><Megaphone size={10} className="shrink-0"/> {e.time && `${e.time} `}{e.title}</div>
                ))}
                
                {data.isClosed ? (
                    <div className="flex-1 flex items-center justify-center"><div className="bg-gray-600 text-white text-sm px-3 py-1 rounded flex items-center gap-1 font-bold shadow"><Store size={14} /> 店休</div></div>
                ) : (
                  <div className="space-y-1 overflow-y-auto flex-1">
                    {Array.isArray(data.assignments) && data.assignments.map((a,ix)=>{ 
                        if (a.type === 'LEAVE') {
                            const pColor = getUserColor(a.uid); 
                            const shortName = users[a.uid]?.name ? (users[a.uid].name.length > 2 ? users[a.uid].name.slice(-2) : users[a.uid].name) : '未知';
                            const subNameFull = a.subUid ? users[a.subUid]?.name : null;
                            const subName = subNameFull ? (subNameFull.length > 2 ? subNameFull.slice(-2) : subNameFull) : null;
  
                            return (
                                <div key={ix} className={`p-1 rounded border-2 ${pColor} bg-opacity-30 mb-1 shadow-sm`}>
                                    <div className="flex justify-between items-center"><span className="font-bold text-[11px] tracking-widest">{shortName}</span><span className="bg-white/90 px-1 rounded text-[10px] border shadow-sm flex items-center gap-0.5 shrink-0 font-bold truncate max-w-[40px]">{leaves.find(t=>t.id===a.leaveType)?.label || '假'}</span></div>
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
         {selectedDate && <ShiftModal dateStr={selectedDate} onClose={()=>setSelectedDate(null)} dbData={dbData} currentUserInfo={currentUserInfo} setEditingEvent={setEditingEvent} isSuperAdmin={isSuperAdmin} isPrivileged={isPrivileged} getUserColor={getUserColor} db={db} appId={appId} isReadOnly={isReadOnly} />}
      </div>
      <CompanyEventModal isOpen={!!editingEvent} onClose={()=>setEditingEvent(null)} eventData={editingEvent} onSave={handleSaveEvent} onDelete={handleDeleteEvent} />
      </>
    );
};
// --- 排班細節 Modal ---
const ShiftModal = ({ dateStr, onClose, dbData, currentUserInfo, setEditingEvent, isSuperAdmin, isPrivileged, getUserColor, db, appId, isReadOnly }) => {
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
  
    const update = async (newData) => { await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'shifts', dateStr), { ...dayData, ...newData }, { merge: true }); setExpanded(null); };
    
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
  
    // 🟢 手術一：修改請假邏輯，不論有無代班，員工申請皆須簽核
    const toggle = async (uid, type, lType = null, subUid = null) => {
        const isMe = uid === currentUserInfo.uid;
        if (!isSuperAdmin && !isMe) return alert("無權限");
        if (isClosed) return alert("本日店休");
        // 🟡 判斷是否為「請假」類型 (LEAVE)
        if (type === 'LEAVE') {
            // A. 如果是管理員在操作：直接寫入資料庫 (維持原狀)
            if (isSuperAdmin) {
                let next = Array.isArray(dayData.assignments) ? [...dayData.assignments] : [];
                const idx = next.findIndex(a => a.uid === uid);
                // 這裡保留您原本的 LEAVE 資料結構
                const leaveEntry = { uid, type: 'LEAVE', leaveType: lType, subUid: subUid || null, timestamp: Date.now() };
                if (idx >= 0) next[idx] = leaveEntry; else next.push(leaveEntry);
                await update({ assignments: next });
                setExpanded(null);
            } 
            // B. 如果是員工本人申請：改為送出簽核通知給主管
            else {
                const leaveLabel = leaves.find(l => l.id === lType)?.label || '假別';
                try {
                    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), {
                        type: 'leave_request',
                        uid: currentUserInfo.uid,
                        userName: currentUserInfo.name,
                        date: dateStr,
                        leaveType: lType,
                        leaveLabel: leaveLabel,
                        subUid: subUid || null,
                        subName: subUid ? (users[subUid]?.name || '') : '',
                        timestamp: new Date(),
                        status: 'pending'
                    });
                    const approverLineIds = [...new Set(Object.values(users)
                        .filter(u => !u.isResigned && (u.role === 'boss' || u.role === 'supervisor' || u.isAdmin || u.isManager) && u.lineUserId)
                        .map(u => u.lineUserId)
                        .filter(Boolean))];
                    if (approverLineIds.length > 0) {
                        await sendLineNotification(approverLineIds, `🔔 【新假單申請】\n申請人：${currentUserInfo.name}\n日期：${dateStr}\n類別：${leaveLabel}${subUid ? `\n代理人：${users[subUid]?.name || '已填寫'}` : ''}\n請至系統「通知中心」進行審核。`);
                    }
                    alert(`✅ ${leaveLabel} 申請已送出！\n不論是否填寫代理人，皆需主管或管理員審核後才會上班表。`);
                    setExpanded(null);
                    onClose(); // 申請完自動關閉彈窗
                } catch (e) {
                    alert("申請送出失敗，請檢查網路連線");
                }
            }
            return; // 結束函數，不執行下方的普通排班邏輯
        }
        // 🔵 處理一般排班 (WORK / OFF) 邏輯 (維持您原本的寫法)
        let next = Array.isArray(dayData.assignments) ? [...dayData.assignments] : [];
        const idx = next.findIndex(a => a.uid === uid);
        if (idx >= 0) next.splice(idx, 1); else next.push({ uid, type });
        update({ assignments: next });
    };
  
    // 🔴 尋回：完整雙日換假邏輯與 LINE 推播通知
    const requestSwap = async (fromUid, toUid, date1) => {
        const targetUser = users[toUid]; 
        const date2 = prompt(`【🔄 換班 / 換假申請】\n您準備與 ${targetUser?.name || '對方'} 在 ${date1} 這天換班。\n\n👉 為了公平，請輸入您要「還給對方」的另一天日期 (格式: YYYY-MM-DD)：\n(也就是將這兩天的班別互換)`);
        
        if (date2 === null) return; 
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date2)) {
            return alert("🚨 日期格式錯誤！請務必輸入如 2026-10-15 的格式。");
        }
        if (!confirm(`確定要將您與 ${targetUser?.name} 在【${date1}】與【${date2}】這兩天的班別完全互換嗎？`)) return;
        
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), { 
            type: 'swap', fromUid, toUid, date1, date2, timestamp: new Date() 
        });
        
        if (targetUser?.lineUserId) {
            sendLineNotification([targetUser.lineUserId], `🔄 【換班請求】\n${currentUserInfo.name} 想與您交換班別。\n互換日期：${date1} 與 ${date2}\n請登入系統「通知中心」審核。`);
        }
        alert("✅ 換假申請已送出！已透過 LINE 通知對方審核。");
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
          <div className={`p-4 border-b flex justify-between font-bold items-center ${isClosed ? 'bg-gray-800 text-white' : 'bg-gray-50'}`}><span className="flex items-center gap-2">{dateStr} {isClosed && <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded">本日店休</span>}</span><button onClick={onClose} className="hover:text-red-500">✕</button></div>
          <div className="p-4 overflow-y-auto space-y-3 flex-1 relative">
            
            <div className="bg-purple-50 p-3 rounded-lg mb-3 border border-purple-200 shadow-sm">
                <div className="flex justify-between items-center mb-2"><h4 className="font-bold text-purple-800 flex items-center gap-1"><Megaphone size={14}/> 公司備忘錄 / 行程</h4>{!isReadOnly && isSuperAdmin && <button onClick={()=>setEditingEvent({ startDate: dateStr, repeatType: 'none', time: '', title: '' })} className="text-purple-600 bg-white px-2 py-0.5 rounded border border-purple-200 text-xs font-bold shadow-sm hover:bg-purple-100 transition-colors">+ 新增</button>}</div>
                {todaysEvents.length === 0 ? <div className="text-xs text-purple-400">今日無行程</div> : (
                    todaysEvents.map(e => (
                        <div key={e.id} className="flex justify-between items-center bg-white p-2 rounded border border-purple-100 mb-1 shadow-sm">
                            <div><div className="text-sm font-bold text-gray-800">{e.time && <span className="text-purple-600 mr-1">{e.time}</span>}{e.title}</div>{(e.repeatType !== 'none' || e.note) && (<div className="text-[10px] text-gray-500 mt-0.5 flex gap-1 items-center">{e.repeatType !== 'none' && <span className="bg-gray-100 px-1 rounded flex items-center gap-0.5"><Repeat size={8}/> {REPEAT_LABELS[e.repeatType]}</span>}{e.note && <span className="truncate max-w-[150px]">{e.note}</span>}</div>)}</div>
                            {!isReadOnly && isSuperAdmin && <button onClick={()=>setEditingEvent(e)} className="text-indigo-500 text-xs font-bold bg-indigo-50 px-2 py-1 rounded hover:bg-indigo-100">編輯</button>}
                        </div>
                    ))
                )}
            </div>
  
            {isClosed && (<div className="absolute inset-0 bg-white/95 z-10 flex flex-col items-center justify-center text-center p-4 mt-20"><Store className="w-16 h-16 text-gray-400 mb-2"/><h3 className="text-xl font-bold text-gray-600 mb-4">本日店休</h3>{!isReadOnly && isSuperAdmin && <button onClick={toggleClosed} className="bg-gray-800 text-white px-6 py-2 rounded shadow hover:bg-gray-700 transition-colors">🔓 恢復營業 (解除店休)</button>}</div>)}
            
            {safeUsers.map(u => {
              const assign = Array.isArray(dayData.assignments) ? dayData.assignments.find(a=>a.uid===u.uid) : null; 
              const userColor = getUserColor(u.uid); 
              const isMe = u.uid === currentUserInfo.uid; 
              const canEdit = (isMe || isSuperAdmin) && !isReadOnly; 
  
              const showSwapBtn = !isMe && !isReadOnly;
              
              const hasOT = assign?.otHours !== undefined && assign?.otHours !== null && assign?.otHours !== "" && Number(assign?.otHours) !== 0;
              const otValue = Number(assign?.otHours);
              const isOT = otValue > 0;
              const hasLeave = assign?.type === 'LEAVE';
  
              const pendingApproveReq = requests.find(r => r.date === dateStr && r.fromUid === u.uid && r.type === 'admin_ot_approve');
              const pendingConfirmReq = requests.find(r => r.date === dateStr && r.uid === u.uid && r.type === 'ot_confirm');
  
              const canEditLeave = isSuperAdmin || (isMe && !hasLeave && !isReadOnly);
              const canEditOT = isPrivileged || (isMe && !hasOT && !pendingApproveReq && !pendingConfirmReq && !isReadOnly);
  
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
                              {showSwapBtn && <button onClick={() => requestSwap(currentUserInfo.uid, u.uid, dateStr)} className="bg-white border border-indigo-200 text-indigo-600 px-2 py-1 rounded text-[10px] font-bold shadow-sm hover:bg-indigo-50 flex items-center gap-1"><ArrowRightLeft size={10}/> 換班</button>}
                              {!isReadOnly && isSuperAdmin && <button onClick={()=>cancelLeave(u.uid)} className="text-red-500 hover:text-red-700 bg-white/80 px-2 py-1 rounded text-xs font-bold shadow-sm border border-red-100 flex items-center gap-1 ml-2"><Trash2 size={12}/> 取消</button>}
                          </div>
                      </div>
                  );
              } else {
                  let otButtonUi = null;
                  if (pendingApproveReq) {
                      otButtonUi = <button onClick={() => !isReadOnly && isPrivileged ? openOTModal(u) : alert("審核中。")} className={`flex-1 py-2 text-xs rounded border font-bold shadow-sm bg-blue-50 text-blue-600 border-blue-200 ${(!isPrivileged || isReadOnly) ? 'opacity-60 cursor-not-allowed' : 'hover:bg-blue-100'}`}><Clock className="w-3.5 h-3.5 inline mr-1" />審核中 ({pendingApproveReq.hours}h)</button>;
                  } else if (pendingConfirmReq) {
                      otButtonUi = <button onClick={() => !isReadOnly && isPrivileged ? openOTModal(u) : alert("單據待確認。")} className={`flex-1 py-2 text-xs rounded border font-bold shadow-sm bg-pink-50 text-pink-600 border-pink-200 ${(!isPrivileged || isReadOnly) ? 'opacity-60 cursor-not-allowed' : 'hover:bg-pink-100'}`}><Clock className="w-3.5 h-3.5 inline mr-1" />待確認 ({pendingConfirmReq.hours}h)</button>;
                  } else if (hasOT) {
                      otButtonUi = <button onClick={() => !isReadOnly && isPrivileged ? openOTModal(u) : alert("時數已生效，無法修改。")} className={`flex-1 py-2 text-xs rounded border font-bold shadow-sm ${isOT ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-green-100 text-green-700 border-green-200'} ${(!isPrivileged || isReadOnly) ? 'opacity-60 cursor-not-allowed' : (isOT ? 'hover:bg-orange-200' : 'hover:bg-green-200')}`}><Clock className="w-3.5 h-3.5 inline mr-1" />{isOT ? `+${otValue}h` : `${otValue}h`}</button>;
                  } else {
                      otButtonUi = <button onClick={() => openOTModal(u)} disabled={!canEditOT} className={`flex-1 py-2 text-xs rounded border shadow-sm transition-colors ${!canEditOT ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-600 hover:bg-gray-50'}`}><Clock className="w-3.5 h-3.5 inline mr-1" />加/補休</button>;
                  }
  
                  return (
                    <div key={u.uid} className={`border rounded-lg p-3 ${!canEdit ? 'bg-gray-50 opacity-100' : 'bg-white shadow-sm hover:border-indigo-200 transition-colors'}`}>
                      <div className="flex justify-between items-center mb-2">
                          <div className="font-bold text-gray-800 flex items-center gap-2">
                              <div className={`w-3 h-3 rounded-full ${userColor.split(' ')[0]} border-2 border-gray-400`}></div>{u.name}
                          </div>
                          {showSwapBtn && <button onClick={() => requestSwap(currentUserInfo.uid, u.uid, dateStr)} className="bg-indigo-50 text-indigo-600 border border-indigo-200 px-2 py-1 rounded text-xs font-bold shadow-sm flex items-center gap-1 hover:bg-indigo-100"><ArrowRightLeft size={12}/> 換班</button>}
                      </div>
  
                      <div className="flex gap-2 w-full mt-2">
                          {!isReadOnly && isSuperAdmin ? (
                              <select value={assign?.shiftCode || ''} onChange={(e) => updateShiftCode(u.uid, e.target.value)} className={`flex-1 text-xs border rounded p-1 shadow-sm text-center focus:outline-none ${assign?.shiftCode ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold' : 'bg-white text-gray-500'}`}>
                                  <option value="">未排班</option>
                                  {shiftsDef.map(st => <option key={st.id} value={st.id}>{st.label}</option>)}
                              </select>
                          ) : (assign?.shiftCode ? (
                              <div className="flex-1 flex items-center justify-center text-xs bg-gray-100 text-gray-600 rounded font-mono border shadow-sm font-bold">班別: {shiftsDef.find(st=>st.id===assign.shiftCode)?.label || assign.shiftCode}</div>
                          ) : <div className="flex-1 flex items-center justify-center text-xs bg-gray-50 text-gray-400 rounded font-mono border border-dashed">未排班</div>)}
  
                          {!isReadOnly && (
                              <>
                                {otButtonUi}
                                {!hasLeave && isSuperAdmin && <button onClick={async () => { await toggle(u.uid,'LEAVE','official',null); onClose(); }} disabled={!canEditLeave} className={`flex-1 py-2 text-xs rounded border shadow-sm transition-colors ${!canEditLeave ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 font-bold'}`}>排休</button>}
                                <button onClick={() => canEditLeave ? setExpanded(expanded===u.uid?null:u.uid) : alert("無權限或已鎖定。")} className={`flex-1 py-2 text-xs rounded border shadow-sm transition-colors ${!canEditLeave ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-600 hover:bg-gray-50 font-bold'}`}>請休假 ▼</button>
                              </>
                          )}
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
                                  if (lt.id === 'official') return null;
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
            <div className="border-t pt-3 mt-2">
                <div className="flex gap-2 items-center mb-1"><StickyNote className="w-4 h-4 text-gray-500" /><span className="text-xs font-bold text-gray-600">當日備註 (顯示於右上角紅點)</span></div>
                <div className="flex gap-2">
                    <input value={note} disabled={isReadOnly} onChange={e=>setNote(e.target.value)} className={`border flex-1 rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-500 ${isReadOnly ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white'}`} placeholder="例如: 衛生局檢查..."/>
                    {!isReadOnly && <button onClick={()=>setDoc(doc(db,'artifacts',appId,'public', 'data', 'shifts',dateStr),{...dayData,note},{merge:true})} className="bg-indigo-600 text-white px-3 rounded hover:bg-indigo-700"><Save size={16}/></button>}
                </div>
            </div>
            {!isReadOnly && isSuperAdmin && !isClosed && <div className="pt-2 border-t mt-2"><button onClick={toggleClosed} className="w-full bg-gray-100 text-gray-600 text-xs py-2 rounded hover:bg-gray-200 flex items-center justify-center gap-1 font-bold transition-colors"><Store className="w-3.5 h-3.5" /> 設為店休 (清空當日班表)</button></div>}
          </div>
        </div>
      </div>
      <OTModal isOpen={!!otModalData} onClose={()=>setOtModalData(null)} onConfirm={handleOTSave} modalData={otModalData} dateStr={dateStr} />
      </>
    );
};
// ==========================================
// 📊 統計明細 (SalaryView) - V10 旗艦還原版
// ==========================================
const SalaryView = ({ users, shifts, currentDate, leaveTypes, currentUserInfo, isPrivileged, gasReceipts, db, appId }) => {
    const [targetMonth, setTargetMonth] = useState(`${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}`);
    const [showResigned, setShowResigned] = useState(false);
    const [gasModalData, setGasModalData] = useState(null);
    const visibleUsers = useMemo(() => {
        let list = isPrivileged ? Object.values(users) : [currentUserInfo];
        if (!showResigned) list = list.filter(u => !u.isResigned);
        return list;
    }, [users, currentUserInfo, isPrivileged, showResigned]);
  
    const calc = (uid) => {
        const targetYear = targetMonth.substring(0, 4);
        const uObj = users[uid];
        const annualLimit = getAnnualLeaveDays(uObj?.startDate);
        let tenureText = "資料未建檔";
        if (uObj?.startDate) {
            const start = new Date(uObj.startDate);
            const now = new Date();
            const diffDays = Math.ceil(Math.abs(now - start) / (1000 * 60 * 60 * 24));
            const diffYears = diffDays / 365.25;
            if (diffYears < 0.5) tenureText = "未滿半年";
            else if (diffYears >= 0.5 && diffYears < 1) tenureText = "滿半年";
            else tenureText = `滿 ${Math.floor(diffYears)} 年`;
        }
        let monthStats = { ot: 0, leaves: {} };
        let yearStats = { otEarned: 0, compHoursUsed: 0, leaves: {}, usedAnnual: 0 }; 
        let otHistory = []; 
        let monthOtHistory = [];
  
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
                if (lType === 'annual') yearStats.usedAnnual += (hrs / 8);
                if ((assign.useComp || lType === 'annual') && hrs > 0 && lType !== 'menstrual') {
                    if (lType !== 'annual') yearStats.compHoursUsed += hrs;
                    otHistory.push({ date, hours: -hrs, reason: `使用「${typeInfo?.label || lType}」抵扣` });
                    if (date.startsWith(targetMonth)) monthOtHistory.push({ date, hours: -hrs, reason: `使用「${typeInfo?.label || lType}」抵扣` });
                }
                if(date.startsWith(targetMonth)) {
                    if(!monthStats.leaves[lType]) monthStats.leaves[lType] = { days: 0, hours: 0, compHours: 0, deductHours: 0 };
                    monthStats.leaves[lType].days += 1;
                    if(assign.leaveHours && lType !== 'menstrual') monthStats.leaves[lType].hours += hrs;
                    if (assign.useComp || lType === 'annual' || lType === 'menstrual') monthStats.leaves[lType].compHours += hrs; else monthStats.leaves[lType].deductHours += hrs;
                }
            }
            if(assign.otHours && assign.otConfirmed) { 
                const hrs = parseFloat(assign.otHours);
                if (hrs > 0) yearStats.otEarned += hrs;
                if (hrs < 0) yearStats.compHoursUsed += Math.abs(hrs);
                if(date.startsWith(targetMonth) && hrs > 0) monthStats.ot += hrs;
                otHistory.push({ date, hours: hrs, reason: assign.otReason || '無備註' });
                if(date.startsWith(targetMonth)) monthOtHistory.push({ date, hours: hrs, reason: assign.otReason || '無備註' });
            }
        });
  
        otHistory.sort((a, b) => b.date.localeCompare(a.date));
        monthOtHistory.sort((a, b) => b.date.localeCompare(a.date));
        const balance = yearStats.otEarned - yearStats.compHoursUsed;
        const gasTotal = (gasReceipts?.[targetMonth]?.[uid] || []).reduce((sum, r) => sum + r.amount, 0);
        return { monthStats, yearStats, balance, otHistory, monthOtHistory, targetYear, annualLimit, gasTotal, tenureText };
    };
    return (
        <div className="space-y-4 pb-20">
            <div className="bg-white p-4 rounded-xl border flex flex-col sm:flex-row sm:justify-between sm:items-center shadow-sm gap-3">
                <h2 className="font-bold flex gap-2 text-indigo-700"><ListFilter /> 時數結算 / 統計明細</h2>
                <div className="flex gap-2">
                    <input type="month" value={targetMonth} onChange={e=>setTargetMonth(e.target.value)} className="border rounded px-2 py-1.5 focus:outline-none"/>
                </div>
            </div>
            {visibleUsers.map(u => {
                const s = calc(u.uid);
                return (
                    <div key={u.uid} className="bg-white p-4 rounded-xl shadow-sm border space-y-4">
                        <div className="flex justify-between items-start border-b pb-2">
                            <div className="font-bold text-lg">{u.name}</div>
                            <div className="text-right">
                                <div className="text-[10px] text-gray-400">年度剩餘補休時數</div>
                                <div className={`font-bold text-xl ${s.balance < 0 ? 'text-red-600' : 'text-indigo-600'}`}>{s.balance} hr</div>
                            </div>
                        </div>
                        <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-200">
                            <div className="text-xs font-bold text-indigo-900 mb-2 border-b border-indigo-100 pb-1 flex justify-between">
                                <span><Gift className="w-3 h-3 inline mr-1"/> 法定特休帳戶</span>
                                <span className="bg-white px-2 rounded text-indigo-600">剩餘: {Math.max(0, s.annualLimit - s.yearStats.usedAnnual)} 天</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-[11px] text-indigo-800">
                                <div>📌 到職日: {u.startDate || '未設定'}</div>
                                <div>⏳ 系統年資: {s.tenureText}</div>
                                <div>🎯 年度總額: {s.annualLimit} 天</div>
                                <div>🏃 年度已休: {s.yearStats.usedAnnual} 天</div>
                            </div>
                        </div>
                        <div className="bg-teal-50 p-2 rounded-lg border border-teal-200 flex justify-between items-center text-xs">
                            <span className="font-bold text-teal-800"><Fuel className="w-3 h-3 inline mr-1"/> 本月油資核銷: ${Math.min(s.gasTotal, 500)}</span>
                            <span className="text-[10px] text-teal-600">實報實銷 (上限500)</span>
                        </div>
                        <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                            <div className="font-bold text-blue-900 mb-2">本月時數結算明細</div>
                            {s.monthOtHistory.length === 0 ? (
                                <div className="text-xs text-blue-500">本月尚無加減時數紀錄</div>
                            ) : (
                                <div className="space-y-1">
                                    {s.monthOtHistory.map((h, i) => (
                                        <div key={i} className="flex items-center justify-between text-xs bg-white/80 border border-blue-100 rounded px-2 py-1">
                                            <span className="font-mono text-gray-500">{h.date}</span>
                                            <span className={`font-bold ${h.hours > 0 ? 'text-orange-600' : 'text-green-600'}`}>{h.hours > 0 ? `+${h.hours}` : h.hours} hr</span>
                                            <span className="text-gray-600 text-right ml-2 flex-1 truncate">{h.reason}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        {s.otHistory.length > 0 && (
                            <div className="text-[10px] bg-gray-50 p-2 rounded border">
                                <div className="font-bold text-gray-500 mb-1">加班/補休沖抵歷史 (最新5筆)</div>
                                {s.otHistory.slice(0, 5).map((h, i) => (
                                    <div key={i} className="flex justify-between border-b border-gray-100 last:border-0 py-0.5">
                                        <span>{h.date.substring(5)}</span>
                                        <span className={h.hours > 0 ? 'text-orange-600' : 'text-green-600'}>{h.hours > 0 ? `+${h.hours}` : h.hours} hr</span>
                                        <span className="text-gray-400 truncate ml-2 w-32 text-right">{h.reason}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    );
};
// ==========================================
// 💰 薪資管理 (PayrollView)
// ==========================================
const PayrollView = ({ users, currentDate, db, appId, gasReceipts }) => {
    const [targetMonth, setTargetMonth] = useState(`${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}`);
    const [payrollData, setPayrollData] = useState({});
    const [showResigned, setShowResigned] = useState(false);
    
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
    const visibleUsers = users.filter(u => showResigned ? true : !u.isResigned);
    return (
        <div className="space-y-4 pb-20">
            <div className="bg-white p-4 rounded-xl border flex flex-col sm:flex-row sm:justify-between sm:items-center shadow-sm gap-3">
                <h2 className="font-bold flex gap-2 text-indigo-700"><DollarSign/> 薪資與福利管理 (機密)</h2>
                <div className="flex gap-3 items-center w-full sm:w-auto justify-between sm:justify-end">
                    <label className="text-xs flex items-center gap-1 text-gray-500 cursor-pointer font-bold bg-gray-50 px-2 py-1.5 rounded border border-gray-200 hover:bg-gray-100 transition-colors">
                        <input type="checkbox" checked={showResigned} onChange={e=>setShowResigned(e.target.checked)} className="accent-indigo-600" />
                        顯示已離職
                    </label>
                    <input type="month" value={targetMonth} onChange={e=>setTargetMonth(e.target.value)} className="border rounded px-2 py-1.5 focus:outline-none"/>
                </div>
            </div>
            
            <div className="bg-white rounded-xl border overflow-x-auto shadow-sm">
                <table className="w-full text-sm text-left"><thead className="bg-gray-50 text-gray-500 font-bold border-b"><tr><th className="p-3">姓名</th><th className="p-3 w-24">本薪</th><th className="p-3 w-20 bg-teal-50 text-teal-700 text-center">油資核銷</th><th className="p-3 w-24">補助/津貼</th><th className="p-3 w-24 bg-pink-50 text-pink-700">生日禮金</th><th className="p-3 w-24 bg-purple-50 text-purple-700">三節獎金</th><th className="p-3 w-24 bg-yellow-50 text-yellow-700">年終獎金</th><th className="p-3">備註</th></tr></thead>
                <tbody>{visibleUsers.map(u => { 
                    const record = payrollData[u.uid] || {}; 
                    const userGasRecords = gasReceipts?.[targetMonth]?.[u.uid] || [];
                    const gasTotal = userGasRecords.reduce((sum, r) => sum + r.amount, 0);
                    const gasCapped = Math.min(gasTotal, 500);
                    return (
                        <tr key={u.uid} className={`border-b hover:bg-gray-50 ${u.isResigned ? 'opacity-60 bg-gray-50' : ''}`}>
                            <td className="p-3 font-bold flex items-center gap-1 mt-1">{u.name}{u.isResigned && <span className="text-[10px] bg-red-100 text-red-600 px-1 py-0.5 rounded ml-1 border border-red-200">離職</span>}</td>
                            <td className="p-3"><input type="number" placeholder="0" className="w-full border rounded px-1 py-1 focus:outline-none focus:border-indigo-500" value={record.base || ''} onChange={e=>updatePayroll(u.uid, 'base', e.target.value)}/></td>
                            <td className="p-3 bg-teal-50 text-center font-bold text-teal-800">${gasCapped}</td>
                            <td className="p-3"><input type="number" placeholder="0" className="w-full border rounded px-1 py-1 focus:outline-none focus:border-indigo-500" value={record.subsidy || ''} onChange={e=>updatePayroll(u.uid, 'subsidy', e.target.value)}/></td>
                            <td className="p-3 bg-pink-50"><input type="number" placeholder="0" className="w-full border rounded px-1 py-1 focus:outline-none focus:border-indigo-500 bg-transparent" value={record.bonus_bday || ''} onChange={e=>updatePayroll(u.uid, 'bonus_bday', e.target.value)}/></td>
                            <td className="p-3 bg-purple-50"><input type="number" placeholder="0" className="w-full border rounded px-1 py-1 focus:outline-none focus:border-indigo-500 bg-transparent" value={record.bonus_festival || ''} onChange={e=>updatePayroll(u.uid, 'bonus_festival', e.target.value)}/></td>
                            <td className="p-3 bg-yellow-50"><input type="number" placeholder="0" className="w-full border rounded px-1 py-1 focus:outline-none focus:border-indigo-500 bg-transparent" value={record.bonus_year || ''} onChange={e=>updatePayroll(u.uid, 'bonus_year', e.target.value)}/></td>
                            <td className="p-3"><input type="text" placeholder="..." className="w-full border rounded px-1 py-1 focus:outline-none focus:border-indigo-500" value={record.note || ''} onChange={e=>updatePayroll(u.uid, 'note', e.target.value)}/></td>
                        </tr>
                    ); 
                })}</tbody></table>
            </div>
        </div>
    );
};
// ==========================================
// ⚙️ 設定視圖 (SettingsView) - 修正版：加入薪資與合約設定
// ==========================================
const SettingsView = ({ users = {}, currentUserInfo, inventoryItems = [], appId, storeConfig, db, isSuperAdmin }) => {
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({});
  const [showResigned, setShowResigned] = useState(false);
  
  const userList = Object.values(users || {});
  const pendingUsersCount = userList.filter(u => !u?.isResigned && (!u?.salaryAmount || !u?.contractStart)).length;
  const saveUser = async () => { 
      if (isSuperAdmin && (!formData.startDate || !formData.salaryAmount || !formData.contractStart)) {
          return alert("🚨 請務必填寫「到職日」、「本薪」及「合約起始日」！");
      }
      // 🟢 儲存時自動確保權限邏輯 (例如：老闆一定是 Admin)
      const updatedData = {
          ...formData,
          isAdmin: ['boss', 'supervisor'].includes(formData.role), // 自動判斷是否具備管理權限
          workLocation: formData.workLocation || storeConfig?.name || storeConfig?.address || '台中東山店',
      };
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', editingId), updatedData); 
      setEditingId(null); 
      alert("✅ 員工權限與合約資料已更新！");
  };
  const roles = [
      { id: 'employee', label: '員工', color: 'bg-gray-100 text-gray-600', desc: '僅能查看個人班表、打卡' },
      { id: 'supervisor', label: '主管', color: 'bg-blue-100 text-blue-600', desc: '可審核假單、查看團隊出勤' },
      { id: 'boss', label: '老闆', color: 'bg-indigo-600 text-white', desc: '全系統最高權限（含薪資、設定）' },
      { id: 'observer', label: '觀察者', color: 'bg-amber-100 text-amber-600', desc: '僅可查看所有資料，不可修改' }
  ];
  return (
    <div className="space-y-8 pb-20 max-w-4xl mx-auto animate-fade-in">
      {/* 💳 頂端資訊卡片 */}
      <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-xl shadow-indigo-50 text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 to-purple-500"></div>
        <h2 className="font-black text-3xl text-gray-800 tracking-tighter">{currentUserInfo?.name || '管理員'}</h2>
        <p className="text-indigo-500 font-black text-xs uppercase tracking-widest mt-1">Permission Controller</p>
      </div>
      {/* 👥 員工資料與權限管理區 */}
      <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-lg">
          <div className="flex justify-between items-center mb-8">
              <h3 className="font-black text-xl text-gray-800 flex items-center gap-3">
                <ShieldAlert className="text-indigo-600" size={24}/> 權限等級與合約檔案
              </h3>
              <button 
                onClick={() => setShowResigned(!showResigned)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${showResigned ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400'}`}
              >
                {showResigned ? '顯示離職' : '隱藏離職'}
              </button>
          </div>
          
          <div className="grid gap-4">
            {userList
              .filter(u => showResigned ? true : !u?.isResigned)
              .sort((a, b) => (a?.isResigned === b?.isResigned ? 0 : a?.isResigned ? 1 : -1))
              .map(u => {
                const needsSetup = !u?.salaryAmount || !u?.contractStart;
                const currentRole = roles.find(r => r.id === (u?.role || 'employee'));
                return (
                  <div key={u.uid} className={`group border p-6 rounded-[2rem] transition-all duration-300 ${u?.isResigned ? 'bg-gray-50 opacity-60' : 'bg-gray-50 hover:bg-white hover:shadow-xl hover:shadow-indigo-50'}`}>
                    {editingId === u.uid ? (
                      <div className="space-y-6 animate-scale-in">
                        {/* 🔑 權限設定區 */}
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-gray-400 ml-2 uppercase tracking-widest">Permission Level 權限等級設定</label>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                {roles.map(role => (
                                    <button
                                        key={role.id}
                                        onClick={() => setFormData({...formData, role: role.id})}
                                        className={`p-3 rounded-2xl text-[11px] font-black transition-all border-2 ${formData.role === role.id ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-inner' : 'border-transparent bg-white text-gray-400 hover:bg-gray-50'}`}
                                    >
                                        {role.label}
                                    </button>
                                ))}
                            </div>
                            <p className="text-[9px] text-gray-400 ml-2 font-bold italic">
                                * {roles.find(r => r.id === formData.role)?.desc}
                            </p>
                        </div>
                        {/* 📅 日期與薪資設定 */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1"><label className="text-[10px] font-black text-gray-400 ml-2">到職日</label><input type="date" value={formData.startDate || ''} onChange={e=>setFormData({...formData, startDate:e.target.value})} className="w-full bg-white border-0 p-4 rounded-2xl text-sm font-bold shadow-sm focus:ring-2 focus:ring-indigo-500" /></div>
                            <div className="space-y-1"><label className="text-[10px] font-black text-gray-400 ml-2">本薪</label><input type="number" value={formData.salaryAmount || ''} onChange={e=>setFormData({...formData, salaryAmount:Number(e.target.value)})} className="w-full bg-white border-0 p-4 rounded-2xl text-sm font-bold shadow-sm focus:ring-2 focus:ring-indigo-500" /></div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1"><label className="text-[10px] font-black text-indigo-400 ml-2">合約起點</label><input type="date" value={formData.contractStart || ''} onChange={e=>setFormData({...formData, contractStart:e.target.value})} className="w-full bg-indigo-50/30 border-2 border-indigo-100 p-4 rounded-2xl text-sm font-bold shadow-sm" /></div>
                            <div className="space-y-1"><label className="text-[10px] font-black text-purple-400 ml-2">合約到期</label><input type="date" value={formData.contractEnd || ''} onChange={e=>setFormData({...formData, contractEnd:e.target.value})} className="w-full bg-purple-50/30 border-2 border-purple-100 p-4 rounded-2xl text-sm font-bold shadow-sm" /></div>
                        </div>
                        <div className="flex gap-3 justify-end pt-2">
                            <button onClick={()=>setEditingId(null)} className="px-6 py-2 font-black text-gray-400 text-xs">取消</button>
                            <button onClick={saveUser} className="bg-indigo-600 text-white px-10 py-4 rounded-2xl font-black text-xs shadow-lg shadow-indigo-100">確認並儲存</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <div className={`w-14 h-14 rounded-[1.25rem] flex items-center justify-center font-black border-2 ${currentRole?.id === 'boss' ? 'border-indigo-600 bg-indigo-50 text-indigo-600' : 'bg-white border-gray-100 text-gray-400'}`}>
                                {u?.name?.slice(0,1)}
                            </div>
                            <div>
                                <div className="font-black text-gray-800 text-lg flex items-center gap-2">
                                  {u?.name}
                                  <span className={`text-[9px] px-2 py-1 rounded-lg font-black ${currentRole?.color || 'bg-gray-100 text-gray-400'}`}>
                                    {currentRole?.label || '未定身分'}
                                  </span>
                                </div>
                                <div className="text-[10px] text-gray-400 font-bold uppercase mt-1 tracking-widest">
                                  {u?.contractStart ? `合約期間: ${u.contractStart} ~ ${u.contractEnd || '長期'}` : '⚠️ 合約日期未設定'}
                                </div>
                            </div>
                        </div>
                        <button onClick={()=>{setEditingId(u.uid); setFormData(u)}} className="bg-white border-2 border-gray-50 px-6 py-3 rounded-2xl text-xs font-black text-gray-600 hover:bg-indigo-600 hover:text-white transition-all">
                            編輯身分
                        </button>
                      </div>
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
// 🌟 系統主程式 (Main App) - V10.0 完整核心
// ==========================================
function App() {
    const [user, setUser] = useState(null);
    const [currentUserInfo, setCurrentUserInfo] = useState(null);
    const [dbData, setDbData] = useState({ 
        users: {}, shifts: {}, events: [], requests: [], signatures: [], 
        gasReceipts: {}, storeLocation: null, inventoryItems: DEFAULT_INVENTORY_ITEMS 
    });
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
                    const initial = { uid: u.uid, name: u.displayName || '新員工', email: u.email, isAdmin: u.email === ADMIN_EMAIL, isManager: false, isResigned: false, startDate: '' };
                    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', u.uid), initial);
                    setCurrentUserInfo(initial);
                } else { setCurrentUserInfo(userDoc.data()); }
            } else { setUser(null); setCurrentUserInfo(null); }
            setLoading(false);
        });
        return () => unsubAuth();
    }, []);
    useEffect(() => {
        if (!user) return;
        const unsubUsers = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'users'), (snap) => { const map = {}; snap.forEach(d => map[d.id] = d.data()); setDbData(prev => ({ ...prev, users: map })); });
        const unsubShifts = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'shifts'), (snap) => { const map = {}; snap.forEach(d => map[d.id] = d.data()); setDbData(prev => ({ ...prev, shifts: map })); });
        const unsubSigs = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'signatures'), (snap) => { const list = []; snap.forEach(d => list.push({ id: d.id, ...d.data() })); setDbData(prev => ({ ...prev, signatures: list })); });
        const unsubReqs = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), (snap) => { const list = []; snap.forEach(d => list.push({ id: d.id, ...d.data() })); setDbData(prev => ({ ...prev, requests: list })); });
        const unsubEvents = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'companyEvents'), (snap) => { const list = []; snap.forEach(d => list.push({ id: d.id, ...d.data() })); setDbData(prev => ({ ...prev, events: list })); });
        const unsubGas = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'gasReceipts'), (snap) => { const map = {}; snap.forEach(d => map[d.id] = d.data()); setDbData(prev => ({ ...prev, gasReceipts: map })); });
        const unsubLoc = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'storeLocation'), (snap) => setDbData(prev => ({ ...prev, storeLocation: snap.data() })));
        const unsubInv = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'inventoryConfig'), (snap) => {
            setDbData(prev => ({ ...prev, inventoryItems: snap.exists() && snap.data().items ? snap.data().items : DEFAULT_INVENTORY_ITEMS }));
        });
        return () => { unsubUsers(); unsubShifts(); unsubSigs(); unsubReqs(); unsubEvents(); unsubGas(); unsubLoc(); unsubInv(); };
    }, [user]);
    const isSuperAdmin = currentUserInfo?.isAdmin === true;
    const canApproveLeaveRequests = currentUserInfo?.role === 'boss' || currentUserInfo?.role === 'supervisor' || currentUserInfo?.isAdmin === true || currentUserInfo?.isManager === true;
    const hasSignedContract = dbData.signatures.some(s => s.uid === user?.uid && s.formType === 'contract');
    const isLocked = !isSuperAdmin && !hasSignedContract;
// 🟢 手術二：處理核准的「大腦」邏輯
// 🟢 請貼在這裡 (handleRequest 的上方)
const needsSetupCount = Object.values(dbData.users || {}).filter(u => !u.isResigned && (!u.salaryAmount || !u.contractStart)).length;
    const handleRequest = async (req, action) => {
        if (!canApproveLeaveRequests) return alert("您沒有審核權限");
        const requestRef = doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.id);
        const targetUser = dbData.users[req.uid || req.fromUid]; 
        if (action === 'reject') {
            await deleteDoc(requestRef);
            if (targetUser?.lineUserId) await sendLineNotification([targetUser.lineUserId], `❌ 您於 ${req.date} 送出的${req.leaveLabel || '申請'}未通過審核。`);
            alert("✅ 已駁回申請，並通知員工。");
            return;
        }
        if (req.type === 'leave_request') {
            const shiftRef = doc(db, 'artifacts', appId, 'public', 'data', 'shifts', req.date);
            const shiftSnap = await getDoc(shiftRef);
            const dayData = shiftSnap.exists() ? shiftSnap.data() : { assignments: [] };
            const assigns = Array.isArray(dayData.assignments) ? [...dayData.assignments] : [];
            const idx = assigns.findIndex(a => a.uid === req.uid);
            const leaveEntry = { 
                uid: req.uid, 
                type: 'LEAVE', 
                leaveType: req.leaveType, 
                leaveHours: 8, 
                subUid: req.subUid || null,
                timestamp: Date.now() 
            };
            if (idx >= 0) assigns[idx] = leaveEntry; else assigns.push(leaveEntry);
            await setDoc(shiftRef, { ...dayData, assignments: assigns }, { merge: true });
            await deleteDoc(requestRef);
            if (targetUser?.lineUserId) await sendLineNotification([targetUser.lineUserId], `✅ 您於 ${req.date} 送出的${req.leaveLabel || '假單'}已核准，班表已同步更新。`);
            alert("✅ 假單已核准，班表已更新，並已通知員工。");
        }
    };
    
    // 🔔 計算主管需要看到的通知數量
    const myNotifications = dbData.requests?.filter(r => 
        (r.type === 'leave_request' && canApproveLeaveRequests) || 
        (r.type === 'admin_ot_approve' && canApproveLeaveRequests)
    ) || [];
    const renderView = () => {
        // 如果還沒簽約，強制跳轉到表單頁
        if (isLocked && view !== 'forms') {
            return <FormsView users={Object.values(dbData.users || {})} currentUserInfo={currentUserInfo} db={db} appId={appId} isPrivileged={isSuperAdmin} signatures={dbData.signatures} isLocked={isLocked} setView={setView} isSuperAdmin={isSuperAdmin} storeConfig={dbData.storeLocation} />;
        }
        switch (view) {
            case 'calendar': return <CalendarView currentDate={currentDate} setCurrentDate={setCurrentDate} dbData={{ ...dbData, leaves: DEFAULT_LEAVE_TYPES, shiftsDef: DEFAULT_SHIFT_TYPES }} currentUserInfo={currentUserInfo} db={db} appId={appId} isSuperAdmin={isSuperAdmin} isPrivileged={isSuperAdmin} isReadOnly={false} />;
            case 'clock': return <ClockView currentUser={user} currentUserInfo={currentUserInfo} storeConfig={dbData.storeLocation} db={db} appId={appId} />;
            case 'inventory': return <InventoryView db={db} appId={appId} inventoryItems={dbData.inventoryItems} />;
            case 'forms': return <FormsView users={Object.values(dbData.users || {})} currentUserInfo={currentUserInfo} db={db} appId={appId} isPrivileged={isSuperAdmin} signatures={dbData.signatures} isLocked={isLocked} setView={setView} isSuperAdmin={isSuperAdmin} storeConfig={dbData.storeLocation} />;
            case 'salary': return <SalaryView users={dbData.users} shifts={dbData.shifts} currentDate={currentDate} leaveTypes={DEFAULT_LEAVE_TYPES} currentUserInfo={currentUserInfo} isPrivileged={isSuperAdmin} gasReceipts={dbData.gasReceipts} db={db} appId={appId} />;
            case 'payroll': return <PayrollView users={Object.values(dbData.users || {})} currentDate={currentDate} db={db} appId={appId} gasReceipts={dbData.gasReceipts} />;
            case 'attendance': return <AttendanceView users={Object.values(dbData.users || {})} currentDate={currentDate} db={db} appId={appId} shifts={dbData.shifts} shiftTypes={DEFAULT_SHIFT_TYPES} />;
            
            // 🟢 修正：只保留一個 settings，並加上空值保護
            case 'settings': return <SettingsView users={dbData.users || {}} currentUserInfo={currentUserInfo} inventoryItems={dbData.inventoryItems || []} appId={appId} storeConfig={dbData.storeLocation} db={db} isSuperAdmin={isSuperAdmin} />;
            
            case 'inbox': return (
                <div className="max-w-md mx-auto space-y-4">
                    <div className="bg-white p-6 rounded-[2rem] border shadow-sm flex items-center gap-3">
                        <Bell className="text-indigo-600"/><h2 className="font-black text-xl">通知中心</h2>
                    </div>
                    {/* 🟢 修正：確保 myNotifications 存在 */}
                    {(!myNotifications || myNotifications.length === 0) ? (
                        <div className="text-center py-20 text-gray-300 font-bold uppercase tracking-widest">No Notifications</div>
                    ) : (
                        myNotifications.map(req => (
                            <div key={req.id} className="bg-white p-6 rounded-[2rem] border border-l-8 border-l-indigo-500 shadow-xl animate-scale-in">
                                <h3 className="font-black text-gray-800">{req.type === 'leave_request' ? '🌴 請假申請' : '單據審核'}</h3>
                                <p className="text-sm font-bold text-gray-500 mt-1">申請人：{dbData.users?.[req.uid]?.name || '未知員工'} | 日期：{req.date}</p>
                                <div className="bg-indigo-50 p-3 my-3 rounded-2xl text-sm font-black text-indigo-700">
                                    {req.type === 'leave_request' ? `類別：${req.leaveLabel}` : `時數：${req.hours} hr`}
                                </div>
                                <div className="flex gap-3">
                                    <button onClick={()=>handleRequest(req, 'reject')} className="flex-1 bg-gray-50 text-gray-400 py-3 rounded-xl font-black hover:bg-gray-100 transition-all">駁回</button>
                                    <button onClick={()=>handleRequest(req, 'accept')} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-black shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all">核准</button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            );
            default: return null;
        }
    };
    if (loading) return <div className="h-screen flex items-center justify-center font-black text-indigo-600 animate-pulse tracking-tighter">SYNCHRONIZING...</div>;
    // 🟠 1. TEATOP 台中東山店：最終純淨版大門 (已移除 T 與小字，修復點擊)
    if (!user) return (
        <div className="min-h-screen bg-orange-50 flex flex-col items-center justify-center p-6 animate-fade-in relative overflow-hidden">
            {/* 背景裝飾 */}
            <div className="absolute -top-20 -left-20 w-80 h-80 bg-orange-100 rounded-full blur-3xl opacity-50 pointer-events-none"></div>
            <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-orange-200 rounded-full blur-3xl opacity-40 pointer-events-none"></div>
            <div className="w-full max-w-md space-y-12 text-center relative z-10">
                <div className="flex flex-col items-center gap-3">
                    <h1 className="font-black text-6xl text-[#F26F21] tracking-tighter">TEATOP</h1>
                    <h2 className="font-extrabold text-4xl text-gray-800 tracking-tight mt-2">台中東山店</h2>
                </div>
                <div className="bg-white/80 backdrop-blur-sm border border-gray-100 p-10 rounded-[3rem] shadow-2xl shadow-orange-200/50">
                    <div className="flex items-center justify-center gap-3 mb-10 text-[#F26F21]">
                        <Fingerprint size={32} />
                        <h3 className="font-black text-2xl text-gray-800">身分驗證</h3>
                    </div>
                    
                    {/* 🟢 修復後的按鈕：加上 cursor-pointer 與 z-50 確保可點擊 */}
                    <button 
                        onClick={() => signInWithPopup(auth, provider)} 
                        className="w-full flex items-center justify-center gap-4 bg-white text-gray-700 font-black px-8 py-6 rounded-2xl border-2 border-gray-50 hover:bg-orange-50 hover:text-[#F26F21] hover:border-orange-100 shadow-xl shadow-gray-100/50 transition-all duration-300 active:scale-95 cursor-pointer relative z-50"
                    >
                        <img src="https://auth.firebase.com/v2/images/google_logo.svg" alt="Google" className="w-6 h-6" />
                        <span className="text-xl">使用 Google 帳號登入</span>
                    </button>
                    
                    <p className="text-[11px] font-bold text-gray-400 mt-10 leading-relaxed">
                        請使用東山店內部授權帳號登入系統<br/>
                        若無法登入請聯繫管理人員
                    </p>
                </div>
            </div>
            <div className="absolute bottom-8 text-center text-gray-300 text-[10px] font-black uppercase tracking-[0.2em]">
                TEATOP DONGSHAN © 2026
            </div>
        </div>
    );
    // 🔵 2. 主要系統架構 (地雷字元全面清除)
    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <header className="bg-white/80 border-b border-gray-100 shadow-sm sticky top-0 z-40 backdrop-blur-md">
                <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#F26F21] rounded-2xl flex items-center justify-center shadow-lg shadow-orange-100">
                            <Calendar className="text-white" size={20} />
                        </div>
                        <h1 className="font-black text-xl text-gray-800 hidden xs:block tracking-tight">TEATOP 東山店</h1>
                    </div>
                    <nav className="flex items-center gap-2">
                        <NavBtn active={view === 'calendar'} onClick={() => setView('calendar')} icon={Calendar} label="班表" />
                        <NavBtn active={view === 'clock'} onClick={() => setView('clock')} icon={Clock} label="打卡" />
                        
                        <div className="relative">
                            <button 
                                onClick={() => setMenuOpen(!menuOpen)} 
                                className={`flex items-center gap-1 px-4 py-2.5 rounded-2xl font-black text-xs relative transition-all ${['salary','attendance','payroll','forms','settings'].includes(view)?'bg-indigo-600 text-white shadow-xl shadow-indigo-100':'text-gray-400 hover:bg-gray-100'}`}
                            >
                                <Settings size={16}/>
                                <ChevronDown size={14}/>
                                {needsSetupCount > 0 && isSuperAdmin && (
                                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 border-2 border-white rounded-full"></span>
                                )}
                            </button>
                            {menuOpen && (
                                <div className="absolute right-0 mt-3 w-56 bg-white border border-gray-100 rounded-[2rem] shadow-2xl py-3 z-50 animate-scale-in">
                                    <DropdownItem onClick={() => {setView('salary'); setMenuOpen(false)}} icon={Wallet} label={isSuperAdmin ? "薪資結算" : "時數結算"} />
                                    {isSuperAdmin && <DropdownItem onClick={() => {setView('attendance'); setMenuOpen(false)}} icon={FileCheck} label="出勤統計" />}
                                    <DropdownItem onClick={() => {setView('forms'); setMenuOpen(false)}} icon={FileText} label="表單簽署" />
                                    <div className="border-t my-2 border-gray-50"></div>
                                    <DropdownItem onClick={() => {setView('settings'); setMenuOpen(false)}} icon={Settings} label="系統設定" />
                                    <button onClick={() => signOut(auth)} className="w-full text-left px-6 py-3 text-red-500 text-xs font-black hover:bg-red-50">登出系統</button>
                                </div>
                            )}
                        </div>
                        <button 
                            onClick={() => setView('inbox')} 
                            className={`p-2.5 relative rounded-xl transition-all ${view === 'inbox' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:bg-gray-100'}`}
                        >
                            <Bell size={20} />
                            {myNotifications.length > 0 && (
                                <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full animate-ping"></span>
                            )}
                        </button>
                    </nav>
                </div>
            </header>
            <main className="flex-1 p-6 max-w-7xl mx-auto w-full animate-fade-in">
                {renderView()}
            </main>
            {isLocked && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-red-600 text-white text-xs py-3 px-8 rounded-full z-50 flex items-center gap-3 font-black shadow-2xl animate-bounce">
                    <Lock size={16}/> 
                    {/* 🟢 安全寫法：用 → 取代 > */}
                    <span>請點擊「管理 → 系統設定」完成員工合約！</span>
                </div>
            )}
        </div>
    );
}
export { App as default };
