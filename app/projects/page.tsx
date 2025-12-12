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
  meta?: any;
  deadline?: string | null;
  created_at?: string;
};

type ProjectMetaType = {
  project_code?: string;
  job_name?: string;
  no_rks?: string;
  date?: string;
  client?: string;
  address?: string;
  time_schedule?: string;
  deadline?: string;
};

// PERBAIKAN: Komponen Countdown Timer yang lebih baik - DIPERBAIKI
const CountdownTimer = ({ deadline }: { deadline: string }) => {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    isOverdue: false
  });

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const deadlineTime = new Date(deadline).getTime();
      
      // Validasi tanggal deadline
      if (isNaN(deadlineTime)) {
        setTimeLeft({
          days: 0,
          hours: 0,
          minutes: 0,
          seconds: 0,
          isOverdue: false
        });
        return;
      }
      
      const difference = deadlineTime - now;

      if (difference <= 0) {
        setTimeLeft({
          days: 0,
          hours: 0,
          minutes: 0,
          seconds: 0,
          isOverdue: true
        });
        return;
      }

      setTimeLeft({
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((difference % (1000 * 60)) / 1000),
        isOverdue: false
      });
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(timer);
  }, [deadline]);

  // Jika deadline tidak valid
  if (!deadline || isNaN(new Date(deadline).getTime())) {
    return (
      <div className="flex items-center gap-1 text-gray-500 text-sm">
        <span>ðŸ“…</span>
        <span>Deadline tidak valid</span>
      </div>
    );
  }

  if (timeLeft.isOverdue) {
    return (
      <div className="flex items-center gap-1 text-red-600 font-semibold text-sm">
        <span>â°</span>
        <span>TELAT</span>
      </div>
    );
  }

  if (timeLeft.days > 30) {
    return (
      <div className="flex items-center gap-1 text-green-600 text-sm">
        <span>ðŸ“…</span>
        <span>{timeLeft.days} hari</span>
      </div>
    );
  }

  if (timeLeft.days > 7) {
    return (
      <div className="flex items-center gap-1 text-orange-500 text-sm">
        <span>â³</span>
        <span>{timeLeft.days} hari</span>
      </div>
    );
  }

  if (timeLeft.days > 0) {
    return (
      <div className="flex items-center gap-1 text-red-500 font-semibold text-sm">
        <span>ðŸš¨</span>
        <span>{timeLeft.days}d {timeLeft.hours}h</span>
      </div>
    );
  }

  // PERBAIKAN: Format waktu yang benar untuk jam dan menit
  return (
    <div className="flex items-center gap-1 text-red-600 font-bold text-sm">
      <span>ðŸ”¥</span>
      <span>{timeLeft.hours}j {timeLeft.minutes}m {timeLeft.seconds}d</span>
    </div>
  );
};

// Komponen User Profile
const UserProfile = () => {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<string | null>(null);

  useEffect(() => {
    const email = localStorage.getItem("userEmail");
    const profile = localStorage.getItem("userProfile");
    setUserEmail(email);
    setUserProfile(profile);
  }, []);

  if (!userEmail) return null;

  return (
    <div className="flex items-center gap-3 bg-blue-50 px-3 py-2 rounded-lg border border-blue-200">
      <img 
        src={userProfile || `https://ui-avatars.com/api/?name=${encodeURIComponent(userEmail.split('@')[0])}&background=random`}
        alt="Profile" 
        className="w-8 h-8 rounded-full"
      />
      <div>
        <div className="text-sm font-medium text-gray-800">{userEmail}</div>
        <div className="text-xs text-gray-500 capitalize">
          {localStorage.getItem("userRole")}
        </div>
      </div>
    </div>
  );
};

export default function ProjectsPage(): React.ReactElement {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const router = useRouter();

  // State untuk form deskripsi proyek terstruktur
  const [metaProject, setMetaProject] = useState<ProjectMetaType>({
    project_code: "",
    job_name: "",
    no_rks: "",
    date: "",
    client: "",
    address: "",
    time_schedule: "",
    deadline: ""
  });

  // State untuk menghindari hydration error
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // ðŸ§  Ambil role user aktif dan email
  useEffect(() => {
    async function fetchUserData() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/");
        return;
      }

      // Set email dari localStorage atau dari user auth
      const storedEmail = localStorage.getItem("userEmail");
      const storedRole = localStorage.getItem("userRole");
      
      if (storedEmail && storedRole) {
        setUserEmail(storedEmail);
        setRole(storedRole);
      } else {
        // Fallback ke data dari Supabase auth
        setUserEmail(user.email || null);
        
        const { data, error } = await supabase
          .from("users")
          .select("role")
          .eq("email", user.email)
          .single();

        if (!error && data) {
          setRole(data.role);
          localStorage.setItem("userRole", data.role);
        }
      }
    }

    fetchUserData();
  }, [router]);

  // ðŸ” Ambil daftar proyek realtime
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

  // Generate kode proyek otomatis
  const generateProjectCode = async (): Promise<string> => {
    try {
      const { count } = await supabase
        .from("projects")
        .select('*', { count: 'exact', head: true });
      
      const projectNumber = (count || 0) + 1;
      const today = new Date();
      const formattedDate = today.toISOString().split('T')[0].replace(/-/g, '');
      
      return `P-EUI-${projectNumber.toString().padStart(3, '0')}-${formattedDate}`;
    } catch (error) {
      console.error("Error generating project code:", error);
      const today = new Date();
      const formattedDate = today.toISOString().split('T')[0].replace(/-/g, '');
      return `P-EUI-001-${formattedDate}`;
    }
  };

  // Auto-generate kode proyek saat komponen mount
  useEffect(() => {
    async function initProjectCode() {
      const autoCode = await generateProjectCode();
      setMetaProject(prev => ({
        ...prev,
        project_code: autoCode,
        date: new Date().toISOString().split('T')[0] // Set tanggal hari ini secara default
      }));
    }
    initProjectCode();
  }, []);

  // ðŸ“¦ Ambil data project dari DB
  async function fetchProjects() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });

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

  // âž• Tambah project baru dengan template terstruktur - DIPERBAIKI
  async function addProject() {
    if (!metaProject.job_name?.trim()) {
      alert("Job Name harus diisi!");
      return;
    }

    if (!metaProject.deadline) {
      alert("Deadline harus diisi!");
      return;
    }

    // Validasi deadline tidak boleh sebelum tanggal hari ini
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadlineDate = new Date(metaProject.deadline);
    
    if (deadlineDate < today) {
      alert("Deadline tidak boleh sebelum hari ini!");
      return;
    }

    setLoading(true);
    try {
      // Generate kode proyek jika belum ada
      const finalProjectCode = metaProject.project_code || await generateProjectCode();

      // Data untuk insert - HANYA gunakan field yang ada di database
      const projectData: any = {
        name: metaProject.job_name,
        description: `Proyek: ${metaProject.job_name} | Client: ${metaProject.client || '-'} | Lokasi: ${metaProject.address || '-'}`,
        status: "ongoing",
        meta: {
          project_code: finalProjectCode,
          job_name: metaProject.job_name,
          no_rks: metaProject.no_rks || "",
          date: metaProject.date || "",
          client: metaProject.client || "",
          address: metaProject.address || "",
          time_schedule: metaProject.time_schedule || "",
          deadline: metaProject.deadline, // Simpan deadline di meta juga untuk backup
          created_by: userEmail // Tambahkan informasi pembuat proyek
        }
      };

      // Coba tambahkan deadline sebagai kolom terpisah jika ada
      // Tapi jangan throw error jika kolom tidak ada
      try {
        projectData.deadline = metaProject.deadline;
      } catch (e) {
        console.warn("Kolom deadline tidak tersedia, menggunakan meta saja:", e);
      }

      const { error } = await supabase.from("projects").insert(projectData);

      if (error) {
        console.error("addProject error:", error);
        
        // Jika error karena kolom deadline tidak ada, coba tanpa deadline
        if (error.message.includes('deadline')) {
          console.log("Kolom deadline tidak ditemukan, mencoba tanpa deadline...");
          delete projectData.deadline;
          
          const { error: retryError } = await supabase.from("projects").insert(projectData);
          
          if (retryError) {
            throw retryError;
          }
        } else {
          throw error;
        }
      }

      // Reset form
      const newProjectCode = await generateProjectCode();
      setMetaProject({
        project_code: newProjectCode,
        job_name: "",
        no_rks: "",
        date: new Date().toISOString().split('T')[0],
        client: "",
        address: "",
        time_schedule: "",
        deadline: ""
      });
      fetchProjects();
      alert("âœ… Proyek berhasil ditambahkan!");
    } catch (err: any) {
      console.error(err);
      alert("Terjadi kesalahan: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  // âŒ Hapus project
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

  // ðŸš€ Buka dashboard sesuai role
  const openProject = (id: number) => {
    localStorage.setItem("selectedProject", String(id));
    if (role === "master") {
      router.push(`/projects/${id}/master`);
    } else {
      router.push(`/projects/${id}/silver`);
    }
  };

  // Format tanggal untuk display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  // Helper function untuk mendapatkan deadline dari project (dari kolom atau meta)
  const getProjectDeadline = (project: Project): string | null => {
    return project.deadline || project.meta?.deadline || null;
  };

  // Hindari hydration error dengan tidak render input sebelum mounted
  if (!mounted) {
    return (
      <div className="p-6 min-h-screen bg-gray-100">
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-600">Memuat...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 min-h-screen bg-gray-100">
      {/* Header */}
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Daftar Proyek</h1>
        <div className="flex items-center gap-4">
          <UserProfile />
          <button
            onClick={handleLogout}
            className="rounded bg-red-500 px-3 py-1 text-white hover:bg-red-600"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Form tambah project - TEMPLATE TERSTRUKTUR */}
      <div className="bg-white rounded shadow p-4 mb-6">
        <h2 className="text-lg font-semibold mb-4">Tambah Proyek Baru</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">KODE PROYEK</label>
            <div className="font-semibold text-gray-800 p-2 border rounded bg-gray-50 min-h-[42px]">
              {metaProject.project_code || "Generating..."}
            </div>
            <p className="text-xs text-gray-500 mt-1">Auto-generated</p>
          </div>
          
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">JOB NAME *</label>
            <input
              type="text"
              value={metaProject.job_name || ""}
              onChange={(e) => setMetaProject(prev => ({ ...prev, job_name: e.target.value }))}
              className="w-full p-2 border rounded text-sm"
              placeholder="Masukkan job name"
              required
            />
          </div>
          
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">NO RKS</label>
            <input
              type="text"
              value={metaProject.no_rks || ""}
              onChange={(e) => setMetaProject(prev => ({ ...prev, no_rks: e.target.value }))}
              className="w-full p-2 border rounded text-sm"
              placeholder="Masukkan no RKS"
            />
          </div>
          
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">TANGGAL MULAI</label>
            <input
              type="date"
              value={metaProject.date || ""}
              onChange={(e) => setMetaProject(prev => ({ ...prev, date: e.target.value }))}
              className="w-full p-2 border rounded text-sm"
            />
          </div>
          
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">CLIENT</label>
            <input
              type="text"
              value={metaProject.client || ""}
              onChange={(e) => setMetaProject(prev => ({ ...prev, client: e.target.value }))}
              className="w-full p-2 border rounded text-sm"
              placeholder="Masukkan nama client"
            />
          </div>
          
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">ADDRESS</label>
            <input
              type="text"
              value={metaProject.address || ""}
              onChange={(e) => setMetaProject(prev => ({ ...prev, address: e.target.value }))}
              className="w-full p-2 border rounded text-sm"
              placeholder="Masukkan alamat proyek"
            />
          </div>
          
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">TIME SCHEDULE</label>
            <input
              type="text"
              value={metaProject.time_schedule || ""}
              onChange={(e) => setMetaProject(prev => ({ ...prev, time_schedule: e.target.value }))}
              className="w-full p-2 border rounded text-sm"
              placeholder="Masukkan time schedule"
            />
          </div>

          {/* KOLOM DEADLINE BARU */}
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">DEADLINE *</label>
            <input
              type="date"
              value={metaProject.deadline || ""}
              onChange={(e) => setMetaProject(prev => ({ ...prev, deadline: e.target.value }))}
              className="w-full p-2 border rounded text-sm"
              min={new Date().toISOString().split('T')[0]}
              required
            />
            <p className="text-xs text-gray-500 mt-1">Batas akhir pengerjaan proyek</p>
          </div>

          {/* INFO COUNTDOWN PREVIEW */}
          {metaProject.deadline && (
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">COUNTDOWN PREVIEW</label>
              <div className="p-2 border rounded bg-yellow-50 text-sm">
                <CountdownTimer deadline={metaProject.deadline} />
                <p className="text-xs text-gray-600 mt-1">
                  Deadline: {formatDate(metaProject.deadline)}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 p-3 bg-blue-50 rounded border">
          <p className="text-sm text-blue-700">
            ðŸ’¡ <strong>Kode proyek otomatis:</strong> P-EUI-NoUrut-Tanggal. Isi Job Name dan Deadline (wajib) lalu klik "Tambah Proyek".
          </p>
        </div>

        <div className="flex justify-end mt-4">
          <button
            onClick={addProject}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
            disabled={loading || !metaProject.job_name?.trim() || !metaProject.deadline}
          >
            {loading ? "â³ Menambahkan..." : "âž• Tambah Proyek"}
          </button>
        </div>
      </div>

      {/* List project */}
      {loading && projects.length === 0 ? (
        <div className="flex justify-center py-8">
          <div className="text-gray-600">Memuat data proyek...</div>
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-8 text-gray-500 italic">
          <div className="text-4xl mb-2">ðŸ“‹</div>
          <p>Belum ada proyek. Tambahkan proyek baru di atas.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Proyek Aktif ({projects.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => {
              const projectDeadline = getProjectDeadline(p);
              return (
                <div
                  key={p.id}
                  className="p-4 bg-white rounded shadow hover:shadow-md transition border relative"
                >
                  {/* Badge Status Berdasarkan Deadline */}
                  {projectDeadline && (
                    <div className="absolute top-3 right-3">
                      <CountdownTimer deadline={projectDeadline} />
                    </div>
                  )}

                  <div className="mb-3 pr-16">
                    <div className="font-semibold text-lg text-gray-800 mb-1">{p.name}</div>
                    {p.meta?.project_code && (
                      <div className="text-xs text-blue-600 font-medium bg-blue-50 px-2 py-1 rounded inline-block mb-2">
                        {p.meta.project_code}
                      </div>
                    )}
                    {p.description && (
                      <div className="text-sm text-gray-600 mb-2 line-clamp-2">{p.description}</div>
                    )}
                    
                    <div className="text-xs text-gray-500 space-y-1">
                      {p.meta?.client && <div>ðŸ‘¤ Client: {p.meta.client}</div>}
                      {p.meta?.address && <div>ðŸ“ {p.meta.address}</div>}
                      {p.meta?.time_schedule && <div>ðŸ“… Jadwal: {p.meta.time_schedule}</div>}
                      {p.meta?.created_by && (
                        <div className="text-xs text-gray-400 mt-2">
                          Dibuat oleh: {p.meta.created_by}
                        </div>
                      )}
                      
                      {/* Info Deadline */}
                      {projectDeadline && (
                        <div className="mt-2 p-2 bg-gray-50 rounded border">
                          <div className="font-medium text-gray-700">â° Deadline</div>
                          <div className="text-gray-600">{formatDate(projectDeadline)}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 pt-3 border-t">
                    <button
                      onClick={() => openProject(p.id)}
                      className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 flex-1"
                    >
                      Buka Proyek
                    </button>
                    <button
                      onClick={() => deleteProject(p.id)}
                      className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600"
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
