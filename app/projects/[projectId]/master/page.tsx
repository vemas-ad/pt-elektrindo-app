"use client";

import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";
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
} from "recharts";

const MapTracking = dynamic(() => import("../../../components/MapTracking"), { ssr: false });

type TaskType = {
  id: string;
  project_id?: string;
  row_index?: number;
  description?: string | null;
  plan_progress?: number | null;
  actual_progress?: number | null;
  color?: string | null;
  location?: string | null;
  proof_url?: string | null;
  weight?: number | null;
  dates?: Record<string, any> | null;
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
  const [activeTab, setActiveTab] = useState<"overview" | "tasks" | "location" | "documents" | "notes">("overview");
  const [newNote, setNewNote] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [dateCols, setDateCols] = useState<string[]>([]);

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
      setLoading(false);
    })();
  }, [projectId, router]);

  const loadProjectData = async () => {
    if (!projectId) return;

    // Load project info
    const pr = await supabase.from("projects").select("name, meta").eq("id", projectId).single();
    setProjectName(pr.data?.name || `Project ${projectId}`);

    // Load tasks dari semua jenis (planning, target, realisasi)
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
    }

    // Load target dan realisasi dari localStorage Silver
    const LS_TARGET_KEY = `silver:${projectId}:target_rows`;
    const LS_REALISASI_KEY = `silver:${projectId}:realisasi_rows`;
    
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

  const setupRealtimeSubscriptions = () => {
    if (!projectId) return;

    // Realtime untuk tasks
    const taskCh = supabase
      .channel(`public:tasks:project_${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `project_id=eq.${projectId}` },
        (payload) => {
          if (payload.eventType === "UPDATE" || payload.eventType === "INSERT") {
            setTasks((prev) => {
              const newRow = payload.new as TaskType;
              const found = prev.find((p) => p.id === newRow.id);
              if (found) return prev.map((r) => (r.id === newRow.id ? newRow : r));
              return [newRow, ...prev];
            });
          } else if (payload.eventType === "DELETE") {
            setTasks((prev) => prev.filter((r) => r.id !== payload.old.id));
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
        (payload) => {
          if (payload.new) setShipments((prev) => [payload.new as ShipmentType, ...prev]);
        }
      )
      .subscribe();

    // Realtime untuk notes
    const noteCh = supabase
      .channel(`public:project_notes:project_${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_notes", filter: `project_id=eq.${projectId}` },
        (payload) => {
          if (payload.new) setNotes((prev) => [payload.new as NoteType, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(taskCh);
      supabase.removeChannel(shipCh);
      supabase.removeChannel(noteCh);
    };
  };

  // data chart
  const chartData = useMemo(
    () =>
      tasks.map((t, i) => ({
        name: `${i + 1}`,
        Plan: Number(t.plan_progress ?? 0),
        Actual: Number(t.actual_progress ?? 0),
        description: t.description?.substring(0, 20) || `Task ${i + 1}`,
      })),
    [tasks]
  );

  const progressSummary = useMemo(() => {
    const totalWeight = tasks.reduce((sum, task) => sum + Number(task.weight || 0), 0);
    const weightedPlan = totalWeight > 0 ? 
      tasks.reduce((sum, task) => sum + (Number(task.weight || 0) * Number(task.plan_progress || 0) / 100), 0) : 0;
    const weightedActual = totalWeight > 0 ? 
      tasks.reduce((sum, task) => sum + (Number(task.weight || 0) * Number(task.actual_progress || 0) / 100), 0) : 0;

    const simplePlan = tasks.reduce((sum, task) => sum + Number(task.plan_progress || 0), 0) / Math.max(tasks.length, 1);
    const simpleActual = tasks.reduce((sum, task) => sum + Number(task.actual_progress || 0), 0) / Math.max(tasks.length, 1);

    return {
      plan: weightedPlan > 0 ? weightedPlan : simplePlan,
      actual: weightedActual > 0 ? weightedActual : simpleActual,
      totalTasks: tasks.length,
      completedTasks: tasks.filter(t => Number(t.actual_progress || 0) >= 100).length,
    };
  }, [tasks]);

  const statusDistribution = useMemo(() => {
    const statusCount = tasks.reduce((acc, task) => {
      const progress = Number(task.actual_progress || 0);
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
        
        const { error: uploadError } = await supabase.storage
          .from("proofs")
          .upload(remoteName, audioFile);
          
        if (!uploadError) {
          const baseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
          audioUrl = `${baseUrl}/storage/v1/object/public/proofs/${remoteName}`;
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
  const renderTaskTable = (taskData: TaskType[], title: string, showTarget: boolean = true, showRealisasi: boolean = true) => (
    <div className="bg-white rounded shadow mb-6">
      <div className="bg-gray-50 border-b p-4">
        <h3 className="font-semibold text-lg">{title}</h3>
      </div>
      <div className="overflow-auto">
        <table className="min-w-full border text-sm text-gray-700">
          <thead className="bg-gray-100 sticky top-0">
            <tr>
              <th className="border px-2 py-2 text-center w-12">NO</th>
              <th className="border px-3 py-2 text-left min-w-[200px]">DESCRIPTION</th>
              <th className="border px-2 py-2 text-center min-w-[80px]">BOBOT %</th>
              {showTarget && <th className="border px-2 py-2 text-center min-w-[100px]">TARGET %</th>}
              {showRealisasi && <th className="border px-2 py-2 text-center min-w-[100px]">REALISASI %</th>}
              <th className="border px-2 py-2 text-center min-w-[80px]">WARNA</th>
              <th className="border px-2 py-2 text-center min-w-[150px]">LOKASI</th>
              {dateCols.map((date, idx) => (
                <th key={idx} className="border px-2 py-2 text-center min-w-[120px] text-xs">
                  {date}
                </th>
              ))}
              <th className="border px-2 py-2 text-center min-w-[100px]">UPLOAD</th>
            </tr>
          </thead>
          <tbody>
            {taskData.length === 0 ? (
              <tr>
                <td colSpan={8 + dateCols.length} className="text-center py-4 text-gray-500">
                  Belum ada data task
                </td>
              </tr>
            ) : (
              taskData.map((task, i) => (
                <tr
                  key={task.id || i}
                  className={`hover:bg-gray-50 ${
                    task.color === "red"
                      ? "bg-red-50"
                      : task.color === "yellow"
                      ? "bg-yellow-50"
                      : task.color === "green"
                      ? "bg-green-50"
                      : ""
                  }`}
                >
                  <td className="border px-2 py-2 text-center">{i + 1}</td>
                  <td className="border px-3 py-2 text-left">{task.description || "-"}</td>
                  <td className="border px-2 py-2 text-center">{task.weight ?? 0}%</td>
                  {showTarget && (
                    <td className="border px-2 py-2 text-center">
                      <span className={`px-2 py-1 rounded text-xs ${
                        Number(task.plan_progress || 0) >= 100 ? 'bg-green-100 text-green-800' :
                        Number(task.plan_progress || 0) > 0 ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {task.plan_progress ?? 0}%
                      </span>
                    </td>
                  )}
                  {showRealisasi && (
                    <td className="border px-2 py-2 text-center">
                      <span className={`px-2 py-1 rounded text-xs ${
                        Number(task.actual_progress || 0) >= 100 ? 'bg-green-100 text-green-800' :
                        Number(task.actual_progress || 0) > 0 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {task.actual_progress ?? 0}%
                      </span>
                    </td>
                  )}
                  <td className="border px-2 py-2 text-center">
                    {task.color && (
                      <div 
                        className="w-4 h-4 rounded-full mx-auto border"
                        style={{ backgroundColor: task.color }}
                        title={task.color}
                      />
                    )}
                  </td>
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
                      {task.dates?.[date] || "-"}
                    </td>
                  ))}
                  <td className="border px-2 py-2 text-center">
                    {task.proof_url ? (
                      <a 
                        href={task.proof_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 text-xs"
                      >
                        📎 Lihat
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-600">
        Memuat data...
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* header + kop proyek */}
      <header className="mb-6">
        <div className="flex justify-between items-center bg-blue-800 text-white p-4 rounded-md shadow">
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
          <div className="flex gap-2">
            <button
              onClick={() => router.push("/projects")}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm font-medium"
            >
              Kembali
            </button>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                router.push("/");
              }}
              className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded text-sm font-medium"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="mb-6 bg-white rounded-lg shadow">
        <div className="flex border-b">
          {[
            { id: "overview", label: "📊 Overview", icon: "📊" },
            { id: "tasks", label: "📋 Tasks", icon: "📋" },
            { id: "location", label: "🗺️ Lokasi", icon: "🗺️" },
            { id: "documents", label: "📎 Dokumen", icon: "📎" },
            { id: "notes", label: "📝 Catatan", icon: "📝" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-6 py-3 border-b-2 font-medium text-sm ${
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
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow border">
              <div className="flex items-center">
                <div className="rounded-full bg-green-100 p-3">
                  <span className="text-green-600 text-xl">✅</span>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Progress Aktual</p>
                  <p className="text-2xl font-bold text-gray-900">{progressSummary.actual.toFixed(1)}%</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow border">
              <div className="flex items-center">
                <div className="rounded-full bg-purple-100 p-3">
                  <span className="text-purple-600 text-xl">📋</span>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Tasks</p>
                  <p className="text-2xl font-bold text-gray-900">{progressSummary.totalTasks}</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow border">
              <div className="flex items-center">
                <div className="rounded-full bg-orange-100 p-3">
                  <span className="text-orange-600 text-xl">🎯</span>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Selesai</p>
                  <p className="text-2xl font-bold text-gray-900">{progressSummary.completedTasks}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="font-semibold mb-4">Kurva S - Progress</h3>
              <div style={{ width: "100%", height: 300 }}>
                <ResponsiveContainer>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="Plan" stroke="#3b82f6" strokeWidth={2} />
                    <Line type="monotone" dataKey="Actual" stroke="#ef4444" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="font-semibold mb-4">Distribusi Status Task</h3>
              <div style={{ width: "100%", height: 300 }}>
                <ResponsiveContainer>
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
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="font-semibold mb-4">Aktivitas Terkini</h3>
            <div className="space-y-3">
              {shipments.slice(0, 5).map((shipment, index) => (
                <div key={shipment.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Update Lokasi</p>
                    <p className="text-xs text-gray-600">{shipment.address}</p>
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(shipment.created_at).toLocaleTimeString()}
                  </div>
                </div>
              ))}
              {notes.slice(0, 3).map((note, index) => (
                <div key={note.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Catatan Baru</p>
                    <p className="text-xs text-gray-600">{note.content.substring(0, 50)}...</p>
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(note.created_at).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tasks Tab */}
      {activeTab === "tasks" && (
        <div className="space-y-6">
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
            <h3 className="font-semibold mb-4">📋 Riwayat Lokasi</h3>
            <div className="overflow-auto">
              <table className="min-w-full border text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="border px-4 py-2">Waktu</th>
                    <th className="border px-4 py-2">Lokasi</th>
                    <th className="border px-4 py-2">Koordinat</th>
                    <th className="border px-4 py-2">Akurasi</th>
                    <th className="border px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shipments.map((shipment) => (
                    <tr key={shipment.id} className="hover:bg-gray-50">
                      <td className="border px-4 py-2">
                        {new Date(shipment.created_at).toLocaleString()}
                      </td>
                      <td className="border px-4 py-2">{shipment.address}</td>
                      <td className="border px-4 py-2 text-xs">
                        {shipment.last_lat.toFixed(6)}, {shipment.last_lng.toFixed(6)}
                      </td>
                      <td className="border px-4 py-2">{Math.round(shipment.accuracy)}m</td>
                      <td className="border px-4 py-2">
                        <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                          {shipment.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Documents Tab */}
      {activeTab === "documents" && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="font-semibold mb-4">📎 Dokumen & Bukti Upload</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tasks
              .filter(task => task.proof_url)
              .map((task, index) => (
                <div key={task.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-blue-600">📎</span>
                    </div>
                    <div>
                      <p className="font-medium text-sm">{task.description || `Task ${index + 1}`}</p>
                      <p className="text-xs text-gray-600">Progress: {task.actual_progress}%</p>
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
                  </div>
                </div>
              ))}
            {tasks.filter(task => task.proof_url).length === 0 && (
              <div className="col-span-full text-center py-8 text-gray-500">
                <div className="text-4xl mb-2">📎</div>
                <p>Belum ada dokumen yang diupload</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Notes Tab */}
      {activeTab === "notes" && (
        <div className="space-y-6">
          {/* Input Note */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="font-semibold mb-4">Tambah Catatan</h3>
            <div className="space-y-4">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Tulis catatan panjang di sini..."
                className="w-full h-32 p-3 border rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              
              <div className="flex items-center gap-4">
                <input
                  type="file"
                  accept="audio/*,video/*"
                  onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
                  className="flex-1"
                />
                <button
                  onClick={addNote}
                  disabled={!newNote.trim()}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg font-medium"
                >
                  Simpan Catatan
                </button>
              </div>
              {audioFile && (
                <p className="text-sm text-green-600">
                  ✅ File audio siap diupload: {audioFile.name}
                </p>
              )}
            </div>
          </div>

          {/* List Notes */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="font-semibold mb-4">Catatan Proyek</h3>
            <div className="space-y-4">
              {notes.map((note) => (
                <div key={note.id} className="border rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                      <span className="text-sm text-gray-600">
                        {new Date(note.created_at).toLocaleString()}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500">By: {note.created_by}</span>
                  </div>
                  <p className="text-gray-800 whitespace-pre-wrap">{note.content}</p>
                  {note.audio_url && (
                    <div className="mt-3 pt-3 border-t">
                      <audio controls className="w-full">
                        <source src={note.audio_url} type="audio/mpeg" />
                        Browser Anda tidak mendukung pemutar audio.
                      </audio>
                    </div>
                  )}
                </div>
              ))}
              {notes.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <div className="text-4xl mb-2">📝</div>
                  <p>Belum ada catatan</p>
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
            <strong>KETERANGAN:</strong>
            <ol className="list-decimal list-inside mt-2 text-gray-700 space-y-1">
              <li>Dashboard monitoring ini menampilkan data real-time dari tim lapangan</li>
              <li>Semua update progress, lokasi, dan dokumen tersinkronisasi otomatis</li>
              <li>Data berasal dari aplikasi Silver yang digunakan tim di lapangan</li>
            </ol>
          </div>
          <div></div>
          <div className="text-center">
            <div className="mt-4 font-semibold">Disetujui oleh:</div>
            <div className="mt-10 underline font-medium">Rudi Winarto</div>
            <div className="text-gray-600">PT Elektrindo Utama Indonesia</div>
          </div>
        </div>
      </div>
    </div>
  );
}