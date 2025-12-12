"use client";

import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useParams } from "next/navigation";
import { supabase, supabase2, DualStorage } from "../../../../lib/supabaseClient";
import {
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  LineChart,
  Line,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area
} from "recharts";

const MapTracking = dynamic(() => import("../../../components/MapTracking"), { ssr: false });

type TaskType = {
  id?: string | null;
  project_id?: string | null;
  row_index?: number | null;
  description?: string | null;
  plan_progress?: number | null;
  actual_progress?: number | null;
  color?: string | null;
  location?: string | null;
  proof_url?: string | null;
  weight?: number | null;
  dates?: Record<string, any> | null;
  is_uploaded?: boolean;
  style?: any;
};

type ShipmentType = {
  id: string;
  project_id?: string;
  last_lat: number;
  last_lng: number;
  accuracy: number;
  address: string;
  status: string;
  recorded_at: string;
  created_at: string;
  item_name?: string;
  notes?: string;
};

type NoteType = {
  id: string;
  project_id: string;
  content: string;
  audio_url?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type ProjectMetaType = {
  project_code?: string;
  job_name?: string;
  no_rks?: string;
  date?: string;
  client?: string;
  address?: string;
  time_schedule?: string;
  deadline?: string;
};

type UserPresenceType = {
  id: string;
  email: string;
  user_metadata?: {
    avatar_url?: string;
    full_name?: string;
  };
  last_seen: string;
  active_tab: string;
  editing_task?: string;
};

export default function MasterDashboard(): React.JSX.Element {
  const router = useRouter();
  const params = useParams();
  const projectId = (params as any)?.projectId as string | undefined;

  const [projectName, setProjectName] = useState("Project");
  const [tasks, setTasks] = useState<TaskType[]>([]);
  const [targetTasks, setTargetTasks] = useState<TaskType[]>([]);
  const [realisasiTasks, setRealisasiTasks] = useState<TaskType[]>([]);
  const [shipments, setShipments] = useState<ShipmentType[]>([]);
  const [notes, setNotes] = useState<NoteType[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "tasks" | "location" | "documents" | "notes" | "comparison">("overview");
  const [newNote, setNewNote] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [dateCols, setDateCols] = useState<string[]>([]);
  const [metaProject, setMetaProject] = useState<ProjectMetaType>({});
  const [onlineUsers, setOnlineUsers] = useState<UserPresenceType[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  // 🔒 cek login + load data
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data?.session) {
        router.push("/");
        return;
      }
      if (!projectId) return;

      await loadProjectData();
      await loadOnlineUsers();
      setLoading(false);
    })();
  }, [projectId, router]);

  useEffect(() => {
    const email = localStorage.getItem("userEmail");
    const profile = localStorage.getItem("userProfile");
    const role = localStorage.getItem("userRole");
    setUserEmail(email);
    setUserProfile(profile);
    setUserRole(role);
  }, []);

  const UserProfile = () => {
    if (!userEmail) return null;

    return (
      <div className="flex items-center gap-3 bg-blue-50 px-3 py-2 rounded-lg border border-blue-200">
        <img 
          src={userProfile || `https://ui-avatars.com/api/?name=${encodeURIComponent(userEmail.split('@')[0])}&background=random`}
          alt="Profile" 
          className="w-8 h-8 rounded-full"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(userEmail.split('@')[0])}&background=random`;
          }}
        />
        <div>
          <div className="text-sm font-medium text-gray-800">{userEmail}</div>
          <div className="text-xs text-gray-500 capitalize">
            {userRole || 'user'} - Master Dashboard
          </div>
        </div>
      </div>
    );
  };

  const parseDecimalValue = (value: any): number => {
    if (value === null || value === undefined || value === "") return 0;
    
    if (typeof value === 'string') {
      value = value.replace(',', '.');
      value = value.replace(/[^\d.-]/g, '');
    }
    
    const num = Number(value);
    return isNaN(num) ? 0 : parseFloat(num.toFixed(2));
  };

  const calculateDateTotals = (rowsData: TaskType[]) => {
    const totals: Record<string, number> = {};
    
    let cumulativeTotal = 0;
    dateCols.forEach(date => {
      const dateTotal = rowsData.reduce((sum, row) => {
        const dateValue = parseDecimalValue(row.dates?.[date]);
        return sum + dateValue;
      }, 0);
      
      cumulativeTotal += dateTotal;
      totals[date] = cumulativeTotal;
    });
    
    return totals;
  };

  const loadProjectData = async () => {
    if (!projectId) return;

    // Load project info
    const pr = await supabase.from("projects").select("name, meta, created_at, deadline").eq("id", projectId).single();
    setProjectName(pr.data?.name || `Project ${projectId}`);

    // Load meta project dari localStorage Silver
    const LS_META_PROJECT = `silver:${projectId}:meta_project`;
    const savedMeta = localStorage.getItem(LS_META_PROJECT);
    if (savedMeta) {
      try {
        const parsedMeta = JSON.parse(savedMeta);
        if (parsedMeta && typeof parsedMeta === 'object') {
          setMetaProject(parsedMeta);
        } else {
          // Fallback ke data dari database
          if (pr.data?.meta && typeof pr.data.meta === "object") {
            setMetaProject(pr.data.meta as ProjectMetaType);
          }
        }
      } catch (e) {
        console.warn("invalid meta project:", e);
        if (pr.data?.meta && typeof pr.data.meta === "object") {
          setMetaProject(pr.data.meta as ProjectMetaType);
        }
      }
    } else if (pr.data?.meta && typeof pr.data.meta === "object") {
      setMetaProject(pr.data.meta as ProjectMetaType);
    }

    // Load tasks dari database
    const allTasks = await supabase
      .from("tasks")
      .select("*")
      .eq("project_id", projectId)
      .order("row_index", { ascending: true });
    
    const tasksData = (allTasks.data as TaskType[]) || [];
    setTasks(tasksData);

    // Load date columns dari localStorage Silver
    const LS_DATE_COLS = `silver:${projectId}:date_cols`;
    const savedDateCols = localStorage.getItem(LS_DATE_COLS);
    if (savedDateCols) {
      try {
        const parsedDateCols = JSON.parse(savedDateCols);
        if (Array.isArray(parsedDateCols)) {
          setDateCols(parsedDateCols);
        }
      } catch (e) {
        console.warn("invalid date columns:", e);
      }
    } else {
      // Ekstrak tanggal dari tasks jika tidak ada di localStorage
      const datesSet = new Set<string>();
      tasksData.forEach((r) => { 
        if (r.dates) Object.keys(r.dates).forEach((k) => datesSet.add(k)); 
      });
      setDateCols(Array.from(datesSet));
    }

    // Load target dan realisasi dari localStorage Silver
    const LS_TARGET_KEY = `silver:${projectId}:target_rows`;
    const LS_REALISASI_KEY = `silver:${projectId}:realisasi_rows`;
    const LS_KEY = `silver:${projectId}:rows`;
    
    // Load planning rows dari localStorage
    const localRaw = localStorage.getItem(LS_KEY);
    if (localRaw) {
      try {
        const localRows = JSON.parse(localRaw) as TaskType[];
        if (Array.isArray(localRows) && localRows.length) {
          // Gabungkan dengan data dari database
          const byIndex = new Map<number, TaskType>();
          tasksData.forEach((s) => { 
            if (s.row_index !== null && s.row_index !== undefined) 
              byIndex.set(Number(s.row_index), s); 
          });
          
          const mergedRows = localRows.map((lr, i) => {
            const ri = Number(lr.row_index ?? i + 1);
            const server = byIndex.get(ri);
            return { ...server, ...lr };
          });
          
          setTasks(mergedRows);
        }
      } catch (e) {
        console.warn("invalid local rows:", e);
      }
    }

    // Load target rows
    const targetRaw = localStorage.getItem(LS_TARGET_KEY);
    if (targetRaw) {
      try {
        const targetData = JSON.parse(targetRaw) as TaskType[];
        if (Array.isArray(targetData)) {
          setTargetTasks(targetData);
        }
      } catch (e) {
        console.warn("invalid target data:", e);
      }
    }

    // Load realisasi rows
    const realisasiRaw = localStorage.getItem(LS_REALISASI_KEY);
    if (realisasiRaw) {
      try {
        const realisasiData = JSON.parse(realisasiRaw) as TaskType[];
        if (Array.isArray(realisasiData)) {
          setRealisasiTasks(realisasiData);
        }
      } catch (e) {
        console.warn("invalid realisasi data:", e);
      }
    }

    // Load shipments
    const s = await supabase
      .from("shipments")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    setShipments(s.data || []);

    // Load notes
    const n = await supabase
      .from("project_notes")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    setNotes(n.data || []);

    // Setup realtime subscriptions
    setupRealtimeSubscriptions();
  };

  const loadOnlineUsers = async () => {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      
      const { data, error } = await supabase
        .from('user_presence')
        .select('*')
        .eq('project_id', projectId)
        .gte('last_seen', fiveMinutesAgo)
        .order('last_seen', { ascending: false });

      if (error) {
        console.log('Database error in loadOnlineUsers:', error);
        return;
      }

      if (data) {
        const users = data.map(item => item.user_data as UserPresenceType);
        setOnlineUsers(users);
      }
    } catch (error) {
      console.log('Exception in loadOnlineUsers:', error);
    }
  };

  const OnlineUsers = () => {
    const [showUsers, setShowUsers] = useState(false);

    return (
      <div className="bg-white p-3 rounded shadow mb-4">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-sm">👥 User Online di Silver App</h3>
          <button
            onClick={() => setShowUsers(!showUsers)}
            className="px-2 py-1 bg-blue-100 hover:bg-blue-200 rounded text-xs flex items-center gap-1"
          >
            {showUsers ? '▲ Sembunyikan' : '▼ Tampilkan'}
          </button>
        </div>
        
        {showUsers && (
          <div className="mt-2 space-y-2">
            {onlineUsers.map((user) => (
              <div key={user.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded border">
                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
                  {user.user_metadata?.avatar_url ? (
                    <img 
                      src={user.user_metadata.avatar_url} 
                      alt={user.user_metadata.full_name || user.email}
                      className="w-8 h-8 rounded-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                  ) : null}
                  <div className={user.user_metadata?.avatar_url ? 'hidden' : ''}>
                    {user.email.charAt(0).toUpperCase()}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">
                    {user.user_metadata?.full_name || user.email}
                    {user.id === currentUser?.id && (
                      <span className="ml-1 text-blue-600 text-xs">(Anda)</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {user.active_tab === '1' && '📋 Tab Planning'}
                    {user.active_tab === '2' && '📍 Tab Lokasi'}
                    {user.active_tab === '3' && '🎯 Tab Target'}
                    {user.active_tab === '4' && '📊 Tab Realisasi'}
                    {user.active_tab === '5' && '📝 Tab Catatan'}
                    {user.editing_task && ` - Edit: ${user.editing_task}`}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-gray-500">Online</span>
                </div>
              </div>
            ))}
            
            {onlineUsers.length === 0 && (
              <div className="text-center py-4 text-gray-500">
                <div className="text-2xl mb-1">👻</div>
                <p>Tidak ada user online di Silver App</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

// Ganti bagian setupRealtimeSubscriptions() dengan kode berikut:

const setupRealtimeSubscriptions = () => {
  if (!projectId) return;

  // Realtime untuk tasks
  const taskCh = supabase
    .channel(`public:tasks:project_${projectId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "tasks", filter: `project_id=eq.${projectId}` },
      (payload: any) => {
        if (payload.eventType === "UPDATE" || payload.eventType === "INSERT") {
          setTasks((prev) => {
            const newRow = payload.new as TaskType;
            const found = prev.find((p) => p.id === newRow.id);
            if (found) return prev.map((r) => (r.id === newRow.id ? newRow : r));
            return [newRow, ...prev];
          });
        } else if (payload.eventType === "DELETE") {
          const oldId = payload.old?.id;
          if (oldId) {
            setTasks((prev) => prev.filter((r) => r.id !== oldId));
          }
        }
      }
    )
    .subscribe();

  // Realtime untuk shipments
  const shipCh = supabase
    .channel(`public:shipments:project_${projectId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "shipments", filter: `project_id=eq.${projectId}` },
      (payload: any) => {
        if (payload.new) {
          const newShipment = payload.new as ShipmentType;
          setShipments(prev => {
            const exists = prev.find(s => s.id === newShipment.id);
            if (exists) return prev.map(s => s.id === newShipment.id ? newShipment : s);
            return [newShipment, ...prev].slice(0, 100); // Limit to 100 entries
          });
        } else if (payload.eventType === "DELETE") {
          const oldId = payload.old?.id;
          if (oldId) {
            setShipments(prev => prev.filter(s => s.id !== oldId));
          }
        }
      }
    )
    .subscribe();

  // Realtime untuk notes - PERBAIKAN UTAMA DI SINI
// PERBAIKAN: Line 296-305 - Ganti .then() dengan .on()
const noteCh = supabase
  .channel(`public:project_notes:project_${projectId}`)
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "project_notes", filter: `project_id=eq.${projectId}` },
    (payload: any) => {  // <-- PERBAIKAN DI SINI
      if (payload.new) {
        const newNote = payload.new as NoteType;
        setNotes(prev => {
          const exists = prev.find(n => n.id === newNote.id);
          if (exists) return prev.map(n => n.id === newNote.id ? newNote : n);
          return [newNote, ...prev];
        });
      } else if (payload.eventType === "DELETE") {
        const oldId = payload.old?.id;
        if (oldId) {
          setNotes(prev => prev.filter(n => n.id !== oldId));
        }
      }
    }
  )
  .subscribe();

  // Realtime untuk user presence
  const presenceCh = supabase
    .channel(`user_presence:project_${projectId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'user_presence',
        filter: `project_id=eq.${projectId}`
      },
      (payload: any) => {
        loadOnlineUsers();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(taskCh);
    supabase.removeChannel(shipCh);
    supabase.removeChannel(noteCh);
    supabase.removeChannel(presenceCh);
  };
};

  // Data chart dari Silver App (Planning)
  const planningChartData = useMemo(() => {
    if (!dateCols.length) return [];

    const allDataPoints: any[] = [];
    
    tasks.forEach((row, rowIndex) => {
      const description = row.description || `Task ${rowIndex + 1}`;
      
      dateCols.forEach((date, dateIndex) => {
        const dateValue = parseDecimalValue(row.dates?.[date]);
        
        let cumulativeUntilNow = 0;
        for (let i = 0; i < dateIndex; i++) {
          const prevDate = dateCols[i];
          cumulativeUntilNow += parseDecimalValue(row.dates?.[prevDate]);
        }
        
        if (dateValue > 0) {
          allDataPoints.push({
            date,
            task: description,
            progress: dateValue,
            rowIndex,
            cumulative: cumulativeUntilNow + dateValue
          });
        }
      });
    });

    const dateMap = new Map();
    
    allDataPoints.forEach(point => {
      if (!dateMap.has(point.date)) {
        dateMap.set(point.date, {
          date: point.date,
          totalProgress: 0,
          tasks: {}
        });
      }
      
      const dateData = dateMap.get(point.date);
      dateData.tasks[point.task] = point.progress;
      dateData.totalProgress = point.cumulative;
    });

    return Array.from(dateMap.values());
  }, [tasks, dateCols]);

  // Data chart dari Silver App (Target)
  const targetChartData = useMemo(() => {
    if (!dateCols.length) return [];

    const allDataPoints: any[] = [];
    
    targetTasks.forEach((row, rowIndex) => {
      const description = row.description || `Task ${rowIndex + 1}`;
      
      dateCols.forEach((date, dateIndex) => {
        const dateValue = parseDecimalValue(row.dates?.[date]);
        
        let cumulativeUntilNow = 0;
        for (let i = 0; i < dateIndex; i++) {
          const prevDate = dateCols[i];
          cumulativeUntilNow += parseDecimalValue(row.dates?.[prevDate]);
        }
        
        if (dateValue > 0) {
          allDataPoints.push({
            date,
            task: description,
            progress: dateValue,
            rowIndex,
            cumulative: cumulativeUntilNow + dateValue
          });
        }
      });
    });

    const dateMap = new Map();
    
    allDataPoints.forEach(point => {
      if (!dateMap.has(point.date)) {
        dateMap.set(point.date, {
          date: point.date,
          totalProgress: 0,
          tasks: {}
        });
      }
      
      const dateData = dateMap.get(point.date);
      dateData.tasks[point.task] = point.progress;
      dateData.totalProgress = point.cumulative;
    });

    return Array.from(dateMap.values());
  }, [targetTasks, dateCols]);

  // Data chart dari Silver App (Realisasi)
  const realisasiChartData = useMemo(() => {
    if (!dateCols.length) return [];

    const allDataPoints: any[] = [];
    
    realisasiTasks.forEach((row, rowIndex) => {
      const description = row.description || `Task ${rowIndex + 1}`;
      
      dateCols.forEach((date, dateIndex) => {
        const dateValue = parseDecimalValue(row.dates?.[date]);
        
        let cumulativeUntilNow = 0;
        for (let i = 0; i < dateIndex; i++) {
          const prevDate = dateCols[i];
          cumulativeUntilNow += parseDecimalValue(row.dates?.[prevDate]);
        }
        
        if (dateValue > 0) {
          allDataPoints.push({
            date,
            task: description,
            progress: dateValue,
            rowIndex,
            cumulative: cumulativeUntilNow + dateValue
          });
        }
      });
    });

    const dateMap = new Map();
    
    allDataPoints.forEach(point => {
      if (!dateMap.has(point.date)) {
        dateMap.set(point.date, {
          date: point.date,
          totalProgress: 0,
          tasks: {}
        });
      }
      
      const dateData = dateMap.get(point.date);
      dateData.tasks[point.task] = point.progress;
      dateData.totalProgress = point.cumulative;
    });

    return Array.from(dateMap.values());
  }, [realisasiTasks, dateCols]);

  // Chart data untuk overview (simple)
  const chartData = useMemo(
    () =>
      tasks.map((t, i) => ({
        name: `${i + 1}`,
        Plan: Number(t.plan_progress ?? 0),
        Actual: Number(t.actual_progress ?? 0),
        description: t.description?.substring(0, 20) || `Task ${i + 1}`,
        weight: Number(t.weight ?? 0)
      })),
    [tasks]
  );

  // PERBAIKAN 2: Hitung progress summary dengan benar sesuai Silver App
  const progressSummary = useMemo(() => {
    // Hitung total bobot
    const totalWeight = tasks.reduce((sum, task) => sum + parseDecimalValue(task.weight), 0);
    
    // Hitung total % dari tabel (kumulatif terakhir) - Planning
    const dateTotals = calculateDateTotals(tasks);
    const totalPercentageFromTable = dateTotals[dateCols[dateCols.length - 1]] || 0;

    // Hitung total % untuk target
    const targetDateTotals = calculateDateTotals(targetTasks);
    const totalTargetPercentage = targetDateTotals[dateCols[dateCols.length - 1]] || 0;

    // Hitung total % untuk realisasi
    const realisasiDateTotals = calculateDateTotals(realisasiTasks);
    const totalRealisasiPercentage = realisasiDateTotals[dateCols[dateCols.length - 1]] || 0;

    return {
      plan: totalPercentageFromTable,
      actual: totalPercentageFromTable,
      target: totalTargetPercentage,
      realisasi: totalRealisasiPercentage,
      totalWeight: totalWeight,
      isValidWeight: totalWeight <= 100,
      totalTasks: tasks.length + targetTasks.length + realisasiTasks.length,
      completedTasks: tasks.filter(t => parseDecimalValue(t.actual_progress) >= 100).length +
                     targetTasks.filter(t => parseDecimalValue(t.plan_progress) >= 100).length +
                     realisasiTasks.filter(t => parseDecimalValue(t.actual_progress) >= 100).length,
      totalUploaded: tasks.filter(t => t.proof_url || t.is_uploaded).length +
                     targetTasks.filter(t => t.proof_url || t.is_uploaded).length +
                     realisasiTasks.filter(t => t.proof_url || t.is_uploaded).length
    };
  }, [tasks, targetTasks, realisasiTasks, dateCols]);

  const statusDistribution = useMemo(() => {
    const statusCount = tasks.reduce((acc, task) => {
      const progress = parseDecimalValue(task.actual_progress);
      let status = "Not Started";
      if (progress > 0 && progress < 100) status = "In Progress";
      else if (progress >= 100) status = "Completed";
      
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(statusCount).map(([name, value]) => ({ name, value }));
  }, [tasks]);

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

  // Fungsi untuk menambah catatan
  const addNote = async () => {
    if (!newNote.trim() || !projectId) return;

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    let audioUrl = null;
    
    // Upload audio jika ada
    if (audioFile) {
      try {
        const safeProject = encodeURIComponent(projectId);
        const safeFileName = `${Date.now()}_${audioFile.name}`;
        const remoteName = `${safeProject}/notes/${safeFileName}`;
        
        // Upload ke dual storage
        const result = await DualStorage.upload(audioFile, remoteName, 'proofs');
        
        if (result.success && result.url) {
          audioUrl = result.url;
        }
      } catch (error) {
        console.error("Error uploading audio:", error);
      }
    }

    // Simpan note ke database
    const { error } = await supabase.from("project_notes").insert({
      project_id: projectId,
      content: newNote,
      audio_url: audioUrl,
      created_by: userId || "unknown",
    });

    if (!error) {
      setNewNote("");
      setAudioFile(null);
    } else {
      console.error("Error saving note:", error);
    }
  };

  // Komponen untuk menampilkan tabel dengan data dari Silver
  const renderTaskTable = (taskData: TaskType[], title: string, showTarget: boolean = true, showRealisasi: boolean = true) => {
    // Hitung total untuk tabel ini
    const dateTotals = calculateDateTotals(taskData);
    
    return (
      <div className="bg-white rounded shadow mb-6">
        <div className="bg-gray-50 border-b p-4">
          <h3 className="font-semibold text-lg">{title}</h3>
          <div className="text-sm text-gray-600 mt-1">
            Total Data: {taskData.length} rows | Total Progress: {dateTotals[dateCols[dateCols.length - 1]]?.toFixed(2) || "0"}%
          </div>
        </div>
        <div className="overflow-auto max-h-[500px]">
          <table className="min-w-full border text-sm text-gray-700">
            <thead className="bg-gray-100 sticky top-0">
              <tr>
                <th className="border px-2 py-2 text-center w-12">NO</th>
                <th className="border px-3 py-2 text-left min-w-[200px]">DESCRIPTION</th>
                <th className="border px-2 py-2 text-center min-w-[80px]">BOBOT %</th>
                {showTarget && <th className="border px-2 py-2 text-center min-w-[100px]">TARGET %</th>}
                {showRealisasi && <th className="border px-2 py-2 text-center min-w-[100px]">REALISASI %</th>}
                <th className="border px-2 py-2 text-center min-w-[150px]">LOKASI</th>
                {dateCols.map((date, idx) => (
                  <th key={idx} className="border px-2 py-2 text-center min-w-[120px] text-xs">
                    {date || `Tanggal ${idx + 1}`}
                  </th>
                ))}
                <th className="border px-2 py-2 text-center min-w-[100px]">UPLOAD</th>
                <th className="border px-2 py-2 text-center min-w-[80px]">STATUS</th>
              </tr>
            </thead>
            <tbody>
              {taskData.length === 0 ? (
                <tr>
                  <td colSpan={7 + dateCols.length} className="text-center py-8 text-gray-500">
                    <div className="text-2xl mb-2">📊</div>
                    <p>Belum ada data task</p>
                  </td>
                </tr>
              ) : (
                <>
                  {taskData.map((task, i) => {
                    const progress = showRealisasi ? parseDecimalValue(task.actual_progress) : parseDecimalValue(task.plan_progress);
                    const isCompleted = progress >= 100;
                    const isInProgress = progress > 0 && progress < 100;
                    
                    return (
                      <tr
                        key={task.id || i}
                        className={`hover:bg-gray-50 ${
                          isCompleted ? 'bg-green-50' :
                          isInProgress ? 'bg-yellow-50' :
                          task.color === "red" ? "bg-red-50" :
                          task.color === "yellow" ? "bg-yellow-50" :
                          task.color === "green" ? "bg-green-50" : ""
                        }`}
                      >
                        <td className="border px-2 py-2 text-center font-medium">{i + 1}</td>
                        <td className="border px-3 py-2 text-left">
                          <div className="font-medium">{task.description || "-"}</div>
                          {task.row_index && (
                            <div className="text-xs text-gray-500">Row: {task.row_index}</div>
                          )}
                        </td>
                        <td className="border px-2 py-2 text-center">
                          <span className="font-semibold">{parseDecimalValue(task.weight).toFixed(1)}%</span>
                        </td>
                        {showTarget && (
                          <td className="border px-2 py-2 text-center">
                            <span className={`px-2 py-1 rounded text-xs ${
                              parseDecimalValue(task.plan_progress) >= 100 ? 'bg-green-100 text-green-800' :
                              parseDecimalValue(task.plan_progress) > 0 ? 'bg-blue-100 text-blue-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {parseDecimalValue(task.plan_progress).toFixed(1)}%
                            </span>
                          </td>
                        )}
                        {showRealisasi && (
                          <td className="border px-2 py-2 text-center">
                            <span className={`px-2 py-1 rounded text-xs ${
                              parseDecimalValue(task.actual_progress) >= 100 ? 'bg-green-100 text-green-800' :
                              parseDecimalValue(task.actual_progress) > 0 ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {parseDecimalValue(task.actual_progress).toFixed(1)}%
                            </span>
                          </td>
                        )}
                        <td className="border px-2 py-2 text-center text-xs">
                          {task.location ? (
                            <span className="text-blue-600" title={task.location}>
                              📍 {task.location.length > 20 ? task.location.substring(0, 20) + '...' : task.location}
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                        {dateCols.map((date, idx) => (
                          <td key={idx} className="border px-2 py-2 text-center text-xs">
                            {task.dates?.[date] ? parseDecimalValue(task.dates[date]).toFixed(1) : "-"}
                          </td>
                        ))}
                        <td className="border px-2 py-2 text-center">
                          {task.proof_url || task.is_uploaded ? (
                            <a 
                              href={task.proof_url || "#"} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-green-600 hover:text-green-800 text-xs font-medium"
                            >
                              ✅ Uploaded
                            </a>
                          ) : (
                            <span className="text-red-600 text-xs">❌ Belum</span>
                          )}
                        </td>
                        <td className="border px-2 py-2 text-center">
                          <span className={`px-2 py-1 rounded text-xs ${
                            isCompleted ? 'bg-green-100 text-green-800' :
                            isInProgress ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {isCompleted ? 'Selesai' : isInProgress ? 'Progress' : 'Belum'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  
                  {/* Total Row */}
                  <tr className="bg-blue-50 font-semibold">
                    <td className="border px-2 py-2 text-center" colSpan={2}>TOTAL %</td>
                    <td className="border px-2 py-2 text-center">
                      {taskData.reduce((sum, task) => sum + parseDecimalValue(task.weight), 0).toFixed(1)}%
                    </td>
                    {showTarget && (
                      <td className="border px-2 py-2 text-center">
                        {taskData.reduce((sum, task) => sum + parseDecimalValue(task.plan_progress), 0).toFixed(1)}%
                      </td>
                    )}
                    {showRealisasi && (
                      <td className="border px-2 py-2 text-center">
                        {taskData.reduce((sum, task) => sum + parseDecimalValue(task.actual_progress), 0).toFixed(1)}%
                      </td>
                    )}
                    <td className="border px-2 py-2 text-center">-</td>
                    {dateCols.map((date, idx) => (
                      <td key={idx} className="border px-2 py-2 text-center font-medium">
                        {dateTotals[date]?.toFixed(1) || "0.0"}%
                      </td>
                    ))}
                    <td className="border px-2 py-2 text-center" colSpan={2}>
                      {taskData.filter(t => t.proof_url || t.is_uploaded).length} / {taskData.length}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Render comparison chart antara Planning, Target, dan Realisasi
  const renderComparisonChart = () => {
    const comparisonData = dateCols.map(date => {
      // Hitung kumulatif untuk setiap tanggal
      const planningTotal = calculateDateTotals(tasks)[date] || 0;
      const targetTotal = calculateDateTotals(targetTasks)[date] || 0;
      const realisasiTotal = calculateDateTotals(realisasiTasks)[date] || 0;
      
      return {
        date,
        Planning: planningTotal,
        Target: targetTotal,
        Realisasi: realisasiTotal,
        Gap: Math.max(0, targetTotal - realisasiTotal)
      };
    });

    return (
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h3 className="font-semibold mb-4">📊 Perbandingan Planning vs Target vs Realisasi</h3>
        <div style={{ width: "100%", height: 400 }}>
          <ResponsiveContainer>
            <LineChart data={comparisonData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                angle={-45}
                textAnchor="end"
                height={60}
                interval={0}
                tick={{ fontSize: 10 }}
              />
              <YAxis 
                label={{ 
                  value: 'Progress (%)', 
                  angle: -90, 
                  position: 'insideLeft',
                  offset: -5,
                  style: { textAnchor: 'middle', fontSize: 12 }
                }}
              />
              <Tooltip />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="Planning" 
                stroke="#3b82f6" 
                strokeWidth={3}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line 
                type="monotone" 
                dataKey="Target" 
                stroke="#10b981" 
                strokeWidth={3}
                strokeDasharray="5 5"
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line 
                type="monotone" 
                dataKey="Realisasi" 
                stroke="#ef4444" 
                strokeWidth={3}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Area 
                type="monotone" 
                dataKey="Gap" 
                stroke="#f59e0b" 
                fill="#f59e0b" 
                fillOpacity={0.3}
                strokeWidth={1}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="p-3 bg-blue-50 rounded border">
            <div className="font-semibold text-blue-800">Planning</div>
            <div className="text-2xl font-bold">{progressSummary.plan.toFixed(1)}%</div>
            <div className="text-xs text-blue-600 mt-1">Total progress dari tab Planning</div>
          </div>
          <div className="p-3 bg-green-50 rounded border">
            <div className="font-semibold text-green-800">Target</div>
            <div className="text-2xl font-bold">{progressSummary.target.toFixed(1)}%</div>
            <div className="text-xs text-green-600 mt-1">Target yang ditetapkan</div>
          </div>
          <div className="p-3 bg-red-50 rounded border">
            <div className="font-semibold text-red-800">Realisasi</div>
            <div className="text-2xl font-bold">{progressSummary.realisasi.toFixed(1)}%</div>
            <div className="text-xs text-red-600 mt-1">Progress aktual lapangan</div>
          </div>
        </div>
        <div className="mt-4 p-3 bg-yellow-50 rounded border">
          <div className="text-sm text-yellow-800">
            <strong>Keterangan:</strong> Chart menunjukkan perbandingan progress antara planning (biru), target (hijau putus-putus), dan realisasi (merah). Area kuning menunjukkan gap antara target dan realisasi.
          </div>
        </div>
      </div>
    );
  };

  // Render project info panel
  const renderProjectInfoPanel = () => (
    <div className="bg-white p-4 rounded shadow mb-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold">📋 Informasi Proyek</h3>
        <div className="text-xs text-gray-500">
          Sinkron dengan Silver App
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">KODE PROYEK</label>
          <div className="font-semibold text-gray-800 p-2 border rounded bg-gray-50 min-h-[42px]">
            {metaProject.project_code || "P-EUI-000-Tanggal"}
          </div>
        </div>
        
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">JOB NAME</label>
          <div className="font-semibold text-gray-800 p-2 border rounded bg-gray-50 min-h-[42px]">
            {metaProject.job_name || "-"}
          </div>
        </div>
        
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">CLIENT</label>
          <div className="font-semibold text-gray-800 p-2 border rounded bg-gray-50 min-h-[42px]">
            {metaProject.client || "-"}
          </div>
        </div>
        
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">ALAMAT</label>
          <div className="font-semibold text-gray-800 p-2 border rounded bg-gray-50 min-h-[42px]">
            {metaProject.address || "-"}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">TANGGAL</label>
          <div className="font-semibold text-gray-800 p-2 border rounded bg-gray-50 min-h-[42px]">
            {metaProject.date || "-"}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">DEADLINE</label>
          <div className="font-semibold text-gray-800 p-2 border rounded bg-gray-50 min-h-[42px]">
            {metaProject.deadline || "-"}
          </div>
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">TIME SCHEDULE</label>
          <div className="font-semibold text-gray-800 p-2 border rounded bg-gray-50 min-h-[42px]">
            {metaProject.time_schedule || "-"}
          </div>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-600">
        Memuat data master dashboard...
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* header + kop proyek */}
      <header className="mb-6">
        <div className="flex justify-between items-center bg-blue-800 text-white p-4 rounded-md shadow">
          <div className="flex items-center gap-4">
            <div className="bg-white p-2 rounded">
              <div className="text-blue-800 font-bold text-lg">MASTER</div>
            </div>
            <div>
              <h1 className="text-2xl font-bold">
                PT ELEKTRINDO UTAMA INDONESIA<br />
                <span className="text-sm font-normal">
                  MECHANICAL – ELECTRICAL – FIRE PROTECTION SYSTEM
                </span>
              </h1>
              <div className="mt-2 text-blue-200">
                <strong>MASTER MONITORING DASHBOARD</strong> — {projectName}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <UserProfile />
            <div className="flex gap-2">
              <button
                onClick={() => window.open(`/silver/${projectId}`, '_blank')}
                className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded text-sm font-medium"
              >
                Buka Silver App
              </button>
              <button
                onClick={() => router.push("/projects")}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm font-medium"
              >
                Kembali ke Projects
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Online Users dari Silver App */}
      <OnlineUsers />

      {/* Project Info Panel */}
      {renderProjectInfoPanel()}

      {/* Navigation Tabs */}
      <div className="mb-6 bg-white rounded-lg shadow">
        <div className="flex border-b overflow-x-auto">
          {[
            { id: "overview", label: "📊 Overview", icon: "📊" },
            { id: "comparison", label: "📈 Perbandingan", icon: "📈" },
            { id: "tasks", label: "📋 Semua Tasks", icon: "📋" },
            { id: "location", label: "🗺️ Lokasi", icon: "🗺️" },
            { id: "documents", label: "📎 Dokumen", icon: "📎" },
            { id: "notes", label: "📝 Catatan", icon: "📝" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-6 py-3 border-b-2 font-medium text-sm whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-blue-500 text-blue-600 bg-blue-50"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-lg shadow border">
              <div className="flex items-center">
                <div className="rounded-full bg-blue-100 p-3">
                  <span className="text-blue-600 text-xl">📈</span>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Progress Rencana</p>
                  <p className="text-2xl font-bold text-gray-900">{progressSummary.plan.toFixed(1)}%</p>
                  <p className="text-xs text-gray-500 mt-1">Dari {tasks.length} tasks</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow border">
              <div className="flex items-center">
                <div className="rounded-full bg-green-100 p-3">
                  <span className="text-green-600 text-xl">🎯</span>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Progress Target</p>
                  <p className="text-2xl font-bold text-gray-900">{progressSummary.target.toFixed(1)}%</p>
                  <p className="text-xs text-gray-500 mt-1">Dari {targetTasks.length} tasks</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow border">
              <div className="flex items-center">
                <div className="rounded-full bg-red-100 p-3">
                  <span className="text-red-600 text-xl">✅</span>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Progress Realisasi</p>
                  <p className="text-2xl font-bold text-gray-900">{progressSummary.realisasi.toFixed(1)}%</p>
                  <p className="text-xs text-gray-500 mt-1">Dari {realisasiTasks.length} tasks</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow border">
              <div className="flex items-center">
                <div className="rounded-full bg-purple-100 p-3">
                  <span className="text-purple-600 text-xl">📊</span>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Upload</p>
                  <p className="text-2xl font-bold text-gray-900">{progressSummary.totalUploaded}</p>
                  <p className="text-xs text-gray-500 mt-1">Dokumen terupload</p>
                </div>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="font-semibold mb-4">Kurva S - Progress per Tanggal (Planning)</h3>
              <div style={{ width: "100%", height: 300 }}>
                <ResponsiveContainer>
                  {planningChartData.length > 0 ? (
                    <LineChart data={planningChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="date" 
                        angle={-45}
                        textAnchor="end"
                        height={60}
                        interval={0}
                        tick={{ fontSize: 10 }}
                      />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="totalProgress" 
                        stroke="#3b82f6" 
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                        name="Total Progress"
                      />
                    </LineChart>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-500">
                      <div className="text-center">
                        <div className="text-4xl mb-2">📊</div>
                        <p>Belum ada data progress per tanggal</p>
                        <p className="text-sm">Data akan muncul setelah diisi di Silver App</p>
                      </div>
                    </div>
                  )}
                </ResponsiveContainer>
              </div>
              <div className="mt-2 text-sm text-gray-600">
                <p>• Menunjukkan progress kumulatif per tanggal dari tab Planning</p>
                <p>• Data sinkron real-time dengan Silver App</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="font-semibold mb-4">Distribusi Status Task (Planning)</h3>
              <div style={{ width: "100%", height: 300 }}>
                <ResponsiveContainer>
                  {statusDistribution.length > 0 ? (
                    <PieChart>
                      <Pie
                        data={statusDistribution}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} (${((percent || 0) * 100).toFixed(0)}%)`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {statusDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-500">
                      <div className="text-center">
                        <div className="text-4xl mb-2">📋</div>
                        <p>Belum ada data task</p>
                        <p className="text-sm">Data akan muncul setelah diisi di Silver App</p>
                      </div>
                    </div>
                  )}
                </ResponsiveContainer>
              </div>
              <div className="mt-2 text-sm text-gray-600">
                <p>• Menunjukkan distribusi status task dari tab Planning</p>
                <p>• Update real-time saat tim lapangan mengupdate progress</p>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="font-semibold mb-4">Aktivitas Terkini</h3>
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {shipments.slice(0, 10).map((shipment, index) => (
                <div key={shipment.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Update Lokasi Lapangan</p>
                    <p className="text-xs text-gray-600">{shipment.address}</p>
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(shipment.created_at).toLocaleTimeString('id-ID')}
                    <div className="text-xs">
                      {new Date(shipment.created_at).toLocaleDateString('id-ID')}
                    </div>
                  </div>
                </div>
              ))}
              {notes.slice(0, 5).map((note, index) => (
                <div key={note.id} className="flex items-center gap-3 p-3 bg-blue-50 rounded">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Catatan Lapangan</p>
                    <p className="text-xs text-gray-600">{note.content.substring(0, 60)}...</p>
                    <p className="text-xs text-gray-500 mt-1">Oleh: {note.created_by}</p>
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(note.created_at).toLocaleTimeString('id-ID')}
                  </div>
                </div>
              ))}
              {shipments.length === 0 && notes.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <div className="text-4xl mb-2">📝</div>
                  <p>Belum ada aktivitas terkini</p>
                  <p className="text-sm">Tim lapangan belum mengupdate data</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Comparison Tab */}
      {activeTab === "comparison" && (
        <div className="space-y-6">
          {renderComparisonChart()}
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="font-semibold mb-4">📈 Kurva S Target</h3>
              <div style={{ width: "100%", height: 300 }}>
                <ResponsiveContainer>
                  {targetChartData.length > 0 ? (
                    <LineChart data={targetChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="date" 
                        angle={-45}
                        textAnchor="end"
                        height={60}
                        interval={0}
                        tick={{ fontSize: 10 }}
                      />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="totalProgress" 
                        stroke="#10b981" 
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                        name="Total Progress"
                      />
                    </LineChart>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-500">
                      <div className="text-center">
                        <div className="text-4xl mb-2">🎯</div>
                        <p>Belum ada data target</p>
                        <p className="text-sm">Data akan muncul setelah diisi di Silver App Tab Target</p>
                      </div>
                    </div>
                  )}
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="font-semibold mb-4">📈 Kurva S Realisasi</h3>
              <div style={{ width: "100%", height: 300 }}>
                <ResponsiveContainer>
                  {realisasiChartData.length > 0 ? (
                    <LineChart data={realisasiChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="date" 
                        angle={-45}
                        textAnchor="end"
                        height={60}
                        interval={0}
                        tick={{ fontSize: 10 }}
                      />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="totalProgress" 
                        stroke="#ef4444" 
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                        name="Total Progress"
                      />
                    </LineChart>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-500">
                      <div className="text-center">
                        <div className="text-4xl mb-2">✅</div>
                        <p>Belum ada data realisasi</p>
                        <p className="text-sm">Data akan muncul setelah diisi di Silver App Tab Realisasi</p>
                      </div>
                    </div>
                  )}
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="font-semibold mb-4">📊 Statistik Perbandingan</h3>
              <div className="space-y-4">
                <div className="p-3 bg-blue-50 rounded border">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Planning vs Target</span>
                    <span className={`font-bold ${Math.abs(progressSummary.plan - progressSummary.target) < 5 ? 'text-green-600' : 'text-red-600'}`}>
                      {Math.abs(progressSummary.plan - progressSummary.target).toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    {progressSummary.plan >= progressSummary.target ? 'Planning sesuai target' : 'Planning di bawah target'}
                  </div>
                </div>

                <div className="p-3 bg-green-50 rounded border">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Target vs Realisasi</span>
                    <span className={`font-bold ${Math.abs(progressSummary.target - progressSummary.realisasi) < 5 ? 'text-green-600' : 'text-red-600'}`}>
                      {Math.abs(progressSummary.target - progressSummary.realisasi).toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    {progressSummary.realisasi >= progressSummary.target ? 'Realisasi sesuai target' : 'Realisasi di bawah target'}
                  </div>
                </div>

                <div className="p-3 bg-yellow-50 rounded border">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Planning vs Realisasi</span>
                    <span className={`font-bold ${Math.abs(progressSummary.plan - progressSummary.realisasi) < 5 ? 'text-green-600' : 'text-red-600'}`}>
                      {Math.abs(progressSummary.plan - progressSummary.realisasi).toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    {progressSummary.realisasi >= progressSummary.plan ? 'Realisasi sesuai planning' : 'Realisasi di bawah planning'}
                  </div>
                </div>

                <div className="p-3 bg-gray-50 rounded border">
                  <div className="font-medium mb-2">Summary Progress</div>
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span>Total Bobot:</span>
                      <span className="font-semibold">{progressSummary.totalWeight.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Status Bobot:</span>
                      <span className={`font-semibold ${progressSummary.isValidWeight ? 'text-green-600' : 'text-red-600'}`}>
                        {progressSummary.isValidWeight ? 'VALID' : 'INVALID (>100%)'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Tasks:</span>
                      <span className="font-semibold">{progressSummary.totalTasks}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Selesai:</span>
                      <span className="font-semibold">{progressSummary.completedTasks}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tasks Tab */}
      {activeTab === "tasks" && (
        <div className="space-y-6">
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <h3 className="font-semibold text-blue-800 mb-2">📋 Data Tasks dari Silver App</h3>
            <p className="text-sm text-blue-700">
              Data ini ditampilkan dari localStorage Silver App yang disinkronkan secara real-time. 
              Anda dapat melihat semua tabel dari Planning, Target, dan Realisasi dalam satu dashboard.
            </p>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                <span>Planning: <strong>{tasks.length}</strong> tasks</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span>Target: <strong>{targetTasks.length}</strong> tasks</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <span>Realisasi: <strong>{realisasiTasks.length}</strong> tasks</span>
              </div>
            </div>
          </div>

          {renderTaskTable(tasks, "Tabel Planning - Target vs Realisasi", true, true)}
          {renderTaskTable(targetTasks, "Tabel Target", true, false)}
          {renderTaskTable(realisasiTasks, "Tabel Realisasi", false, true)}
        </div>
      )}

      {/* Location Tab */}
      {activeTab === "location" && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="font-semibold mb-4">🗺️ Peta Tracking Real-time</h3>
            <MapTracking projectId={projectId} />
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold">📋 Riwayat Lokasi Lapangan</h3>
              <div className="text-sm text-gray-500">
                Total: {shipments.length} lokasi
              </div>
            </div>
            <div className="overflow-auto max-h-[500px]">
              <table className="min-w-full border text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="border px-4 py-2">Waktu</th>
                    <th className="border px-4 py-2">Lokasi</th>
                    <th className="border px-4 py-2">Koordinat</th>
                    <th className="border px-4 py-2">Akurasi</th>
                    <th className="border px-4 py-2">Status</th>
                    <th className="border px-4 py-2">Catatan</th>
                  </tr>
                </thead>
                <tbody>
                  {shipments.map((shipment) => (
                    <tr key={shipment.id} className="hover:bg-gray-50">
                      <td className="border px-4 py-2">
                        <div className="text-xs font-medium">
                          {new Date(shipment.created_at).toLocaleDateString('id-ID')}
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(shipment.created_at).toLocaleTimeString('id-ID')}
                        </div>
                      </td>
                      <td className="border px-4 py-2">{shipment.address}</td>
                      <td className="border px-4 py-2 text-xs font-mono">
                        {shipment.last_lat.toFixed(6)}, {shipment.last_lng.toFixed(6)}
                      </td>
                      <td className="border px-4 py-2">
                        <span className={`px-2 py-1 rounded text-xs ${
                          shipment.accuracy <= 10 ? 'bg-green-100 text-green-800' :
                          shipment.accuracy <= 50 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {Math.round(shipment.accuracy)}m
                        </span>
                      </td>
                      <td className="border px-4 py-2">
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                          {shipment.status}
                        </span>
                      </td>
                      <td className="border px-4 py-2 text-xs">
                        {shipment.item_name && (
                          <div className="font-medium">{shipment.item_name}</div>
                        )}
                        {shipment.notes && (
                          <div className="text-gray-600 mt-1">{shipment.notes}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {shipments.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-gray-500">
                        <div className="text-4xl mb-2">📍</div>
                        <p>Belum ada riwayat lokasi</p>
                        <p className="text-sm">Tim lapangan belum mengupdate lokasi</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Documents Tab */}
      {activeTab === "documents" && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="font-semibold mb-4">📎 Dokumen & Bukti Upload dari Silver App</h3>
          <div className="mb-4 p-3 bg-blue-50 rounded border">
            <p className="text-sm text-blue-700">
              Dokumen ini diupload melalui Silver App menggunakan Dual Storage System (Primary & Backup Supabase)
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...tasks, ...targetTasks, ...realisasiTasks]
              .filter(task => task.proof_url || task.is_uploaded)
              .map((task, index) => (
                <div key={task.id || index} className="border rounded-lg p-4 hover:shadow-md transition-shadow bg-white">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 text-lg">📎</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{task.description || `Task ${index + 1}`}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs px-2 py-1 bg-gray-100 rounded">
                          {task.plan_progress ? `Target: ${parseDecimalValue(task.plan_progress).toFixed(1)}%` : ''}
                          {task.actual_progress ? `Realisasi: ${parseDecimalValue(task.actual_progress).toFixed(1)}%` : ''}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded ${
                          task.is_uploaded ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {task.is_uploaded ? '✅ Dual Storage' : '📎 Single'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={task.proof_url!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-center py-2 px-3 rounded text-sm"
                    >
                      Lihat Dokumen
                    </a>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(task.proof_url!);
                        alert('Link dokumen berhasil disalin!');
                      }}
                      className="bg-gray-100 hover:bg-gray-200 text-gray-800 py-2 px-3 rounded text-sm"
                      title="Salin link"
                    >
                      📋
                    </button>
                  </div>
                  {task.location && (
                    <div className="mt-2 text-xs text-gray-600">
                      <span className="font-medium">Lokasi:</span> {task.location}
                    </div>
                  )}
                </div>
              ))}
            {[...tasks, ...targetTasks, ...realisasiTasks].filter(task => task.proof_url || task.is_uploaded).length === 0 && (
              <div className="col-span-full text-center py-12 text-gray-500">
                <div className="text-6xl mb-4">📎</div>
                <p className="text-lg font-medium">Belum ada dokumen yang diupload</p>
                <p className="text-sm mt-2">Tim lapangan belum mengupload dokumen melalui Silver App</p>
                <button
                  onClick={() => window.open(`/silver/${projectId}`, '_blank')}
                  className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm"
                >
                  Buka Silver App untuk Upload
                </button>
              </div>
            )}
          </div>
          
          {/* Summary */}
          {[...tasks, ...targetTasks, ...realisasiTasks].filter(task => task.proof_url || task.is_uploaded).length > 0 && (
            <div className="mt-6 p-4 bg-gray-50 rounded border">
              <h4 className="font-semibold mb-2">📊 Statistik Upload</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="p-2 bg-white rounded border">
                  <div className="font-medium">Total Upload</div>
                  <div className="text-2xl font-bold text-blue-600">
                    {[...tasks, ...targetTasks, ...realisasiTasks].filter(task => task.proof_url || task.is_uploaded).length}
                  </div>
                </div>
                <div className="p-2 bg-white rounded border">
                  <div className="font-medium">Dual Storage</div>
                  <div className="text-2xl font-bold text-green-600">
                    {[...tasks, ...targetTasks, ...realisasiTasks].filter(task => task.is_uploaded).length}
                  </div>
                </div>
                <div className="p-2 bg-white rounded border">
                  <div className="font-medium">Persentase Upload</div>
                  <div className="text-2xl font-bold text-purple-600">
                    {(([...tasks, ...targetTasks, ...realisasiTasks].filter(task => task.proof_url || task.is_uploaded).length / 
                      [...tasks, ...targetTasks, ...realisasiTasks].length) * 100 || 0).toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Notes Tab */}
      {activeTab === "notes" && (
        <div className="space-y-6">
          {/* Input Note */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="font-semibold mb-4">Tambah Catatan (Master)</h3>
            <div className="space-y-4">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Tulis catatan penting untuk proyek ini..."
                className="w-full h-32 p-3 border rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tambah Voice Note (Opsional)
                  </label>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
                    className="w-full"
                  />
                </div>
                <button
                  onClick={addNote}
                  disabled={!newNote.trim()}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg font-medium mt-6"
                >
                  Simpan Catatan
                </button>
              </div>
              {audioFile && (
                <p className="text-sm text-green-600">
                  ✅ File audio siap diupload ke DUAL storage: {audioFile.name}
                </p>
              )}
            </div>
          </div>

          {/* List Notes */}
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold">Catatan Proyek</h3>
              <div className="text-sm text-gray-500">
                Total: {notes.length} catatan
              </div>
            </div>
            <div className="space-y-4">
              {notes.map((note) => (
                <div key={note.id} className="border rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                      <span className="text-sm text-gray-600">
                        {new Date(note.created_at).toLocaleString('id-ID')}
                      </span>
                      <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">
                        {note.created_by}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(note.updated_at).toLocaleTimeString('id-ID')}
                    </div>
                  </div>
                  <p className="text-gray-800 whitespace-pre-wrap">{note.content}</p>
                  {note.audio_url && (
                    <div className="mt-3 pt-3 border-t">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-medium">Voice Note:</span>
                        <a
                          href={note.audio_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          Download Audio
                        </a>
                      </div>
                      <audio controls className="w-full">
                        <source src={note.audio_url} type="audio/mpeg" />
                        Browser Anda tidak mendukung pemutar audio.
                      </audio>
                    </div>
                  )}
                </div>
              ))}
              {notes.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <div className="text-6xl mb-4">📝</div>
                  <p className="text-lg font-medium">Belum ada catatan</p>
                  <p className="text-sm mt-2">Tambahkan catatan pertama untuk proyek ini</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-8 bg-white p-6 rounded-lg shadow">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
          <div>
            <strong className="text-blue-800">KETERANGAN MASTER DASHBOARD:</strong>
            <ol className="list-decimal list-inside mt-2 text-gray-700 space-y-1">
              <li>Dashboard monitoring ini menampilkan data real-time dari tim lapangan melalui Silver App</li>
              <li>Semua data tersinkronisasi otomatis dengan localStorage Silver App</li>
              <li>Dual Storage System memastikan keamanan dokumen di dua server Supabase</li>
              <li>Progress dihitung secara kumulatif sesuai implementasi Silver App</li>
            </ol>
          </div>
          <div className="text-center">
            <div className="text-blue-800 font-semibold mb-2">STATUS SINKRONISASI</div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span>Silver App Data:</span>
                <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                  ✅ TERSINKRON
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Database Real-time:</span>
                <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                  ✅ AKTIF
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>User Online:</span>
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                  👥 {onlineUsers.length} USERS
                </span>
              </div>
            </div>
          </div>
          <div className="text-center">
            <div className="mt-4 font-semibold text-blue-800">Disetujui oleh:</div>
            <div className="mt-10 underline font-medium">Rudi Winarto</div>
            <div className="text-gray-600">PT Elektrindo Utama Indonesia</div>
            <div className="mt-6 text-xs text-gray-500">
              Master Dashboard v2.0<br />
              Terintegrasi dengan Silver App
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}