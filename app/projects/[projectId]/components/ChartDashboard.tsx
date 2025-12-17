"use client";

import React, { useEffect, useState } from "react";
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
import { supabase } from "../../../../lib/supabaseClient";

type ChartRow = {
  name: string;
  Target: number;
  Realisasi: number;
  color?: string;
};

export default function ProgressChart({ projectId }: { projectId: string }) {
  const [data, setData] = useState<ChartRow[]>([]);

  useEffect(() => {
    if (!projectId) return;

    // initial load
    load();

    // create realtime subscription using postgres_changes filter for this project
    const channel = supabase
      .channel(`public:tasks:project:${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          load();
        }
      )
      .subscribe();

    // cleanup on unmount
    return () => {
      // unsubscribe channel
      channel.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function load() {
    try {
      const { data: rows, error } = await supabase
        .from("tasks")
        .select("description, plan_progress, actual_progress, color")
        .eq("project_id", projectId)
        .order("row_index", { ascending: true });

      if (error) {
        console.error("Failed to load tasks:", error);
        return;
      }

      const series: ChartRow[] = (rows || []).map((r: any, idx: number) => ({
        name:
          (r.description && String(r.description).slice(0, 12)) ||
          `Item ${idx + 1}`,
        Target: Number(r.plan_progress ?? 0),
        Realisasi: Number(r.actual_progress ?? 0),
        color: r.color ?? "green",
      }));

      setData(series);
    } catch (e) {
      console.error(e);
    }
  }

  // If no data yet, show empty placeholder
  if (!data || data.length === 0) {
    return (
      <div className="bg-white p-4 rounded shadow">
        <h3 className="font-semibold mb-2">Perbandingan Target & Realisasi</h3>
        <div className="text-sm text-gray-500">Belum ada data untuk grafik</div>
      </div>
    );
  }

  return (
    <div className="bg-white p-4 rounded shadow">
      <h3 className="font-semibold mb-2">Perbandingan Target & Realisasi</h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data}>
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
  );
}
