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

const MapTracking = dynamic(() => import("../../components/MapTracking"), {
  ssr: false,
});

type TaskType = {
  id: string | number;
  description?: string | null;
  plan_progress?: number | null;
  actual_progress?: number | null;
  color?: string | null;
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.push("/");
        return;
      }
      await loadProjects();
      setLoading(false);
    };
    init();
  }, [router]);

  async function loadProjects() {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error) setProjects((data as any) || []);
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  const loadProjectData = async (projectId: string) => {
    setSelectedProject(projectId);

    const [taskRes, shipRes] = await Promise.all([
      supabase
        .from("tasks")
        .select("*")
        .eq("project_id", projectId)
        .order("row_index", { ascending: true }),
      supabase.from("shipments").select("*").eq("project_id", projectId),
    ]);

    setTasks((taskRes.data as any) || []);
    setShipments((shipRes.data as any) || []);

    // ✅ REALTIME TASKS
    supabase
      .channel(`tasks-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `project_id=eq.${projectId}`,
        },
        async () => {
          const refreshed = await supabase
            .from("tasks")
            .select("*")
            .eq("project_id", projectId)
            .order("row_index", { ascending: true });
          setTasks((refreshed.data as any) || []);
        }
      )
      .subscribe();

    // ✅ REALTIME SHIPMENTS
    supabase
      .channel(`shipments-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shipments",
          filter: `project_id=eq.${projectId}`,
        },
        async () => {
          const refreshed = await supabase
            .from("shipments")
            .select("*")
            .eq("project_id", projectId);
          setShipments((refreshed.data as any) || []);
        }
      )
      .subscribe();
  };

  const chartData = tasks.map((t) => ({
    name: t.description?.slice(0, 15) || "Task",
    Target: Number(t.plan_progress ?? 0),
    Realisasi: Number(t.actual_progress ?? 0),
  }));

  if (loading) {
    return <div className="flex h-screen items-center justify-center">Memuat...</div>;
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <header className="flex justify-between items-center bg-indigo-700 text-white p-4 rounded mb-6">
        <h1 className="text-2xl font-bold">Master Dashboard</h1>
        <button onClick={handleLogout} className="bg-red-500 px-4 py-2 rounded">
          Logout
        </button>
      </header>

      <div className="bg-white p-4 rounded shadow mb-6">
        <select
          className="border rounded px-3 py-2 w-full"
          value={selectedProject || ""}
          onChange={(e) => loadProjectData(e.target.value)}
        >
          <option value="">-- Pilih Proyek --</option>
          {projects.map((p) => (
            <option key={String(p.id)} value={String(p.id)}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {selectedProject && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-4 rounded shadow">
              <ResponsiveContainer width="100%" height={300}>
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

            <div className="bg-white p-4 rounded shadow">
              <MapTracking projectId={selectedProject} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
