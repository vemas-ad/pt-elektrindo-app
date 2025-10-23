// app/Dashboard/Master.js  (atau pages/dashboard/master.js)
"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import dynamic from "next/dynamic";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const MapTracking = dynamic(() => import("../../components/MapTracking"), { ssr: false });

export default function MasterDashboard() {
  const [tasks, setTasks] = useState([]);
  const [locations, setLocations] = useState([]);

  useEffect(() => {
    let cancelled = false;
    // initial load tasks & locations
    (async () => {
      const [{ data: tasksData }, { data: locData }] = await Promise.all([
        supabase.from("tasks").select("*").order("id", { ascending: true }),
        supabase.from("locations").select("*").order("timestamp", { ascending: true }).limit(100),
      ]);
      if (!cancelled) {
        setTasks(tasksData || []);
        setLocations(locData || []);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // subscribe to tasks
    const tasksChannel = supabase
      .channel("public:tasks")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, (payload) => {
        const evt = payload.eventType;
        const rec = payload.new ?? payload.old;
        setTasks((prev) => {
          let next = [...prev];
          if (evt === "INSERT") {
            next.push(rec);
          } else if (evt === "UPDATE") {
            next = next.map((t) => (t.id === rec.id ? rec : t));
          } else if (evt === "DELETE") {
            next = next.filter((t) => t.id !== rec.id);
          }
          next.sort((a, b) => a.id - b.id);
          return next;
        });
      })
      .subscribe();

    // subscribe to locations
    const locChannel = supabase
      .channel("public:locations")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "locations" }, (payload) => {
        const rec = payload.new;
        setLocations((prev) => [...prev, rec].slice(-200)); // keep last 200
      })
      .subscribe();

    return () => {
      supabase.removeChannel(tasksChannel);
      supabase.removeChannel(locChannel);
    };
  }, []);

  // prepare data for chart: group by task.title -> progress
  const chartData = tasks.map((t) => ({ name: t.title, progress: t.progress || 0 }));

  // For map, choose last known location of shipments / users
  const lastLocations = locations.slice(-50);

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <h1 className="text-2xl font-bold mb-4 text-indigo-700">Dashboard Master</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-4 rounded shadow">
          <h2 className="font-semibold mb-2">Progress Tasks (per task)</h2>
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" interval={0} angle={-30} textAnchor="end" height={80} />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="progress" stroke="#8884d8" activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-4 rounded shadow">
          <h2 className="font-semibold mb-2">Peta Lokasi Terakhir</h2>
          {lastLocations.length ? (
            <div style={{ width: "100%", height: 300 }}>
              {/* show first of lastLocations center */}
              <MapTracking lat={lastLocations[lastLocations.length - 1].lat} lng={lastLocations[lastLocations.length - 1].lng} />
              <div className="mt-2 text-sm text-gray-600">Menampilkan {lastLocations.length} lokasi terakhir.</div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Belum ada data lokasi.</p>
          )}
        </div>
      </div>

      <div className="mt-6 bg-white p-4 rounded shadow">
        <h2 className="font-semibold mb-2">Daftar Tasks (realtime)</h2>
        <div className="space-y-3">
          {tasks.map((t) => (
            <div key={t.id} className="p-3 border rounded flex justify-between items-center">
              <div>
                <div className="font-medium">{t.title}</div>
                <div className="text-sm text-gray-600">Progress: {t.progress ?? 0}% — Status: {t.status}</div>
              </div>
              <div className="text-sm text-gray-500">{t.target_date}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
