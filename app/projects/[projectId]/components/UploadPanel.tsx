// app/projects/[projectId]/components/UploadPanel.tsx
"use client";
import React, { useState } from "react";
import { supabase } from "../../../../lib/supabaseClient";

export default function UploadPanel({ projectId }: { projectId: string }) {
  const [file, setFile] = useState<File | null>(null);

  async function upload() {
    if (!file) return alert("Pilih file");
    const fileName = `${Date.now()}_${file.name}`;
    const { data, error } = await supabase.storage.from("project-uploads").upload(fileName, file);
    if (error) return alert("Upload gagal: " + error.message);
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/project-uploads/${fileName}`;
    await supabase.from("uploads").insert({ project_id: projectId, filename: fileName, url });
    alert("Berhasil upload");
  }

  return (
    <div className="bg-white p-4 rounded shadow">
      <h3 className="font-semibold mb-2">Upload Bukti Progres</h3>
      <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <button onClick={upload} className="bg-blue-600 text-white px-3 py-1 rounded mt-2">Upload</button>
    </div>
  );
}
