// app/dashboard/master/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// load map dynamically (no SSR)
const MapTracking = dynamic(() => import("../../components/MapTracking"), {
  ssr: false,
});

type TaskType = {
  id: string | number;
  description?: string | null;
  plan_progress?: number | null;
  actual_progress?: number | null;
  color?: "red" | "yellow" | "green" | string | null;
  schedule_date?: string | null;
  status?: string | null;
  row_index?: number | null;
  project_id?: string | number | null;
};

type ShipmentType = {
  id: string | number;
  last_lat?: number | null;
  last_lng?: number | null;
  item_name?: string | null;
  status?: string | null;
  updated_at?: string | null;
};

type ProjectType = {
  id: string | number;
  name?: string;
  description?: string | null;
  created_at?: string | null;
};

export default function MasterDashboard(): React.JSX.Element {
  
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskType[]>([]);
  const [shipments, setShipments] = useState<ShipmentType[]>([]);
  const [projects, setProjects] = useState<ProjectType[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function init() {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data?.session) {
          router.push("/");
          return;
        }
        await loadProjects();
      } catch (err) {
        console.error("Session check error:", err);
      } finally {
        setLoading(false);
      }
    }
    init();

    return () => {
      try {
        const getChannelsFn = (supabase as any).getChannels;
        const channels = typeof getChannelsFn === "function" ? (supabase as any).getChannels() : [];
        channels.forEach((ch: any) => {
          try {
            (supabase as any).removeChannel(ch);
          } catch (e) {
            /* ignore */
          }
        });
      } catch (e) {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProjects() {
    // remove generic to avoid TS generic mismatch
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading projects:", error);
      return;
    }
    setProjects((data as any) || []);
  }

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Logout error:", error);
      alert("Gagal logout: " + error.message);
    } else {
      router.push("/");
    }
  };

  const loadProjectData = async (projectId: string) => {
    setSelectedProject(projectId);

    const [taskRes, shipRes] = await Promise.all([
      // remove generics here too
      supabase.from("tasks").select("*").eq("project_id", projectId).order("row_index", { ascending: true }),
      supabase.from("shipments").select("*").eq("project_id", projectId),
    ]);

    setTasks((taskRes.data as any) || []);
    setShipments((shipRes.data as any) || []);

    // remove existing related channels (safety)
    try {
      const getChannelsFn = (supabase as any).getChannels;
      const channels = typeof getChannelsFn === "function" ? (supabase as any).getChannels() : [];
      channels.forEach((ch: any) => {
        if (ch.topic && (ch.topic.includes("tasks") || ch.topic.includes("shipments"))) {
          try {
            (supabase as any).removeChannel(ch);
          } catch (err) {
            /* ignore */
          }
        }
      });
    } catch (err) {
      /* ignore */
    }

    // subscribe tasks (use as any to silence TS generic signature)
    try {
      const taskChannel = (supabase as any).channel(`public:tasks:project_${projectId}`);
      taskChannel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `project_id=eq.${projectId}`,
        },
        async () => {
          try {
            const refreshed = await supabase.from("tasks").select("*").eq("project_id", projectId).order("row_index", { ascending: true });
            setTasks((refreshed.data as any) || []);
          } catch (err) {
            console.error("Error refreshing tasks:", err);
          }
        }
      );
      taskChannel.subscribe();
    } catch (err) {
      console.error("Task subscribe error:", err);
    }

    // subscribe shipments
    try {
      const shipChannel = (supabase as any).channel(`public:shipments:project_${projectId}`);
      shipChannel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shipments",
          filter: `project_id=eq.${projectId}`,
        },
        async () => {
          try {
            const refreshed = await supabase.from("shipments").select("*").eq("project_id", projectId);
            setShipments((refreshed.data as any) || []);
          } catch (err) {
            console.error("Error refreshing shipments:", err);
          }
        }
      );
      shipChannel.subscribe();
    } catch (err) {
      console.error("Shipment subscribe error:", err);
    }
  };

  const chartData = tasks.map((t) => ({
    name: (t.description && t.description.slice(0, 15)) || "Task",
    Target: Number(t.plan_progress ?? 0),
    Realisasi: Number(t.actual_progress ?? 0),
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-600">
        Memuat data...
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <header className="flex justify-between items-center bg-indigo-700 text-white p-4 rounded-md shadow mb-6">
        <h1 className="text-2xl font-bold">Master Dashboard</h1>
        <button
          onClick={handleLogout}
          className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded text-sm font-medium"
        >
          Logout
        </button>
      </header>

      <div className="mb-6 bg-white p-4 rounded shadow">
        <h2 className="font-semibold mb-2">Pilih Proyek untuk Dipantau</h2>
        <select
          className="border rounded px-3 py-2 w-full"
          onChange={(e) => loadProjectData(String(e.target.value))}
          value={selectedProject || ""}
        >
          <option value="">-- Pilih Proyek --</option>
          {projects.map((p) => (
            <option key={String(p.id)} value={String(p.id)}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {!selectedProject && <p className="text-gray-600">Silakan pilih proyek untuk melihat detailnya.</p>}

      {selectedProject && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-4 rounded shadow">
              <h2 className="font-semibold mb-2">Perbandingan Target & Realisasi</h2>
              <div style={{ width: "100%", height: 300 }}>
                <ResponsiveContainer>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Target" fill="#8884d8" />
                    <Bar dataKey="Realisasi" fill="#82ca9d" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-4 rounded shadow">
              <h2 className="font-semibold mb-2">Peta Pengiriman Barang</h2>
              {shipments.length > 0 ? (
                <div style={{ width: "100%", height: 300 }}>
                  <MapTracking projectId={selectedProject} />
                  <div className="mt-2 text-sm text-gray-600">
                    Menampilkan lokasi {shipments.length} pengiriman terakhir.
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500">Belum ada data pengiriman.</p>
              )}
            </div>
          </div>

          <div className="mt-6 bg-white p-4 rounded shadow">
            <h2 className="font-semibold mb-2">Daftar Pekerjaan (Realtime)</h2>
            <div className="overflow-auto max-h-[400px] space-y-3">
              {tasks.length === 0 && <p className="text-sm text-gray-500">Belum ada data task.</p>}
              {tasks.map((t) => (
                <div
                  key={String(t.id)}
                  className={`p-3 border rounded flex justify-between items-center ${
                    t.color === "red" ? "bg-red-100" : t.color === "yellow" ? "bg-yellow-100" : t.color === "green" ? "bg-green-100" : "bg-white"
                  }`}
                >
                  <div>
                    <div className="font-medium">{t.description}</div>
                    <div className="text-sm text-gray-600">
                      Progress: {t.actual_progress ?? 0}% â€” Target: {t.plan_progress ?? 0}% â€” Status: {t.status || "N/A"}
                    </div>
                  </div>
                  <div className="text-sm text-gray-500">
                    {t.schedule_date ? new Date(t.schedule_date).toLocaleDateString() : "-"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

