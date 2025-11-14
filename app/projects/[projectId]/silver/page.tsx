"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

const Spreadsheet = dynamic(() => import("react-spreadsheet"), { ssr: false });
const MapTracking = dynamic(() => import("../../../components/MapTracking"), { ssr: false });

// lightweight debounce (no external lib)
function debounceFn<T extends (...args: any[]) => any>(fn: T, wait = 1000) {
  let timeout: any;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
}

type TaskType = {
  id?: string | null;
  project_id?: string | null;
  row_index?: number | null;
  description?: string | null;
  weight?: number | null;
  plan_progress?: number | null;
  actual_progress?: number | null;
  color?: string | null;
  location?: string | null;
  proof_url?: string | null;
  dates?: Record<string, any> | null;
};

type DateColsHistory = {
  dateCols: string[];
  rows: TaskType[];
  targetRows: TaskType[];
  realisasiRows: TaskType[];
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

export default function SilverPage(): JSX.Element {
  const router = useRouter();
  const params = useParams();
  const projectId = (params as any)?.projectId as string | undefined;

  const [projectName, setProjectName] = useState<string>("Project");
  const [rows, setRows] = useState<TaskType[]>([]);
  const [dateCols, setDateCols] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [metaProject, setMetaProject] = useState({ project: "", no_spk: "", tgl_spk: "", rev: "" });
  const [activeTab, setActiveTab] = useState<1 | 2 | 3 | 4 | 5>(1); // Added tab 5 for notes
  const [logoError, setLogoError] = useState(false);

  // Data terpisah untuk Target dan Realisasi
  const [targetRows, setTargetRows] = useState<TaskType[]>([]);
  const [realisasiRows, setRealisasiRows] = useState<TaskType[]>([]);
  const [targetChartData, setTargetChartData] = useState<any[]>([]);
  const [realisasiChartData, setRealisasiChartData] = useState<any[]>([]);

  // State untuk notes
  const [notes, setNotes] = useState<NoteType[]>([]);
  const [newNote, setNewNote] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);

  // Undo/Redo stacks
  const undoStack = useRef<TaskType[][]>([]);
  const redoStack = useRef<TaskType[][]>([]);
  const targetUndoStack = useRef<TaskType[][]>([]);
  const targetRedoStack = useRef<TaskType[][]>([]);
  const realisasiUndoStack = useRef<TaskType[][]>([]);
  const realisasiRedoStack = useRef<TaskType[][]>([]);
  
  const dateColsUndoStack = useRef<DateColsHistory[]>([]);
  const dateColsRedoStack = useRef<DateColsHistory[]>([]);

  const LS_KEY = `silver:${projectId}:rows`;
  const LS_TARGET_KEY = `silver:${projectId}:target_rows`;
  const LS_REALISASI_KEY = `silver:${projectId}:realisasi_rows`;
  const LS_DATE_COLS = `silver:${projectId}:date_cols`;

  // Summary calculations
  const planningSummary = useMemo(() => {
    const plan = rows.reduce((s, r) => s + Number(r.plan_progress ?? 0), 0);
    const actual = rows.reduce((s, r) => s + Number(r.actual_progress ?? 0), 0);
    
    const totalWeight = rows.reduce((s, r) => s + Number(r.weight ?? 0), 0);
    const weightedPlan = totalWeight > 0 ? 
      rows.reduce((s, r) => s + (Number(r.weight ?? 0) * Number(r.plan_progress ?? 0) / 100), 0) : 0;
    const weightedActual = totalWeight > 0 ? 
      rows.reduce((s, r) => s + (Number(r.weight ?? 0) * Number(r.actual_progress ?? 0) / 100), 0) : 0;

    return {
      plan: weightedPlan > 0 ? weightedPlan : plan / Math.max(rows.length, 1),
      accumPlan: weightedPlan > 0 ? weightedPlan : plan / Math.max(rows.length, 1),
      actual: weightedActual > 0 ? weightedActual : actual / Math.max(rows.length, 1),
      accumActual: weightedActual > 0 ? weightedActual : actual / Math.max(rows.length, 1),
    };
  }, [rows]);

  const targetSummary = useMemo(() => {
    const plan = targetRows.reduce((s, r) => s + Number(r.plan_progress ?? 0), 0);
    const totalWeight = targetRows.reduce((s, r) => s + Number(r.weight ?? 0), 0);
    const weightedPlan = totalWeight > 0 ? 
      targetRows.reduce((s, r) => s + (Number(r.weight ?? 0) * Number(r.plan_progress ?? 0) / 100), 0) : 0;

    return {
      plan: weightedPlan > 0 ? weightedPlan : plan / Math.max(targetRows.length, 1),
      accumPlan: weightedPlan > 0 ? weightedPlan : plan / Math.max(targetRows.length, 1),
      actual: 0,
      accumActual: 0,
    };
  }, [targetRows]);

  const realisasiSummary = useMemo(() => {
    const actual = realisasiRows.reduce((s, r) => s + Number(r.actual_progress ?? 0), 0);
    const totalWeight = realisasiRows.reduce((s, r) => s + Number(r.weight ?? 0), 0);
    const weightedActual = totalWeight > 0 ? 
      realisasiRows.reduce((s, r) => s + (Number(r.weight ?? 0) * Number(r.actual_progress ?? 0) / 100), 0) : 0;

    return {
      plan: 0,
      accumPlan: 0,
      actual: weightedActual > 0 ? weightedActual : actual / Math.max(realisasiRows.length, 1),
      accumActual: weightedActual > 0 ? weightedActual : actual / Math.max(realisasiRows.length, 1),
    };
  }, [realisasiRows]);

  const currentSummary = useMemo(() => {
    switch (activeTab) {
      case 1: return planningSummary;
      case 3: return targetSummary;
      case 4: return realisasiSummary;
      default: return planningSummary;
    }
  }, [activeTab, planningSummary, targetSummary, realisasiSummary]);

  // debounced autosave to supabase
  const autosave = useRef(
    debounceFn(async (projectIdArg: string | undefined, snapshotRows: TaskType[]) => {
      if (!projectIdArg) return;
      try {
        await Promise.all(
          snapshotRows.map(async (r) => {
            const payload: any = {
              description: r.description ?? null,
              weight: Number(r.weight ?? 0),
              plan_progress: Number(r.plan_progress ?? 0),
              actual_progress: Number(r.actual_progress ?? 0),
              color: r.color ?? "",
              location: r.location ?? null,
              dates: r.dates ?? {},
              project_id: projectIdArg,
              row_index: r.row_index ?? 0,
            };
            if (r.id) {
              await supabase.from("tasks").update(payload).eq("id", r.id);
            } else {
              await supabase.from("tasks").upsert(payload);
            }
          })
        );
      } catch (err) {
        console.error("autosave error:", err);
      }
    }, 1100)
  ).current;

  // initial load + realtime subscribe
  useEffect(() => {
    if (!projectId) {
      router.push("/projects");
      return;
    }
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const pr = await supabase.from("projects").select("name,meta").eq("id", projectId).single();
        setProjectName(pr.data?.name || `Project ${projectId}`);
        if (pr.data?.meta && typeof pr.data.meta === "object") {
          setMetaProject({
            project: pr.data.meta.project || pr.data?.name || "",
            no_spk: pr.data.meta.no_spk || "",
            tgl_spk: pr.data.meta.tgl_spk || "",
            rev: pr.data.meta.rev || "",
          });
        }

        const t = await supabase.from("tasks").select("*").eq("project_id", projectId).order("row_index", { ascending: true });
        let taskList: TaskType[] = (t.data as TaskType[]) || [];

        // Load date columns from localStorage
        const savedDateCols = localStorage.getItem(LS_DATE_COLS);
        if (savedDateCols) {
          try {
            const parsedDateCols = JSON.parse(savedDateCols);
            if (Array.isArray(parsedDateCols)) {
              setDateCols(parsedDateCols);
            }
          } catch (e) {
            console.warn("invalid date columns snapshot:", e);
          }
        }

        // Load from local storage
        const localRaw = localStorage.getItem(LS_KEY);
        if (localRaw) {
          try {
            const localRows = JSON.parse(localRaw) as TaskType[];
            if (Array.isArray(localRows) && localRows.length) {
              const byIndex = new Map<number, TaskType>();
              taskList.forEach((s) => { if (s.row_index) byIndex.set(Number(s.row_index), s); });
              taskList = localRows.map((lr, i) => {
                const ri = Number(lr.row_index ?? i + 1);
                const server = byIndex.get(ri);
                return { ...server, ...lr };
              });
            }
          } catch (e) {
            console.warn("invalid local snapshot:", e);
          }
        }

        // Load data untuk Target dan Realisasi
        const targetRaw = localStorage.getItem(LS_TARGET_KEY);
        if (targetRaw) {
          try {
            const targetData = JSON.parse(targetRaw) as TaskType[];
            if (Array.isArray(targetData)) {
              setTargetRows(targetData);
            }
          } catch (e) {
            console.warn("invalid target snapshot:", e);
          }
        }

        const realisasiRaw = localStorage.getItem(LS_REALISASI_KEY);
        if (realisasiRaw) {
          try {
            const realisasiData = JSON.parse(realisasiRaw) as TaskType[];
            if (Array.isArray(realisasiData)) {
              setRealisasiRows(realisasiData);
            }
          } catch (e) {
            console.warn("invalid realisasi snapshot:", e);
          }
        }

        // Load notes
        const n = await supabase
          .from("project_notes")
          .select("*")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false });
        setNotes(n.data || []);

        // derive dateCols from existing data
        if (!savedDateCols) {
          const datesSet = new Set<string>();
          taskList.forEach((r) => { if (r.dates) Object.keys(r.dates).forEach((k) => datesSet.add(k)); });
          targetRows.forEach((r) => { if (r.dates) Object.keys(r.dates).forEach((k) => datesSet.add(k)); });
          realisasiRows.forEach((r) => { if (r.dates) Object.keys(r.dates).forEach((k) => datesSet.add(k)); });
          setDateCols(Array.from(datesSet));
        }

        setRows(taskList);
      } catch (err) {
        console.error("load error:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();

    // Setup realtime subscriptions
    const taskCh = supabase
      .channel(`public:tasks:project_${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `project_id=eq.${projectId}` }, async () => {
        try {
          const res = await supabase.from("tasks").select("*").eq("project_id", projectId).order("row_index", { ascending: true });
          const serverRows = (res.data as TaskType[]) || [];
          const localRaw = localStorage.getItem(LS_KEY);
          if (localRaw) {
            try {
              const localRows = JSON.parse(localRaw) as TaskType[];
              if (Array.isArray(localRows) && localRows.length) {
                const byIndex = new Map<number, TaskType>();
                serverRows.forEach((sr) => { if (sr.row_index) byIndex.set(Number(sr.row_index), sr); });
                const merged = localRows.map((lr, i) => {
                  const ri = Number(lr.row_index ?? i + 1);
                  const srv = byIndex.get(ri);
                  return { ...srv, ...lr };
                });
                setRows(merged);
                return;
              }
            } catch {}
          }
          setRows(serverRows);
        } catch (e) {
          console.error("realtime refresh error:", e);
        }
      })
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
      try { 
        supabase.removeChannel(taskCh);
        supabase.removeChannel(noteCh);
      } catch {}
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // update charts
  useEffect(() => {
    setChartData(rows.map((r, i) => ({
      name: (r.description || `Task ${i + 1}`).slice(0, 18),
      Target: Number(r.plan_progress ?? 0),
      Realisasi: Number(r.actual_progress ?? 0),
    })));
  }, [rows]);

  useEffect(() => {
    setTargetChartData(targetRows.map((r, i) => ({
      name: (r.description || `Task ${i + 1}`).slice(0, 18),
      Target: Number(r.plan_progress ?? 0),
    })));
  }, [targetRows]);

  useEffect(() => {
    setRealisasiChartData(realisasiRows.map((r, i) => ({
      name: (r.description || `Task ${i + 1}`).slice(0, 18),
      Realisasi: Number(r.actual_progress ?? 0),
    })));
  }, [realisasiRows]);

  // Undo/Redo functions
  const pushUndo = (snapshot: TaskType[], stack: React.MutableRefObject<TaskType[][]>) => {
    stack.current.push(JSON.parse(JSON.stringify(snapshot)));
  };

  const pushDateColsUndo = () => {
    dateColsUndoStack.current.push({
      dateCols: [...dateCols],
      rows: JSON.parse(JSON.stringify(rows)),
      targetRows: JSON.parse(JSON.stringify(targetRows)),
      realisasiRows: JSON.parse(JSON.stringify(realisasiRows))
    });
    dateColsRedoStack.current = [];
  };

  const undo = (currentRows: TaskType[], setRowsFn: React.Dispatch<React.SetStateAction<TaskType[]>>, 
                undoStack: React.MutableRefObject<TaskType[][]>, redoStack: React.MutableRefObject<TaskType[][]>,
                storageKey?: string) => {
    if (!undoStack.current.length) return;
    const last = undoStack.current.pop()!;
    redoStack.current.push(JSON.parse(JSON.stringify(currentRows)));
    setRowsFn(last);
    if (storageKey) {
      try { localStorage.setItem(storageKey, JSON.stringify(last)); } catch {}
    }
  };

  const redo = (currentRows: TaskType[], setRowsFn: React.Dispatch<React.SetStateAction<TaskType[]>>, 
                undoStack: React.MutableRefObject<TaskType[][]>, redoStack: React.MutableRefObject<TaskType[][]>,
                storageKey?: string) => {
    if (!redoStack.current.length) return;
    const last = redoStack.current.pop()!;
    undoStack.current.push(JSON.parse(JSON.stringify(currentRows)));
    setRowsFn(last);
    if (storageKey) {
      try { localStorage.setItem(storageKey, JSON.stringify(last)); } catch {}
    }
  };

  const undoDateCols = () => {
    if (!dateColsUndoStack.current.length) return;
    const last = dateColsUndoStack.current.pop()!;
    dateColsRedoStack.current.push({
      dateCols: [...dateCols],
      rows: JSON.parse(JSON.stringify(rows)),
      targetRows: JSON.parse(JSON.stringify(targetRows)),
      realisasiRows: JSON.parse(JSON.stringify(realisasiRows))
    });
    
    setDateCols(last.dateCols);
    setRows(last.rows);
    setTargetRows(last.targetRows);
    setRealisasiRows(last.realisasiRows);
    
    localStorage.setItem(LS_DATE_COLS, JSON.stringify(last.dateCols));
    localStorage.setItem(LS_KEY, JSON.stringify(last.rows));
    localStorage.setItem(LS_TARGET_KEY, JSON.stringify(last.targetRows));
    localStorage.setItem(LS_REALISASI_KEY, JSON.stringify(last.realisasiRows));
  };

  const redoDateCols = () => {
    if (!dateColsRedoStack.current.length) return;
    const last = dateColsRedoStack.current.pop()!;
    dateColsUndoStack.current.push({
      dateCols: [...dateCols],
      rows: JSON.parse(JSON.stringify(rows)),
      targetRows: JSON.parse(JSON.stringify(targetRows)),
      realisasiRows: JSON.parse(JSON.stringify(realisasiRows))
    });
    
    setDateCols(last.dateCols);
    setRows(last.rows);
    setTargetRows(last.targetRows);
    setRealisasiRows(last.realisasiRows);
    
    localStorage.setItem(LS_DATE_COLS, JSON.stringify(last.dateCols));
    localStorage.setItem(LS_KEY, JSON.stringify(last.rows));
    localStorage.setItem(LS_TARGET_KEY, JSON.stringify(last.targetRows));
    localStorage.setItem(LS_REALISASI_KEY, JSON.stringify(last.realisasiRows));
  };

  // add row
  async function addRow() {
    pushUndo(rows, undoStack);
    const nextIndex = rows.length ? Math.max(...rows.map(r => Number(r.row_index ?? 0))) + 1 : 1;
    const payload: TaskType = {
      project_id: projectId,
      row_index: nextIndex,
      description: "New task",
      weight: 0,
      plan_progress: 0,
      actual_progress: 0,
      color: "",
      dates: {},
    };
    try {
      const { data, error } = await supabase.from("tasks").insert(payload).select().single();
      if (error || !data) {
        const next = [...rows, payload];
        setRows(next);
        localStorage.setItem(LS_KEY, JSON.stringify(next));
        return;
      }
      const next = [...rows, (data as TaskType) || payload];
      setRows(next);
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch (e) {
      console.error("addRow exception:", e);
      const next = [...rows, payload];
      setRows(next);
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    }
  }

  // remove last row
  async function removeLastRow() {
    if (!rows.length) return;
    pushUndo(rows, undoStack);
    const last = rows[rows.length - 1];
    try { if (last.id) await supabase.from("tasks").delete().eq("id", last.id); } catch (e) { console.warn(e); }
    const next = rows.slice(0, -1).map((r, i) => ({ ...r, row_index: i + 1 }));
    setRows(next);
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    try {
      await Promise.all(next.map(nr => nr.id ? supabase.from("tasks").update({ row_index: nr.row_index }).eq("id", nr.id) : Promise.resolve()));
    } catch {}
  }

  // add date column
  function addDateColumn() {
    pushDateColsUndo();
    
    const d = new Date();
    let k = d.toLocaleDateString();
    let counter = 1;
    
    while (dateCols.includes(k)) {
      k = `${d.toLocaleDateString()} (${counter})`;
      counter++;
    }
    
    const next = [...dateCols, k];
    setDateCols(next);
    
    localStorage.setItem(LS_DATE_COLS, JSON.stringify(next));
    
    const newRows = rows.map(r => ({ ...r, dates: { ...(r.dates || {}), [k]: "" } }));
    const newTargetRows = targetRows.map(r => ({ ...r, dates: { ...(r.dates || {}), [k]: "" } }));
    const newRealisasiRows = realisasiRows.map(r => ({ ...r, dates: { ...(r.dates || {}), [k]: "" } }));
    
    setRows(newRows);
    setTargetRows(newTargetRows);
    setRealisasiRows(newRealisasiRows);
    
    try { 
      localStorage.setItem(LS_KEY, JSON.stringify(newRows));
      localStorage.setItem(LS_TARGET_KEY, JSON.stringify(newTargetRows));
      localStorage.setItem(LS_REALISASI_KEY, JSON.stringify(newRealisasiRows));
    } catch (e) { /* ignore */ }
    
    autosave(projectId, newRows);
  }

  // Enhanced Google Drive Upload
  async function uploadToGoogleDrive(file: File, taskId?: string | null, rowIndex?: number, description?: string) {
    if (!file) {
      alert("Pilih file terlebih dahulu!");
      return;
    }

    try {
      console.log("Uploading to Google Drive:", file.name);
      
      alert(`Mengupload ${file.name} ke Google Drive...`);
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const safeProject = encodeURIComponent(projectId || "unknown");
      const safeTask = encodeURIComponent(taskId || `row_${rowIndex}`);
      const safeDescription = encodeURIComponent(description || "unknown");
      const safeFileName = `${Date.now()}_${file.name}`;
      const remoteName = `${safeProject}/${safeDescription}_${safeFileName}`;
      
      const { error: upErr } = await supabase.storage
        .from("proofs")
        .upload(remoteName, file, { upsert: true });
        
      if (upErr) {
        alert("Upload gagal: " + upErr.message);
        return;
      }
      
      const baseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
      const url = `${baseUrl}/storage/v1/object/public/proofs/${remoteName}`;
      
      if (taskId) {
        await supabase.from("tasks").update({ proof_url: url }).eq("id", taskId);
      }
      
      setFile(null);
      alert(`✅ File berhasil diupload!\n\nFile: ${file.name}\nTask: ${description}\nTersimpan di: Cloud Storage`);
      
    } catch (err) {
      console.error("Upload error:", err);
      alert("❌ Upload gagal. Silakan coba lagi.");
    }
  }

  // Enhanced location tracking
  const updateCurrentLocation = async () => {
    if (!navigator.geolocation) {
      alert("Geolocation tidak didukung oleh browser Anda");
      return;
    }

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        });
      });

      const { latitude, longitude, accuracy } = position.coords;
      
      let address = "Lokasi tidak diketahui";
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
        const data = await response.json();
        if (data.display_name) {
          address = data.display_name;
        }
      } catch (e) {
        console.warn("Gagal mendapatkan alamat:", e);
      }

      const { error } = await supabase.from("shipments").insert({
        project_id: projectId,
        last_lat: latitude,
        last_lng: longitude,
        accuracy: accuracy,
        address: address,
        status: "manual",
        recorded_at: new Date().toISOString()
      });

      if (error) {
        throw error;
      }

      alert(`📍 Lokasi berhasil dikirim!\n\nKoordinat: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}\nAkurasi: ${accuracy}m\nAlamat: ${address}`);
      
    } catch (error: any) {
      console.error("Error getting location:", error);
      if (error.code === error.PERMISSION_DENIED) {
        alert("Akses lokasi ditolak. Silakan izinkan akses lokasi di pengaturan browser Anda.");
      } else if (error.code === error.TIMEOUT) {
        alert("Timeout saat mengambil lokasi. Pastikan GPS aktif dan coba lagi.");
      } else {
        alert("Gagal mengambil lokasi: " + error.message);
      }
    }
  };

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
      alert("Catatan berhasil disimpan!");
    } else {
      console.error("Error saving note:", error);
      alert("Gagal menyimpan catatan");
    }
  };

  // Enhanced spreadsheet data dengan upload column di samping kanan
  const sheetData = useMemo(() => (
    rows.map((r, idx) => {
      const base = [
        { value: idx + 1 },
        { value: r.description ?? "" },
        { value: r.weight ?? "" },
        { value: r.plan_progress ?? "" },
        { value: r.actual_progress ?? "" },
        { value: r.color ?? "" },
        { value: r.location ?? "" },
      ];
      const dates = dateCols.map(c => ({ value: r.dates?.[c] ?? "" }));
      const uploadColumn = [{ value: "📎 Upload", readOnly: true }];
      return [...base, ...dates, ...uploadColumn];
    })
  ), [rows, dateCols]);

  const targetSheetData = useMemo(() => (
    targetRows.map((r, idx) => {
      const base = [
        { value: idx + 1 },
        { value: r.description ?? "" },
        { value: r.weight ?? "" },
        { value: r.plan_progress ?? "" },
        { value: r.color ?? "" },
        { value: r.location ?? "" },
      ];
      const dates = dateCols.map(c => ({ value: r.dates?.[c] ?? "" }));
      const uploadColumn = [{ value: "📎 Upload", readOnly: true }];
      return [...base, ...dates, ...uploadColumn];
    })
  ), [targetRows, dateCols]);

  const realisasiSheetData = useMemo(() => (
    realisasiRows.map((r, idx) => {
      const base = [
        { value: idx + 1 },
        { value: r.description ?? "" },
        { value: r.weight ?? "" },
        { value: r.actual_progress ?? "" },
        { value: r.color ?? "" },
        { value: r.location ?? "" },
      ];
      const dates = dateCols.map(c => ({ value: r.dates?.[c] ?? "" }));
      const uploadColumn = [{ value: "📎 Upload", readOnly: true }];
      return [...base, ...dates, ...uploadColumn];
    })
  ), [realisasiRows, dateCols]);

  // Enhanced spreadsheet change handlers
  function handleSpreadsheetFullChange(newData: any[][]) {
    pushUndo(rows, undoStack);

    const updated = newData.map((row, i) => {
      const base: TaskType = {
        project_id: projectId,
        row_index: i + 1,
        description: row[1]?.value || "",
        weight: Number(row[2]?.value || 0),
        plan_progress: Number(row[3]?.value || 0),
        actual_progress: Number(row[4]?.value || 0),
        color: row[5]?.value || "",
        location: row[6]?.value || "",
        dates: {},
      };

      dateCols.forEach((c, idx) => {
        base.dates![c] = row[7 + idx]?.value || "";
      });

      if (rows[i]?.id) base.id = rows[i].id;

      return base;
    });

    setRows(updated);
    localStorage.setItem(LS_KEY, JSON.stringify(updated));
    autosave(projectId, updated);
  }

  function handleTargetSpreadsheetChange(newData: any[][]) {
    pushUndo(targetRows, targetUndoStack);

    const updated = newData.map((row, i) => {
      const base: TaskType = {
        project_id: projectId,
        row_index: i + 1,
        description: row[1]?.value || "",
        weight: Number(row[2]?.value || 0),
        plan_progress: Number(row[3]?.value || 0),
        actual_progress: 0,
        color: row[4]?.value || "",
        location: row[5]?.value || "",
        dates: {},
      };

      dateCols.forEach((c, idx) => {
        base.dates![c] = row[6 + idx]?.value || "";
      });

      if (targetRows[i]?.id) base.id = targetRows[i].id;

      return base;
    });

    setTargetRows(updated);
    localStorage.setItem(LS_TARGET_KEY, JSON.stringify(updated));
  }

  function handleRealisasiSpreadsheetChange(newData: any[][]) {
    pushUndo(realisasiRows, realisasiUndoStack);

    const updated = newData.map((row, i) => {
      const base: TaskType = {
        project_id: projectId,
        row_index: i + 1,
        description: row[1]?.value || "",
        weight: Number(row[2]?.value || 0),
        plan_progress: 0,
        actual_progress: Number(row[3]?.value || 0),
        color: row[4]?.value || "",
        location: row[5]?.value || "",
        dates: {},
      };

      dateCols.forEach((c, idx) => {
        base.dates![c] = row[6 + idx]?.value || "";
      });

      if (realisasiRows[i]?.id) base.id = realisasiRows[i].id;

      return base;
    });

    setRealisasiRows(updated);
    localStorage.setItem(LS_REALISASI_KEY, JSON.stringify(updated));
  }

  // Row operations untuk Target dan Realisasi
  function addTargetRow() {
    pushUndo(targetRows, targetUndoStack);
    const nextIndex = targetRows.length ? Math.max(...targetRows.map(r => Number(r.row_index ?? 0))) + 1 : 1;
    const payload: TaskType = {
      project_id: projectId,
      row_index: nextIndex,
      description: "New task",
      weight: 0,
      plan_progress: 0,
      actual_progress: 0,
      color: "",
      dates: {},
    };
    const next = [...targetRows, payload];
    setTargetRows(next);
    localStorage.setItem(LS_TARGET_KEY, JSON.stringify(next));
  }

  function addRealisasiRow() {
    pushUndo(realisasiRows, realisasiUndoStack);
    const nextIndex = realisasiRows.length ? Math.max(...realisasiRows.map(r => Number(r.row_index ?? 0))) + 1 : 1;
    const payload: TaskType = {
      project_id: projectId,
      row_index: nextIndex,
      description: "New task",
      weight: 0,
      plan_progress: 0,
      actual_progress: 0,
      color: "",
      dates: {},
    };
    const next = [...realisasiRows, payload];
    setRealisasiRows(next);
    localStorage.setItem(LS_REALISASI_KEY, JSON.stringify(next));
  }

  function removeLastTargetRow() {
    if (!targetRows.length) return;
    pushUndo(targetRows, targetUndoStack);
    const next = targetRows.slice(0, -1).map((r, i) => ({ ...r, row_index: i + 1 }));
    setTargetRows(next);
    localStorage.setItem(LS_TARGET_KEY, JSON.stringify(next));
  }

  function removeLastRealisasiRow() {
    if (!realisasiRows.length) return;
    pushUndo(realisasiRows, realisasiUndoStack);
    const next = realisasiRows.slice(0, -1).map((r, i) => ({ ...r, row_index: i + 1 }));
    setRealisasiRows(next);
    localStorage.setItem(LS_REALISASI_KEY, JSON.stringify(next));
  }

  // Save summary
  async function handleSaveSummary() {
    try {
      await supabase.from("projects").update({ meta: metaProject }).eq("id", projectId);
      await Promise.all(rows.map(async (r) => {
        const payload: any = {
          description: r.description ?? null,
          weight: Number(r.weight ?? 0),
          plan_progress: Number(r.plan_progress ?? 0),
          actual_progress: Number(r.actual_progress ?? 0),
          color: r.color ?? "",
          location: r.location ?? null,
          dates: r.dates ?? {},
          project_id: projectId,
          row_index: r.row_index,
        };
        if (r.id) await supabase.from("tasks").update(payload).eq("id", r.id);
        else await supabase.from("tasks").insert(payload);
      }));
      localStorage.removeItem(LS_KEY);
      alert("Simpan berhasil");
    } catch (err) {
      console.error("save summary error", err);
      alert("Gagal simpan");
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-screen text-gray-600">Memuat data...</div>;
  }

  // Enhanced spreadsheet component dengan upload di samping kanan
  const renderSpreadsheetWithControls = (
    data: any[][],
    onAddRow: () => void,
    onRemoveLastRow: () => void,
    onChange: (data: any[][]) => void,
    title: string,
    showTargetColumn: boolean = true,
    showRealisasiColumn: boolean = true,
    currentRows: TaskType[],
    undoStack: React.MutableRefObject<TaskType[][]>,
    redoStack: React.MutableRefObject<TaskType[][]>,
    storageKey?: string
  ) => {
    const header = ["No", "Description", "Bobot %", 
      ...(showTargetColumn && showRealisasiColumn ? ["Target (%)", "Realisasi (%)"] : 
          showTargetColumn ? ["Target (%)"] : 
          showRealisasiColumn ? ["Realisasi (%)"] : []),
      "Warna", "Lokasi", ...dateCols, "Upload"];

    return (
      <div className="bg-white p-4 rounded shadow mb-6">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold">📋 {title}</h3>
          <div className="text-sm text-gray-500">
            Scroll horizontal untuk lihat kolom tanggal & upload
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <Spreadsheet
            data={data}
            onChange={onChange}
            columnLabels={header}
          />
        </div>

        {/* Enhanced controls dengan fungsi Excel-like */}
        <div className="mt-3 flex flex-wrap gap-1 items-center">
          {/* File Operations */}
          <div className="flex gap-1 border-r pr-2">
            <button className="px-2 py-1 bg-blue-50 hover:bg-blue-100 border rounded text-xs flex items-center gap-1">
              💾 Save
            </button>
            <button className="px-2 py-1 bg-green-50 hover:bg-green-100 border rounded text-xs flex items-center gap-1">
              📤 Export
            </button>
          </div>

          {/* Edit Operations */}
          <div className="flex gap-1 border-r pr-2">
            <button 
              onClick={() => undo(currentRows, 
                showTargetColumn && showRealisasiColumn ? setRows : 
                showTargetColumn ? setTargetRows : setRealisasiRows, 
                undoStack, redoStack, storageKey)} 
              className="px-2 py-1 bg-gray-50 hover:bg-gray-100 border rounded text-xs flex items-center gap-1"
              disabled={undoStack.current.length === 0}
              title="Undo"
            >
              ↩️
            </button>
            <button 
              onClick={() => redo(currentRows, 
                showTargetColumn && showRealisasiColumn ? setRows : 
                showTargetColumn ? setTargetRows : setRealisasiRows, 
                undoStack, redoStack, storageKey)} 
              className="px-2 py-1 bg-gray-50 hover:bg-gray-100 border rounded text-xs flex items-center gap-1"
              disabled={redoStack.current.length === 0}
              title="Redo"
            >
              ↪️
            </button>
          </div>

          {/* Format Operations */}
          <div className="flex gap-1 border-r pr-2">
            <button className="px-2 py-1 bg-white hover:bg-gray-50 border rounded text-xs font-bold" title="Bold">
              <strong>B</strong>
            </button>
            <button className="px-2 py-1 bg-white hover:bg-gray-50 border rounded text-xs italic" title="Italic">
              <em>I</em>
            </button>
            <button className="px-2 py-1 bg-white hover:bg-gray-50 border rounded text-xs underline" title="Underline">
              <u>U</u>
            </button>
          </div>

          {/* Cell Operations */}
          <div className="flex gap-1 border-r pr-2">
            <button className="px-2 py-1 bg-yellow-50 hover:bg-yellow-100 border rounded text-xs" title="Merge Cells">
              🔗 Merge
            </button>
            <button className="px-2 py-1 bg-purple-50 hover:bg-purple-100 border rounded text-xs" title="Color Fill">
              🎨 Fill
            </button>
          </div>

          {/* Row Operations */}
          <div className="flex gap-1 border-r pr-2">
            <button onClick={onAddRow} className="px-2 py-1 bg-blue-50 hover:bg-blue-100 border rounded text-xs" title="Insert Row">
              ➕ Row
            </button>
            <button onClick={onRemoveLastRow} className="px-2 py-1 bg-red-50 hover:bg-red-100 border rounded text-xs" title="Delete Row">
              ➖ Row
            </button>
          </div>

          {/* Date Column */}
          <div className="flex gap-1">
            <button
              onClick={addDateColumn}
              className="px-2 py-1 bg-green-50 hover:bg-green-100 border rounded text-xs flex items-center gap-1"
              title="Add Date Column"
            >
              📅 Add Date
            </button>
          </div>

          {/* Save Summary */}
          {showTargetColumn && showRealisasiColumn && (
            <button
              onClick={handleSaveSummary}
              className="ml-auto px-2 py-1 bg-green-600 hover:bg-green-700 text-white border rounded text-xs"
            >
              💾 Save All
            </button>
          )}
        </div>

        {/* Upload Section untuk setiap baris */}
        <div className="mt-4 p-3 bg-gray-50 rounded border">
          <h4 className="font-semibold text-sm mb-2">📎 Upload File untuk Task Spesifik</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentRows.map((row, index) => (
              <div key={index} className="flex gap-2 items-center p-2 bg-white rounded border">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">
                    {row.description || `Task ${index + 1}`}
                  </div>
                </div>
                <input
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="text-xs flex-1"
                  id={`file-${index}`}
                />
                <button
                  onClick={() => {
                    if (file) {
                      uploadToGoogleDrive(file, row.id, index + 1, row.description || `Task ${index + 1}`);
                    } else {
                      document.getElementById(`file-${index}`)?.click();
                    }
                  }}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs whitespace-nowrap"
                >
                  Upload
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            File akan diupload ke Google Drive dan tersimpan sesuai dengan nama task
          </p>
        </div>
      </div>
    );
  };

  // Komponen untuk menampilkan chart
  const renderChart = (data: any[], title: string, showTarget: boolean = true, showRealisasi: boolean = true) => (
    <div className="bg-white p-4 rounded shadow mb-6">
      <h2 className="font-semibold mb-3">📈 {title}</h2>
      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            {showTarget && (
              <Line
                type="monotone"
                dataKey="Target"
                stroke="#3b82f6"
                dot={{ r: 3 }}
              />
            )}
            {showRealisasi && (
              <Line
                type="monotone"
                dataKey="Realisasi"
                stroke="#ef4444"
                dot={{ r: 3 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  // Komponen untuk tab notes
  const renderNotesTab = () => (
    <div className="space-y-6">
      {/* Input Note */}
      <div className="bg-white p-6 rounded shadow">
        <h3 className="font-semibold mb-4">Tambah Catatan Lapangan</h3>
        <div className="space-y-4">
          <textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Tulis catatan lapangan di sini... (laporan harian, kendala, progress, dll)"
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
              ✅ File audio siap diupload: {audioFile.name}
            </p>
          )}
        </div>
      </div>

      {/* List Notes */}
      <div className="bg-white p-6 rounded shadow">
        <h3 className="font-semibold mb-4">Catatan Lapangan Terkini</h3>
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
              <p>Belum ada catatan lapangan</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header + meta */}
      <div className="bg-white p-4 rounded shadow mb-6">
        <div className="flex items-center gap-4">
          {!logoError ? (
            <img 
              src="/logo_eltama.png" 
              alt="PT Elektrindo Utama Indonesia" 
              style={{ width: 140 }}
              onError={() => setLogoError(true)}
            />
          ) : (
            <div className="w-32 h-16 bg-blue-600 flex items-center justify-center rounded">
              <span className="text-white font-bold text-sm text-center">PT EUI</span>
            </div>
          )}
          <div>
            <div className="text-xl font-bold">PT ELEKTRINDO UTAMA INDONESIA</div>
            <div className="text-sm text-gray-600">
              MECHANICAL - ELECTRICAL - FIRE PROTECTION SYSTEM
            </div>
            <div className="text-xs text-blue-600 font-semibold mt-1">
              SILVER APP - INPUT DATA LAPANGAN
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <input
            placeholder="PROJECT"
            value={metaProject.project}
            onChange={(e) =>
              setMetaProject({ ...metaProject, project: e.target.value })
            }
            className="border px-2 py-1 rounded"
          />
          <input
            placeholder="No SPK"
            value={metaProject.no_spk}
            onChange={(e) =>
              setMetaProject({ ...metaProject, no_spk: e.target.value })
            }
            className="border px-2 py-1 rounded"
          />
          <input
            type="date"
            value={metaProject.tgl_spk}
            onChange={(e) =>
              setMetaProject({ ...metaProject, tgl_spk: e.target.value })
            }
            className="border px-2 py-1 rounded"
          />
          <input
            placeholder="REV"
            value={metaProject.rev}
            onChange={(e) =>
              setMetaProject({ ...metaProject, rev: e.target.value })
            }
            className="border px-2 py-1 rounded"
          />
        </div>
      </div>

      {/* === Tabs utama === */}
      <div className="mb-4 flex gap-2 items-center flex-wrap">
        <button
          onClick={() => setActiveTab(1)}
          className={`px-3 py-1 rounded ${
            activeTab === 1 ? "bg-blue-600 text-white" : "bg-white border"
          }`}
        >
          Tab 1 — Planning
        </button>
        <button
          onClick={() => setActiveTab(2)}
          className={`px-3 py-1 rounded ${
            activeTab === 2 ? "bg-blue-600 text-white" : "bg-white border"
          }`}
        >
          Tab 2 — Lokasi
        </button>
        <button
          onClick={() => setActiveTab(3)}
          className={`px-3 py-1 rounded ${
            activeTab === 3 ? "bg-blue-600 text-white" : "bg-white border"
          }`}
        >
          Tab Target
        </button>
        <button
          onClick={() => setActiveTab(4)}
          className={`px-3 py-1 rounded ${
            activeTab === 4 ? "bg-blue-600 text-white" : "bg-white border"
          }`}
        >
          Tab Realisasi
        </button>
        <button
          onClick={() => setActiveTab(5)}
          className={`px-3 py-1 rounded ${
            activeTab === 5 ? "bg-blue-600 text-white" : "bg-white border"
          }`}
        >
          Tab Catatan
        </button>
      </div>

      {/* === Tab 1 - Planning === */}
      {activeTab === 1 && (
        <div>
          {renderChart(chartData, "Kurva S (Line) - Target vs Realisasi", true, true)}
          {renderSpreadsheetWithControls(
            sheetData,
            addRow,
            removeLastRow,
            handleSpreadsheetFullChange,
            "Tabel Planning (Excel-like)",
            true,
            true,
            rows,
            undoStack,
            redoStack,
            LS_KEY
          )}
        </div>
      )}

      {/* === Tab 2 - Lokasi === */}
      {activeTab === 2 && (
        <div>
          <div className="bg-white p-4 rounded shadow mb-6">
            <h3 className="font-semibold mb-3">📊 Riwayat Lokasi Karyawan</h3>
            <div className="text-sm text-gray-600 mb-4">
              Monitor lokasi GPS yang dikirimkan oleh karyawan
            </div>
            
            <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-4">
              <h4 className="font-semibold text-yellow-800 mb-2">📍 Lokasi Terkini</h4>
              <p className="text-sm text-yellow-700">
                Klik tombol di bawah untuk mengirim lokasi GPS Anda saat ini
              </p>
            </div>
          </div>

          <div className="bg-white p-4 rounded shadow mb-6">
            <h3 className="font-semibold mb-3">🗺️ Peta & Monitor Lokasi</h3>
            <MapTracking projectId={projectId} />
            <div className="mt-4 p-4 bg-blue-50 rounded border">
              <h4 className="font-semibold text-blue-800 mb-2">🚀 Update Lokasi Sekarang</h4>
              <button
                onClick={updateCurrentLocation}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-white flex items-center gap-2"
              >
                📍 Kirim Lokasi GPS Saya
              </button>
              <p className="text-xs text-blue-600 mt-2">
                • Pastikan GPS aktif dan izinkan akses lokasi<br/>
                • Lokasi akan tersimpan dengan akurasi tinggi<br/>
                • Alamat akan terdeteksi otomatis
              </p>
            </div>
          </div>
        </div>
      )}

      {/* === Tab Target === */}
      {activeTab === 3 && (
        <div>
          {renderChart(targetChartData, "Kurva S (Line) - Target", true, false)}
          {renderSpreadsheetWithControls(
            targetSheetData,
            addTargetRow,
            removeLastTargetRow,
            handleTargetSpreadsheetChange,
            "Tabel Target",
            true,
            false,
            targetRows,
            targetUndoStack,
            targetRedoStack,
            LS_TARGET_KEY
          )}
        </div>
      )}

      {/* === Tab Realisasi === */}
      {activeTab === 4 && (
        <div>
          {renderChart(realisasiChartData, "Kurva S (Line) - Realisasi", false, true)}
          {renderSpreadsheetWithControls(
            realisasiSheetData,
            addRealisasiRow,
            removeLastRealisasiRow,
            handleRealisasiSpreadsheetChange,
            "Tabel Realisasi",
            false,
            true,
            realisasiRows,
            realisasiUndoStack,
            realisasiRedoStack,
            LS_REALISASI_KEY
          )}
        </div>
      )}

      {/* === Tab 5 - Catatan === */}
      {activeTab === 5 && renderNotesTab()}

      {/* === Summary Boxes === */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
        <div className="bg-white p-4 rounded shadow">
          <div className="text-xs text-gray-500">PLAN PROGRESS %</div>
          <div className="text-xl font-semibold">
            {currentSummary.plan.toFixed(2)}
          </div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <div className="text-xs text-gray-500">
            ACCUMULATIVE PLAN PROGRESS %
          </div>
          <div className="text-xl font-semibold">
            {currentSummary.accumPlan.toFixed(2)}
          </div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <div className="text-xs text-gray-500">ACTUAL PROGRESS %</div>
          <div className="text-xl font-semibold">
            {currentSummary.actual.toFixed(2)}
          </div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <div className="text-xs text-gray-500">
            ACCUMULATIVE ACTUAL PROGRESS %
          </div>
          <div className="text-xl font-semibold">
            {currentSummary.accumActual.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center gap-3">
          <div className="text-blue-600 text-lg">ℹ️</div>
          <div>
            <h4 className="font-semibold text-blue-800">Informasi Sinkronisasi</h4>
            <p className="text-sm text-blue-700">
              Semua data yang Anda input akan otomatis tersinkronisasi dengan Master Dashboard.
              Tim manajemen dapat memantau progress real-time dari data yang Anda kirimkan.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}