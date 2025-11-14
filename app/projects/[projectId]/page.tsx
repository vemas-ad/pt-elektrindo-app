// app/projects/[projectId]/page.tsx
"use client";

import React from "react";
import { useRouter, useParams } from "next/navigation";

export default function ProjectRoot() {
  const router = useRouter();
  const params = useParams(); // bisa null menurut TS
  const projectId = params?.projectId as string | undefined;

  // Jika params belum tersedia, tampilkan loading singkat
  if (!projectId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center p-6 bg-white rounded shadow">
          <div className="mb-2 text-lg font-medium">Memuat project…</div>
          <div className="text-sm text-gray-500">Tunggu sebentar</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="bg-white shadow rounded-lg p-6">
        <h1 className="text-2xl font-bold mb-4">Project Dashboard</h1>
        <p className="text-sm text-gray-600 mb-6">
          ID Project: <span className="font-mono text-gray-800">{projectId}</span>
        </p>

        <div className="flex gap-4">
          <button
            onClick={() => router.push(`/projects/${projectId}/silver`)}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Silver Dashboard
          </button>

          <button
            onClick={() => router.push(`/projects/${projectId}/master`)}
            className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
          >
            Master Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
