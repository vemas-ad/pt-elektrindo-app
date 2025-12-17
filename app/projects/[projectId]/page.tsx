// app/projects/[projectId]/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient"; // Pastikan path ini sesuai

export default function ProjectRoot() {
  const router = useRouter();
  const params = useParams();
  const projectId = params?.projectId as string | undefined;
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    // Cek session user
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data?.session) {
        router.push("/");
        return;
      }
      setUser(data.session.user);
      setLoading(false);
    };

    checkSession();
  }, [router]);

  // Jika params belum tersedia atau loading, tampilkan loading
  if (!projectId || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center p-6 bg-white rounded shadow">
          <div className="mb-2 text-lg font-medium">Memuat project…</div>
          <div className="text-sm text-gray-500">Tunggu sebentar</div>
        </div>
      </div>
    );
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header dengan logout */}
      <header className="flex justify-between items-center bg-indigo-700 text-white p-4 rounded-md shadow mb-6">
        <h1 className="text-2xl font-bold">Project Dashboard</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm">Welcome, {user?.email}</span>
          <button
            onClick={handleLogout}
            className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded text-sm font-medium"
          >
            Logout
          </button>
        </div>
      </header>

      <div className="bg-white shadow rounded-lg p-6">
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2">Informasi Project</h2>
          <p className="text-sm text-gray-600">
            ID Project: <span className="font-mono text-gray-800 bg-gray-100 px-2 py-1 rounded">{projectId}</span>
          </p>
          <p className="text-sm text-gray-600 mt-2">
            Pilih dashboard sesuai level akses Anda:
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border rounded-lg p-6 hover:shadow-md transition-shadow">
            <h3 className="text-lg font-medium mb-3 text-blue-700">Silver Dashboard</h3>
            <p className="text-sm text-gray-600 mb-4">
              Akses untuk tim operasional dengan kemampuan edit schedule dan monitoring progress.
            </p>
            <button
              onClick={() => router.push(`/projects/${projectId}/silver`)}
              className="w-full bg-blue-600 text-white px-4 py-3 rounded hover:bg-blue-700 transition-colors"
            >
              Buka Silver Dashboard
            </button>
          </div>

          <div className="border rounded-lg p-6 hover:shadow-md transition-shadow">
            <h3 className="text-lg font-medium mb-3 text-gray-700">Master Dashboard</h3>
            <p className="text-sm text-gray-600 mb-4">
              Akses untuk manajemen dengan kemampuan monitoring semua project dan analisis data.
            </p>
            <button
              onClick={() => router.push(`/projects/${projectId}/master`)}
              className="w-full bg-gray-600 text-white px-4 py-3 rounded hover:bg-gray-700 transition-colors"
            >
              Buka Master Dashboard
            </button>
          </div>
        </div>

        {/* Navigasi cepat */}
        <div className="mt-8 pt-6 border-t">
          <h3 className="text-lg font-medium mb-3">Navigasi Cepat</h3>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => router.push("/dashboard")}
              className="bg-gray-200 text-gray-700 px-3 py-1 rounded text-sm hover:bg-gray-300"
            >
              Dashboard Utama
            </button>
            <button
              onClick={() => router.push("/projects")}
              className="bg-gray-200 text-gray-700 px-3 py-1 rounded text-sm hover:bg-gray-300"
            >
              Daftar Project
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}