import React, { useState, useEffect, useMemo } from 'react';
// 安裝依賴：firebase, lucide-react
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged, 
  GoogleAuthProvider,
  signInWithPopup,
  signOut
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  onSnapshot, 
  updateDoc,
  getDoc,
  addDoc,
  deleteDoc,
  writeBatch
} from 'firebase/firestore';
import { 
  Calendar, 
  Users, 
  ChevronLeft, 
  ChevronRight, 
  Save,
  ShieldAlert,
  Plus,
  Trash2,
  BookOpen,
  LogOut,
  CheckCircle2,
  Lock,
  Eye,
  Clock,
  Store,
  Bell,
  ArrowRightLeft,
  FileBarChart,
  UserX,
  Upload,
  ListFilter,
  History,
  StickyNote, // 備註圖示
  DollarSign, // 薪資圖示
  Gift,       // 福利圖示
  Megaphone   // 公告圖示
} from 'lucide-react';

// ==========================================
// 🟢 您的 Firebase 設定 (已自動填入)
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
// ==========================================

// --- 初始化 Firebase ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'team-shift-pc-v2-optimized'; // 升級版本號，確保資料結構清晰

// --- 假別設定 ---
const DEFAULT_LEAVE_TYPES = [
  { id: 'rostered', label: '自畫假', note: '自選畫休 (不扣薪)', deduct: false },
  { id: 'official', label: '排休', note: '排定休假 (管理員排)', deduct: false }, 
  { id: 'annual', label: '特休', note: '全薪，依年資給予 (不扣薪)', deduct: false },
  { id: 'comp', label: '補休', note: '輸入時數扣抵加班 (扣餘額)', deduct: false },
  { id: 'menstrual', label: '生理假', note: '每月得請1日，半薪。', deduct: true },
  { id: 'sick', label: '病假', note: '一年未超過30日半薪。', deduct: true },
  { id: 'personal', label: '事假', note: '無薪，一年限14日。', deduct: true },
];

// --- 🎨 員工專屬色票 ---
const USER_COLORS = [
  'bg-yellow-100 text-yellow-900 border-yellow-300', 
  'bg-blue-100 text-blue-900 border-blue-300',     
  'bg-green-100 text-green-900 border-green-300',   
  'bg-purple-100 text-purple-900 border-purple-300', 
  'bg-orange-100 text-orange-900 border-orange-300', 
  'bg-pink-100 text-pink-900 border-pink-300',       
  'bg-teal-100 text-teal-900 border-teal-300',       
  'bg-red-100 text-red-900 border-red-300',         
];

const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
const getMonthData = (year, month) => {
  const firstDay = new Date(year, month, 1).getDay();
  const days = daysInMonth(year, month);
  return { firstDay, days };
};

// --- 主程式 ---
export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('calendar'); 
  const [loading, setLoading] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);
  
  const [users, setUsers] = useState({});
  const [shifts, setShifts] = useState({});
  const [requests, setRequests] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState(DEFAULT_LEAVE_TYPES);
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    if (!auth) { setLoading(false); return; }
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !db) return;
    
    // Users
    const unsubUsers = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'users'), (snap) => {
      const d = {}; snap.forEach(doc => d[doc.id] = doc.data());
      setUsers(d);
      if (!d[user.uid]) {
        setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', user.uid), {
          uid: user.uid, name: user.displayName || `員工`, email: user.email,
          isAdmin: Object.keys(d).length === 0,
          isResigned: false
        });
      }
    });

    // Shifts
    const unsubShifts = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'shifts'), (snap) => {
      const d = {}; snap.forEach(doc => d[doc.id] = doc.data());
      setShifts(d);
    });

    // Requests
    const unsubRequests = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), (snap) => {
      const list = [];
      snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      setRequests(list);
    });

    // Settings
    const unsubSettings = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'leaves'), (snap) => {
      if (snap.exists()) setLeaveTypes(snap.data().types || DEFAULT_LEAVE_TYPES);
      else setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'leaves'), { types: DEFAULT_LEAVE_TYPES });
    });

    return () => { unsubUsers(); unsubShifts(); unsubRequests(); unsubSettings(); };
  }, [user]);

  const handleLogin = async () => {
    if (!auth) return alert("Firebase 設定錯誤");
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } 
    catch (e) { alert("登入失敗: " + e.message); }
  };

  const handleRequest = async (req, action) => {
    if (action === 'reject') {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.id));
        return;
    }

    if (req.type === 'ot_confirm') {
        const shiftRef = doc(db, 'artifacts', appId, 'public', 'data', 'shifts', req.date);
        const shiftSnap = await getDoc(shiftRef);
        if (shiftSnap.exists()) {
            const data = shiftSnap.data();
            const newAssigns = data.assignments.map(a => {
                if (a.uid === req.uid) return { ...a, otConfirmed: true };
                return a;
            });
            await updateDoc(shiftRef, { assignments: newAssigns });
        }
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.id));
        alert("加班時數已確認！");
    } 
    else if (req.type === 'swap') {
        const shiftRef = doc(db, 'artifacts', appId, 'public', 'data', 'shifts', req.date);
        const shiftSnap = await getDoc(shiftRef);
        if (shiftSnap.exists()) {
            const data = shiftSnap.data();
            const assigns = [...(data.assignments || [])];
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
                alert("班表狀態已變更，無法換假");
                await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.id));
            }
        }
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center">載入中...</div>;
  if (!user) return (
    <div className="flex h-screen items-center justify-center p-4 bg-gray-50">
      <div className="bg-white p-8 rounded-xl shadow-lg text-center">
        <h1 className="text-2xl font-bold mb-4 text-indigo-600">TeamShift 排班系統</h1>
        <button onClick={handleLogin} className="bg-white border px-6 py-2 rounded shadow hover:bg-gray-50 flex items-center gap-2 mx-auto">
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5"/> Google 登入
        </button>
      </div>
    </div>
  );

  const myNotifications = requests.filter(r => r.toUid === user.uid || (r.type === 'ot_confirm' && r.uid === user.uid));
  const activeUsers = Object.values(users).filter(u => !u.isResigned);
  const currentUserInfo = users[user.uid] || {};
  const isAdmin = currentUserInfo.isAdmin;

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-slate-800 pb-20 sm:pb-0 relative">
      <nav className="bg-white shadow-sm border-b sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xl text-indigo-600">
            <Calendar className="w-6 h-6" /> <span className="hidden sm:inline">TeamShift</span>
          </div>
          <div className="flex gap-1 sm:gap-2 items-center overflow-x-auto">
            <NavBtn active={view==='calendar'} onClick={()=>setView('calendar')} icon={Calendar} label="月曆" />
            <NavBtn active={view==='salary'} onClick={()=>setView('salary')} icon={FileBarChart} label="統計" />
            {isAdmin && <NavBtn active={view==='payroll'} onClick={()=>setView('payroll')} icon={DollarSign} label="薪資" />}
            <NavBtn active={view==='settings'} onClick={()=>setView('settings')} icon={Users} label="設定" />
            
            <div className="relative">
                <button onClick={() => setShowNotifications(!showNotifications)} className="p-2 text-gray-500 hover:text-indigo-600 relative">
                    <Bell className="w-5 h-5" />
                    {myNotifications.length > 0 && <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-white"></span>}
                </button>
                {showNotifications && (
                    <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border z-50 overflow-hidden animate-fade-in">
                        <div className="p-3 border-b bg-gray-50 font-bold text-sm">通知中心</div>
                        <div className="max-h-64 overflow-y-auto">
                            {myNotifications.length === 0 ? (
                                <div className="p-4 text-center text-gray-400 text-xs">沒有新通知</div>
                            ) : (
                                myNotifications.map(req => (
                                    <div key={req.id} className="p-3 border-b last:border-0 hover:bg-gray-50">
                                        {req.type === 'ot_confirm' ? (
                                            <>
                                                <div className="text-sm font-bold text-gray-800 mb-1">加班時數確認</div>
                                                <p className="text-xs text-gray-600 mb-2">{req.date}: {req.hours}hr ({req.reason})</p>
                                                <div className="flex gap-2">
                                                    <button onClick={()=>handleRequest(req, 'accept')} className="flex-1 bg-indigo-600 text-white text-xs py-1 rounded">確認</button>
                                                    <button onClick={()=>handleRequest(req, 'reject')} className="flex-1 bg-gray-200 text-gray-700 text-xs py-1 rounded">駁回</button>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="text-sm font-bold text-gray-800 mb-1">換假申請</div>
                                                <p className="text-xs text-gray-600 mb-2">{users[req.fromUid]?.name} 想跟您交換 {req.date} 的班表</p>
                                                <div className="flex gap-2">
                                                    <button onClick={()=>handleRequest(req, 'accept')} className="flex-1 bg-indigo-600 text-white text-xs py-1 rounded">同意</button>
                                                    <button onClick={()=>handleRequest(req, 'reject')} className="flex-1 bg-gray-200 text-gray-700 text-xs py-1 rounded">拒絕</button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>

            <button onClick={()=>signOut(auth)} className="p-2 text-gray-400 hover:text-red-500"><LogOut className="w-5 h-5"/></button>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-3 sm:p-4">
        {view === 'calendar' && <CalendarView currentDate={currentDate} setCurrentDate={setCurrentDate} shifts={shifts} users={activeUsers} allUsers={users} currentUser={user} leaveTypes={leaveTypes} />}
        {view === 'salary' && <SalaryView users={activeUsers} shifts={shifts} currentDate={currentDate} leaveTypes={leaveTypes} currentUser={user} />}
        {view === 'payroll' && isAdmin && <PayrollView users={users} currentDate={currentDate} />}
        {view === 'settings' && <SettingsView users={users} currentUser={user} leaveTypes={leaveTypes} />}
      </main>
    </div>
  );
}

const NavBtn = ({ active, onClick, icon: Icon, label }) => (
  <button onClick={onClick} className={`flex items-center gap-1 px-3 py-2 rounded-lg transition-colors ${active ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-500 hover:bg-gray-100'}`}>
    <Icon className="w-4 h-4" /><span className="hidden xs:inline">{label}</span>
  </button>
);

// --- 1. Calendar View (移除AI，改為公告，格子加大，備註標記) ---
const CalendarView = ({ currentDate, setCurrentDate, shifts, users, allUsers, currentUser, leaveTypes }) => {
  const [selectedDate, setSelectedDate] = useState(null);
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const { firstDay, days } = getMonthData(year, month);
  
  const sortedUserIds = useMemo(() => Object.keys(allUsers).sort(), [allUsers]);
  
  const getUserColor = (uid) => {
    const idx = sortedUserIds.indexOf(uid);
    if (idx === -1) return 'bg-gray-100 text-gray-800';
    return USER_COLORS[idx % USER_COLORS.length];
  };

  const myLeaveCount = useMemo(() => {
    let count = 0;
    const prefix = `${year}-${String(month+1).padStart(2,'0')}`;
    Object.keys(shifts).forEach(d => { if(d.startsWith(prefix)) shifts[d].assignments?.forEach(a => { if(a.uid===currentUser.uid && a.type==='LEAVE' && a.leaveType==='rostered') count++ }) });
    return count;
  }, [shifts, year, month, currentUser.uid]);

  return (
    <div className="space-y-4">
      {/* 頂部導航與公告欄 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-xl border shadow-sm flex justify-between items-center md:col-span-1">
            <button onClick={()=>setCurrentDate(new Date(year, month-1, 1))} className="p-2 hover:bg-gray-100 rounded-full"><ChevronLeft/></button>
            <div className="font-bold text-lg">{year}年 {month+1}月</div>
            <button onClick={()=>setCurrentDate(new Date(year, month+1, 1))} className="p-2 hover:bg-gray-100 rounded-full"><ChevronRight/></button>
          </div>
          
          <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 md:col-span-2 flex flex-col justify-center">
             <h4 className="font-bold text-indigo-700 flex items-center gap-2 mb-1 text-sm"><Megaphone size={16}/> 系統公告 & 更新紀錄</h4>
             <ul className="text-xs text-indigo-800 list-disc list-inside space-y-0.5">
                <li>新增「薪資管理」功能，管理員可記錄獎金與福利。</li>
                <li>月曆格子已加大，支援備註紅點標記與代班人顯示。</li>
                <li>統計頁面已優化：各類請假時數分開統計，餘額自動跨年累計。</li>
             </ul>
          </div>
      </div>
      
      <div className="bg-white rounded-xl border overflow-hidden grid grid-cols-7">
        {['日','一','二','三','四','五','六'].map(d=><div key={d} className="py-2 text-center text-sm text-gray-500 bg-gray-50 border-b">{d}</div>)}
        {Array.from({length:firstDay}).map((_,i)=><div key={'e'+i} className="min-h-[120px] border-b border-r bg-gray-50/30"/>)}
        {Array.from({length:days}).map((_,i)=>{
          const d=i+1, dateStr=`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          const data = shifts[dateStr] || {};
          const isClosed = data.isClosed === true;
          const hasNote = data.note && data.note.trim().length > 0;
          
          return (
            <div 
                key={d} 
                onClick={()=>setSelectedDate(dateStr)} 
                className={`min-h-[120px] border-b border-r p-1 cursor-pointer transition-colors relative
                    ${isClosed ? 'bg-gray-200 hover:bg-gray-300' : 'hover:bg-indigo-50'}
                `}
            >
              <div className="flex justify-between items-start">
                  <span className="text-xs font-bold text-gray-700 ml-1">{d}</span>
                  {/* 備註小箭頭 (紅色三角形) */}
                  {hasNote && (
                      <div className="w-0 h-0 border-t-[8px] border-r-[8px] border-t-red-500 border-r-transparent" title="有備註"></div>
                  )}
              </div>
              
              {isClosed ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                      <div className="bg-gray-600 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                          <Store size={12} /> 店休
                      </div>
                  </div>
              ) : (
                  <div className="mt-1 space-y-1 overflow-y-auto max-h-[90px]">
                    {data.assignments?.map((a,ix)=>{
                      if (a.type !== 'LEAVE') return null;
                      const lLabel = leaveTypes.find(t=>t.id===a.leaveType)?.label || '休';
                      const pColor = getUserColor(a.uid);
                      const subName = a.subUid ? allUsers[a.subUid]?.name : null; // 代班人名字
                      
                      return (
                        <div key={ix} className={`text-[10px] p-1 rounded border ${pColor} bg-opacity-20 mb-1 flex flex-col`}>
                          <div className="flex justify-between items-center">
                             <span className="font-medium">{allUsers[a.uid]?.name}</span>
                             <span className={`text-[9px] bg-white bg-opacity-80 px-1 rounded border shadow-sm`}>{lLabel}</span>
                          </div>
                          {/* 顯示代班資訊 */}
                          {subName && (
                              <div className="text-[9px] text-gray-500 mt-0.5 flex items-center gap-1">
                                  <ArrowRightLeft size={8}/> {subName}代
                              </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
              )}
            </div>
          )
        })}
      </div>

      {selectedDate && <ShiftModal dateStr={selectedDate} onClose={()=>setSelectedDate(null)} shifts={shifts} users={users} currentUser={currentUser} leaveTypes={leaveTypes} userColors={USER_COLORS} sortedUserIds={sortedUserIds} />}
    </div>
  );
};

// --- Shift Modal (新增代班人選項) ---
const ShiftModal = ({ dateStr, onClose, shifts, users, currentUser, leaveTypes, userColors, sortedUserIds }) => {
  const dayData = shifts[dateStr] || { assignments: [], note: '', isClosed: false };
  const [note, setNote] = useState(dayData.note || '');
  const [expanded, setExpanded] = useState(null);
  
  const isAdmin = (users || []).find(u => u.uid === currentUser.uid)?.isAdmin;
  const isClosed = dayData.isClosed === true;
  const myAssignment = dayData.assignments?.find(a => a.uid === currentUser.uid);
  const amIOnLeave = myAssignment && myAssignment.type === 'LEAVE';

  const getUserColor = (uid) => {
    const idx = sortedUserIds.indexOf(uid);
    if (idx === -1) return 'bg-gray-100 text-gray-800';
    return userColors[idx % userColors.length];
  };

  const update = async (newData) => {
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'shifts', dateStr), { ...dayData, ...newData }, { merge: true });
    if(newData.assignments) setExpanded(null);
  };

  const toggleClosed = async () => {
      if (!isAdmin) return;
      const newStatus = !isClosed;
      if (newStatus && dayData.assignments?.length > 0) {
          if (!confirm("設定為店休將會清除當日所有排班紀錄，確定嗎？")) return;
          await update({ isClosed: true, assignments: [] });
      } else {
          await update({ isClosed: newStatus });
      }
      onClose();
  };

  const cancelLeave = (uid) => {
    if (uid !== currentUser.uid && !isAdmin) return alert("無權限");
    let next = [...(dayData.assignments||[])];
    const idx = next.findIndex(a=>a.uid===uid);
    if(idx>=0) {
      next.splice(idx, 1);
      update({ assignments: next });
    }
  };

  // 處理排班/請假 (包含代班邏輯)
  const toggle = (uid, type, lType=null, subUid=null) => {
    if(uid!==currentUser.uid && !isAdmin) return alert("無權限");
    if(isClosed) return alert("本日店休");

    let next = [...(dayData.assignments||[])];
    const idx = next.findIndex(a=>a.uid===uid);
    
    if (lType === 'rostered') {
        const getRosteredCount = () => {
            const prefix = dateStr.substring(0, 7);
            let count = 0;
            Object.keys(shifts).forEach(d => {
                if (d.startsWith(prefix) && shifts[d].assignments?.some(a=>a.uid===uid && a.type==='LEAVE' && a.leaveType==='rostered')) count++;
            });
            return count;
        };
        const isAlreadyRosteredToday = next[idx] && next[idx].leaveType === 'rostered';
        if (!isAdmin && !isAlreadyRosteredToday && getRosteredCount() >= 3) {
            return alert("本月自選畫休 (排休) 已達 3 天上限");
        }
    }

    let leaveHours = 0;
    if (lType === 'comp') {
        const p = prompt("請輸入補休時數 (例如 8 或 12):", "8");
        if (p === null) return; 
        leaveHours = parseFloat(p);
        if (isNaN(leaveHours)) return alert("請輸入有效的數字");
    }

    const newEntry = { uid, type, leaveType: lType };
    if (leaveHours > 0) newEntry.leaveHours = leaveHours;
    if (subUid) newEntry.subUid = subUid; // 儲存代班人

    if(idx>=0) next[idx] = newEntry;
    else next.push(newEntry);

    update({ assignments: next });
    if (lType === 'rostered' || lType === 'official') onClose();
  };

  const requestSwap = async (fromUid, toUid) => {
      const targetUser = (users || []).find(u=>u.uid===toUid);
      if (!confirm(`確定要向 ${targetUser?.name || '對方'} 申請換假嗎？`)) return;
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), {
          type: 'swap', fromUid, toUid, date: dateStr, timestamp: new Date()
      });
      alert("換假申請已送出！");
  };

  const updateOT = async (uid) => {
    if(uid !== currentUser.uid && !isAdmin) return alert("無權限");
    if(isClosed) return alert("本日店休");
    const hours = prompt("請輸入加班/補休時數:");
    if(hours === null) return;
    const numHours = parseFloat(hours);
    if(isNaN(numHours)) return alert("請輸入有效數字");
    const remark = prompt("請輸入原因:", "");
    if(remark === null) return;

    if (isAdmin && uid !== currentUser.uid) {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), {
            type: 'ot_confirm', uid, date: dateStr, hours: numHours, reason: remark || '無備註', timestamp: new Date()
        });
        alert("已送出加班確認請求給員工");
        return;
    }
    let next = [...(dayData.assignments||[])];
    const idx = next.findIndex(a=>a.uid===uid);
    const newEntry = { otHours: numHours, otReason: remark || '無備註', otConfirmed: isAdmin };
    if (idx === -1) next.push({ uid, type: 'WORK', ...newEntry });
    else next[idx] = { ...next[idx], ...newEntry };
    update({ assignments: next });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white w-full max-w-md rounded-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className={`p-4 border-b flex justify-between font-bold items-center ${isClosed ? 'bg-gray-800 text-white' : 'bg-gray-50'}`}>
            <span className="flex items-center gap-2">
                {dateStr} 
                {isClosed && <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded">本日店休</span>}
            </span>
            <button onClick={onClose}>✕</button>
        </div>
        
        <div className="p-4 overflow-y-auto space-y-3 flex-1 relative">
          {isClosed && (
              <div className="absolute inset-0 bg-white/90 z-10 flex flex-col items-center justify-center text-center p-4">
                  <Store className="w-16 h-16 text-gray-400 mb-2"/>
                  <h3 className="text-xl font-bold text-gray-600">本日店休</h3>
                  {isAdmin && <button onClick={toggleClosed} className="mt-2 bg-gray-800 text-white px-4 py-2 rounded shadow">🔓 恢復營業</button>}
              </div>
          )}

          {(users || []).map(u => {
            const assign = dayData.assignments?.find(a=>a.uid===u.uid);
            const isRostered = assign?.type === 'LEAVE' && assign?.leaveType === 'rostered';
            const userColor = getUserColor(u.uid);
            const isMe = u.uid === currentUser.uid;
            const canEdit = isMe || isAdmin;
            const showSwapBtn = amIOnLeave && !isMe && assign?.type === 'WORK';
            
            // 下拉選單用的代班人列表 (排除自己)
            const availableSubs = users.filter(sub => sub.uid !== u.uid && !sub.isResigned);

            return (
              <div key={u.uid} className={`border rounded-lg p-3 ${!canEdit ? 'bg-gray-50 opacity-100' : 'bg-white'}`}>
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full border ${userColor.split(' ')[0]} border-gray-400`}></div>
                    <span className="font-bold">{u.name}</span>
                    {assign?.otHours > 0 && (
                        <span className={`text-xs px-1.5 py-0.5 rounded border font-bold flex items-center gap-1 ${assign.otConfirmed ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                           OT: {assign.otHours}hr ({assign.otReason}) {assign.otConfirmed ? <CheckCircle2 size={10}/> : <ShieldAlert size={10}/>}
                        </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {showSwapBtn && <button onClick={() => requestSwap(currentUser.uid, u.uid)} className="bg-indigo-50 text-indigo-600 border border-indigo-200 px-2 py-1 rounded text-[10px] flex items-center gap-1 hover:bg-indigo-100"><ArrowRightLeft className="w-3 h-3"/> 換假</button>}
                    <button onClick={() => updateOT(u.uid)} disabled={!canEdit} className={`px-3 py-1.5 text-xs rounded border ${!canEdit ? 'bg-gray-100' : (assign?.otHours > 0 ? 'bg-orange-100 text-orange-700 font-bold' : 'bg-white text-gray-500')}`}><Clock className="w-3.5 h-3.5" /> {assign?.otHours > 0 ? `${assign.otHours}h` : '時數'}</button>
                    {isAdmin && <button onClick={() => toggle(u.uid, 'LEAVE', 'official')} className="px-3 py-1.5 text-xs rounded border bg-gray-100 text-gray-600 hover:bg-gray-200">排休</button>}
                    <button disabled={!canEdit} onClick={() => toggle(u.uid, 'LEAVE', 'rostered')} className={`px-4 py-2 text-xs rounded font-bold ${!canEdit ? 'bg-gray-200 text-gray-400' : (isRostered ? 'bg-red-600 text-white ring-2 ring-red-200' : 'bg-red-500 text-white hover:bg-red-600')}`}>{isRostered ? '已排休' : '自畫假'}</button>
                    <button disabled={!canEdit} onClick={()=>setExpanded(expanded===u.uid?null:u.uid)} className={`px-3 py-2 text-xs rounded border ${!canEdit ? 'bg-gray-100' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{assign?.type==='LEAVE' && !isRostered ? '變更' : '請假 ▼'}</button>
                  </div>
                </div>
                {assign?.type === 'LEAVE' && (
                   <div className={`flex items-center justify-between text-xs px-2 py-1 rounded mb-2 ${userColor} bg-opacity-30 border`}>
                     <div>
                        <span className="font-medium text-gray-900">
                            狀態: {leaveTypes.find(t=>t.id===assign.leaveType)?.label || '休假'}
                            {(assign.leaveType==='comp' && assign.leaveHours) && ` (${assign.leaveHours}h)`}
                        </span>
                        {assign.subUid && <span className="ml-2 text-gray-600">➤ {users.find(sub=>sub.uid===assign.subUid)?.name}代班</span>}
                     </div>
                     {canEdit && <button onClick={()=>cancelLeave(u.uid)} className="text-red-600 hover:underline ml-2 font-bold flex items-center gap-1"><Trash2 className="w-3 h-3"/> 取消</button>}
                   </div>
                )}
                {expanded===u.uid && (
                  <div className="bg-gray-50 p-2 rounded animate-fade-in border-t space-y-2">
                    <div className="text-[10px] text-gray-400">請選擇假別 (可選代班人):</div>
                    {/* 代班人選擇器 */}
                    <div className="flex gap-2 items-center mb-2">
                        <span className="text-xs text-gray-600">代班:</span>
                        <select id={`sub-select-${u.uid}`} className="text-xs border rounded p-1 flex-1">
                            <option value="">-- 無代班人 --</option>
                            {availableSubs.map(s => <option key={s.uid} value={s.uid}>{s.name}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        {leaveTypes.filter(lt=>lt.id!=='rostered' && lt.id!=='official').map(lt=>(
                            <button key={lt.id} onClick={()=>{
                                const subVal = document.getElementById(`sub-select-${u.uid}`).value;
                                toggle(u.uid,'LEAVE',lt.id, subVal || null);
                            }} className={`text-xs p-2 border rounded bg-white hover:bg-gray-100`}>{lt.label}</button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          
          <div className="border-t pt-3 mt-2">
             <div className="flex gap-2 items-center mb-1">
                <StickyNote className="w-4 h-4 text-gray-500" />
                <span className="text-xs font-bold text-gray-600">當日備註 (顯示於右上角紅點)</span>
             </div>
             <div className="flex gap-2">
                <input value={note} onChange={e=>setNote(e.target.value)} className="border flex-1 rounded px-2 py-1 text-sm" placeholder="例如: 衛生局檢查..."/>
                <button onClick={()=>setDoc(doc(db,'artifacts',appId,'public', 'data', 'shifts',dateStr),{...dayData,note},{merge:true})} className="bg-indigo-600 text-white px-3 rounded"><Save size={16}/></button>
             </div>
          </div>
          
          {isAdmin && !isClosed && <div className="pt-2 border-t mt-2"><button onClick={toggleClosed} className="w-full bg-gray-100 text-gray-600 text-xs py-2 rounded hover:bg-gray-200 flex items-center justify-center gap-1"><Store className="w-3.5 h-3.5" /> 設為店休 (清空當日班表)</button></div>}
        </div>
      </div>
    </div>
  );
};

// --- 2. Salary View (統計優化：分類、年累計) ---
const SalaryView = ({ users, shifts, currentDate, leaveTypes, currentUser }) => {
  const [targetMonth, setTargetMonth] = useState(`${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}`);
  const isAdmin = users.find(u => u.uid === currentUser.uid)?.isAdmin;
  const visibleUsers = useMemo(() => isAdmin ? users : users.filter(u => u.uid === currentUser.uid), [users, currentUser, isAdmin]);

  const calc = (uid) => {
    let monthStats = { ot: 0, leaves: {} };
    let totalStats = { otEarned: 0, compHoursUsed: 0 }; 

    Object.keys(shifts).forEach(date => {
        const data = shifts[date];
        if(data.isClosed) return;
        const assign = data.assignments?.find(a => a.uid === uid);
        if(!assign) return;

        // 生涯累計 (跨年累計)
        if(assign.otHours && assign.otConfirmed) totalStats.otEarned += assign.otHours;
        if(assign.type === 'LEAVE' && assign.leaveType === 'comp') {
            const used = (assign.leaveHours !== undefined && assign.leaveHours !== null) ? assign.leaveHours : 8; // 舊資料預設8
            totalStats.compHoursUsed += parseFloat(used);
        }

        // 本月統計
        if(date.startsWith(targetMonth)) {
             if(assign.otHours && assign.otConfirmed) monthStats.ot += assign.otHours;
             if(assign.type === 'LEAVE') {
                 const lType = assign.leaveType || 'unknown';
                 monthStats.leaves[lType] = (monthStats.leaves[lType] || 0) + 1;
             }
        }
    });

    const balance = totalStats.otEarned - totalStats.compHoursUsed;
    return { monthStats, totalStats, balance };
  };

  return (
    <div className="space-y-4 pb-20">
      <div className="bg-white p-4 rounded-xl border flex justify-between items-center">
        <h2 className="font-bold flex gap-2"><ListFilter className="text-indigo-600"/> 統計明細</h2>
        <input type="month" value={targetMonth} onChange={e=>setTargetMonth(e.target.value)} className="border rounded px-2"/>
      </div>
      <div className="grid gap-3">
        {visibleUsers.map(u => {
          const s = calc(u.uid);
          return (
            <div key={u.uid} className="bg-white p-4 rounded shadow-sm border">
              <div className="flex justify-between items-start mb-2 border-b pb-2">
                <div className="font-bold text-lg">{u.name}</div>
                <div className="text-right">
                    <div className="text-xs text-gray-400">剩餘可休 (跨年累計)</div>
                    <div className={`font-bold text-xl ${s.balance < 0 ? 'text-red-600' : 'text-green-600'}`}>{s.balance} <span className="text-xs">hr</span></div>
                </div>
              </div>
              <div className="space-y-3 text-sm">
                <div className="bg-orange-50 p-2 rounded border border-orange-100 flex justify-between text-xs text-gray-600">
                    <span>總賺取: {s.totalStats.otEarned} hr</span>
                    <span>已使用: {s.totalStats.compHoursUsed} hr</span>
                </div>
                <div className="bg-gray-50 p-2 rounded border border-gray-100">
                    <div className="text-xs font-bold text-gray-500 mb-1">本月 ({targetMonth}) 各類請假明細</div>
                    {Object.keys(s.monthStats.leaves).length > 0 ? (
                        <div className="grid grid-cols-2 gap-2 mt-1">
                            {Object.entries(s.monthStats.leaves).map(([typeId, count]) => {
                                const typeInfo = leaveTypes.find(t => t.id === typeId);
                                return <span key={typeId} className={`text-xs px-2 py-1 rounded bg-white border ${typeInfo?.deduct ? 'text-red-500 border-red-200' : 'text-gray-600'}`}>{typeInfo?.label || '假'}: {count} 天</span>;
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

// --- 3. New Payroll View (薪資管理) ---
const PayrollView = ({ users, currentDate }) => {
    const [targetMonth, setTargetMonth] = useState(`${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}`);
    const [payrollData, setPayrollData] = useState({});
    const [loading, setLoading] = useState(false);

    // 讀取當月薪資資料
    useEffect(() => {
        setLoading(true);
        const unsub = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'payrolls', targetMonth), (docSnap) => {
            if (docSnap.exists()) setPayrollData(docSnap.data().records || {});
            else setPayrollData({});
            setLoading(false);
        });
        return () => unsub();
    }, [targetMonth]);

    const updatePayroll = async (uid, field, value) => {
        const newData = { ...payrollData, [uid]: { ...(payrollData[uid] || {}), [field]: value } };
        setPayrollData(newData); // 樂觀更新
        // 儲存到 Firestore
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'payrolls', targetMonth), { records: newData }, { merge: true });
    };

    const activeUsers = users.filter(u => !u.isResigned);

    return (
        <div className="space-y-4 pb-20">
            <div className="bg-white p-4 rounded-xl border flex justify-between items-center">
                <h2 className="font-bold flex gap-2 text-indigo-700"><DollarSign/> 薪資與福利管理 (管理員)</h2>
                <input type="month" value={targetMonth} onChange={e=>setTargetMonth(e.target.value)} className="border rounded px-2"/>
            </div>
            
            <div className="bg-white rounded-xl border overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-500 font-bold border-b">
                        <tr>
                            <th className="p-3">姓名</th>
                            <th className="p-3 w-24">本薪</th>
                            <th className="p-3 w-24">補助/津貼</th>
                            <th className="p-3 w-24 bg-pink-50 text-pink-700">生日禮金</th>
                            <th className="p-3 w-24 bg-purple-50 text-purple-700">三節獎金</th>
                            <th className="p-3 w-24 bg-yellow-50 text-yellow-700">年終獎金</th>
                            <th className="p-3">備註</th>
                        </tr>
                    </thead>
                    <tbody>
                        {activeUsers.map(u => {
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
                        })}
                    </tbody>
                </table>
                <div className="p-4 text-xs text-gray-400 text-center">
                    資料自動儲存。請於年底時手動匯總各月資料製作清冊。
                </div>
            </div>
        </div>
    );
};

// --- Settings View (維持原樣) ---
const SettingsView = ({ users, currentUser, leaveTypes }) => {
  const userList = Object.values(users);
  const currentUserInfo = users[currentUser.uid] || {};
  const isCurrentUserAdmin = currentUserInfo.isAdmin;
  const [newLeave, setNewLeave] = useState({ label: '', note: '', color: 'bg-gray-100 text-gray-700' });
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({});
  const [showResigned, setShowResigned] = useState(false);

  const addLeave = async () => {
    if(!newLeave.label) return;
    const types = [...leaveTypes, { ...newLeave, id: Math.random().toString(36).substr(2,9) }];
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'leaves'), { types });
    setNewLeave({ label: '', note: '', color: 'bg-gray-100 text-gray-700' });
  };
  const saveUser = async () => { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', editingId), formData); setEditingId(null); };
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 1024 * 1024) { alert("圖片檔案過大，請使用 1MB 以下的圖片"); return; }
    const reader = new FileReader();
    reader.onloadend = () => { setFormData({ ...formData, bankImage: reader.result }); };
    reader.readAsDataURL(file);
  };
  const visibleUsers = useMemo(() => {
      let list = userList;
      if (!isCurrentUserAdmin) list = list.filter(u => u.uid === currentUser.uid);
      else if (!showResigned) list = list.filter(u => !u.isResigned);
      return list;
  }, [userList, currentUser, isCurrentUserAdmin, showResigned]);

  return (
    <div className="space-y-6 pb-20">
      <div className="bg-white p-6 rounded-xl border shadow-sm text-center">
        <div className="w-16 h-16 bg-indigo-100 rounded-full mx-auto flex items-center justify-center text-2xl font-bold text-indigo-600 mb-2">{currentUserInfo.name?.[0]}</div>
        <h2 className="font-bold text-xl">{currentUserInfo.name}</h2>
        <p className="text-gray-500">{isCurrentUserAdmin?'管理員':'員工'}</p>
      </div>
      {isCurrentUserAdmin && (
        <div className="bg-white p-4 rounded-xl border">
          <h3 className="font-bold mb-3 flex gap-2"><BookOpen size={18}/> 假別管理</h3>
          <div className="flex gap-2 mb-3">
             <input placeholder="名稱" value={newLeave.label} onChange={e=>setNewLeave({...newLeave, label:e.target.value})} className="border rounded px-2 w-20"/>
             <input placeholder="說明" value={newLeave.note} onChange={e=>setNewLeave({...newLeave, note:e.target.value})} className="border rounded px-2 flex-1"/>
             <button onClick={addLeave} className="bg-indigo-600 text-white px-3 rounded"><Plus/></button>
          </div>
          <div className="space-y-2">
            {leaveTypes.map(l => (
              <div key={l.id} className="flex justify-between items-center bg-gray-50 p-2 rounded">
                <span className={`text-xs px-2 py-1 rounded ${l.color}`}>{l.label}</span>
                <span className="text-xs text-gray-500 truncate flex-1 mx-2">{l.note}</span>
                <button onClick={async()=>{ const types = leaveTypes.filter(t=>t.id!==l.id); await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'leaves'), { types }); }} className="text-gray-400"><Trash2 size={14}/></button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="bg-white p-4 rounded-xl border">
         <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold flex gap-2"><Users size={18}/> 資料設定</h3>
            {isCurrentUserAdmin && (<label className="text-xs flex items-center gap-1 text-gray-500 cursor-pointer"><input type="checkbox" checked={showResigned} onChange={e=>setShowResigned(e.target.checked)} />顯示已離職</label>)}
         </div>
         {visibleUsers.map(u => (
           <div key={u.uid} className={`border-b py-3 last:border-0 ${u.isResigned ? 'opacity-50 bg-gray-50' : ''}`}>
             {editingId === u.uid ? (
               <div className="space-y-3 p-3 bg-gray-50 rounded">
                 <div className="grid grid-cols-2 gap-2">
                   <div><label className="text-xs text-gray-500">姓名</label><input value={formData.name} onChange={e=>setFormData({...formData, name:e.target.value})} className="w-full border p-2 rounded"/></div>
                   {isCurrentUserAdmin && (<div><label className="text-xs text-gray-500">在職狀態</label><select value={formData.isResigned ? 'true' : 'false'} onChange={e=>setFormData({...formData, isResigned: e.target.value === 'true'})} className="w-full border p-2 rounded bg-white"><option value="false">在職中</option><option value="true">已離職</option></select></div>)}
                 </div>
                 {isCurrentUserAdmin && (
                     <div className="space-y-2 border-t pt-2 mt-2">
                        <div className="text-xs font-bold text-indigo-600 flex items-center gap-1"><Lock size={10}/> 敏感資料</div>
                        <div className="grid grid-cols-2 gap-2">
                            <input placeholder="到職日 (YYYY-MM-DD)" value={formData.startDate || ''} onChange={e=>setFormData({...formData, startDate:e.target.value})} className="border p-2 rounded text-sm"/>
                            <input placeholder="電話" value={formData.phone || ''} onChange={e=>setFormData({...formData, phone:e.target.value})} className="border p-2 rounded text-sm"/>
                            <input placeholder="出生年月日" value={formData.birthday || ''} onChange={e=>setFormData({...formData, birthday:e.target.value})} className="border p-2 rounded text-sm"/>
                            <input placeholder="身分證字號" value={formData.nationalId || ''} onChange={e=>setFormData({...formData, nationalId:e.target.value})} className="border p-2 rounded text-sm"/>
                        </div>
                        <div><label className="text-xs text-gray-500 block mb-1">銀行存摺封面</label><div className="flex items-center gap-2"><label className="cursor-pointer bg-white border border-gray-300 text-gray-600 px-3 py-1.5 rounded text-xs hover:bg-gray-50 flex items-center gap-1"><Upload size={12}/> 上傳圖片<input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" /></label>{formData.bankImage && <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 size={12}/> 已選取</span>}</div>{formData.bankImage && (<img src={formData.bankImage} alt="Bank" className="mt-2 h-20 object-contain border rounded bg-white" />)}</div>
                     </div>
                 )}
                 <div className="flex gap-2 justify-end mt-2"><button onClick={()=>setEditingId(null)} className="px-3 py-1 bg-gray-200 rounded">取消</button><button onClick={saveUser} className="px-3 py-1 bg-indigo-600 text-white rounded">儲存</button></div>
               </div>
             ) : (
               <div className="flex justify-between items-center">
                 <div><div className="font-bold flex items-center gap-2">{u.name}{u.isResigned && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded flex items-center gap-0.5"><UserX size={10}/> 已離職</span>}</div>{isCurrentUserAdmin && u.startDate && <div className="text-xs text-gray-400">到職: {u.startDate}</div>}</div>
                 <button onClick={()=>{setEditingId(u.uid);setFormData(u)}} className="text-indigo-600 text-sm">編輯</button>
               </div>
             )}
           </div>
         ))}
      </div>
    </div>
  );
};