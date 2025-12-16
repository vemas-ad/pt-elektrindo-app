// app/projects/[projectId]/components/ExcelGrid.tsx - VERSI FINAL
"use client";
import React, { useEffect, useState } from "react";
import DataGrid, { Column, RenderCellProps } from "react-data-grid";
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

// Custom cell editor untuk input desimal
const DecimalCellEditor = ({ row, column, onRowChange, onClose }: any) => {
  const [value, setValue] = useState(row[column.key] || "");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    // Izinkan angka, koma, titik, dan minus
    if (inputValue === "" || /^-?\d*[,.]?\d*$/.test(inputValue)) {
      setValue(inputValue);
    }
  };

  const handleBlur = () => {
    // Konversi koma ke titik untuk database
    let finalValue = value;
    if (finalValue) {
      finalValue = finalValue.replace(',', '.');
      const numValue = parseFloat(finalValue);
      if (!isNaN(numValue)) {
        finalValue = Math.min(numValue, 100).toFixed(2);
      } else {
        finalValue = "";
      }
    }
    
    onRowChange({ ...row, [column.key]: finalValue });
    onClose(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleBlur();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <input
      type="text"
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className="w-full h-full px-2 border border-blue-400 outline-none"
      autoFocus
      placeholder="0,00"
    />
  );
};

// Custom cell renderer untuk display desimal
const DecimalCellRenderer = ({ row, column }: RenderCellProps<Task>) => {
  const value = row[column.key as keyof Task];
  
  if (value === null || value === undefined || value === "") {
    return <div className="px-2 py-1"></div>;
  }

  // Format untuk display dengan koma
  const displayValue = typeof value === 'number' 
    ? value.toFixed(2).replace('.', ',')
    : String(value).replace('.', ',');

  return (
    <div className="px-2 py-1" title={displayValue}>
      {displayValue}
    </div>
  );
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
    // Parse desimal values sebelum save
    const parseDecimal = (value: any) => {
      if (value === null || value === undefined || value === "") return null;
      if (typeof value === 'string') {
        const normalized = value.replace(',', '.');
        const num = parseFloat(normalized);
        return isNaN(num) ? null : parseFloat(num.toFixed(2));
      }
      return typeof value === 'number' ? parseFloat(value.toFixed(2)) : null;
    };

    await supabase
      .from("tasks")
      .update({
        description: r.description,
        schedule_date: r.schedule_date,
        weight: parseDecimal(r.weight),
        plan_progress: parseDecimal(r.plan_progress),
        actual_progress: parseDecimal(r.actual_progress),
        color: r.color,
        assigned_to: r.assigned_to,
        last_update: new Date().toISOString(),
      } as any) // Tambahkan type assertion untuk menghindari error TypeScript
      .eq("id", r.id);
  }

  // Kolom tabel (mirip Excel)
  const columns: Column<Task>[] = [
    { 
      key: "row_index", 
      name: "No", 
      width: 50,
      renderCell: (props) => (
        <div className="px-2 py-1 text-center">{props.row.row_index}</div>
      )
    },
    { 
      key: "description", 
      name: "Deskripsi", 
      editable: !readOnly, 
      resizable: true,
      renderEditCell: (props) => (
        <input
          type="text"
          value={props.row.description || ""}
          onChange={(e) => props.onRowChange({ ...props.row, description: e.target.value })}
          className="w-full h-full px-2 border border-blue-400 outline-none"
          autoFocus
        />
      )
    },
    { 
      key: "schedule_date", 
      name: "Tanggal", 
      editable: !readOnly,
      renderEditCell: (props) => (
        <input
          type="date"
          value={props.row.schedule_date || ""}
          onChange={(e) => props.onRowChange({ ...props.row, schedule_date: e.target.value })}
          className="w-full h-full px-2 border border-blue-400 outline-none"
          autoFocus
        />
      )
    },
    { 
      key: "weight", 
      name: "Bobot (%)", 
      editable: !readOnly,
      renderCell: DecimalCellRenderer,
      renderEditCell: DecimalCellEditor
    },
    { 
      key: "plan_progress", 
      name: "Rencana (%)", 
      editable: !readOnly,
      renderCell: DecimalCellRenderer,
      renderEditCell: DecimalCellEditor
    },
    { 
      key: "actual_progress", 
      name: "Realisasi (%)", 
      editable: !readOnly,
      renderCell: DecimalCellRenderer,
      renderEditCell: DecimalCellEditor
    },
    { 
      key: "color", 
      name: "Warna", 
      editable: !readOnly,
      renderEditCell: (props) => (
        <input
          type="color"
          value={props.row.color || "#ffffff"}
          onChange={(e) => props.onRowChange({ ...props.row, color: e.target.value })}
          className="w-full h-full px-2"
          autoFocus
        />
      )
    },
    { 
      key: "assigned_to", 
      name: "Penanggung Jawab", 
      editable: !readOnly,
      renderEditCell: (props) => (
        <input
          type="text"
          value={props.row.assigned_to || ""}
          onChange={(e) => props.onRowChange({ ...props.row, assigned_to: e.target.value })}
          className="w-full h-full px-2 border border-blue-400 outline-none"
          autoFocus
        />
      )
    },
  ];

  // Saat data diubah
  function onRowsChange(newRows: Task[], changes: any) {
    setRows(newRows);
    const updatedRow = newRows[changes.indexes[0]];
    if (updatedRow) updateRow(updatedRow);
  }

  return (
    <div className="bg-white rounded shadow p-4">
      <div className="mb-3 text-sm text-gray-600">
        💡 <strong>Input desimal dengan koma (,)</strong> otomatis akan dikonversi ke titik (.) untuk database
      </div>
      <DataGrid
        columns={columns}
        rows={rows}
        onRowsChange={onRowsChange}
        className="border border-gray-200 rdg-light"
        rowHeight={40}
      />
    </div>
  );
}