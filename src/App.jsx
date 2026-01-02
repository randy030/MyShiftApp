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
  Sparkles,
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
  History
} from 'lucide-react';

// ==========================================
// 🔴 您的 Firebase 設定
// ==========================================
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
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
const appId = 'team-shift-pc-v1';

// --- 假別設定 ---
const DEFAULT_LEAVE_TYPES = [
  { id: 'rostered', label: '自畫假', note: '自選畫休 (不扣薪)', deduct: false },
  { id: 'official', label: '排休', note: '排定休假 (管理員排)', deduct: false }, 
  { id: 'annual', label: '特休', note: '全薪，依年資給予 (不扣薪)', deduct: false },
  { id: 'comp', label: '補休', note: '輸入時數扣抵加班 (扣餘額)', deduct: false }, // 修改說明
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

// --- Gemini API ---
const callGeminiAI = async (prompt, apiKey, model = 'gemini-1.5-flash') => {
  if (!apiKey) throw new Error("請先在「設定」頁面輸入 Gemini API Key");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || `AI 請求失敗 (${model})`);
  }
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "無回應";
};

// --- 主程式 ---
export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('calendar'); 
  const [loading, setLoading] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);
  
  const [geminiKey, setGeminiKey] = useState(localStorage.getItem('gemini_api_key') || "");
  const [aiModel, setAiModel] = useState(localStorage.getItem('gemini_model') || "gemini-1.5-flash");
  
  const [users, setUsers] = useState({});
  const [shifts, setShifts] = useState({});
  const [requests, setRequests] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState(DEFAULT_LEAVE_TYPES);
  const [currentDate, setCurrentDate] = useState(new Date());

  const handleSetGeminiKey = (key) => { setGeminiKey(key); localStorage.setItem('gemini_api_key', key); };
  const handleSetAiModel = (model) => { setAiModel(model); localStorage.setItem('gemini_model', model); };

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

    const unsubShifts = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'shifts'), (snap) => {
      const d = {}; snap.forEach(doc => d[doc.id] = doc.data());
      setShifts(d);
    });

    const unsubRequests = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), (snap) => {
      const list = [];
      snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      setRequests(list);
    });

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
        <h1 className="text-2xl font-bold mb-4 text-indigo-600">TeamShift 排班</h1>
        <button onClick={handleLogin} className="bg-white border px-6 py-2 rounded shadow hover:bg-gray-50 flex items-center gap-2 mx-auto">
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5"/> Google 登入
        </button>
      </div>
    </div>
  );

  const myNotifications = requests.filter(r => r.toUid === user.uid || (r.type === 'ot_confirm' && r.uid === user.uid));
  const activeUsers = Object.values(users).filter(u => !u.isResigned);

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-slate-800 pb-20 sm:pb-0 relative">
      <nav className="bg-white shadow-sm border-b sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xl text-indigo-600">
            <Calendar className="w-6 h-6" /> <span className="hidden sm:inline">TeamShift</span>
          </div>
          <div className="flex gap-2 items-center">
            <NavBtn active={view==='calendar'} onClick={()=>setView('calendar')} icon={Calendar} label="月曆" />
            <NavBtn active={view==='salary'} onClick={()=>setView('salary')} icon={FileBarChart} label="統計" />
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

      <main className="max-w-4xl mx-auto p-3 sm:p-4">
        {view === 'calendar' && <CalendarView currentDate={currentDate} setCurrentDate={setCurrentDate} shifts={shifts} users={activeUsers} allUsers={users} currentUser={user} leaveTypes={leaveTypes} geminiKey={geminiKey} aiModel={aiModel} />}
        {view === 'salary' && <SalaryView users={activeUsers} shifts={shifts} currentDate={currentDate} leaveTypes={leaveTypes} currentUser={user} />}
        {view === 'settings' && <SettingsView users={users} currentUser={user} leaveTypes={leaveTypes} geminiKey={geminiKey} setGeminiKey={handleSetGeminiKey} aiModel={aiModel} setAiModel={handleSetAiModel} />}
      </main>
    </div>
  );
}

const NavBtn = ({ active, onClick, icon: Icon, label }) => (
  <button onClick={onClick} className={`flex items-center gap-1 px-3 py-2 rounded-lg transition-colors ${active ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-500 hover:bg-gray-100'}`}>
    <Icon className="w-4 h-4" /><span className="hidden xs:inline">{label}</span>
  </button>
);

// --- Calendar View ---
const CalendarView = ({ currentDate, setCurrentDate, shifts, users, allUsers, currentUser, leaveTypes, geminiKey, aiModel }) => {
  const [selectedDate, setSelectedDate] = useState(null);
  const [aiResult, setAiResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
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

  const monthlyStats = useMemo(() => {
    const stats = {};
    const prefix = `${year}-${String(month+1).padStart(2,'0')}`;
    users.forEach(u => { stats[u.uid] = { name: u.name, color: getUserColor(u.uid), total: 0, details: [] }; });
    
    Object.entries(shifts).forEach(([date, data]) => {
      if (!date.startsWith(prefix) || data.isClosed) return;
      const dayNum = parseInt(date.split('-')[2]);
      data.assignments?.forEach(a => {
        if (a.type === 'LEAVE' && stats[a.uid]) {
          stats[a.uid].total += 1;
          const lLabel = leaveTypes.find(t=>t.id===a.leaveType)?.label || '休';
          stats[a.uid].details.push(`${dayNum}日(${lLabel})`);
        }
      });
    });
    Object.values(stats).forEach(s => { s.details.sort((a,b) => parseInt(a) - parseInt(b)); });
    return Object.values(stats).filter(s => s.total > 0);
  }, [shifts, year, month, users, leaveTypes]);

  const handleAI = async () => {
    setAiLoading(true);
    try {
      const prefix = `${year}-${String(month+1).padStart(2,'0')}`;
      let leaves=[];
      Object.entries(shifts).forEach(([d, data]) => {
        if(!d.startsWith(prefix) || data.isClosed) return;
        data.assignments?.forEach(a => { if(a.type==='LEAVE' && users.find(u=>u.uid===a.uid)) leaves.push(`${d} ${allUsers[a.uid]?.name}(${leaveTypes.find(t=>t.id===a.leaveType)?.label})`) });
      });
      const prompt = `請寫一份 ${year}年${month+1}月 班表公告。請假: ${leaves.join(', ')}。`;
      const res = await callGeminiAI(prompt, geminiKey, aiModel);
      setAiResult(res);
    } catch(e) { alert(e.message); } finally { setAiLoading(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl border shadow-sm">
        <button onClick={()=>setCurrentDate(new Date(year, month-1, 1))} className="p-2 hover:bg-gray-100 rounded-full"><ChevronLeft/></button>
        <div className="font-bold text-lg">{year}年 {month+1}月</div>
        <button onClick={()=>setCurrentDate(new Date(year, month+1, 1))} className="p-2 hover:bg-gray-100 rounded-full"><ChevronRight/></button>
      </div>
      <div className="bg-indigo-50 p-4 rounded-lg flex justify-between items-center text-sm text-indigo-800">
        <div className="flex items-center gap-2">
           <div className={`w-3 h-3 rounded-full border ${getUserColor(currentUser.uid).split(' ')[0]} border-gray-400`}></div>
           <div>自選畫休: <span className="font-bold">{myLeaveCount}/3</span> (排休)</div>
        </div>
        <button onClick={handleAI} disabled={aiLoading} className="flex gap-2 bg-white px-3 py-1 rounded shadow text-indigo-600 hover:bg-indigo-50 disabled:opacity-50">
          {aiLoading ? '...' : <><Sparkles size={16}/> 產生公告</>}
        </button>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden grid grid-cols-7">
        {['日','一','二','三','四','五','六'].map(d=><div key={d} className="py-2 text-center text-sm text-gray-500 bg-gray-50 border-b">{d}</div>)}
        {Array.from({length:firstDay}).map((_,i)=><div key={'e'+i} className="h-24 border-b border-r bg-gray-50/30"/>)}
        {Array.from({length:days}).map((_,i)=>{
          const d=i+1, dateStr=`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          const data = shifts[dateStr] || {};
          const isClosed = data.isClosed === true;
          
          return (
            <div 
                key={d} 
                onClick={()=>setSelectedDate(dateStr)} 
                className={`h-24 border-b border-r p-1 cursor-pointer transition-colors relative
                    ${isClosed ? 'bg-gray-200 hover:bg-gray-300' : 'hover:bg-indigo-50'}
                `}
            >
              <div className="flex justify-between"><span className="text-xs font-bold text-gray-700">{d}</span></div>
              
              {isClosed ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                      <div className="bg-gray-600 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                          <Store size={12} /> 店休
                      </div>
                  </div>
              ) : (
                  <div className="mt-1 space-y-1 overflow-y-auto max-h-[70px]">
                    {data.assignments?.map((a,ix)=>{
                      if (a.type !== 'LEAVE') return null;
                      const lLabel = leaveTypes.find(t=>t.id===a.leaveType)?.label || '休';
                      const pColor = getUserColor(a.uid);
                      // 顯示補休時數
                      const extraLabel = (a.leaveType==='comp' && a.leaveHours) ? ` ${a.leaveHours}h` : '';
                      return (
                        <div key={ix} className={`text-[10px] p-0.5 rounded border ${pColor} bg-opacity-20 flex justify-between items-center mb-1`}>
                          <span className="font-medium">{allUsers[a.uid]?.name}</span>
                          <span className={`text-[9px] bg-white bg-opacity-80 px-1 rounded ml-1 border shadow-sm`}>{lLabel}{extraLabel}</span>
                        </div>
                      )
                    })}
                  </div>
              )}
            </div>
          )
        })}
      </div>

      {monthlyStats.length > 0 && (
        <div className="bg-white rounded-xl border shadow-sm p-4 animate-fade-in">
          <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
            <ListFilter className="w-5 h-5 text-indigo-600" /> 本月請假統計
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {monthlyStats.map((stat, idx) => (
              <div key={idx} className={`p-3 rounded-lg border flex items-start gap-3 ${stat.color} bg-opacity-10 border-opacity-50`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold shadow-sm bg-white text-gray-700 border`}>
                  {stat.name[0]}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-gray-900">{stat.name}</span>
                    <span className="text-xs font-bold bg-white px-2 py-0.5 rounded border">共 {stat.total} 天</span>
                  </div>
                  <div className="text-xs text-gray-600 leading-relaxed">
                    {stat.details.join('、')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedDate && <ShiftModal dateStr={selectedDate} onClose={()=>setSelectedDate(null)} shifts={shifts} users={users} currentUser={currentUser} leaveTypes={leaveTypes} userColors={USER_COLORS} sortedUserIds={sortedUserIds} />}
      {aiResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-md rounded-xl p-4 shadow-2xl">
            <h3 className="font-bold mb-2 flex gap-2"><Sparkles className="text-purple-500"/> AI 公告</h3>
            <textarea className="w-full h-64 border rounded p-2 text-sm" defaultValue={aiResult}/>
            <button onClick={()=>setAiResult(null)} className="mt-2 w-full bg-gray-100 py-2 rounded">關閉</button>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Shift Modal (更新：補休要問時數) ---
const ShiftModal = ({ dateStr, onClose, shifts, users, currentUser, leaveTypes, userColors, sortedUserIds }) => {
  const dayData = shifts[dateStr] || { assignments: [], note: '', isClosed: false };
  const [note, setNote] = useState(dayData.note || '');
  const [expanded, setExpanded] = useState(null);
  
  const isAdmin = (users || []).find(u => u.uid === currentUser.uid)?.isAdmin;
  const isClosed = dayData.isClosed === true;

  // 取得當前使用者在這天的班表
  const myAssignment = dayData.assignments?.find(a => a.uid === currentUser.uid);
  
  // 關鍵邏輯：當天我必須是「休假 (LEAVE)」，這樣我才能把休假換給上班的同事
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

  const toggle = (uid, type, lType=null) => {
    if(uid!==currentUser.uid && !isAdmin) return alert("無權限");
    if(isClosed) return alert("本日店休");

    let next = [...(dayData.assignments||[])];
    const idx = next.findIndex(a=>a.uid===uid);
    
    // 檢查自選畫休 (rostered) 上限
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

    // 🔴 補休輸入時數邏輯 🔴
    let leaveHours = 0;
    if (lType === 'comp') {
        const p = prompt("請輸入補休時數 (例如 8 或 12):", "8");
        if (p === null) return; // 取消
        leaveHours = parseFloat(p);
        if (isNaN(leaveHours)) return alert("請輸入有效的數字");
    }

    const newEntry = { uid, type, leaveType: lType };
    if (leaveHours > 0) newEntry.leaveHours = leaveHours;

    if(idx>=0) next[idx] = newEntry;
    else next.push(newEntry);

    update({ assignments: next });
    
    // 只要是「自畫假」或「排休(official)」，都自動關閉視窗
    if (lType === 'rostered' || lType === 'official') {
        onClose();
    }
  };

  const requestSwap = async (fromUid, toUid) => {
      const targetUser = (users || []).find(u=>u.uid===toUid);
      if (!confirm(`確定要向 ${targetUser?.name || '對方'} 申請換假嗎？(將您的休假換給對方)`)) return;
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), {
          type: 'swap',
          fromUid,
          toUid,
          date: dateStr,
          timestamp: new Date()
      });
      alert("換假申請已送出！等待對方同意。");
  };

  const updateOT = async (uid) => {
    if(uid !== currentUser.uid && !isAdmin) return alert("無權限");
    if(isClosed) return alert("本日店休");

    const hours = prompt("請輸入加班/補休時數 (數字):");
    if(hours === null) return;
    const numHours = parseFloat(hours);
    if(isNaN(numHours)) return alert("請輸入有效數字");

    const remark = prompt("請輸入原因/備註 (例如: 支援盤點):", "");
    if(remark === null) return;

    if (isAdmin && uid !== currentUser.uid) {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), {
            type: 'ot_confirm',
            uid,
            date: dateStr,
            hours: numHours,
            reason: remark || '無備註',
            timestamp: new Date()
        });
        alert("已送出加班確認請求給員工");
        return;
    }

    let next = [...(dayData.assignments||[])];
    const idx = next.findIndex(a=>a.uid===uid);
    const newEntry = { otHours: numHours, otReason: remark || '無備註', otConfirmed: isAdmin };

    if (idx === -1) {
        next.push({ uid, type: 'WORK', ...newEntry });
    } else {
        next[idx] = { ...next[idx], ...newEntry };
    }
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
                  <p className="text-sm text-gray-400 mb-4">無法進行排班或畫假</p>
                  {isAdmin && <button onClick={toggleClosed} className="bg-gray-800 text-white px-4 py-2 rounded shadow hover:bg-gray-700 transition">🔓 取消店休 (恢復營業)</button>}
              </div>
          )}

          {(users || []).map(u => {
            const assign = dayData.assignments?.find(a=>a.uid===u.uid);
            const isRostered = assign?.type === 'LEAVE' && assign?.leaveType === 'rostered';
            const userColor = getUserColor(u.uid);
            const isMe = u.uid === currentUser.uid;
            const canEdit = isMe || isAdmin;
            
            // 換假按鈕顯示邏輯：
            // 1. 我今天必須是「休假」(amIOnLeave)
            // 2. 對方不是我 (!isMe)
            // 3. 對方今天必須是「上班」狀態 (assign?.type === 'WORK') - 這樣才能跟他換
            const showSwapBtn = amIOnLeave && !isMe && assign?.type === 'WORK';

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
                    {!canEdit && <Eye className="w-3 h-3 text-gray-400" />}
                  </div>
                  <div className="flex gap-2">
                    
                    {showSwapBtn && (
                        <button onClick={() => requestSwap(currentUser.uid, u.uid)} className="bg-indigo-50 text-indigo-600 border border-indigo-200 px-2 py-1 rounded text-[10px] flex items-center gap-1 hover:bg-indigo-100"><ArrowRightLeft className="w-3 h-3"/> 換假</button>
                    )}

                    <button onClick={() => updateOT(u.uid)} disabled={!canEdit} className={`px-3 py-1.5 text-xs rounded border transition-colors flex items-center gap-1 ${!canEdit ? 'bg-gray-100 text-gray-300' : (assign?.otHours > 0 ? 'bg-orange-100 text-orange-700 border-orange-300 font-bold' : 'bg-white text-gray-500 hover:bg-orange-50')}`} title="登記時數"><Clock className="w-3.5 h-3.5" /> {assign?.otHours > 0 ? `${assign.otHours}h` : '時數'}</button>
                    
                    {isAdmin && (
                        <button onClick={() => toggle(u.uid, 'LEAVE', 'official')} className="px-3 py-1.5 text-xs rounded border bg-gray-100 text-gray-600 hover:bg-gray-200">排休</button>
                    )}

                    <button disabled={!canEdit} onClick={() => toggle(u.uid, 'LEAVE', 'rostered')} className={`px-4 py-2 text-xs rounded font-bold transition-colors shadow-sm ${!canEdit ? (isRostered ? 'bg-red-100 text-red-700 cursor-not-allowed' : 'bg-gray-200 text-gray-400 cursor-not-allowed') : (isRostered ? 'bg-red-600 text-white ring-2 ring-red-200' : 'bg-red-500 text-white hover:bg-red-600')}`}>{!canEdit && isRostered ? `❌ 已排休` : (isRostered ? '已排休' : '自畫假')}</button>
                    <button disabled={!canEdit} onClick={()=>setExpanded(expanded===u.uid?null:u.uid)} className={`px-3 py-2 text-xs rounded border flex items-center gap-1 transition-colors ${!canEdit ? 'bg-gray-100 text-gray-300 cursor-not-allowed' : (assign?.type==='LEAVE' && !isRostered ? 'bg-blue-100 text-blue-900 border-blue-300' : 'bg-white text-gray-600 hover:bg-gray-50')}`}>{assign?.type==='LEAVE' && !isRostered ? '變更' : '請假 ▼'}</button>
                  </div>
                </div>
                {assign?.type === 'LEAVE' && (
                   <div className={`flex items-center justify-between text-xs px-2 py-1 rounded mb-2 ${userColor} bg-opacity-30 border`}>
                     <span className="font-medium text-gray-900">
                        狀態: {leaveTypes.find(t=>t.id===assign.leaveType)?.label || '休假'}
                        {(assign.leaveType==='comp' && assign.leaveHours) && ` (${assign.leaveHours}小時)`}
                     </span>
                     {canEdit && <button onClick={()=>cancelLeave(u.uid)} className="text-red-600 hover:underline ml-2 font-bold flex items-center gap-1"><Trash2 className="w-3 h-3"/> 取消</button>}
                   </div>
                )}
                {expanded===u.uid && (
                  <div className="grid grid-cols-2 gap-2 bg-gray-50 p-2 rounded animate-fade-in border-t">
                    <div className="col-span-2 text-[10px] text-gray-400 mb-1">請選擇假別 (其他):</div>
                    {/* 隱藏官方和自畫假，只顯示一般假別 */}
                    {leaveTypes.filter(lt=>lt.id!=='rostered' && lt.id!=='official').map(lt=><button key={lt.id} onClick={()=>toggle(u.uid,'LEAVE',lt.id)} className={`text-xs p-2 border rounded bg-white hover:bg-gray-100`}>{lt.label}</button>)}
                  </div>
                )}
              </div>
            )
          })}
          <div className="flex gap-2"><input value={note} onChange={e=>setNote(e.target.value)} className="border flex-1 rounded px-2" placeholder="備註"/><button onClick={()=>setDoc(doc(db,'artifacts',appId,'public', 'data', 'shifts',dateStr),{...dayData,note},{merge:true})} className="bg-indigo-600 text-white px-3 rounded"><Save size={16}/></button></div>
          {isAdmin && !isClosed && <div className="pt-2 border-t mt-2"><button onClick={toggleClosed} className="w-full bg-gray-100 text-gray-600 text-xs py-2 rounded hover:bg-gray-200 flex items-center justify-center gap-1"><Store className="w-3.5 h-3.5" /> 設為店休 (清空當日班表)</button></div>}
        </div>
      </div>
    </div>
  );
};

// --- Salary View (更新：顯示生涯累計) ---
const SalaryView = ({ users, shifts, currentDate, leaveTypes, currentUser }) => {
  const [targetMonth, setTargetMonth] = useState(`${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}`);
  const isAdmin = users.find(u => u.uid === currentUser.uid)?.isAdmin;
  
  const visibleUsers = useMemo(() => {
      if (isAdmin) return users;
      return users.filter(u => u.uid === currentUser.uid);
  }, [users, currentUser, isAdmin]);

  const calc = (uid) => {
    let monthStats = { ot: 0, leaves: {} };
    let totalStats = { otEarned: 0, compHoursUsed: 0 }; // 改用 compHoursUsed

    Object.keys(shifts).forEach(date => {
        const data = shifts[date];
        if(data.isClosed) return;

        const assign = data.assignments?.find(a => a.uid === uid);
        if(!assign) return;

        // 1. 生涯累計 (所有歷史資料)
        if(assign.otHours && assign.otConfirmed) {
            totalStats.otEarned += assign.otHours;
        }
        if(assign.type === 'LEAVE' && assign.leaveType === 'comp') {
            // 🔴 改為累計「輸入的時數」，如果沒有(舊資料)則不扣
            const used = assign.leaveHours || 0; 
            totalStats.compHoursUsed += used;
        }

        // 2. 本月統計 (僅限選定月份)
        if(date.startsWith(targetMonth)) {
             if(assign.otHours && assign.otConfirmed) {
                monthStats.ot += assign.otHours;
             }
             if(assign.type === 'LEAVE') {
                 const lType = assign.leaveType || 'unknown';
                 monthStats.leaves[lType] = (monthStats.leaves[lType] || 0) + 1;
             }
        }
    });

    // 計算餘額: 總賺取 - 總花費
    const balance = totalStats.otEarned - totalStats.compHoursUsed;

    return { monthStats, totalStats, balance };
  };

  const handleClearMonth = async () => {
    if (!confirm(`確定要清空 ${targetMonth} 的所有班表與請假紀錄嗎？此動作無法復原！`)) return;
    const batch = writeBatch(db);
    let count = 0;
    Object.keys(shifts).forEach(d => {
        if (d.startsWith(targetMonth)) {
            const ref = doc(db, 'artifacts', appId, 'public', 'data', 'shifts', d);
            batch.delete(ref);
            count++;
        }
    });
    if (count > 0) { await batch.commit(); alert(`已成功刪除 ${count} 筆紀錄`); } else { alert("本月無資料可清除"); }
  };

  return (
    <div className="space-y-4 pb-20">
      <div className="bg-white p-4 rounded-xl border flex justify-between items-center">
        <h2 className="font-bold flex gap-2"><ListFilter className="text-indigo-600"/> 統計明細</h2>
        <div className="flex gap-2">
            {isAdmin && <button onClick={handleClearMonth} className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded hover:bg-red-200" title="清空本月班表"><Trash2 size={16}/></button>}
            <input type="month" value={targetMonth} onChange={e=>setTargetMonth(e.target.value)} className="border rounded px-2"/>
        </div>
      </div>
      <div className="grid gap-3">
        {visibleUsers.map(u => {
          const s = calc(u.uid);
          return (
            <div key={u.uid} className="bg-white p-4 rounded shadow-sm border">
              <div className="flex justify-between items-start mb-2 border-b pb-2">
                <div className="font-bold text-lg">{u.name}</div>
                <div className="text-right">
                    <div className="text-xs text-gray-400">剩餘可休</div>
                    <div className={`font-bold text-xl ${s.balance < 0 ? 'text-red-600' : 'text-green-600'}`}>{s.balance} <span className="text-xs">hr</span></div>
                </div>
              </div>
              
              <div className="space-y-3 text-sm">
                {/* 生涯累計區塊 */}
                <div className="bg-orange-50 p-2 rounded border border-orange-100">
                    <div className="text-xs font-bold text-orange-800 mb-1 flex items-center gap-1"><History size={12}/> 生涯累計</div>
                    <div className="flex justify-between text-xs text-gray-600">
                        <span>總加班賺取: {s.totalStats.otEarned} hr</span>
                        <span>總補休時數: {s.totalStats.compHoursUsed} hr</span>
                    </div>
                </div>

                {/* 本月統計區塊 */}
                <div className="bg-gray-50 p-2 rounded border border-gray-100">
                    <div className="text-xs font-bold text-gray-500 mb-1">本月 ({targetMonth}) 小計</div>
                    <div className="flex justify-between mb-1"><span>本月加班:</span><span className="font-bold text-gray-800">{s.monthStats.ot} 小時</span></div>
                    {Object.keys(s.monthStats.leaves).length > 0 && (
                        <div className="grid grid-cols-2 gap-1 mt-1 border-t pt-1">
                            {Object.entries(s.monthStats.leaves).map(([typeId, count]) => {
                                const typeInfo = leaveTypes.find(t => t.id === typeId);
                                return <span key={typeId} className={`text-xs ${typeInfo?.deduct ? 'text-red-500' : 'text-gray-600'}`}>{typeInfo?.label || '假'}: {count} 天</span>;
                            })}
                        </div>
                    )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  );
};

// --- Settings View (修復權限與UI) ---
const SettingsView = ({ users, currentUser, leaveTypes, geminiKey, setGeminiKey, aiModel, setAiModel }) => {
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

  const saveUser = async () => {
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', editingId), formData);
    setEditingId(null);
  };

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

      <div className="bg-white p-4 rounded-xl border border-indigo-200">
        <h3 className="font-bold mb-3 flex gap-2 text-indigo-700"><Sparkles size={18}/> AI 設定</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">API Key</label>
            <input type="password" value={geminiKey} onChange={e=>setGeminiKey(e.target.value)} className="w-full border rounded px-3 py-2" placeholder="貼上 AI Key"/>
          </div>
        </div>
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
                <button onClick={async()=>{
                  const types = leaveTypes.filter(t=>t.id!==l.id);
                  await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'leaves'), { types });
                }} className="text-gray-400"><Trash2 size={14}/></button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white p-4 rounded-xl border">
         <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold flex gap-2"><Users size={18}/> 資料設定</h3>
            {isCurrentUserAdmin && (
                <label className="text-xs flex items-center gap-1 text-gray-500 cursor-pointer">
                    <input type="checkbox" checked={showResigned} onChange={e=>setShowResigned(e.target.checked)} />
                    顯示已離職
                </label>
            )}
         </div>
         
         {visibleUsers.map(u => (
           <div key={u.uid} className={`border-b py-3 last:border-0 ${u.isResigned ? 'opacity-50 bg-gray-50' : ''}`}>
             {editingId === u.uid ? (
               <div className="space-y-3 p-3 bg-gray-50 rounded">
                 <div className="grid grid-cols-2 gap-2">
                   <div>
                       <label className="text-xs text-gray-500">姓名</label>
                       <input value={formData.name} onChange={e=>setFormData({...formData, name:e.target.value})} className="w-full border p-2 rounded"/>
                   </div>
                   {isCurrentUserAdmin && (
                       <div>
                           <label className="text-xs text-gray-500">在職狀態</label>
                           <select 
                               value={formData.isResigned ? 'true' : 'false'} 
                               onChange={e=>setFormData({...formData, isResigned: e.target.value === 'true'})}
                               className="w-full border p-2 rounded bg-white"
                           >
                               <option value="false">在職中</option>
                               <option value="true">已離職</option>
                           </select>
                       </div>
                   )}
                 </div>

                 {isCurrentUserAdmin && (
                     <div className="space-y-2 border-t pt-2 mt-2">
                        <div className="text-xs font-bold text-indigo-600 flex items-center gap-1"><Lock size={10}/> 敏感資料 (僅管理員可見)</div>
                        <div className="grid grid-cols-2 gap-2">
                            <input placeholder="到職日 (YYYY-MM-DD)" value={formData.startDate || ''} onChange={e=>setFormData({...formData, startDate:e.target.value})} className="border p-2 rounded text-sm"/>
                            <input placeholder="電話" value={formData.phone || ''} onChange={e=>setFormData({...formData, phone:e.target.value})} className="border p-2 rounded text-sm"/>
                            <input placeholder="出生年月日" value={formData.birthday || ''} onChange={e=>setFormData({...formData, birthday:e.target.value})} className="border p-2 rounded text-sm"/>
                            <input placeholder="身分證字號" value={formData.nationalId || ''} onChange={e=>setFormData({...formData, nationalId:e.target.value})} className="border p-2 rounded text-sm"/>
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 block mb-1">銀行存摺封面</label>
                            <div className="flex items-center gap-2">
                                <label className="cursor-pointer bg-white border border-gray-300 text-gray-600 px-3 py-1.5 rounded text-xs hover:bg-gray-50 flex items-center gap-1">
                                    <Upload size={12}/> 上傳圖片
                                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                                </label>
                                {formData.bankImage && <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 size={12}/> 已選取</span>}
                            </div>
                            {formData.bankImage && (
                                <img src={formData.bankImage} alt="Bank" className="mt-2 h-20 object-contain border rounded bg-white" />
                            )}
                        </div>
                     </div>
                 )}

                 <div className="flex gap-2 justify-end mt-2">
                   <button onClick={()=>setEditingId(null)} className="px-3 py-1 bg-gray-200 rounded">取消</button>
                   <button onClick={saveUser} className="px-3 py-1 bg-indigo-600 text-white rounded">儲存</button>
                 </div>
               </div>
             ) : (
               <div className="flex justify-between items-center">
                 <div>
                   <div className="font-bold flex items-center gap-2">
                       {u.name}
                       {u.isResigned && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded flex items-center gap-0.5"><UserX size={10}/> 已離職</span>}
                   </div>
                   {isCurrentUserAdmin && u.startDate && <div className="text-xs text-gray-400">到職: {u.startDate}</div>}
                 </div>
                 <button onClick={()=>{setEditingId(u.uid);setFormData(u)}} className="text-indigo-600 text-sm">編輯</button>
               </div>
             )}
           </div>
         ))}
      </div>
    </div>
  );
};