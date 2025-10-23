// app/Dashboard/Silver.js  (atau pages/dashboard/silver.js)
"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "../../lib/supabaseClient";
import dynamic from "next/dynamic";

const MapTracking = dynamic(() => import("../../components/MapTracking"), { ssr: false });

export default function SilverDashboard() {
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [progressInputs, setProgressInputs] = useState({});
  const [location, setLocation] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const tasksRef = useRef([]);
  const locationsRef = useRef([]);

  // helper untuk set state dan ref konsisten
  const setTasksAndRef = (newTasks) => {
    tasksRef.current = newTasks;
    setTasks(newTasks);
  };

  useEffect(() => {
    (async () => {
      const resp = await supabase.auth.getUser();
      if (resp?.data?.user) setUser(resp.data.user);
    })();
  }, []);

  // initial load tasks (assigned to this user)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from("tasks")
        .select("*")
        .eq("assigned_to", user.id)
        .order("id", { ascending: true });

      if (!cancelled) setTasksAndRef(data || []);
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Realtime subscription for tasks and locations (only while component mounted)
  useEffect(() => {
    // subscribe to tasks changes
    const tasksChannel = supabase
      .channel("public:tasks")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        (payload) => {
          const evt = payload.eventType; // INSERT | UPDATE | DELETE
          const record = payload.new ?? payload.old;
          setTasksAndRef((prev) => {
            let next = [...prev];
            if (evt === "INSERT") {
              // only add if assigned to user
              if (record.assigned_to === user?.id) next.push(record);
            } else if (evt === "UPDATE") {
              next = next.map((t) => (t.id === record.id ? record : t));
              // keep ordering
              next.sort((a, b) => a.id - b.id);
            } else if (evt === "DELETE") {
              next = next.filter((t) => t.id !== record.id);
            }
            return next;
          });
        }
      )
      .subscribe();

    // subscribe to locations changes (if need to show other nearby SPV / shipments)
    const locChannel = supabase
      .channel("public:locations")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "locations" },
        (payload) => {
          const rec = payload.new;
          locationsRef.current = [...locationsRef.current, rec];
        }
      )
      .subscribe();

    return () => {
      // cleanup subscription
      supabase.removeChannel(tasksChannel);
      supabase.removeChannel(locChannel);
    };
  }, [user]);

  // Optimistic update for progress
  const handleProgressUpdate = async (taskId) => {
    const raw = progressInputs[taskId];
    const newVal = Number(raw);
    if (Number.isNaN(newVal) || newVal < 0 || newVal > 100) {
      return alert("Masukkan angka progress 0-100");
    }

    // optimistic update: simpan old array untuk rollback
    const oldTasks = [...tasksRef.current];
    const optimistic = oldTasks.map((t) =>
      t.id === taskId ? { ...t, progress: newVal, status: newVal === 100 ? "done" : "in-progress" } : t
    );
    setTasksAndRef(optimistic);

    // backend update
    try {
      const { error } = await supabase
        .from("tasks")
        .update({ progress: newVal, status: newVal === 100 ? "done" : "in-progress" })
        .eq("id", taskId);

      if (error) throw error;
      // success: nothing to do (realtime will confirm)
    } catch (err) {
      // rollback
      setTasksAndRef(oldTasks);
      console.error("Gagal menyimpan progress:", err);
      alert("Gagal menyimpan progress. Silakan coba lagi.");
    }
  };

  // Upload bukti (no optimistic for file; we show uploading state)
  const handleUpload = async (taskId) => {
    if (!uploadFile) return alert("Pilih file dulu!");
    const fileName = `${Date.now()}_${uploadFile.name}`;

    try {
      const { error: uploadError } = await supabase.storage.from("proofs").upload(fileName, uploadFile);

      if (uploadError) throw uploadError;

      // Build public URL
      const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const publicUrl = `${base.replace(/\/$/, "")}/storage/v1/object/public/proofs/${fileName}`;

      const { error: dbError } = await supabase.from("tasks").update({ proof_url: publicUrl }).eq("id", taskId);
      if (dbError) throw dbError;

      alert("Bukti berhasil diupload!");
      setUploadFile(null);
    } catch (err) {
      console.error("Upload error:", err);
      alert("Gagal upload: " + (err.message || err));
    }
  };

  // Update lokasi (optimistic: display immediately)
  const handleGetLocation = () => {
    if (!navigator.geolocation) return alert("Perangkat tidak mendukung pelacakan lokasi.");

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude, timestamp: new Date() };
        setLocation(coords);
        // optimistic append to ref
        locationsRef.current = [...locationsRef.current, coords];

        try {
          const { error } = await supabase.from("locations").insert([{ lat: coords.lat, lng: coords.lng, timestamp: coords.timestamp }]);
          if (error) throw error;
          alert("Lokasi berhasil diperbarui!");
        } catch (err) {
          // rollback last location
          locationsRef.current = locationsRef.current.slice(0, -1);
          console.error("Gagal menyimpan lokasi:", err);
          alert("Gagal menyimpan lokasi: " + err.message);
        }
      },
      (err) => {
        console.error("Geolocation error:", err);
        alert("Gagal mendapatkan lokasi: " + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <h1 className="text-2xl font-bold mb-4 text-blue-600">Dashboard Silver (SPV Lapangan)</h1>

      <div className="flex gap-3 items-center mb-4">
        <button onClick={handleGetLocation} className="bg-green-600 text-white px-4 py-2 rounded">
          Update Lokasi Terkini
        </button>

        <input type="file" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} />
      </div>

      {location && (
        <div className="mb-6">
          <h3 className="font-semibold mb-2">Lokasi Anda Saat Ini:</h3>
          <MapTracking lat={location.lat} lng={location.lng} />
        </div>
      )}

      <h2 className="text-xl font-semibold mb-2">Daftar Tugas Anda</h2>

      <div className="space-y-4">
        {tasks.map((task) => (
          <div key={task.id} className="bg-white p-4 rounded-lg shadow flex flex-col space-y-2">
            <h3 className="font-bold text-gray-800">{task.title}</h3>
            <p>Status: {task.status}</p>
            <p>Target tanggal: {task.target_date}</p>
            <p>Progress saat ini: {task.progress}%</p>

            <div className="flex gap-2 items-center">
              <input
                type="number"
                min="0"
                max="100"
                placeholder="Update progress (%)"
                value={progressInputs[task.id] ?? ""}
                onChange={(e) => setProgressInputs({ ...progressInputs, [task.id]: e.target.value })}
                className="border p-2 w-28"
              />
              <button onClick={() => handleProgressUpdate(task.id)} className="bg-blue-500 text-white px-3 py-1 rounded">
                Simpan Progress
              </button>

              <button onClick={() => handleUpload(task.id)} className="bg-purple-600 text-white px-3 py-1 rounded">
                Upload Bukti (Jika sudah pilih file)
              </button>
            </div>

            {task.proof_url && (
              <div className="mt-2">
                <p className="font-semibold">Bukti Tersimpan:</p>
                <a href={task.proof_url} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                  Lihat Bukti
                </a>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
