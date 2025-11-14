// app/projects/[projectId]/components/ExcelGrid.tsx
"use client";
import React, { useEffect, useState } from "react";
import { DataGrid, Column } from "react-data-grid";
import { supabase } from "../../../../lib/supabaseClient";

// Definisi tipe data tiap baris
type Task = {
  id: string;
  row_index: number;
  description: string;
  schedule_date: string | null;
  weight: number | null;
  plan_progress: number | null;
  actual_progress: number | null;
  color: string | null;
  assigned_to?: string;
};

export default function ExcelGrid({
  projectId,
  readOnly = false,
}: {
  projectId: string;
  readOnly?: boolean;
}) {
  const [rows, setRows] = useState<Task[]>([]);

  // Ambil data + Realtime Supabase v2
  useEffect(() => {
    fetchRows();

    const channel = supabase
      .channel(`tasks-changes-${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `project_id=eq.${projectId}` },
        (_payload: any) => {
          fetchRows();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  // Ambil data tasks dari database
  async function fetchRows() {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("project_id", projectId)
      .order("row_index", { ascending: true });

    if (error) console.error("Error fetching rows:", error);
    else setRows(data || []);
  }

  // Update perubahan data ke database
  async function updateRow(r: Task) {
    await supabase
      .from("tasks")
      .update({
        description: r.description,
        schedule_date: r.schedule_date,
        weight: r.weight,
        plan_progress: r.plan_progress,
        actual_progress: r.actual_progress,
        color: r.color,
        assigned_to: r.assigned_to,
        last_update: new Date().toISOString(),
      })
      .eq("id", r.id);
  }

  // Kolom tabel (mirip Excel)
  const columns: Column<Task>[] = [
    { key: "row_index", name: "No", width: 50 },
    { key: "description", name: "Deskripsi", editable: !readOnly, resizable: true },
    { key: "schedule_date", name: "Tanggal", editable: !readOnly },
    { key: "weight", name: "Bobot (%)", editable: !readOnly },
    { key: "plan_progress", name: "Rencana (%)", editable: !readOnly },
    { key: "actual_progress", name: "Realisasi (%)", editable: !readOnly },
    { key: "color", name: "Warna", editable: !readOnly },
    { key: "assigned_to", name: "Penanggung Jawab", editable: !readOnly },
  ];

  // Saat data diubah
  function onRowsChange(newRows: Task[], changes: any) {
    setRows(newRows);
    const updatedRow = newRows[changes.indexes[0]];
    if (updatedRow) updateRow(updatedRow);
  }

  return (
    <div className="bg-white rounded shadow p-4">
      <DataGrid
        columns={columns}
        rows={rows}
        onRowsChange={onRowsChange}
        className="border border-gray-200"
      />
    </div>
  );
}
