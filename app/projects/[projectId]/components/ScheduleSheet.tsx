"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabaseClient";

type TaskRow = {
  id?: number | null;
  project_id?: number | string | null;
  row_index?: number;
  description?: string | null;
  weight?: number | null;
  plan_progress?: number | null;
  actual_progress?: number | null;
  color?: string | null;
  item_name?: string | null;
  contractor?: string | null;
  location?: string | null;
  proof_url?: string | null;
  last_lat?: number | null;
  last_lng?: number | null;
  schedule_date?: string | null;
};

export default function ScheduleSheet({
  projectId,
  editable = true,
}: {
  projectId: string | number;
  editable?: boolean;
}) {
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    loadRows();

    const chan = supabase
      .channel(`public:tasks:project_${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `project_id=eq.${projectId}` },
        () => {
          loadRows();
        }
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(chan);
      } catch (e) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function loadRows() {
    setLoading(true);
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("project_id", projectId)
      .order("row_index", { ascending: true });

    if (error) {
      console.error("loadRows error", error);
      setRows([]);
    } else {
      // if empty, seed a few rows
      if (!data || data.length === 0) {
        const seed = [
          { description: "Persiapan", row_index: 1 },
          { description: "Pelaksanaan 1", row_index: 2 },
          { description: "Finish", row_index: 3 },
        ].map((r, i) => ({ ...r, weight: 0, plan_progress: 0, actual_progress: 0 }));
        setRows(seed as TaskRow[]);
      } else {
        setRows(data as TaskRow[]);
      }
    }
    setLoading(false);
  }

  // Upsert row to DB (insert if no id)
  async function saveRow(row: TaskRow) {
    try {
      const payload = {
        ...row,
        project_id: projectId,
        weight: row.weight ?? 0,
        plan_progress: row.plan_progress ?? 0,
        actual_progress: row.actual_progress ?? 0,
        updated_at: new Date().toISOString(),
      };
      if (row.id) {
        const { error } = await supabase.from("tasks").update(payload).eq("id", row.id);
        if (error) console.error("saveRow update error", error);
      } else {
        const { error } = await supabase.from("tasks").insert(payload);
        if (error) console.error("saveRow insert error", error);
      }
    } catch (e) {
      console.error("saveRow exception", e);
    }
  }

  // on cell change
  function updateCell(index: number, key: keyof TaskRow, value: any) {
    setRows((prev) => {
      const copy = [...prev];
      const r = { ...(copy[index] || {}) };
      if (key === "weight" || key === "plan_progress" || key === "actual_progress") {
(r as any)[key] = value === "" ? 0 : Number(value);
      } else {
(r as any)[key] = value;
      }
      copy[index] = r;
      // save debounce quickly
      saveRow(r);
      return copy;
    });
  }

  async function addRow() {
    const idx = rows.length + 1;
    const newRow: TaskRow = {
      project_id: projectId,
      row_index: idx,
      description: "",
      weight: 0,
      plan_progress: 0,
      actual_progress: 0,
      color: "white",
    };
    // insert immediately
    const { data, error } = await supabase.from("tasks").insert(newRow).select().single();
    if (error) {
      console.error("addRow error", error);
    } else {
      setRows((p) => [...p, data as TaskRow]);
    }
  }

  async function deleteRow(rowId?: number, index?: number) {
    if (!rowId) {
      // if unsaved local row, just remove
      setRows((p) => p.filter((_, i) => i !== (index ?? -1)));
      return;
    }
    if (!confirm("Hapus baris ini?")) return;
    const { error } = await supabase.from("tasks").delete().eq("id", rowId);
    if (error) console.error("deleteRow error", error);
    setRows((p) => p.filter((r) => r.id !== rowId));
  }

  if (loading) return <div className="p-4 text-gray-600">Memuat sheet...</div>;

  return (
    <div>
      <div className="flex gap-2 mb-3 items-center">
        {editable && (
          <>
            <button onClick={addRow} className="bg-green-600 text-white px-3 py-1 rounded">+ Baris</button>
            <button
              onClick={async () => {
                // add column: not implemented full dynamic columns; we keep fixed columns like requested
                alert("Untuk menambah kolom, gunakan fitur export/import (nanti dikembangkan).");
              }}
              className="bg-blue-500 text-white px-3 py-1 rounded"
            >
              + Kolom
            </button>
          </>
        )}
        <div className="text-sm text-gray-500">Kolom: No, Deskripsi, Bobot %, Target (%), Realisasi (%), Warna, Barang, Kontraktor, Lokasi, Tgl</div>
      </div>

      <div className="overflow-auto border rounded">
        <table className="min-w-max w-full table-auto">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 border">No</th>
              <th className="p-2 border">Deskripsi</th>
              <th className="p-2 border">Bobot (%)</th>
              <th className="p-2 border">Target (%)</th>
              <th className="p-2 border">Realisasi (%)</th>
              <th className="p-2 border">Warna</th>
              <th className="p-2 border">Nama Barang</th>
              <th className="p-2 border">Kontraktor</th>
              <th className="p-2 border">Lokasi</th>
              <th className="p-2 border">Tgl</th>
              {editable && <th className="p-2 border">Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id ?? `r-${i}`} className="odd:bg-white even:bg-gray-50">
                <td className="p-2 border text-center">{i + 1}</td>

                <td className="p-2 border">
                  {editable ? (
                    <input value={r.description ?? ""} onChange={(e) => updateCell(i, "description", e.target.value)} className="w-full" />
                  ) : (
                    <span>{r.description}</span>
                  )}
                </td>

                <td className="p-2 border">
                  {editable ? (
                    <input type="number" step="0.01" min="0" max="100" value={r.weight ?? 0} onChange={(e) => updateCell(i, "weight", e.target.value)} className="w-full" />
                  ) : (
                    <span>{r.weight ?? 0}</span>
                  )}
                </td>

                <td className="p-2 border">
                  {editable ? (
                    <input type="number" step="0.01" min="0" max="100" value={r.plan_progress ?? 0} onChange={(e) => updateCell(i, "plan_progress", e.target.value)} className="w-full" />
                  ) : (
                    <span>{r.plan_progress ?? 0}</span>
                  )}
                </td>

                <td className="p-2 border">
                  {editable ? (
                    <input type="number" step="0.01" min="0" max="100" value={r.actual_progress ?? 0} onChange={(e) => updateCell(i, "actual_progress", e.target.value)} className="w-full" />
                  ) : (
                    <span>{r.actual_progress ?? 0}</span>
                  )}
                </td>

                <td className="p-2 border">
                  {editable ? (
                    <select value={r.color ?? "white"} onChange={(e) => updateCell(i, "color", e.target.value)}>
                      <option value="white">Default</option>
                      <option value="red">Merah</option>
                      <option value="yellow">Kuning</option>
                      <option value="green">Hijau</option>
                    </select>
                  ) : (
                    <span>{r.color ?? "-"}</span>
                  )}
                </td>

                <td className="p-2 border">
                  {editable ? (
                    <input value={r.item_name ?? ""} onChange={(e) => updateCell(i, "item_name", e.target.value)} className="w-full" />
                  ) : (
                    <span>{r.item_name ?? "-"}</span>
                  )}
                </td>

                <td className="p-2 border">
                  {editable ? (
                    <input value={r.contractor ?? ""} onChange={(e) => updateCell(i, "contractor", e.target.value)} className="w-full" />
                  ) : (
                    <span>{r.contractor ?? "-"}</span>
                  )}
                </td>

                <td className="p-2 border">
                  {editable ? (
                    <input value={r.location ?? ""} onChange={(e) => updateCell(i, "location", e.target.value)} className="w-full" />
                  ) : (
                    <span>{r.location ?? "-"}</span>
                  )}
                  {/* quick map btn */}
                  {r.last_lat && r.last_lng && (
                    <div className="mt-1">
                      <a target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${r.last_lat},${r.last_lng}`} className="text-xs text-blue-600">
                        Lihat Lokasi
                      </a>
                    </div>
                  )}
                </td>

                <td className="p-2 border">
                  {editable ? (
                    <input type="date" value={r.schedule_date ? r.schedule_date.split("T")?.[0] : ""} onChange={(e) => updateCell(i, "schedule_date", e.target.value)} className="w-full" />
                  ) : (
                    <span>{r.schedule_date ? new Date(r.schedule_date).toLocaleDateString() : "-"}</span>
                  )}
                </td>

                {editable && (
                  <td className="p-2 border text-center">
                    <button className="text-red-600" onClick={() => deleteRow(r.id ?? undefined, i)}>Hapus</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
