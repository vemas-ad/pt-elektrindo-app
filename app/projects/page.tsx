"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useRouter } from "next/navigation";
import { handleLogout } from "@/lib/logout";

type Project = {
  id: number;
  name: string;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
};

export default function ProjectsPage(): React.ReactElement {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const router = useRouter();

  // 🧠 Ambil role user aktif dari Supabase
  useEffect(() => {
    async function fetchUserRole() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/");
        return;
      }

      const { data, error } = await supabase
        .from("users")
        .select("role")
        .eq("email", user.email)
        .single();

      if (error || !data) {
        console.error("Gagal ambil role:", error);
        router.push("/");
        return;
      }

      setRole(data.role);
    }

    fetchUserRole();
  }, [router]);

  // 🔁 Ambil daftar proyek realtime
  useEffect(() => {
    fetchProjects();

    const channel = supabase
      .channel("public:projects")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projects" },
        () => fetchProjects()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 📦 Ambil data project dari DB
  async function fetchProjects() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("id", { ascending: false });

      if (error) {
        console.error("fetchProjects error:", error);
        setProjects([]);
      } else {
        setProjects(data || []);
      }
    } catch (err) {
      console.error("fetchProjects exception:", err);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }

  // ➕ Tambah project baru
  async function addProject() {
    if (!name.trim()) return alert("Masukkan nama project.");
    setLoading(true);
    try {
      const { error } = await supabase.from("projects").insert({
        name,
        description,
        status: "ongoing",
      });

      if (error) {
        console.error("addProject error:", error);
        alert("Gagal menambah project: " + error.message);
      } else {
        setName("");
        setDescription("");
        fetchProjects();
      }
    } catch (err) {
      console.error(err);
      alert("Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  }

  // ❌ Hapus project
  async function deleteProject(id: number) {
    if (!confirm("Hapus project ini?")) return;
    setLoading(true);
    try {
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) {
        console.error("deleteProject error:", error);
        alert("Gagal menghapus: " + error.message);
      } else {
        fetchProjects();
      }
    } catch (err) {
      console.error(err);
      alert("Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  }

  // 🚀 Buka dashboard sesuai role
  const openProject = (id: number) => {
    localStorage.setItem("selectedProject", String(id));
    if (role === "master") {
      router.push(`/projects/${id}/master`);
    } else {
      router.push(`/projects/${id}/silver`);
    }
  };

  return (
    <div className="p-6 min-h-screen bg-gray-100">
      {/* Header */}
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Daftar Proyek</h1>
        <button
          onClick={handleLogout}
          className="rounded bg-red-500 px-3 py-1 text-white hover:bg-red-600"
        >
          Logout
        </button>
      </header>

      {/* Form tambah project */}
      <div className="bg-white rounded shadow p-4 mb-6">
        <h2 className="text-lg font-semibold mb-3">Tambah Proyek Baru</h2>
        <div className="flex flex-col md:flex-row gap-2">
          <input
            className="border px-2 py-1 rounded flex-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nama proyek"
          />
          <input
            className="border px-2 py-1 rounded flex-1"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Deskripsi proyek"
          />
          <button
            onClick={addProject}
            className="bg-blue-600 text-white px-4 rounded disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Memproses..." : "Tambah"}
          </button>
        </div>
      </div>

      {/* List project */}
      {loading && projects.length === 0 ? (
        <div>Loading...</div>
      ) : projects.length === 0 ? (
        <div className="text-gray-500 italic">Belum ada project.</div>
      ) : (
        <ul className="space-y-3">
          {projects.map((p) => (
            <li
              key={p.id}
              className="p-4 bg-white rounded shadow flex justify-between items-center hover:shadow-md transition"
            >
              <div>
                <div className="font-semibold text-lg">{p.name}</div>
                {p.description && (
                  <div className="text-sm text-gray-500">{p.description}</div>
                )}
                <div className="text-xs text-gray-400">
                  Status: {p.status || "ongoing"}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => openProject(p.id)}
                  className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
                >
                  Open
                </button>
                <button
                  onClick={() => deleteProject(p.id)}
                  className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
