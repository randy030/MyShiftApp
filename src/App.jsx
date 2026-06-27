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
const CURRENT_VERSION = "v12.8.4.9-recovery-hotfix (Contract Appendix Edition)"; 
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
    if (!targetLineIds || targetLineIds.length === 0) return false;
    try {
        const response = await fetch(LINE_API_URL, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ to: targetLineIds, messages: [{ type: 'text', text: messageText }] }) 
        });
        if (!response.ok) throw new Error(`LINE API ${response.status}`);
        return true;
    } catch (e) {
        console.error("LINE 通知失敗", e);
        return false;
    }
};
const getApproverLineIds = (users = {}) => [...new Set(
    Object.values(users || {})
        .filter(u => !u?.isResigned && (u?.role === 'boss' || u?.role === 'supervisor' || u?.isAdmin === true || u?.isManager === true) && u?.lineUserId)
        .map(u => u.lineUserId)
        .filter(Boolean)
)];
const getSiblingPendingRequests = (requests = [], req = {}) => {
    const requesterUid = req?.uid || req?.fromUid;
    return (requests || []).filter(item => {
        const itemRequesterUid = item?.uid || item?.fromUid;
        if (!item?.id || item.id === req?.id) return false;
        if (item?.type !== req?.type) return false;
        if (itemRequesterUid !== requesterUid) return false;
        if ((item?.date || '') !== (req?.date || '')) return false;
        if ((item?.leaveType || '') !== (req?.leaveType || '')) return false;
        return String(item?.hours ?? '') === String(req?.hours ?? '');
    });
};
const formatDateTime = (value) => {
    if (!value) return '—';
    const dateObj = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
    if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return '—';
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    const hh = String(dateObj.getHours()).padStart(2, '0');
    const mi = String(dateObj.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
};

const sortInventoryItems = (items = []) => {
    const safeItems = Array.isArray(items) ? [...items] : [];
    return safeItems
        .map((item, index) => ({ item, index }))
        .sort((a, b) => {
            const hasOrderA = Number.isFinite(Number(a.item?.sortOrder));
            const hasOrderB = Number.isFinite(Number(b.item?.sortOrder));
            if (hasOrderA && hasOrderB) {
                const orderDiff = Number(a.item.sortOrder) - Number(b.item.sortOrder);
                if (orderDiff !== 0) return orderDiff;
            } else if (hasOrderA !== hasOrderB) {
                return hasOrderA ? -1 : 1;
            }
            return a.index - b.index;
        })
        .map(entry => entry.item);
};
const normalizeInventoryItems = (items = []) => (Array.isArray(items) ? items : []).map((item, index) => ({
    ...item,
    sortOrder: index
}));
const prepareInventoryItems = (items = []) => {
    const safeItems = Array.isArray(items) ? [...items] : [];
    if (safeItems.length === 0) return [];
    const hasExplicitOrder = safeItems.some(item => Number.isFinite(Number(item?.sortOrder)));
    return normalizeInventoryItems(hasExplicitOrder ? sortInventoryItems(safeItems) : safeItems);
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

const getAnnualLeaveHours = (startDateStr) => getAnnualLeaveDays(startDateStr) * 8;
const calculateShiftHours = (shiftCode, shiftTypes = DEFAULT_SHIFT_TYPES) => {
    const shift = (shiftTypes || []).find(st => st.id === shiftCode);
    if (!shift) return 8;
    if (Number(shift?.hours) > 0) return Number(shift.hours);
    if (!shift.start || !shift.end) return 8;
    const [startHour, startMinute] = String(shift.start).split(':').map(Number);
    const [endHour, endMinute] = String(shift.end).split(':').map(Number);
    let startTotal = (startHour || 0) * 60 + (startMinute || 0);
    let endTotal = (endHour || 0) * 60 + (endMinute || 0);
    if (endTotal <= startTotal) endTotal += 24 * 60;
    const rawHours = Math.round(((endTotal - startTotal) / 60) * 100) / 100;
    if (rawHours === 8.5) return 8;
    return Math.max(1, rawHours || 8);
};
const resolveLeaveHours = (assignment, shiftTypes = DEFAULT_SHIFT_TYPES) => {
    const existingHours = Number(assignment?.leaveHours);
    if (Number.isFinite(existingHours) && existingHours > 0) return existingHours;
    if (assignment?.shiftCode) return calculateShiftHours(assignment.shiftCode, shiftTypes);
    return 8;
};
const getUserYearlyTimeStats = ({ shifts = {}, uid, targetYear, targetMonth = '', leaveTypes = [], shiftTypes = DEFAULT_SHIFT_TYPES }) => {
    let monthStats = { ot: 0, leaves: {} };
    let yearStats = { otEarned: 0, compHoursUsed: 0, leaves: {}, usedAnnualHours: 0 };
    let otHistory = [];
    let monthOtHistory = [];

    Object.keys(shifts || {}).forEach(date => {
        if (!String(date).startsWith(targetYear || '')) return;
        const data = shifts?.[date];
        if (data?.isClosed) return;
        const assign = Array.isArray(data?.assignments) ? data.assignments.find(a => a.uid === uid) : null;
        if (!assign) return;

        if (assign.type === 'LEAVE') {
            const lType = assign.leaveType || 'unknown';
            const typeInfo = (leaveTypes || []).find(t => t.id === lType);
            const hrs = resolveLeaveHours(assign, shiftTypes);
            if (!yearStats.leaves[lType]) yearStats.leaves[lType] = { days: 0, hours: 0, compHours: 0, deductHours: 0 };
            yearStats.leaves[lType].days += 1;
            if (lType !== 'menstrual') yearStats.leaves[lType].hours += hrs;
            if (lType === 'annual') yearStats.usedAnnualHours += hrs;
            if (assign.useComp && hrs > 0 && lType !== 'menstrual' && lType !== 'annual') {
                yearStats.compHoursUsed += hrs;
                yearStats.leaves[lType].compHours += hrs;
                otHistory.push({ date, hours: -hrs, reason: `使用「${typeInfo?.label || lType}」抵扣` });
                if (targetMonth && date.startsWith(targetMonth)) {
                    monthOtHistory.push({ date, hours: -hrs, reason: `使用「${typeInfo?.label || lType}」抵扣${assign.note ? ` (${assign.note})` : ''}` });
                }
            } else if (hrs > 0 && lType !== 'menstrual' && lType !== 'annual') {
                yearStats.leaves[lType].deductHours += hrs;
            }
            if (targetMonth && date.startsWith(targetMonth)) {
                if (!monthStats.leaves[lType]) monthStats.leaves[lType] = { days: 0, hours: 0, compHours: 0, deductHours: 0 };
                monthStats.leaves[lType].days += 1;
                if (lType !== 'menstrual') monthStats.leaves[lType].hours += hrs;
                if (assign.useComp && lType !== 'menstrual' && lType !== 'annual') monthStats.leaves[lType].compHours += hrs;
                else if (lType !== 'annual' && lType !== 'menstrual') monthStats.leaves[lType].deductHours += hrs;
            }
        }

        if (assign.otHours && assign.otConfirmed) {
            const hrs = parseFloat(assign.otHours);
            if (hrs > 0) yearStats.otEarned += hrs;
            if (hrs < 0) yearStats.compHoursUsed += Math.abs(hrs);
            if (targetMonth && date.startsWith(targetMonth) && hrs > 0) monthStats.ot += hrs;
            otHistory.push({ date, hours: hrs, reason: assign.otReason || '無備註' });
            if (targetMonth && date.startsWith(targetMonth)) {
                monthOtHistory.push({ date, hours: hrs, reason: (assign.otReason && assign.otReason !== '無備註') ? assign.otReason : (assign.note || '無備註') });
            }
        }
    });

    otHistory.sort((a, b) => b.date.localeCompare(a.date));
    monthOtHistory.sort((a, b) => b.date.localeCompare(a.date));

    return {
        monthStats,
        yearStats,
        otHistory,
        monthOtHistory,
        balance: yearStats.otEarned - yearStats.compHoursUsed
    };
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
    { id: '09A', label: '09A', start: '09:00', end: '17:30', hours: 8, display: '09:00~17:30' },
    { id: '09B', label: '09B', start: '09:30', end: '18:00', hours: 8, display: '09:30~18:00' },
    { id: '12A', label: '12A', start: '12:00', end: '20:30', hours: 8, display: '12:00~20:30' },
    { id: '12B', label: '12B', start: '12:30', end: '21:00', hours: 8, display: '12:30~21:00' },
    { id: '0901', label: '0901', start: '09:00', end: '21:00', hours: 8, display: '09:00~13:00 / 17:00~21:00' },
    { id: '09O', label: '09O', start: '09:00', end: '21:00', hours: 12, display: '09:00~21:00（舊制保留）' }
];
const mergeShiftTypes = (customShiftTypes = []) => {
    const baseMap = new Map(DEFAULT_SHIFT_TYPES.map(item => [item.id, item]));
    (Array.isArray(customShiftTypes) ? customShiftTypes : []).forEach(item => {
        const id = String(item?.id || '').trim();
        if (!id || baseMap.has(id)) return;
        baseMap.set(id, {
            id,
            label: String(item?.label || id).trim() || id,
            start: String(item?.start || '').trim(),
            end: String(item?.end || '').trim(),
            hours: Number(item?.hours) > 0 ? Number(item.hours) : 8,
            display: String(item?.display || '').trim() || `${String(item?.start || '').trim()}~${String(item?.end || '').trim()}`
        });
    });
    return Array.from(baseMap.values());
};
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
    const eventEndDate = event.endDate || event.startDate;
    if (checkDateStr < event.startDate || checkDateStr > eventEndDate) return false;
    if (event.repeatType === 'none') return checkDateStr >= event.startDate && checkDateStr <= eventEndDate;
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
                    <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100 flex justify-between items-center"><span className="text-sm font-bold text-indigo-900">年度可用補休時數（不含特休／生理假）：</span><span className={`text-lg font-bold ${balance < 0 ? 'text-red-600' : 'text-green-600'}`}>{balance} hr</span></div>
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">增減時數 (小時)</label><input type="number" autoFocus value={hours} onChange={e=>setHours(e.target.value)} placeholder="加班正數，補休負數" className={`w-full border-2 rounded-lg px-3 py-2 text-lg font-bold focus:outline-none ${isExceeding ? 'border-red-300 text-red-600 bg-red-50' : 'border-indigo-100 text-gray-700 focus:border-indigo-500'}`}/>{isExceeding && <p className="text-[11px] font-bold text-red-600 mt-1">⚠️ 申請補休大於剩餘時數，將依規定扣薪！</p>}</div>
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">事由 / 備註</label><input type="text" value={reason} onChange={e=>setReason(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"/></div>
                    <div className="flex gap-3 pt-2"><button onClick={onClose} className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-lg font-bold hover:bg-gray-200">取消</button><button onClick={() => { if(hours === '') return alert("請輸入時數"); onConfirm(parseFloat(hours), reason); }} className="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg font-bold shadow hover:bg-indigo-700">送出</button></div>
                </div>
            </div>
        </div>
    );
};
const CompanyEventModal = ({ isOpen, onClose, eventData, onSave, onDelete }) => {
    const [formData, setFormData] = useState({ title: '', startDate: '', endDate: '', time: '', repeatType: 'none', note: '' });
    useEffect(() => {
        if (isOpen && eventData) {
            setFormData({
                ...eventData,
                endDate: eventData.endDate || eventData.startDate || ''
            });
        }
    }, [isOpen, eventData]);
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
                <div className="bg-purple-600 p-4 text-white flex justify-between items-center"><h3 className="font-bold flex items-center gap-2"><Megaphone className="w-5 h-5"/> 公司行程備忘錄</h3><button onClick={onClose} className="hover:bg-purple-700 p-1 rounded"><X size={20}/></button></div>
                <div className="p-6 space-y-4">
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">標題 <span className="text-red-500">*</span></label><input type="text" value={formData.title} onChange={e=>setFormData({...formData, title: e.target.value})} className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500"/></div>
                    <div className="grid grid-cols-2 gap-3"><div><label className="block text-xs font-bold text-gray-700 mb-1">開始日期</label><input type="date" value={formData.startDate} onChange={e=>setFormData({...formData, startDate: e.target.value, endDate: formData.endDate || e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"/></div><div><label className="block text-xs font-bold text-gray-700 mb-1">結束日期</label><input type="date" value={formData.endDate || formData.startDate} onChange={e=>setFormData({...formData, endDate: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"/></div></div>
                    <div className="grid grid-cols-2 gap-3"><div className="col-span-2"><label className="block text-[11px] font-bold text-purple-600 mb-1">日期區間預設為同一天，可依活動期間調整</label></div><div><label className="block text-xs font-bold text-gray-700 mb-1">時間</label><input type="time" value={formData.time} onChange={e=>setFormData({...formData, time: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"/></div><div><label className="block text-xs font-bold text-gray-700 mb-1">重複</label><select value={formData.repeatType} onChange={e=>setFormData({...formData, repeatType: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none">{Object.entries(REPEAT_LABELS).map(([val, label]) => <option key={val} value={val}>{label}</option>)}</select></div></div>
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">備註 (選填)</label><textarea value={formData.note || ''} onChange={e=>setFormData({...formData, note: e.target.value})} rows="2" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"></textarea></div>
                    <div className="flex gap-3 pt-4 border-t">{formData.id && <button onClick={()=>onDelete(formData.id)} className="p-2.5 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg"><Trash2 size={18}/></button>}<button onClick={onClose} className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-lg font-bold hover:bg-gray-200">取消</button><button onClick={() => { if(!formData.title) return alert("請輸入標題"); if(!formData.startDate) return alert("請選擇開始日期"); const safeEndDate = formData.endDate || formData.startDate; if (safeEndDate < formData.startDate) return alert("結束日期不可早於開始日期"); onSave({ ...formData, endDate: safeEndDate }); }} className="flex-1 bg-purple-600 text-white py-2.5 rounded-lg font-bold shadow hover:bg-purple-700">儲存</button></div>
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
                                    <li><strong>生理假/病假/事假</strong>：依法與公司內部規定辦理；生理假每年最多 3 天、每月最多 1 天；全年事假上限 14 日、病假上限 30 日。</li>
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
                                <p className="font-bold text-gray-900 mt-4 bg-amber-50 px-2 py-1 rounded inline-block">請假規則附錄</p>
                                <p className="pl-4 mt-2">本附錄為本同意書之一部分，員工於系統內簽署本同意書時，視為已一併閱讀並同意以下請假規則。</p>
                                <p className="pl-4 mt-1">1. 生理假：每年最多 3 天，每月最多 1 天。</p>
                                <p className="pl-4 mt-1">2. 特休：屬獨立假別，由系統依到職年資依法計算，不列入補休扣抵。</p>
                                <p className="pl-4 mt-1">3. 病假 / 事假：申請時可選擇是否使用補休時數扣抵；主管於核准流程中得依申請內容確認最終扣抵方式。</p>
                            </>
                        )}
                    </div>
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 cursor-pointer hover:bg-blue-100 transition-colors" onClick={()=>setAgree(!agree)}>
                        <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={agree} onChange={()=>setAgree(!agree)} className="w-5 h-5 accent-blue-600 cursor-pointer"/><span className="font-bold text-blue-900 leading-tight">本人已詳細審閱、充分了解且同意上述條款及請假規則附錄，並以下方親筆簽名為憑。</span></label>
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
                                <p><strong>請假規則附錄</strong><br/>本附錄為本同意書之一部分，員工於系統內簽署本同意書時，視為已一併閱讀並同意以下請假規則：<br/>1. 生理假：每年最多 3 天，每月最多 1 天。<br/>2. 特休：屬獨立假別，由系統依到職年資依法計算，不列入補休扣抵。<br/>3. 病假 / 事假：申請時可選擇是否使用補休時數扣抵；主管於核准流程中得依申請內容確認最終扣抵方式。</p>
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

const InventoryView = ({ db, appId, inventoryItems, currentUserInfo }) => {
    const items = useMemo(() => prepareInventoryItems(inventoryItems), [inventoryItems]);
    const categories = useMemo(() => [...new Set(items.map(i => i.category).filter(Boolean))], [items]);
    const draftKey = `inventoryDraft_${appId}_${currentUserInfo?.uid || 'guest'}`;

    const [mode, setMode] = useState('count');
    const [activeTab, setActiveTab] = useState(categories[0] || '');
    const [records, setRecords] = useState({});
    const [historyList, setHistoryList] = useState([]);
    const [selectedHistory, setSelectedHistory] = useState(null);
    const [editingRecordDate, setEditingRecordDate] = useState(null);
    const [editingRecordId, setEditingRecordId] = useState(null);

    useEffect(() => {
        if (categories.length > 0 && !categories.includes(activeTab)) setActiveTab(categories[0] || '');
    }, [categories, activeTab]);

    useEffect(() => {
        try {
            const savedDraft = localStorage.getItem(draftKey);
            if (savedDraft) {
                const parsed = JSON.parse(savedDraft);
                if (parsed?.records && typeof parsed.records === 'object') {
                    setRecords(parsed.records);
                    if (parsed.activeTab) setActiveTab(parsed.activeTab);
                    if (parsed.editingRecordDate) setEditingRecordDate(parsed.editingRecordDate);
                    if (parsed.editingRecordId) setEditingRecordId(parsed.editingRecordId);
                }
            }
        } catch (e) {
            console.error('讀取盤點暫存失敗', e);
        }
    }, [draftKey]);

    useEffect(() => {
        try {
            if (Object.keys(records).length === 0 && !editingRecordDate && !editingRecordId) {
                localStorage.removeItem(draftKey);
            } else {
                localStorage.setItem(draftKey, JSON.stringify({
                    records,
                    activeTab,
                    editingRecordDate,
                    editingRecordId,
                    savedAt: Date.now()
                }));
            }
        } catch (e) {
            console.error('儲存盤點暫存失敗', e);
        }
    }, [records, activeTab, editingRecordDate, editingRecordId, draftKey]);

    useEffect(() => {
        if (mode === 'history') {
            const unsub = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'inventoryRecords'), (snap) => {
                const list = [];
                snap.forEach(docSnap => list.push({ id: docSnap.id, ...docSnap.data() }));
                list.sort((a, b) => (b.updatedAt || b.timestamp || 0) - (a.updatedAt || a.timestamp || 0));
                setHistoryList(list);
            });
            return () => unsub();
        }
    }, [mode, db, appId]);

    const filteredItems = items.filter(i => i.category === activeTab);
    const totalValue = useMemo(() => items.reduce((sum, item) => sum + ((records[item.id] || 0) * Number(item.price || 0)), 0), [items, records]);
    const roundedTotalValue = useMemo(() => Math.ceil(totalValue), [totalValue]);

    const resetDraft = () => {
        setRecords({});
        setEditingRecordDate(null);
        setEditingRecordId(null);
        try {
            localStorage.removeItem(draftKey);
        } catch (e) {
            console.error('清除盤點暫存失敗', e);
        }
    };

    const loadHistoryForEdit = (hist) => {
        const nextRecords = hist?.data && typeof hist.data === 'object' ? hist.data : {};
        setRecords(nextRecords);
        setEditingRecordDate(hist?.date || null);
        setEditingRecordId(hist?.id || hist?.date || null);
        setMode('count');
        setSelectedHistory(hist || null);
        const firstCategory = items.find(item => nextRecords[item.id] !== undefined)?.category || categories[0] || '';
        if (firstCategory) setActiveTab(firstCategory);
        alert(`已載入 ${hist?.date || ''} 的盤點資料，請直接修改後按「更新檔案」儲存。`);
    };

    const handleCountChange = (id, delta) => {
        setRecords(prev => {
            const current = prev[id] || 0;
            return { ...prev, [id]: Math.max(0, current + delta) };
        });
    };

    const handleInputChange = (id, val) => {
        const num = parseFloat(val);
        if (!Number.isNaN(num) && num >= 0) setRecords(prev => ({ ...prev, [id]: num }));
        else if (val === '') setRecords(prev => {
            const nextRecords = { ...prev };
            delete nextRecords[id];
            return nextRecords;
        });
    };

    const handleSave = async () => {
        if (Object.keys(records).length === 0) return alert('尚未填寫任何盤點數量！');
        const now = Date.now();
        const targetDate = editingRecordDate || new Date(now).toISOString().split('T')[0];
        const targetRecordId = editingRecordId || targetDate;
        const existingHistory = historyList.find(hist => hist.id === targetRecordId) || (selectedHistory?.id === targetRecordId ? selectedHistory : null);
        const createdAt = existingHistory?.createdAt || existingHistory?.timestamp || now;
        const nextEditCount = editingRecordId ? Number(existingHistory?.editCount || 0) + 1 : 0;
        const actionLabel = editingRecordId ? `更新 ${targetDate} 的盤點紀錄` : '送出今日盤點結果';
        if (!window.confirm(`確定要${actionLabel}嗎？

儲存後會保留在歷史紀錄中，並清空目前暫存。`)) return;

        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventoryRecords', targetRecordId), {
            id: targetRecordId,
            date: targetDate,
            timestamp: createdAt,
            createdAt,
            updatedAt: now,
            data: records,
            lastEditorUid: currentUserInfo?.uid || '',
            lastEditorName: currentUserInfo?.name || '未知使用者',
            editCount: nextEditCount,
            lastEditedAt: editingRecordId ? now : null
        }, { merge: true });

        alert(`✅ 盤點資料已成功${editingRecordId ? '更新' : '儲存'}至雲端！`);
        resetDraft();
        setSelectedHistory(null);
        setMode('history');
    };

    const handleClearDraft = () => {
        if (!window.confirm('確定要清空目前盤點暫存嗎？')) return;
        resetDraft();
    };

    const handleExportCSV = () => {
        const targetDate = editingRecordDate || new Date().toISOString().split('T')[0];
        const rows = [['分類', '品名', '盤點單位', '數量', '單價', '總金額(估算)']];
        let exportTotal = 0;
        items.forEach(item => {
            const qty = records[item.id] || 0;
            const subtotal = qty * Number(item.price || 0);
            exportTotal += subtotal;
            rows.push([item.category, item.name, item.spec, qty, item.price, subtotal]);
        });
        rows.push(['', '', '', '', '庫存總值(無條件進位):', Math.ceil(exportTotal)]);
        exportToCSV(`當前盤點表_${targetDate}`, rows);
    };

    const handleExportHistoryCSV = (hist) => {
        const rows = [['分類', '品名', '盤點單位', '數量', '單價', '總金額(估算)']];
        let exportTotal = 0;
        items.forEach(item => {
            const qty = hist?.data?.[item.id] || 0;
            const subtotal = qty * Number(item.price || 0);
            exportTotal += subtotal;
            rows.push([item.category, item.name, item.spec, qty, item.price, subtotal]);
        });
        rows.push(['', '', '', '', '庫存總值(無條件進位):', Math.ceil(exportTotal)]);
        exportToCSV(`歷史盤點紀錄_${hist?.date || '未命名'}`, rows);
    };

    if (items.length === 0) {
        return (
            <div className="max-w-2xl mx-auto pb-20 text-center mt-10">
                <Package size={64} className="mx-auto text-gray-300 mb-4" />
                <h2 className="text-xl font-bold text-gray-600">目前尚無庫存品項</h2>
                <p className="text-gray-500 mt-2">請使用管理員帳號，前往「管理」➡️「系統設定」新增庫存品項。</p>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto pb-20">
            <div className="bg-white p-4 rounded-xl border flex flex-col sm:flex-row justify-between items-center mb-4 shadow-sm gap-3">
                <h2 className="font-bold text-lg text-indigo-700 flex items-center gap-2"><Package/> 庫存盤點</h2>
                <div className="flex gap-2 bg-gray-100 p-1 rounded-lg w-full sm:w-auto">
                    <button onClick={() => { setMode('count'); setSelectedHistory(null); }} className={`flex-1 sm:flex-none px-4 py-1.5 rounded text-sm font-bold transition-colors ${mode === 'count' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>新增盤點</button>
                    <button onClick={() => setMode('history')} className={`flex-1 sm:flex-none px-4 py-1.5 rounded text-sm font-bold transition-colors ${mode === 'history' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>歷史紀錄</button>
                </div>
            </div>
            {mode === 'count' ? (
                <>
                    {(editingRecordId || Object.keys(records).length > 0) && (
                        <div className="mb-3 bg-amber-50 border border-amber-100 rounded-xl p-3 text-sm font-bold text-amber-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div>{editingRecordId ? `目前正在修改 ${editingRecordDate} 的已送出盤點紀錄` : '已為您保留盤點暫存，離開後回來可接續編輯。'}</div>
                            <button onClick={handleClearDraft} className="px-3 py-1.5 rounded-lg bg-white border border-amber-200 text-amber-700 text-xs font-black hover:bg-amber-100">清空暫存</button>
                        </div>
                    )}
                    <div className="flex justify-between items-center mb-2 px-1 gap-2 flex-wrap">
                        <div className="font-bold text-red-600 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100">總值: ${roundedTotalValue.toLocaleString()} <span className="text-[10px] text-red-400 ml-1">(小數點後無條件進位)</span></div>
                        <div className="flex gap-2">
                            <button onClick={handleExportCSV} className="bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded font-bold shadow-sm hover:bg-green-100 flex items-center gap-1"><Download size={16}/><span className="hidden sm:inline">匯出</span></button>
                            <button onClick={handleSave} className="bg-indigo-600 text-white px-4 py-1.5 rounded font-bold shadow hover:bg-indigo-700 flex items-center gap-1"><Save size={16}/> {editingRecordId ? '更新檔案' : '送出'}</button>
                        </div>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-2 mb-2 scrollbar-hide">
                        {categories.map(category => (
                            <button key={category} onClick={() => setActiveTab(category)} className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap shadow-sm transition-all ${activeTab === category ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'}`}>{category}</button>
                        ))}
                    </div>
                    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                        {filteredItems.map((item, idx) => (
                            <div key={item.id} className={`p-4 flex justify-between items-center ${idx !== filteredItems.length - 1 ? 'border-b border-gray-100' : ''}`}>
                                <div>
                                    <div className="font-bold text-gray-800 text-lg">{item.name}</div>
                                    <div className="text-xs text-gray-400 font-mono">單價: ${Number(item.price || 0)}</div>
                                </div>
                                <div className="flex items-center gap-2 sm:gap-3">
                                    <span className="text-lg font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100 shadow-sm mr-1 sm:mr-3">{item.spec}</span>
                                    <button onClick={() => handleCountChange(item.id, -1)} className="w-10 h-10 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-gray-200 active:scale-90 transition-transform"><Minus size={20}/></button>
                                    <input type="number" value={records[item.id] !== undefined ? records[item.id] : ''} onChange={(e) => handleInputChange(item.id, e.target.value)} placeholder="0" className="w-16 text-center font-bold text-xl border-b-2 border-indigo-200 focus:border-indigo-600 focus:outline-none py-1 bg-transparent" />
                                    <button onClick={() => handleCountChange(item.id, 1)} className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center hover:bg-indigo-100 active:scale-90 transition-transform"><Plus size={20}/></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                    {selectedHistory ? (
                        <div className="p-4">
                            <div className="flex justify-between items-center mb-4 border-b pb-3 flex-wrap gap-2">
                                <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2"><Calendar size={18}/> {selectedHistory.date} 盤點明細</h3>
                                <div className="flex gap-2 flex-wrap">
                                    <button onClick={() => loadHistoryForEdit(selectedHistory)} className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded text-sm font-bold shadow-sm hover:bg-indigo-100 flex items-center gap-1"><Edit size={14}/> 修改此檔</button>
                                    <button onClick={() => handleExportHistoryCSV(selectedHistory)} className="bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded text-sm font-bold shadow-sm hover:bg-green-100 flex items-center gap-1"><Download size={14}/> 匯出</button>
                                    <button onClick={() => setSelectedHistory(null)} className="bg-gray-100 text-gray-600 px-3 py-1.5 rounded text-sm font-bold hover:bg-gray-200">返回列表</button>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 text-xs">
                                <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                                    <div className="text-gray-400 font-black mb-1">送出時間</div>
                                    <div className="font-bold text-gray-700">{formatDateTime(selectedHistory.createdAt || selectedHistory.timestamp)}</div>
                                </div>
                                <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                                    <div className="text-gray-400 font-black mb-1">最後編輯</div>
                                    <div className="font-bold text-gray-700">{selectedHistory.lastEditorName || '—'}</div>
                                    {selectedHistory.updatedAt && <div className="text-[11px] text-gray-400 mt-1">{formatDateTime(selectedHistory.updatedAt)}</div>}
                                </div>
                            </div>
                            <div className="space-y-2">
                                {items.map(item => {
                                    const qty = selectedHistory?.data?.[item.id];
                                    if (qty === undefined || qty === 0) return null;
                                    return (
                                        <div key={item.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                                            <div>
                                                <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-bold mr-2">{item.category}</span>
                                                <span className="font-bold text-gray-700 text-sm">{item.name}</span>
                                            </div>
                                            <div className="font-mono font-bold text-indigo-600 text-lg">{qty} <span className="text-xs text-gray-500">{item.spec}</span></div>
                                        </div>
                                    );
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
                                        const totalCost = items.reduce((sum, item) => sum + (((hist?.data?.[item.id]) || 0) * Number(item.price || 0)), 0);
                                        return (
                                            <div key={hist.id} onClick={() => setSelectedHistory(hist)} className="p-4 hover:bg-indigo-50 cursor-pointer flex justify-between items-center transition-colors gap-4">
                                                <div className="min-w-0">
                                                    <div className="font-bold text-gray-800 text-lg flex items-center gap-2"><Calendar size={16} className="text-indigo-500"/> {hist.date}</div>
                                                    <div className="text-xs text-gray-400 mt-1">送出時間: {formatDateTime(hist.createdAt || hist.timestamp)}</div>
                                                    {hist.updatedAt && <div className="text-xs text-gray-400 mt-1">最後更新: {formatDateTime(hist.updatedAt)}</div>}
                                                    {hist.lastEditorName && <div className="text-xs text-gray-400 mt-1">最後編輯: {hist.lastEditorName}{hist.editCount ? `（已修改 ${hist.editCount} 次）` : ''}</div>}
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <div className="text-xs text-gray-500">當次庫存總值</div>
                                                    <div className="font-bold text-red-600">${Math.ceil(totalCost).toLocaleString()}</div>
                                                    <button onClick={(e) => { e.stopPropagation(); loadHistoryForEdit(hist); }} className="mt-2 bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded text-xs font-bold shadow-sm hover:bg-indigo-100 flex items-center gap-1 ml-auto"><Edit size={13}/> 修改此檔</button>
                                                </div>
                                            </div>
                                        );
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
// 📍 GPS 打卡頁面 (ClockView)// ==========================================
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
const AttendanceView = ({ users, currentDate, db, appId, shifts, shiftTypes = DEFAULT_SHIFT_TYPES }) => {
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
        attendanceList.forEach(r => { const shiftStr = r.shiftInfo ? (r.shiftInfo.display || `${r.shiftInfo.start}~${r.shiftInfo.end}`) : '-'; rows.push([r.date, r.name, shiftStr, r.in || '', r.out || '', r.status.join(', ')]); });
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
                                    <tr key={i} className="border-b hover:bg-gray-50"><td className="p-3 font-mono text-gray-600">{r.date.substring(5)}</td><td className="p-3 font-bold">{r.name}</td><td className="p-3 text-center text-gray-500 text-xs">{r.shiftInfo ? <span className="bg-gray-100 px-2 py-0.5 rounded">{r.shiftInfo.label} ({r.shiftInfo.display || `${r.shiftInfo.start}~${r.shiftInfo.end}`})</span> : <span className="text-gray-300">-</span>}</td><td className={`p-3 text-center font-bold ${r.in && r.shiftInfo && r.in > r.shiftInfo.start ? 'text-red-500' : 'text-gray-800'}`}>{r.in || '-'}</td><td className={`p-3 text-center font-bold ${r.out && r.shiftInfo && r.out < r.shiftInfo.end ? 'text-red-500' : 'text-gray-800'}`}>{r.out || '-'}</td><td className="p-3 font-bold">{isAbnormal ? <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded text-xs">{r.status.join(', ')}</span> : <span className="text-green-600 bg-green-50 px-2 py-0.5 rounded text-xs">{r.status.join(', ')}</span>}</td></tr>
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
        const isEditing = !!eventData.id;
        const normalizedEvent = { ...eventData, endDate: eventData.endDate || eventData.startDate };
        if (normalizedEvent.id) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'companyEvents', normalizedEvent.id), normalizedEvent);
        else await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'companyEvents'), normalizedEvent);
        setEditingEvent(null);
        alert(`✅ 公司備忘錄 / 行程已${isEditing ? '更新' : '新增'}。系統將於事件區間內每日早上 9:00 或有人開啟系統時，自動發送 LINE 提醒。`);
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
    const stats = getUserYearlyTimeStats({ shifts, uid, targetYear: yearToFind, leaveTypes: leaves, shiftTypes: shiftsDef || DEFAULT_SHIFT_TYPES });
    return stats.balance;
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
    const toggle = async (uid, type, lType = null, subUid = null, useComp = false) => {
        const isMe = uid === currentUserInfo.uid;
        if (!isSuperAdmin && !isMe) return alert("無權限");
        if (isClosed) return alert("本日店休");
        // 🟡 判斷是否為「請假」類型 (LEAVE)
        if (type === 'LEAVE') {
            // A. 如果是管理員在操作：直接寫入資料庫 (維持原狀)
            if (isSuperAdmin) {
                let next = Array.isArray(dayData.assignments) ? [...dayData.assignments] : [];
                const idx = next.findIndex(a => a.uid === uid);
                const baseAssign = idx >= 0 ? next[idx] : null;
                const leaveHours = resolveLeaveHours(baseAssign, shiftsDef || DEFAULT_SHIFT_TYPES);
                const leaveEntry = { uid, type: 'LEAVE', leaveType: lType, leaveHours, shiftCode: baseAssign?.shiftCode || null, subUid: subUid || null, useComp: ['sick', 'personal'].includes(lType) ? useComp : false, timestamp: Date.now() };
                if (idx >= 0) next[idx] = leaveEntry; else next.push(leaveEntry);
                await update({ assignments: next });
                setExpanded(null);
            } 
            // B. 如果是員工本人申請：改為送出簽核通知給主管
            else {
                const leaveLabel = leaves.find(l => l.id === lType)?.label || '假別';
                try {
                    const duplicatedReqs = (requests || []).filter(r => r.type === 'leave_request' && (r.uid === currentUserInfo.uid) && r.date === dateStr);
                    await Promise.all(duplicatedReqs.map(r => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', r.id)).catch(() => null)));
                    const newRequestRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), {
                        type: 'leave_request',
                        uid: currentUserInfo.uid,
                        userName: currentUserInfo.name,
                        date: dateStr,
                        leaveType: lType,
                        leaveLabel: leaveLabel,
                        subUid: subUid || null,
                        subName: subUid ? (users[subUid]?.name || '') : '',
                        useComp: ['sick', 'personal'].includes(lType) ? useComp : false,
                        timestamp: new Date(),
                        status: 'pending'
                    });
                    const approverLineIds = getApproverLineIds(users);
                    if (approverLineIds.length > 0) {
                        const sent = await sendLineNotification(approverLineIds, `🔔 【新假單申請】
申請人：${currentUserInfo.name}
日期：${dateStr}
類別：${leaveLabel}${['sick', 'personal'].includes(lType) ? `
補休扣抵：${useComp ? '是' : '否'}` : ''}${subUid ? `
代理人：${users[subUid]?.name || '已填寫'}` : ''}
請至系統「通知中心」進行審核。`);
                        if (sent) {
                            await updateDoc(newRequestRef, {
                                lineNotifiedAt: Date.now(),
                                notifiedApproverCount: approverLineIds.length,
                                lastNotificationType: 'create'
                            });
                        }
                    }
                    alert(`✅ ${leaveLabel} 申請已送出！
不論是否填寫代理人，皆需主管或管理員審核後才會上班表。`);
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
          const duplicatedReqs = (requests || []).filter(r => r.date === dateStr && r.fromUid === uid && r.type === 'admin_ot_approve');
          await Promise.all(duplicatedReqs.map(r => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', r.id)).catch(() => null)));
          const newRequestRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), { type: 'admin_ot_approve', fromUid: currentUserInfo.uid, fromName: currentUserInfo.name, date: dateStr, hours: numHours, reason: remark || '無備註', timestamp: new Date() });
          const approverLineIds = getApproverLineIds(users);
          if (approverLineIds.length > 0) {
            const sent = await sendLineNotification(approverLineIds, `🔔 【時數審核申請】
申請人：${currentUserInfo.name}
日期：${dateStr}
時數：${numHours} hr
原因：${remark || '無備註'}
請至系統「通知中心」進行審核。`);
            if (sent) {
              await updateDoc(newRequestRef, {
                lineNotifiedAt: Date.now(),
                notifiedApproverCount: approverLineIds.length,
                lastNotificationType: 'create'
              });
            }
          }
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
                <div className="flex justify-between items-center mb-2"><h4 className="font-bold text-purple-800 flex items-center gap-1"><Megaphone size={14}/> 公司備忘錄 / 行程</h4>{!isReadOnly && isSuperAdmin && <button onClick={()=>setEditingEvent({ startDate: dateStr, endDate: dateStr, repeatType: 'none', time: '', title: '', note: '' })} className="text-purple-600 bg-white px-2 py-0.5 rounded border border-purple-200 text-xs font-bold shadow-sm hover:bg-purple-100 transition-colors">+ 新增</button>}</div>
                {todaysEvents.length === 0 ? <div className="text-xs text-purple-400">今日無行程</div> : (
                    todaysEvents.map(e => (
                        <div key={e.id} className="flex justify-between items-center bg-white p-2 rounded border border-purple-100 mb-1 shadow-sm">
                            <div><div className="text-sm font-bold text-gray-800">{e.time && <span className="text-purple-600 mr-1">{e.time}</span>}{e.title}</div>{((e.endDate && e.endDate !== e.startDate) || e.repeatType !== 'none' || e.note) && (<div className="text-[10px] text-gray-500 mt-0.5 flex gap-1 items-center flex-wrap">{e.endDate && e.endDate !== e.startDate && <span className="bg-purple-100 text-purple-700 px-1 rounded">{e.startDate} ～ {e.endDate}</span>}{e.repeatType !== 'none' && <span className="bg-gray-100 px-1 rounded flex items-center gap-0.5"><Repeat size={8}/> {REPEAT_LABELS[e.repeatType]}</span>}{e.note && <span className="truncate max-w-[150px]">{e.note}</span>}</div>)}</div>
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
                          <label className="flex items-center gap-2 mb-3 text-xs text-indigo-700 font-bold bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                              <input id={`use-comp-${u.uid}`} type="checkbox" className="accent-indigo-600" />
                              病假 / 事假申請時，使用補休時數扣抵
                          </label>
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
                                      <button key={lt.id} onClick={() => { if (limitReached) { if (isSuperAdmin) { if(!window.confirm(`⚠️ 警告：${u.name} 的${limitMsg}\n\n您具有管理員權限，是否要「強制核准」此假單？`)) return; } else { alert(`🚫 拒絕：${limitMsg}`); return; } } const subVal = document.getElementById(`sub-select-${u.uid}`).value; const useCompChecked = ['sick', 'personal'].includes(lt.id) ? !!document.getElementById(`use-comp-${u.uid}`)?.checked : false; toggle(u.uid,'LEAVE',lt.id, subVal || null, useCompChecked); }} className={`text-xs p-2 border rounded font-bold transition-all ${btnClass}`}>
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
// 📊 統計明細 (SalaryView) - V12 發票登錄版
// ==========================================
const SalaryView = ({ users, shifts, shiftTypes = DEFAULT_SHIFT_TYPES, currentDate, leaveTypes, currentUserInfo, isPrivileged, gasReceipts, db, appId }) => {
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
    const annualLimitHours = getAnnualLeaveHours(uObj?.startDate);
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
    const { monthStats, yearStats, balance, otHistory, monthOtHistory } = getUserYearlyTimeStats({
        shifts,
        uid,
        targetYear,
        targetMonth,
        leaveTypes,
        shiftTypes
    });
    const gasTotal = (gasReceipts?.[targetMonth]?.[uid] || []).reduce((sum, r) => sum + r.amount, 0);
    return { monthStats, yearStats, balance, otHistory, monthOtHistory, targetYear, annualLimitHours, gasTotal, tenureText };
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
                                <div className="text-[10px] text-gray-400">年度可用補休時數</div>
                                <div className={`font-bold text-xl ${s.balance < 0 ? 'text-red-600' : 'text-indigo-600'}`}>{s.balance} hr</div>
                            </div>
                        </div>
                        <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-200">
                            <div className="text-xs font-bold text-indigo-900 mb-2 border-b border-indigo-100 pb-1 flex justify-between">
                                <span><Gift className="w-3 h-3 inline mr-1"/> 特休時數帳戶（獨立，不扣補休）</span>
                                <span className="bg-white px-2 rounded text-indigo-600">剩餘: {Math.max(0, s.annualLimitHours - s.yearStats.usedAnnualHours)} 小時</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-[11px] text-indigo-800">
                                <div>📌 到職日: {u.startDate || '未設定'}</div>
                                <div>⏳ 系統年資: {s.tenureText}</div>
                                <div>🎯 年度總額: {s.annualLimitHours} 小時</div>
                                <div>🏃 年度已休: {s.yearStats.usedAnnualHours} 小時</div>
                            </div>
                        </div>
                        <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                            <div className="text-xs font-bold text-amber-900 mb-2 border-b border-amber-100 pb-1">年度已休假總明細</div>
                            <div className="grid grid-cols-2 gap-2 text-[11px] text-amber-800">
                                <div>🩸 生理假：{s.yearStats.leaves.menstrual?.days || 0} 天（每年最多 3 天／每月最多 1 天）</div>
                                <div>🤒 病假：{s.yearStats.leaves.sick?.days || 0} 天 / {s.yearStats.leaves.sick?.hours || 0} 小時（可選擇補休扣抵）</div>
                                <div>🗂️ 事假：{s.yearStats.leaves.personal?.days || 0} 天 / {s.yearStats.leaves.personal?.hours || 0} 小時（可選擇補休扣抵）</div>
                                <div>🌴 特休：{s.yearStats.leaves.annual?.hours || 0} 小時（獨立帳戶）</div>
                            </div>
                        </div>
                        <div className="bg-teal-50 p-3 rounded-lg border border-teal-200 flex justify-between items-center gap-3">
                            <div>
                                <div className="font-bold text-sm text-teal-800"><Fuel className="w-3 h-3 inline mr-1"/> 本月油資核銷: ${Math.min(s.gasTotal, 500)}</div>
                                <div className="text-[10px] text-teal-600">已登錄 {(gasReceipts?.[targetMonth]?.[u.uid] || []).length} 張發票，實報實銷 (上限500)</div>
                            </div>
                            <button onClick={() => setGasModalData(u)} className="shrink-0 bg-teal-600 text-white text-xs font-bold px-3 py-2 rounded-lg hover:bg-teal-700 shadow-sm">{isPrivileged ? '管理發票' : '登錄發票'}</button>
                        </div>
                        <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                            <div className="font-bold text-blue-900 mb-2">本月加減時數明細（加班／補休扣抵）</div>
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
                                <div className="font-bold text-gray-500 mb-1">年度補休增減歷史（最新 5 筆，不含特休）</div>
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
            <GasReceiptModal
                isOpen={!!gasModalData}
                onClose={() => setGasModalData(null)}
                user={gasModalData}
                monthStr={targetMonth}
                db={db}
                appId={appId}
                currentRecords={gasReceipts?.[targetMonth] || {}}
            />
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
    const [gasModalUser, setGasModalUser] = useState(null);
    
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
                <table className="w-full text-sm text-left"><thead className="bg-gray-50 text-gray-500 font-bold border-b"><tr><th className="p-3">姓名</th><th className="p-3 w-24">本薪</th><th className="p-3 w-32 bg-teal-50 text-teal-700 text-center">油資核銷 / 發票</th><th className="p-3 w-24">補助/津貼</th><th className="p-3 w-24 bg-pink-50 text-pink-700">生日禮金</th><th className="p-3 w-24 bg-purple-50 text-purple-700">三節獎金</th><th className="p-3 w-24 bg-yellow-50 text-yellow-700">年終獎金</th><th className="p-3">備註</th></tr></thead>
                <tbody>{visibleUsers.map(u => { 
                    const record = payrollData[u.uid] || {}; 
                    const userGasRecords = gasReceipts?.[targetMonth]?.[u.uid] || [];
                    const gasTotal = userGasRecords.reduce((sum, r) => sum + r.amount, 0);
                    const gasCapped = Math.min(gasTotal, 500);
                    return (
                        <tr key={u.uid} className={`border-b hover:bg-gray-50 ${u.isResigned ? 'opacity-60 bg-gray-50' : ''}`}>
                            <td className="p-3 font-bold flex items-center gap-1 mt-1">{u.name}{u.isResigned && <span className="text-[10px] bg-red-100 text-red-600 px-1 py-0.5 rounded ml-1 border border-red-200">離職</span>}</td>
                            <td className="p-3"><input type="number" placeholder="0" className="w-full border rounded px-1 py-1 focus:outline-none focus:border-indigo-500" value={record.base || ''} onChange={e=>updatePayroll(u.uid, 'base', e.target.value)}/></td>
                            <td className="p-3 bg-teal-50 text-center">
                                <div className="font-bold text-teal-800">${gasCapped}</div>
                                <div className="text-[10px] text-teal-600">登錄 ${gasTotal} / {userGasRecords.length} 張</div>
                                <button onClick={() => setGasModalUser(u)} className="mt-1 text-[10px] font-bold text-white bg-teal-600 hover:bg-teal-700 px-2 py-1 rounded">發票列表</button>
                            </td>
                            <td className="p-3"><input type="number" placeholder="0" className="w-full border rounded px-1 py-1 focus:outline-none focus:border-indigo-500" value={record.subsidy || ''} onChange={e=>updatePayroll(u.uid, 'subsidy', e.target.value)}/></td>
                            <td className="p-3 bg-pink-50"><input type="number" placeholder="0" className="w-full border rounded px-1 py-1 focus:outline-none focus:border-indigo-500 bg-transparent" value={record.bonus_bday || ''} onChange={e=>updatePayroll(u.uid, 'bonus_bday', e.target.value)}/></td>
                            <td className="p-3 bg-purple-50"><input type="number" placeholder="0" className="w-full border rounded px-1 py-1 focus:outline-none focus:border-indigo-500 bg-transparent" value={record.bonus_festival || ''} onChange={e=>updatePayroll(u.uid, 'bonus_festival', e.target.value)}/></td>
                            <td className="p-3 bg-yellow-50"><input type="number" placeholder="0" className="w-full border rounded px-1 py-1 focus:outline-none focus:border-indigo-500 bg-transparent" value={record.bonus_year || ''} onChange={e=>updatePayroll(u.uid, 'bonus_year', e.target.value)}/></td>
                            <td className="p-3"><input type="text" placeholder="..." className="w-full border rounded px-1 py-1 focus:outline-none focus:border-indigo-500" value={record.note || ''} onChange={e=>updatePayroll(u.uid, 'note', e.target.value)}/></td>
                        </tr>
                    ); 
                })}</tbody></table>
            </div>
            <GasReceiptModal
                isOpen={!!gasModalUser}
                onClose={() => setGasModalUser(null)}
                user={gasModalUser}
                monthStr={targetMonth}
                db={db}
                appId={appId}
                currentRecords={gasReceipts?.[targetMonth] || {}}
            />
        </div>
    );
};
// ==========================================
// ⚙️ 設定視圖 (SettingsView) - 修正版：加入薪資與合約設定
// ==========================================


const SettingsView = ({ users = {}, currentUserInfo, inventoryItems = [], shiftTypes = DEFAULT_SHIFT_TYPES, appId, storeConfig, db, isSuperAdmin }) => {
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({});
  const [showResigned, setShowResigned] = useState(false);
  const [inventoryList, setInventoryList] = useState(prepareInventoryItems(inventoryItems));
  const [editingItemId, setEditingItemId] = useState(null);
  const [inventoryForm, setInventoryForm] = useState({ category: '', name: '', spec: '', price: '' });
  const [sequenceInputs, setSequenceInputs] = useState({});
  const defaultShiftTypeIds = useMemo(() => DEFAULT_SHIFT_TYPES.map(item => item.id), []);
  const [customShiftList, setCustomShiftList] = useState((Array.isArray(shiftTypes) ? shiftTypes : []).filter(item => !defaultShiftTypeIds.includes(item.id)));
  const [editingShiftId, setEditingShiftId] = useState(null);
  const [shiftForm, setShiftForm] = useState({ id: '', label: '', display: '', start: '', end: '', hours: '' });
  const canManageInventory = isSuperAdmin || currentUserInfo?.isAdmin === true || currentUserInfo?.isManager === true || currentUserInfo?.role === 'boss' || currentUserInfo?.role === 'supervisor';

  useEffect(() => {
      setInventoryList(prepareInventoryItems(inventoryItems));
  }, [inventoryItems]);

  useEffect(() => {
      setCustomShiftList((Array.isArray(shiftTypes) ? shiftTypes : []).filter(item => !defaultShiftTypeIds.includes(item.id)));
  }, [shiftTypes, defaultShiftTypeIds]);

  const buildInventoryGroups = (sourceItems = []) => {
      const groups = [];
      (Array.isArray(sourceItems) ? sourceItems : []).forEach(item => {
          const category = String(item?.category || '未分類').trim() || '未分類';
          let group = groups.find(entry => entry.category === category);
          if (!group) {
              group = { category, items: [] };
              groups.push(group);
          }
          group.items.push({ ...item, category });
      });
      return groups;
  };

  const flattenInventoryGroups = (groups = []) => normalizeInventoryItems(
      (Array.isArray(groups) ? groups : []).flatMap(group =>
          (group?.items || []).map(item => ({
              ...item,
              category: String(group?.category || item?.category || '未分類').trim() || '未分類'
          }))
      )
  );

  const inventoryGroups = useMemo(() => buildInventoryGroups(inventoryList), [inventoryList]);
  const inventoryCategories = useMemo(() => inventoryGroups.map(group => group.category), [inventoryGroups]);

  useEffect(() => {
      const nextInputs = {};
      inventoryGroups.forEach(group => {
          group.items.forEach((item, index) => {
              nextInputs[item.id] = String(index + 1);
          });
      });
      setSequenceInputs(nextInputs);
  }, [inventoryGroups]);

  const userList = Object.values(users || {});
  const pendingUsersCount = userList.filter(u => !u?.isResigned && (!u?.salaryAmount || !u?.contractStart)).length;

  const saveUser = async () => {
      if (isSuperAdmin && (!formData.startDate || !formData.salaryAmount || !formData.contractStart)) {
          return alert('🚨 請務必填寫「到職日」、「本薪」及「合約起始日」！');
      }
      const updatedData = {
          ...formData,
          isAdmin: ['boss', 'supervisor'].includes(formData.role),
          workLocation: formData.workLocation || storeConfig?.name || storeConfig?.address || '台中東山店',
      };
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', editingId), updatedData);
      setEditingId(null);
      alert('✅ 員工權限與合約資料已更新！');
  };

  const roles = [
      { id: 'employee', label: '員工', color: 'bg-gray-100 text-gray-600', desc: '僅能查看個人班表、打卡' },
      { id: 'supervisor', label: '主管', color: 'bg-blue-100 text-blue-600', desc: '可審核假單、查看團隊出勤' },
      { id: 'boss', label: '老闆', color: 'bg-indigo-600 text-white', desc: '全系統最高權限（含薪資、設定）' },
      { id: 'observer', label: '觀察者', color: 'bg-amber-100 text-amber-600', desc: '僅可查看所有資料，不可修改' }
  ];

  const persistInventoryList = async (nextItems) => {
      const normalizedItems = normalizeInventoryItems(nextItems);
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'inventoryConfig'), { items: normalizedItems }, { merge: true });
      setInventoryList(normalizedItems);
      return normalizedItems;
  };

  const resetInventoryForm = () => {
      setEditingItemId(null);
      setInventoryForm({ category: '', name: '', spec: '', price: '' });
  };

  const startAddInventoryItem = () => {
      if (!canManageInventory) return alert('只有管理權限帳號可新增庫存品項');
      setEditingItemId('new');
      setInventoryForm({ category: '', name: '', spec: '', price: '' });
  };

  const startEditInventoryItem = (item) => {
      if (!canManageInventory) return alert('只有管理權限帳號可編輯庫存品項');
      setEditingItemId(item.id);
      setInventoryForm({
          category: item.category || '',
          name: item.name || '',
          spec: item.spec || '',
          price: item.price ?? ''
      });
  };

  const saveInventoryItem = async () => {
      if (!canManageInventory) return alert('只有管理權限帳號可儲存庫存品項');
      const category = String(inventoryForm.category || '').trim();
      const name = String(inventoryForm.name || '').trim();
      const spec = String(inventoryForm.spec || '').trim();
      const priceNum = Number(inventoryForm.price);
      if (!category || !name || !spec) return alert('請完整填寫分類、品名與單位');
      if (Number.isNaN(priceNum) || priceNum < 0) return alert('單價請輸入 0 以上的數字');

      const itemId = editingItemId && editingItemId !== 'new' ? editingItemId : `i_${Date.now()}`;
      let nextItems = Array.isArray(inventoryList) ? [...inventoryList] : [];
      const idx = nextItems.findIndex(i => i.id === itemId);
      const currentItem = idx >= 0 ? nextItems[idx] : null;
      const nextItem = {
          id: itemId,
          category,
          name,
          spec,
          price: priceNum,
          sortOrder: Number.isFinite(Number(currentItem?.sortOrder)) ? Number(currentItem.sortOrder) : nextItems.length
      };
      if (idx >= 0) nextItems[idx] = nextItem;
      else nextItems.push(nextItem);

      await persistInventoryList(nextItems);
      resetInventoryForm();
      alert(`✅ 庫存品項已${idx >= 0 ? '更新' : '新增'}！`);
  };

  const deleteInventoryItem = async (itemId) => {
      if (!canManageInventory) return alert('只有管理權限帳號可刪除庫存品項');
      const target = inventoryList.find(i => i.id === itemId);
      if (!window.confirm(`確定要刪除「${target?.name || '這個品項'}」嗎？`)) return;
      const nextItems = inventoryList.filter(i => i.id !== itemId);
      await persistInventoryList(nextItems);
      if (editingItemId === itemId) resetInventoryForm();
      alert('✅ 庫存品項已刪除！');
  };

  const moveInventoryItemByStep = async (itemId, step) => {
      if (!canManageInventory) return alert('只有管理權限帳號可調整排序');
      const groups = buildInventoryGroups(inventoryList);
      const groupIndex = groups.findIndex(group => group.items.some(item => item.id === itemId));
      if (groupIndex < 0) return;
      const itemIndex = groups[groupIndex].items.findIndex(item => item.id === itemId);
      const targetIndex = itemIndex + step;
      if (targetIndex < 0 || targetIndex >= groups[groupIndex].items.length) return;
      const temp = groups[groupIndex].items[itemIndex];
      groups[groupIndex].items[itemIndex] = groups[groupIndex].items[targetIndex];
      groups[groupIndex].items[targetIndex] = temp;
      await persistInventoryList(flattenInventoryGroups(groups));
  };

  const applyInventorySequence = async (itemId) => {
      if (!canManageInventory) return alert('只有管理權限帳號可調整排序');
      const groups = buildInventoryGroups(inventoryList);
      const groupIndex = groups.findIndex(group => group.items.some(item => item.id === itemId));
      if (groupIndex < 0) return;
      const itemIndex = groups[groupIndex].items.findIndex(item => item.id === itemId);
      const rawValue = sequenceInputs[itemId];
      const parsed = parseInt(rawValue, 10);
      if (Number.isNaN(parsed)) return alert('排序序號請輸入正整數');
      const clampedIndex = Math.min(Math.max(parsed, 1), groups[groupIndex].items.length) - 1;
      const [movingItem] = groups[groupIndex].items.splice(itemIndex, 1);
      groups[groupIndex].items.splice(clampedIndex, 0, movingItem);
      await persistInventoryList(flattenInventoryGroups(groups));
  };

  const updateInventoryCategory = async (itemId, targetCategory) => {
      if (!canManageInventory) return alert('只有管理權限帳號可變更分類');
      const category = String(targetCategory || '').trim();
      if (!category) return alert('請選擇有效分類');
      const groups = buildInventoryGroups(inventoryList);
      const groupIndex = groups.findIndex(group => group.items.some(item => item.id === itemId));
      if (groupIndex < 0) return;
      const itemIndex = groups[groupIndex].items.findIndex(item => item.id === itemId);
      const [movingItem] = groups[groupIndex].items.splice(itemIndex, 1);
      if (groups[groupIndex].items.length === 0) groups.splice(groupIndex, 1);
      let targetGroup = groups.find(group => group.category === category);
      if (!targetGroup) {
          targetGroup = { category, items: [] };
          groups.push(targetGroup);
      }
      targetGroup.items.push({ ...movingItem, category });
      await persistInventoryList(flattenInventoryGroups(groups));
  };

  const persistCustomShiftList = async (nextList) => {
      const normalized = (Array.isArray(nextList) ? nextList : []).map(item => ({
          id: String(item?.id || '').trim(),
          label: String(item?.label || item?.id || '').trim(),
          start: String(item?.start || '').trim(),
          end: String(item?.end || '').trim(),
          display: String(item?.display || '').trim(),
          hours: Number(item?.hours) > 0 ? Number(item.hours) : 8
      })).filter(item => item.id && item.label);
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'shiftConfig'), { customShiftTypes: normalized }, { merge: true });
      setCustomShiftList(normalized);
      return normalized;
  };

  const resetShiftForm = () => {
      setEditingShiftId(null);
      setShiftForm({ id: '', label: '', display: '', start: '', end: '', hours: '' });
  };

  const startEditShift = (item) => {
      if (!isSuperAdmin) return alert('只有最高管理員可以設定特殊班別');
      setEditingShiftId(item.id);
      setShiftForm({
          id: item.id || '',
          label: item.label || '',
          display: item.display || '',
          start: item.start || '',
          end: item.end || '',
          hours: item.hours ?? ''
      });
  };

  const saveCustomShift = async () => {
      if (!isSuperAdmin) return alert('只有最高管理員可以設定特殊班別');
      const id = String(shiftForm.id || '').trim().toUpperCase();
      const label = String(shiftForm.label || id).trim();
      const start = String(shiftForm.start || '').trim();
      const end = String(shiftForm.end || '').trim();
      const display = String(shiftForm.display || '').trim() || `${start}~${end}`;
      const hours = Number(shiftForm.hours);
      if (!id) return alert('請填寫班別代號');
      if (defaultShiftTypeIds.includes(id) && editingShiftId !== id) return alert('此代號已是系統預設班別，請改用其他代號');
      if (!label) return alert('請填寫班別名稱');
      if ((!start || !end) && !display) return alert('請至少填寫顯示時段，建議同時設定開始與結束時間');
      if (!Number.isFinite(hours) || hours <= 0) return alert('請填寫正確的小時數');
      let nextList = Array.isArray(customShiftList) ? [...customShiftList] : [];
      const idx = nextList.findIndex(item => item.id === editingShiftId || item.id === id);
      const nextItem = { id, label, start, end, display, hours };
      if (idx >= 0) nextList[idx] = nextItem;
      else nextList.push(nextItem);
      await persistCustomShiftList(nextList);
      resetShiftForm();
      alert(`✅ 特殊班別已${idx >= 0 ? '更新' : '新增'}！`);
  };

  const deleteCustomShift = async (shiftId) => {
      if (!isSuperAdmin) return alert('只有最高管理員可以刪除特殊班別');
      if (!window.confirm(`確定要刪除特殊班別「${shiftId}」嗎？`)) return;
      const nextList = customShiftList.filter(item => item.id !== shiftId);
      await persistCustomShiftList(nextList);
      if (editingShiftId === shiftId) resetShiftForm();
      alert('✅ 特殊班別已刪除！');
  };

  return (
    <div className="space-y-8 pb-20 max-w-5xl mx-auto animate-fade-in">
      <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-xl shadow-indigo-50 text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 to-purple-500"></div>
        <h2 className="font-black text-3xl text-gray-800 tracking-tighter">{currentUserInfo?.name || '管理員'}</h2>
        <p className="text-indigo-500 font-black text-xs uppercase tracking-widest mt-1">Permission Controller</p>
      </div>

      <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-lg">
          <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-8">
              <div>
                  <h3 className="font-black text-xl text-gray-800 flex items-center gap-3">
                    <ShieldAlert className="text-indigo-600" size={24}/> 權限等級與合約檔案
                  </h3>
                  {pendingUsersCount > 0 && <p className="text-[11px] text-red-500 font-black mt-2">尚有 {pendingUsersCount} 位員工未完成合約 / 薪資必要設定</p>}
              </div>
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
                const currentRole = roles.find(r => r.id === (u?.role || 'employee'));
                return (
                  <div key={u.uid} className={`group border p-6 rounded-[2rem] transition-all duration-300 ${u?.isResigned ? 'bg-gray-50 opacity-60' : 'bg-gray-50 hover:bg-white hover:shadow-xl hover:shadow-indigo-50'}`}>
                    {editingId === u.uid ? (
                      <div className="space-y-6 animate-scale-in">
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
                      <div className="flex justify-between items-center gap-4">
                        <div className="flex items-center gap-4 min-w-0">
                            <div className={`w-14 h-14 rounded-[1.25rem] flex items-center justify-center font-black border-2 shrink-0 ${currentRole?.id === 'boss' ? 'border-indigo-600 bg-indigo-50 text-indigo-600' : 'bg-white border-gray-100 text-gray-400'}`}>
                                {u?.name?.slice(0,1)}
                            </div>
                            <div className="min-w-0">
                                <div className="font-black text-gray-800 text-lg flex items-center gap-2 flex-wrap">
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
                        <button onClick={()=>{setEditingId(u.uid); setFormData(u)}} className="bg-white border-2 border-gray-50 px-6 py-3 rounded-2xl text-xs font-black text-gray-600 hover:bg-indigo-600 hover:text-white transition-all shrink-0">
                            編輯身分
                        </button>
                      </div>
                    )}
                  </div>
                )
            })}
          </div>
      </div>


<div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-lg">
    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-8">
        <div>
            <h3 className="font-black text-xl text-gray-800 flex items-center gap-3">
              <Clock className="text-indigo-600" size={24}/> 班別設定
            </h3>
            <p className="text-sm text-gray-500 mt-2">系統預設班別已建立；如有臨時活動班、教育訓練班或特殊時段，可在此新增「特殊班別」。</p>
        </div>
        <div className="bg-indigo-50 rounded-2xl px-4 py-3 border border-indigo-100 text-center min-w-[220px]">
            <div className="text-[10px] font-black text-indigo-400">目前可用班別數</div>
            <div className="text-2xl font-black text-indigo-700">{(shiftTypes || []).length}</div>
        </div>
    </div>
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-gray-50 rounded-[2rem] border border-gray-100 p-6 space-y-3">
            <div className="font-black text-gray-800">系統預設班別</div>
            <div className="space-y-2">
                {DEFAULT_SHIFT_TYPES.map(item => (
                    <div key={item.id} className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 px-4 py-3 text-sm">
                        <div>
                            <div className="font-black text-gray-800">{item.label}</div>
                            <div className="text-[11px] text-gray-500">{item.display || `${item.start}~${item.end}`}</div>
                        </div>
                        <div className="text-xs font-black text-indigo-600">{item.hours} 小時</div>
                    </div>
                ))}
            </div>
        </div>
        <div className="bg-gray-50 rounded-[2rem] border border-gray-100 p-6 space-y-4">
            <div className="font-black text-gray-800">特殊班別新增 / 編輯</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input value={shiftForm.id} onChange={e=>setShiftForm({...shiftForm, id: e.target.value.toUpperCase()})} placeholder="班別代號，例如: EVT1" className="bg-white border-0 p-4 rounded-2xl text-sm font-bold shadow-sm focus:ring-2 focus:ring-indigo-500" disabled={!isSuperAdmin} />
                <input value={shiftForm.label} onChange={e=>setShiftForm({...shiftForm, label: e.target.value})} placeholder="顯示名稱" className="bg-white border-0 p-4 rounded-2xl text-sm font-bold shadow-sm focus:ring-2 focus:ring-indigo-500" disabled={!isSuperAdmin} />
                <input type="time" value={shiftForm.start} onChange={e=>setShiftForm({...shiftForm, start: e.target.value})} className="bg-white border-0 p-4 rounded-2xl text-sm font-bold shadow-sm focus:ring-2 focus:ring-indigo-500" disabled={!isSuperAdmin} />
                <input type="time" value={shiftForm.end} onChange={e=>setShiftForm({...shiftForm, end: e.target.value})} className="bg-white border-0 p-4 rounded-2xl text-sm font-bold shadow-sm focus:ring-2 focus:ring-indigo-500" disabled={!isSuperAdmin} />
                <input value={shiftForm.display} onChange={e=>setShiftForm({...shiftForm, display: e.target.value})} placeholder="顯示時段，例如: 09:00~12:00 / 17:00~21:00" className="bg-white border-0 p-4 rounded-2xl text-sm font-bold shadow-sm focus:ring-2 focus:ring-indigo-500 md:col-span-2" disabled={!isSuperAdmin} />
                <input type="number" value={shiftForm.hours} onChange={e=>setShiftForm({...shiftForm, hours: e.target.value})} placeholder="實際工時（小時）" className="bg-white border-0 p-4 rounded-2xl text-sm font-bold shadow-sm focus:ring-2 focus:ring-indigo-500 md:col-span-2" disabled={!isSuperAdmin} />
            </div>
            <div className="flex gap-3">
                <button onClick={resetShiftForm} className="px-5 py-3 rounded-2xl bg-gray-100 text-gray-500 text-xs font-black">清空</button>
                <button onClick={saveCustomShift} disabled={!isSuperAdmin} className="flex-1 bg-indigo-600 text-white py-3 rounded-2xl font-black text-sm shadow hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400">{editingShiftId ? '儲存特殊班別' : '新增特殊班別'}</button>
            </div>
            <div className="pt-2 border-t border-gray-200 space-y-2">
                <div className="text-xs font-black text-gray-500">已建立的特殊班別</div>
                {customShiftList.length === 0 ? <div className="text-xs text-gray-400">目前尚未新增特殊班別</div> : customShiftList.map(item => (
                    <div key={item.id} className="flex items-center justify-between gap-3 bg-white rounded-2xl border border-gray-100 px-4 py-3 text-sm">
                        <div className="min-w-0">
                            <div className="font-black text-gray-800">{item.label} <span className="text-[10px] text-gray-400 ml-1">({item.id})</span></div>
                            <div className="text-[11px] text-gray-500 truncate">{item.display || `${item.start}~${item.end}`} / {item.hours} 小時</div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                            <button onClick={()=>startEditShift(item)} disabled={!isSuperAdmin} className="px-3 py-2 rounded-xl bg-indigo-50 text-indigo-600 text-xs font-black disabled:bg-gray-100 disabled:text-gray-400">編輯</button>
                            <button onClick={()=>deleteCustomShift(item.id)} disabled={!isSuperAdmin} className="px-3 py-2 rounded-xl bg-red-50 text-red-500 text-xs font-black disabled:bg-gray-100 disabled:text-gray-400">刪除</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    </div>
</div>

      <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-lg">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-8">
              <div>
                  <h3 className="font-black text-xl text-gray-800 flex items-center gap-3">
                    <Package className="text-indigo-600" size={24}/> 庫存品項管理
                  </h3>
                  <p className="text-sm text-gray-500 mt-2">在這裡統一管理盤點表的品項清單。新增、刪除、編輯後，盤點頁會立即同步更新。</p>
                  <p className="text-xs text-indigo-500 font-bold mt-2">排序改為上下移動、數字序號與分類下拉選單，避免拖曳操作不順。</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center min-w-[260px]">
                  <div className="bg-indigo-50 rounded-2xl px-4 py-3 border border-indigo-100">
                      <div className="text-[10px] font-black text-indigo-400">總品項數</div>
                      <div className="text-2xl font-black text-indigo-700">{inventoryList.length}</div>
                  </div>
                  <div className="bg-purple-50 rounded-2xl px-4 py-3 border border-purple-100">
                      <div className="text-[10px] font-black text-purple-400">分類數</div>
                      <div className="text-2xl font-black text-purple-700">{inventoryCategories.length}</div>
                  </div>
                  <div className="bg-amber-50 rounded-2xl px-4 py-3 border border-amber-100">
                      <div className="text-[10px] font-black text-amber-400">操作權限</div>
                      <div className="text-sm font-black text-amber-700 mt-1">{canManageInventory ? '管理權限可編輯' : '僅可檢視'}</div>
                  </div>
              </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[360px,1fr] gap-6">
              <div className="bg-gray-50 border border-gray-100 rounded-[2rem] p-5 space-y-4">
                  <div className="flex justify-between items-center">
                      <h4 className="font-black text-gray-800">品項編輯器</h4>
                      {canManageInventory && (
                          <button onClick={startAddInventoryItem} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-black shadow hover:bg-indigo-700 flex items-center gap-1">
                              <Plus size={14}/> 新增品項
                          </button>
                      )}
                  </div>

                  {!canManageInventory && (
                      <div className="bg-amber-50 text-amber-700 border border-amber-100 rounded-2xl p-4 text-sm font-bold">
                          目前帳號僅可查看庫存品項，新增、編輯、刪除需使用管理員權限。
                      </div>
                  )}

                  <div className="space-y-3">
                      <div>
                          <label className="block text-[11px] font-black text-gray-500 mb-1">分類</label>
                          <input type="text" value={inventoryForm.category} disabled={!canManageInventory} onChange={e=>setInventoryForm({...inventoryForm, category: e.target.value})} placeholder="例如：茶葉類" className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400" />
                      </div>
                      <div>
                          <label className="block text-[11px] font-black text-gray-500 mb-1">品名</label>
                          <input type="text" value={inventoryForm.name} disabled={!canManageInventory} onChange={e=>setInventoryForm({...inventoryForm, name: e.target.value})} placeholder="例如：高山青茶" className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                          <div>
                              <label className="block text-[11px] font-black text-gray-500 mb-1">單位</label>
                              <input type="text" value={inventoryForm.spec} disabled={!canManageInventory} onChange={e=>setInventoryForm({...inventoryForm, spec: e.target.value})} placeholder="斤 / 包 / 桶" className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400" />
                          </div>
                          <div>
                              <label className="block text-[11px] font-black text-gray-500 mb-1">單價</label>
                              <input type="number" value={inventoryForm.price} disabled={!canManageInventory} onChange={e=>setInventoryForm({...inventoryForm, price: e.target.value})} placeholder="0" className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400" />
                          </div>
                      </div>
                  </div>

                  <div className="bg-white border border-gray-100 rounded-2xl p-4 text-xs text-gray-500 leading-6">
                      <div className="font-black text-gray-700 mb-2">欄位說明</div>
                      <div>• 分類：決定盤點頁上方的分類頁籤</div>
                      <div>• 品名：盤點表中顯示的名稱</div>
                      <div>• 單位：如 斤、包、罐、桶</div>
                      <div>• 單價：用於估算庫存總值，可填 0</div>
                      <div>• 排序：可用上移 / 下移，或直接輸入序號後按套用</div>
                  </div>

                  {canManageInventory && (
                      <div className="flex gap-3 pt-2">
                          <button onClick={resetInventoryForm} className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-2xl font-black text-sm hover:bg-gray-200">清空 / 取消</button>
                          <button onClick={saveInventoryItem} className="flex-1 bg-indigo-600 text-white py-3 rounded-2xl font-black text-sm shadow hover:bg-indigo-700">{editingItemId && editingItemId !== 'new' ? '儲存修改' : '新增品項'}</button>
                      </div>
                  )}
              </div>

              <div className="bg-gray-50 border border-gray-100 rounded-[2rem] p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
                      <h4 className="font-black text-gray-800">現有品項清單</h4>
                      <div className="text-xs text-gray-500 font-bold">操作流程：上下移動 / 修改序號 / 切換分類 → 自動儲存 → 盤點頁立即同步</div>
                  </div>

                  {inventoryList.length === 0 ? (
                      <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-gray-400 font-bold">
                          目前尚無庫存品項，請先新增第一個品項。
                      </div>
                  ) : (
                      <div className="space-y-3 max-h-[760px] overflow-y-auto pr-1">
                          {inventoryGroups.map(group => (
                              <div key={group.category} className="bg-white rounded-[1.5rem] border border-gray-100 overflow-hidden">
                                  <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
                                      <div className="font-black text-indigo-700">{group.category}</div>
                                      <div className="text-[10px] font-black text-indigo-400">{group.items.length} 項</div>
                                  </div>
                                  <div className="divide-y divide-gray-100">
                                      {group.items.map((item, itemIndex) => {
                                          const categoryOptions = Array.from(new Set([...(inventoryCategories || []), item.category].filter(Boolean)));
                                          return (
                                              <div key={item.id} className="px-5 py-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                                  <div className="min-w-0 flex-1">
                                                      <div className="font-black text-gray-800 text-base">{item.name}</div>
                                                      <div className="text-xs text-gray-400 font-bold mt-1">ID: {item.id} ｜ 單位: {item.spec} ｜ 單價: ${Number(item.price || 0).toLocaleString()}</div>
                                                  </div>
                                                  <div className="flex flex-col gap-3 lg:items-end">
                                                      <div className="flex flex-wrap items-center gap-2">
                                                          <button onClick={() => moveInventoryItemByStep(item.id, -1)} className={`px-3 py-2 rounded-xl text-xs font-black border ${canManageInventory ? 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50' : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'}`} disabled={!canManageInventory || itemIndex === 0}>上移</button>
                                                          <button onClick={() => moveInventoryItemByStep(item.id, 1)} className={`px-3 py-2 rounded-xl text-xs font-black border ${canManageInventory ? 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50' : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'}`} disabled={!canManageInventory || itemIndex === group.items.length - 1}>下移</button>
                                                          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-2 py-1.5">
                                                              <span className="text-[11px] font-black text-gray-500">排序</span>
                                                              <input
                                                                  type="number"
                                                                  min="1"
                                                                  value={sequenceInputs[item.id] || String(itemIndex + 1)}
                                                                  disabled={!canManageInventory}
                                                                  onChange={e => setSequenceInputs(prev => ({ ...prev, [item.id]: e.target.value }))}
                                                                  onKeyDown={e => { if (e.key === 'Enter') applyInventorySequence(item.id); }}
                                                                  className="w-16 bg-white border border-gray-200 rounded-lg px-2 py-1 text-sm font-black text-center focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
                                                              />
                                                              <button onClick={() => applyInventorySequence(item.id)} className={`px-3 py-1.5 rounded-lg text-xs font-black ${canManageInventory ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`} disabled={!canManageInventory}>套用</button>
                                                          </div>
                                                      </div>
                                                      <div className="flex flex-wrap items-center gap-2 justify-start lg:justify-end">
                                                          <select
                                                              value={item.category}
                                                              disabled={!canManageInventory}
                                                              onChange={e => updateInventoryCategory(item.id, e.target.value)}
                                                              className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-black text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
                                                          >
                                                              {categoryOptions.map(category => <option key={category} value={category}>{category}</option>)}
                                                          </select>
                                                          <button onClick={() => startEditInventoryItem(item)} className={`px-4 py-2 rounded-xl text-xs font-black border ${canManageInventory ? 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50' : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'}`} disabled={!canManageInventory}>編輯</button>
                                                          <button onClick={() => deleteInventoryItem(item.id)} className={`px-4 py-2 rounded-xl text-xs font-black border ${canManageInventory ? 'bg-white text-red-500 border-red-200 hover:bg-red-50' : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'}`} disabled={!canManageInventory}>刪除</button>
                                                      </div>
                                                  </div>
                                              </div>
                                          );
                                      })}
                                  </div>
                              </div>
                          ))}
                      </div>
                  )}
              </div>
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
        gasReceipts: {}, storeLocation: null, inventoryItems: DEFAULT_INVENTORY_ITEMS, shiftTypes: DEFAULT_SHIFT_TYPES 
    });
    const [view, setView] = useState('calendar');
    const [loading, setLoading] = useState(true);
    const [menuOpen, setMenuOpen] = useState(false);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [showVersionNotice, setShowVersionNotice] = useState(false);
    const versionNoticeKey = user?.uid ? `version_notice_${CURRENT_VERSION}_${user.uid}` : '';
    const dismissVersionNotice = () => {
        try {
            if (versionNoticeKey && typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.setItem(versionNoticeKey, '1');
            }
        } catch (err) {
            console.warn('version notice storage unavailable', err);
        }
        setShowVersionNotice(false);
    };
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
        const unsubShiftCfg = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'shiftConfig'), (snap) => {
            const customShiftTypes = snap.exists() && Array.isArray(snap.data().customShiftTypes) ? snap.data().customShiftTypes : [];
            setDbData(prev => ({ ...prev, shiftTypes: mergeShiftTypes(customShiftTypes) }));
        });
        return () => { unsubUsers(); unsubShifts(); unsubSigs(); unsubReqs(); unsubEvents(); unsubGas(); unsubLoc(); unsubInv(); unsubShiftCfg(); };
    }, [user]);


useEffect(() => {
    if (loading) return;
    if (!user?.uid || !currentUserInfo?.uid) {
        setShowVersionNotice(false);
        return;
    }
    try {
        const hasSeen = (typeof window !== 'undefined' && window.localStorage)
            ? window.localStorage.getItem(`version_notice_${CURRENT_VERSION}_${user.uid}`)
            : '1';
        setShowVersionNotice(!hasSeen);
    } catch (err) {
        console.warn('version notice read failed', err);
        setShowVersionNotice(false);
    }
}, [loading, user?.uid, currentUserInfo?.uid]);

    useEffect(() => {
        if (!user) return;
        const memberLineIds = [...new Set(Object.values(dbData.users || {})
            .filter(u => !u.isResigned && u.lineUserId)
            .map(u => u.lineUserId)
            .filter(Boolean))];
        if (memberLineIds.length === 0 || !Array.isArray(dbData.events) || dbData.events.length === 0) return;

        let timer = null;
        let cancelled = false;

        const sendTodayEventNotifications = async () => {
            if (cancelled) return;
            const now = new Date();
            const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
            const todaysEvents = dbData.events.filter(e => e?.title && checkEventOnDate(e, todayStr));
            if (todaysEvents.length === 0) return;

            for (const evt of todaysEvents) {
                const logId = `${evt.id || evt.startDate || 'event'}_${todayStr}`;
                const logRef = doc(db, 'artifacts', appId, 'public', 'data', 'eventNotificationLogs', logId);
                const sentSnap = await getDoc(logRef);
                if (sentSnap.exists()) continue;

                const timeText = evt.time ? `\n時間：${evt.time}` : '';
                const repeatText = evt.repeatType && evt.repeatType !== 'none' ? `\n重複：${REPEAT_LABELS[evt.repeatType] || evt.repeatType}` : '';
                const noteText = evt.note ? `\n內容：${evt.note}` : '';

                await sendLineNotification(memberLineIds, `📢 【今日公司備忘錄 / 行程提醒】\n日期：${todayStr}${timeText}\n標題：${evt.title}${repeatText}${noteText}\n請留意今日安排。`);
                await setDoc(logRef, { eventId: evt.id || null, date: todayStr, sentAt: Date.now(), title: evt.title, repeatType: evt.repeatType || 'none' }, { merge: true });
            }
        };

        const now = new Date();
        const nineAM = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0, 0);
        if (now >= nineAM) {
            sendTodayEventNotifications();
        } else {
            timer = setTimeout(sendTodayEventNotifications, nineAM.getTime() - now.getTime());
        }

        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [user, dbData.events, dbData.users]);

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
        const requesterUid = req.uid || req.fromUid;
        const targetUser = dbData.users[requesterUid] || Object.values(dbData.users || {}).find(u => u.uid === requesterUid);
        const requesterName = req.userName || req.fromName || targetUser?.name || '未知員工';
        const reviewerName = currentUserInfo?.name || '未知審核人';
        const reviewedAt = Date.now();
        const siblingRequests = getSiblingPendingRequests(dbData.requests, req);
        const writeReviewLog = async (result) => {
            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'requestReviewLogs'), {
                requestId: req.id,
                requestType: req.type,
                requesterUid,
                requesterName,
                requestDate: req.date || '',
                leaveType: req.leaveType || '',
                leaveLabel: req.leaveLabel || '',
                subUid: req.subUid || null,
                subName: req.subName || '',
                hours: req.hours ?? null,
                reason: req.reason || '',
                submittedAt: req.timestamp || null,
                reviewedAt,
                reviewedByUid: currentUserInfo?.uid || '',
                reviewedByName: reviewerName,
                result
            });
        };
        const clearSiblingRequests = async () => {
            await Promise.all(siblingRequests.map(item => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', item.id)).catch(() => null)));
        };
        try {
            if (action === 'reject') {
                await writeReviewLog('rejected');
                await deleteDoc(requestRef);
                await clearSiblingRequests();
                if (targetUser?.lineUserId) {
                    const rejectText = req.type === 'leave_request'
                        ? `❌ 您於 ${req.date} 送出的${req.leaveLabel || '假單'}未通過審核。
審核人：${reviewerName}`
                        : `❌ 您於 ${req.date} 送出的時數申請未通過審核。
審核人：${reviewerName}`;
                    await sendLineNotification([targetUser.lineUserId], rejectText);
                }
                alert(`✅ 已駁回 ${requesterName} 的申請，並通知員工。`);
                return;
            }
            if (req.type === 'leave_request') {
                const shiftRef = doc(db, 'artifacts', appId, 'public', 'data', 'shifts', req.date);
                const shiftSnap = await getDoc(shiftRef);
                const dayData = shiftSnap.exists() ? shiftSnap.data() : { assignments: [] };
                const assigns = Array.isArray(dayData.assignments) ? [...dayData.assignments] : [];
                const idx = assigns.findIndex(a => a.uid === req.uid);
                const baseAssign = idx >= 0 ? assigns[idx] : null;
                const leaveHours = resolveLeaveHours(baseAssign, DEFAULT_SHIFT_TYPES);
                const requestedUseComp = req.useComp === true;
                const finalUseComp = ['sick', 'personal'].includes(req.leaveType)
                    ? window.confirm(`是否在核准 ${requesterName} 的${req.leaveLabel || '假單'}時，使用補休時數扣抵？\n\n員工申請偏好：${requestedUseComp ? '使用補休扣抵' : '不使用補休扣抵'}\n按「確定」= 使用補休扣抵；按「取消」= 不使用補休扣抵`)
                    : false;
                const leaveEntry = { 
                    uid: req.uid, 
                    type: 'LEAVE', 
                    leaveType: req.leaveType, 
                    leaveHours, 
                    shiftCode: baseAssign?.shiftCode || null,
                    subUid: req.subUid || null,
                    useComp: finalUseComp,
                    timestamp: Date.now() 
                };
                if (idx >= 0) assigns[idx] = leaveEntry; else assigns.push(leaveEntry);
                await setDoc(shiftRef, { ...dayData, assignments: assigns }, { merge: true });
                await writeReviewLog('approved');
                await deleteDoc(requestRef);
                await clearSiblingRequests();
                if (targetUser?.lineUserId) await sendLineNotification([targetUser.lineUserId], `✅ 您於 ${req.date} 送出的${req.leaveLabel || '假單'}已核准，班表已同步更新。${['sick', 'personal'].includes(req.leaveType) ? `\n補休扣抵：${finalUseComp ? '是' : '否'}` : ''}
審核人：${reviewerName}`);
                alert(`✅ ${requesterName} 的假單已核准，班表已更新，並已通知員工。`);
            } else if (req.type === 'admin_ot_approve') {
                const shiftRef = doc(db, 'artifacts', appId, 'public', 'data', 'shifts', req.date);
                const shiftSnap = await getDoc(shiftRef);
                const dayData = shiftSnap.exists() ? shiftSnap.data() : { assignments: [] };
                const assigns = Array.isArray(dayData.assignments) ? [...dayData.assignments] : [];
                const idx = assigns.findIndex(a => a.uid === requesterUid);
                const baseEntry = idx >= 0 ? assigns[idx] : { uid: requesterUid, type: 'WORK' };
                const updatedEntry = { ...baseEntry, uid: requesterUid, type: baseEntry.type || 'WORK', otHours: req.hours, otReason: req.reason || '無備註', otConfirmed: true, timestamp: Date.now() };
                if (idx >= 0) assigns[idx] = updatedEntry; else assigns.push(updatedEntry);
                await setDoc(shiftRef, { ...dayData, assignments: assigns }, { merge: true });
                await writeReviewLog('approved');
                await deleteDoc(requestRef);
                await clearSiblingRequests();
                if (targetUser?.lineUserId) await sendLineNotification([targetUser.lineUserId], `✅ 您於 ${req.date} 送出的時數申請已核准，結算明細已同步更新。
審核人：${reviewerName}`);
                alert(`✅ ${requesterName} 的時數申請已核准，並已通知員工。`);
            }
        } catch (e) {
            console.error('審核處理失敗', e);
            alert('這筆申請可能已被其他主管處理，請重新整理後再確認。');
        }
    };
    
    // 🔔 計算主管需要看到的通知數量
    const myNotifications = dbData.requests?.filter(r => 
        (r.type === 'leave_request' && canApproveLeaveRequests) || 
        (r.type === 'admin_ot_approve' && canApproveLeaveRequests)
    ) || [];

    useEffect(() => {
        const pendingRequests = (dbData.requests || []).filter(r => (r.type === 'leave_request' || r.type === 'admin_ot_approve') && !r.lineNotifiedAt);
        if (pendingRequests.length === 0) return;
        const approverLineIds = getApproverLineIds(dbData.users);
        if (approverLineIds.length === 0) return;
        let cancelled = false;
        const backfillPendingNotifications = async () => {
            for (const req of pendingRequests) {
                if (cancelled) return;
                const requesterName = req.userName || req.fromName || dbData.users?.[req.uid || req.fromUid]?.name || '未知員工';
                const msg = req.type === 'leave_request'
                    ? `🔔 【待審核假單提醒】
申請人：${requesterName}
日期：${req.date}
類別：${req.leaveLabel || '假單'}${['sick', 'personal'].includes(req.leaveType) ? `
補休扣抵：${req.useComp ? '是' : '否'}` : ''}${req.subName ? `
代理人：${req.subName}` : ''}
請至系統「通知中心」進行審核。`
                    : `🔔 【待審核時數提醒】
申請人：${requesterName}
日期：${req.date}
時數：${req.hours} hr
原因：${req.reason || '無備註'}
請至系統「通知中心」進行審核。`;
                const sent = await sendLineNotification(approverLineIds, msg);
                if (sent) {
                    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.id), {
                        lineNotifiedAt: Date.now(),
                        notifiedApproverCount: approverLineIds.length,
                        lastNotificationType: 'backfill'
                    }).catch(() => null);
                }
            }
        };
        backfillPendingNotifications();
        return () => { cancelled = true; };
    }, [dbData.requests, dbData.users]);

    const renderView = () => {
        // 如果還沒簽約，強制跳轉到表單頁
        if (isLocked && view !== 'forms') {
            return <FormsView users={Object.values(dbData.users || {})} currentUserInfo={currentUserInfo} db={db} appId={appId} isPrivileged={isSuperAdmin} signatures={dbData.signatures} isLocked={isLocked} setView={setView} isSuperAdmin={isSuperAdmin} storeConfig={dbData.storeLocation} />;
        }
        switch (view) {
            case 'calendar': return <CalendarView currentDate={currentDate} setCurrentDate={setCurrentDate} dbData={{ ...dbData, leaves: DEFAULT_LEAVE_TYPES, shiftsDef: dbData.shiftTypes || DEFAULT_SHIFT_TYPES }} currentUserInfo={currentUserInfo} db={db} appId={appId} isSuperAdmin={isSuperAdmin} isPrivileged={isSuperAdmin} isReadOnly={false} />;
            case 'clock': return <ClockView currentUser={user} currentUserInfo={currentUserInfo} storeConfig={dbData.storeLocation} db={db} appId={appId} />;
            case 'inventory': return <InventoryView db={db} appId={appId} inventoryItems={dbData.inventoryItems} currentUserInfo={currentUserInfo} />;
            case 'forms': return <FormsView users={Object.values(dbData.users || {})} currentUserInfo={currentUserInfo} db={db} appId={appId} isPrivileged={isSuperAdmin} signatures={dbData.signatures} isLocked={isLocked} setView={setView} isSuperAdmin={isSuperAdmin} storeConfig={dbData.storeLocation} />;
            case 'salary': return <SalaryView users={dbData.users} shifts={dbData.shifts} shiftTypes={dbData.shiftTypes || DEFAULT_SHIFT_TYPES} currentDate={currentDate} leaveTypes={DEFAULT_LEAVE_TYPES} currentUserInfo={currentUserInfo} isPrivileged={isSuperAdmin} gasReceipts={dbData.gasReceipts} db={db} appId={appId} />;
            case 'payroll': return <PayrollView users={Object.values(dbData.users || {})} currentDate={currentDate} db={db} appId={appId} gasReceipts={dbData.gasReceipts} />;
            case 'attendance': return <AttendanceView users={Object.values(dbData.users || {})} currentDate={currentDate} db={db} appId={appId} shifts={dbData.shifts} shiftTypes={dbData.shiftTypes || DEFAULT_SHIFT_TYPES} />;
            
            // 🟢 修正：只保留一個 settings，並加上空值保護
            case 'settings': return <SettingsView users={dbData.users || {}} currentUserInfo={currentUserInfo} inventoryItems={dbData.inventoryItems || []} shiftTypes={dbData.shiftTypes || DEFAULT_SHIFT_TYPES} appId={appId} storeConfig={dbData.storeLocation} db={db} isSuperAdmin={isSuperAdmin} />;
            
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
                                <p className="text-sm font-bold text-gray-500 mt-1">申請人：{req.userName || req.fromName || dbData.users?.[req.uid || req.fromUid]?.name || '未知員工'} | 日期：{req.date}</p>
                                <div className="grid grid-cols-2 gap-3 mt-3 mb-3 text-xs font-black">
                                    <div className="bg-gray-50 rounded-2xl px-3 py-2 border border-gray-100">
                                        <div className="text-[10px] text-gray-400 mb-1">送出時間</div>
                                        <div className="text-gray-700">{formatDateTime(req.timestamp)}</div>
                                    </div>
                                    <div className="bg-gray-50 rounded-2xl px-3 py-2 border border-gray-100">
                                        <div className="text-[10px] text-gray-400 mb-1">審核人</div>
                                        <div className="text-gray-700">{req.reviewedByName || '待審核'}</div>
                                    </div>
                                </div>
                                <div className="bg-indigo-50 p-3 my-3 rounded-2xl text-sm font-black text-indigo-700 space-y-1">
                                    <div>{req.type === 'leave_request' ? `類別：${req.leaveLabel}` : `時數：${req.hours} hr`}</div>
                                    {req.type === 'leave_request' && ['sick', 'personal'].includes(req.leaveType) && <div className="text-xs text-amber-600">補休扣抵：{req.useComp ? '是（主管可改）' : '否（主管可改）'}</div>}
                                    {req.type === 'leave_request' && req.subName && <div className="text-xs text-indigo-500">代理人：{req.subName}</div>}
                                    {req.type === 'admin_ot_approve' && <div className="text-xs text-indigo-500">原因：{req.reason || '無備註'}</div>}
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
                        <NavBtn active={view === 'inventory'} onClick={() => setView('inventory')} icon={Package} label="盤點" />
                        
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

{showVersionNotice && user?.uid && !loading && (
    <div className="fixed inset-0 bg-black/60 z-[80] flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-lg rounded-[2rem] shadow-2xl overflow-hidden border border-indigo-100">
            <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
                <div>
                    <div className="text-xs font-black tracking-widest opacity-80">VERSION UPDATE</div>
                    <div className="text-lg font-black">系統版本更新提醒</div>
                </div>
                <button onClick={dismissVersionNotice} className="text-white/80 hover:text-white font-black">✕</button>
            </div>
            <div className="p-6 space-y-3 text-sm text-gray-700">
                <div className="font-black text-gray-800">目前版本：{CURRENT_VERSION}</div>
                <ul className="list-disc pl-5 space-y-2">
                    <li>簽約同意書畫面最後已加入「請假規則附錄」，員工簽約時可直接閱讀。</li>
                    <li>0901 班別已調整為 09:00~13:00 / 17:00~21:00，班別時數同步更新為 8 小時。</li>
                    <li>病假 / 事假申請與主管核准流程，保留補休扣抵規則。</li>
                    <li>版本提醒已改為較保守寫法，避免登入初始化期間影響畫面。</li>
                </ul>
                <div className="pt-3">
                    <button onClick={dismissVersionNotice} className="w-full bg-indigo-600 text-white py-3 rounded-2xl font-black hover:bg-indigo-700">我知道了</button>
                </div>
            </div>
        </div>
    </div>
)}

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
