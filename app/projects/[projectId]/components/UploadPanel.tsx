"use client";

import React, { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function UploadPanel({ projectId }: { projectId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const upload = async () => {
    if (!file) {
      alert("Pilih file terlebih dahulu");
      return;
    }

    setLoading(true);

    try {
      const fileName = `${Date.now()}_${file.name}`;

      // Upload file ke storage
      const { error: uploadError } = await supabase.storage
        .from("project-uploads")
        .upload(fileName, file);

      if (uploadError) {
        alert("Upload gagal: " + uploadError.message);
        return;
      }

      // Ambil public URL secara resmi dari Supabase
      const { data } = supabase.storage
        .from("project-uploads")
        .getPublicUrl(fileName);

      const publicUrl = data.publicUrl;

      // ⬇⬇⬇ INI KUNCI FIX TS2769 ⬇⬇⬇
      const { error: insertError } = await supabase
        .from("uploads")
        .insert([
          {
            project_id: projectId,
            filename: fileName,
            url: publicUrl,
          },
        ] as any);

      if (insertError) {
        alert("Gagal simpan data: " + insertError.message);
        return;
      }

      alert("Upload berhasil");
      setFile(null);
    } catch (err) {
      console.error(err);
      alert("Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-4 rounded shadow">
      <h3 className="font-semibold mb-2">Upload Bukti Progres</h3>

      <input
        type="file"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />

      <button
        onClick={upload}
        disabled={loading}
        className="bg-blue-600 text-white px-3 py-1 rounded mt-2 disabled:opacity-60"
      >
        {loading ? "Mengunggah..." : "Upload"}
      </button>
    </div>
  );
}
