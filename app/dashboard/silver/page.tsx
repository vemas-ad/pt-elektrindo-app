// app/dashboard/silver/page.tsx
"use client";

import React, { useEffect, useState } from "react";
// react-data-grid menggunakan named export DataGrid
import DataGrid from "react-data-grid";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { handleLogout } from "@/lib/logout";

const MapTracking = dynamic(() => import("../../components/MapTracking"), {
  ssr: false,
});

export default function SilverDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [projectName, setProjectName] = useState(
    localStorage.getItem("selectedProject") || "Battery Test Project"
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // cek session + load data
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data?.session) {
        router.push("/");
        return;
      }
      setUser(data.session.user);
      await loadRows();
      setLoading(false);
    };
    checkSession();

    // realtime channel untuk perubahan di tabel master_schedule
    const channel = supabase.channel("realtime:master_schedule");
    channel
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "master_schedule" },
        () => loadRows()
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch (e) {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function loadRows() {
    try {
      const { data, error } = await supabase
        .from("master_schedule")
        .select("*")
        .order("id", { ascending: true });
      if (error) {
        console.error("loadRows error:", error);
        setRows([]);
        setChartData([]);
        return;
      }
      const list = data || [];
      setRows(list);
      setChartData(
        list.map((r: any) => ({
          name: r.description || "-",
          Plan: Number(r.plan_progress || 0),
          Actual: Number(r.actual_progress || 0),
        }))
      );
    } catch (err) {
      console.error("loadRows exception:", err);
      setRows([]);
      setChartData([]);
    }
  }

  // saat user edit di grid → simpan ke supabase
  async function onRowsChange(newRows: any[], { indexes }: any) {
    setRows(newRows);
    const idx = indexes?.[0];
    const updated = typeof idx === "number" ? newRows[idx] : null;
    if (updated && updated.id) {
      try {
        const { error } = await supabase
          .from("master_schedule")
          .update({
            description: updated.description,
            week_date: updated.week_date,
            weight: updated.weight,
            plan_progress: updated.plan_progress,
            actual_progress: updated.actual_progress,
            color: updated.color,
            updated_at: new Date().toISOString(),
          })
          .eq("id", updated.id);
        if (error) console.error("update error:", error);
      } catch (err) {
        console.error("update exception:", err);
      }
    }
  }

  // buat opsi bobot (0.1..100) dan warna
  const weightOptions = Array.from({ length: 1000 }, (_, i) => (i + 1) / 10); // 0.1 - 100.0
  const colorOptions = ["merah", "kuning", "hijau"];

  // kolom DataGrid (editor sederhana)
  const columns = [
    { key: "id", name: "No", width: 60 },
    { key: "description", name: "Kegiatan", editable: true, resizable: true },
    { key: "week_date", name: "Tanggal / Minggu", editable: true, width: 150 },
    {
      key: "weight",
      name: "Bobot (%)",
      editable: true,
      width: 120,
      editor: ({ row, onRowChange }: any) => (
        <select
          value={row.weight ?? ""}
          onChange={(e) =>
            onRowChange({ ...row, weight: e.target.value ? Number(e.target.value) : null })
          }
          className="border px-1"
        >
          <option value="">-</option>
          {weightOptions.map((w) => (
            <option key={w} value={w}>
              {w.toFixed(1)}%
            </option>
          ))}
        </select>
      ),
    },
    { key: "plan_progress", name: "Target (%)", editable: true, width: 120 },
    { key: "actual_progress", name: "Realisasi (%)", editable: true, width: 120 },
    {
      key: "color",
      name: "Warna",
      editable: true,
      width: 120,
      editor: ({ row, onRowChange }: any) => (
        <select
          value={row.color ?? ""}
          onChange={(e) => onRowChange({ ...row, color: e.target.value })}
          className="border px-1"
        >
          <option value="">-</option>
          {colorOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      ),
    },
  ];

  const mapCenter = {
    lat: Number(process.env.NEXT_PUBLIC_MAP_DEFAULT_LAT || -6.2),
    lng: Number(process.env.NEXT_PUBLIC_MAP_DEFAULT_LNG || 106.8),
  };

  if (loading)
    return (
      <div className="p-6 text-center text-gray-600">Memuat Master Schedule...</div>
    );

  return (
    <div className="p-6 bg-gray-50 min-h-screen space-y-6">
      {/* header */}
      <header className="flex justify-between items-center bg-blue-800 text-white p-4 rounded-md shadow">
        <h1 className="text-2xl font-bold">📘 Silver Dashboard — {projectName}</h1>
        <button
          onClick={async () => {
            await handleLogout();
            router.push("/");
          }}
          className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded text-sm font-medium"
        >
          Logout
        </button>
      </header>

      {/* kop & logo */}
      <div className="bg-white p-4 rounded shadow flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-blue-700">
            PT ELEKTRINDO UTAMA INDONESIA
          </h2>
          <p className="text-gray-600">MECHANICAL - ELECTRICAL - FIRE PROTECTION</p>
          <p className="text-sm mt-2">
            Project: <strong>{projectName}</strong>
          </p>
        </div>
        <div>
          {/* pastikan ada file public/logo.png atau ganti src */}
          <img src="/logo.png" alt="Logo" width={100} className="rounded shadow-sm" />
        </div>
      </div>

      {/* grid editable (excel-like) */}
      <div className="bg-white p-4 rounded shadow">
        <h2 className="font-semibold mb-2">📋 Master Schedule — Editable (Silver)</h2>
        <div style={{ height: 420 }}>
          <DataGrid
            columns={columns}
            rows={rows}
            onRowsChange={onRowsChange}
            rowKeyGetter={(row) => row.id}
          />
        </div>
      </div>

      {/* kurva s */}
      <div className="bg-white p-4 rounded shadow">
        <h2 className="font-semibold mb-2">📈 Kurva S (Auto Update)</h2>
        <div style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="Plan" stroke="#8884d8" dot={false} />
              <Line type="monotone" dataKey="Actual" stroke="#82ca9d" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* map */}
      <div className="bg-white p-4 rounded shadow">
        <h2 className="font-semibold mb-2">🗺️ Lokasi Progress / Pengiriman</h2>
        <MapTracking center={mapCenter} />
      </div>

      {/* tanda tangan */}
      <div className="bg-white p-4 rounded shadow flex justify-between mt-8">
        <div className="text-center w-1/3">
          <p className="font-medium">Disusun oleh</p>
          <div className="mt-16 border-t border-gray-400 mx-6"></div>
          <p>Silver Engineer</p>
        </div>
        <div className="text-center w-1/3">
          <p className="font-medium">Diperiksa oleh</p>
          <div className="mt-16 border-t border-gray-400 mx-6"></div>
          <p>Manager Proyek</p>
        </div>
        <div className="text-center w-1/3">
          <p className="font-medium">Disetujui oleh</p>
          <div className="mt-16 border-t border-gray-400 mx-6"></div>
          <p>Direktur</p>
        </div>
      </div>
    </div>
  );
}
