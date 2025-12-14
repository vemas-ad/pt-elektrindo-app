"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // âœ… Jika user sudah login, arahkan langsung ke /projects
  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        router.push("/projects");
      }
    };
    checkSession();
  }, [router]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validasi email harus @gmail.com
      if (!email.endsWith('@gmail.com')) {
        alert("Hanya email @gmail.com yang diperbolehkan untuk login.");
        setLoading(false);
        return;
      }

console.log("Attempting login");


      // Tentukan role berdasarkan password
      let userRole = 'user';
      if (password === 'Eltama01') {
        userRole = 'silver';
      } else if (password === 'Eltama03') {
        userRole = 'master';
      } else {
        alert("Password salah. Gunakan Eltama01 untuk Silver atau Eltama03 untuk Master.");
        setLoading(false);
        return;
      }

      // Langsung coba login ke Supabase
      const { data: signData, error: signError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      // Jika login gagal karena user tidak ditemukan, coba daftarkan user baru
      if (signError && signError.message.includes('Invalid login credentials')) {
        console.log("ðŸ†• User tidak ditemukan, mencoba mendaftarkan user baru...");
        
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              role: userRole
            }
          }
        });

        if (signUpError) {
          console.error("âŒ Sign up error:", signUpError);
          alert("Pendaftaran user gagal: " + signUpError.message);
          setLoading(false);
          return;
        }

        console.log("âœ… User berhasil didaftarkan:", signUpData);
        
        // Coba login lagi setelah pendaftaran berhasil
        const { data: retrySignData, error: retrySignError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (retrySignError) {
          console.error("âŒ Retry login error:", retrySignError);
          alert("Login gagal setelah pendaftaran: " + retrySignError.message);
          setLoading(false);
          return;
        }

        console.log("âœ… Login berhasil setelah pendaftaran:", retrySignData);
        
        // Simpan data ke localStorage
        localStorage.setItem("userEmail", email);
        localStorage.setItem("userRole", userRole);
        localStorage.setItem("userProfile", `https://ui-avatars.com/api/?name=${encodeURIComponent(email.split('@')[0])}&background=random`);

        alert("âœ… Pendaftaran dan login berhasil! Mengarahkan ke halaman projects...");
        router.push("/projects");
        return;

      } else if (signError) {
        // Error selain "Invalid login credentials"
        console.error("âŒ Login error:", signError);
        alert("Login gagal: " + signError.message);
        setLoading(false);
        return;
      }

      // âœ… Jika login berhasil tanpa error
      console.log("âœ… Login successful:", signData);

      // âœ… Simpan data user ke localStorage
      localStorage.setItem("userEmail", email);
      localStorage.setItem("userRole", userRole);
      localStorage.setItem("userProfile", `https://ui-avatars.com/api/?name=${encodeURIComponent(email.split('@')[0])}&background=random`);

      // âœ… Coba update tabel users (jika ada) - dengan error handling yang lebih baik
      try {
        // Cek dulu apakah tabel users ada dengan melakukan select
        const { data: testData, error: testError } = await supabase
          .from("users")
          .select("email")
          .limit(1);

        if (testError) {
          console.log("â„¹ï¸ Tabel users tidak tersedia, skip update user data");
        } else {
          // Jika tabel users ada, lakukan upsert
          const { error: upsertError } = await supabase
            .from("users")
            .upsert({
              email: email,
              role: userRole,
              last_login: new Date().toISOString()
            }, {
              onConflict: 'email'
            });

          if (upsertError && upsertError.code !== '42P01') { // 42P01 = table doesn't exist
            console.warn("âš ï¸ Gagal update user data:", upsertError);
          } else {
            console.log("âœ… User data updated successfully");
          }
        }
      } catch (dbError) {
        console.log("â„¹ï¸ Error saat mengakses tabel users:", dbError);
        // Ignore error, lanjutkan proses login
      }

      // âœ… Arahkan ke halaman pilihan proyek
      alert("Login berhasil! Mengarahkan ke halaman projects...");
      router.push("/projects");
      
    } catch (error) {
      console.error("Unexpected error:", error);
      alert("Terjadi kesalahan tak terduga saat login.");
    } finally {
      setLoading(false);
    }
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const target = e.currentTarget;
    const parent = target.parentElement;
    
    if (parent) {
      target.style.display = 'none';
      // Fallback text dengan background biru persegi panjang
      parent.innerHTML = '<div class="w-full h-full bg-blue-600 flex items-center justify-center text-white font-bold text-lg">PT EUI</div>';
      parent.classList.remove('rounded-full');
      parent.classList.add('rounded-lg');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-sm rounded-lg bg-white p-6 shadow-md"
      >
        <div className="flex flex-col items-center justify-center mb-6">
          {/* Space untuk logo PT - bentuk persegi panjang */}
          <div className="w-48 h-24 mb-4 bg-white rounded-lg flex items-center justify-center border border-gray-200">
            <img 
              src="/logo-eltama.png" 
              alt="PT Elektrindo Utama Indonesia"  
              className="w-50 h-100 object-contain rounded-lg"
              onError={handleImageError}
            />
          </div>
          <h1 className="text-xl font-bold text-gray-800 text-center">
            PT ELEKTRINDO UTAMA INDONESIA
          </h1>
          <p className="text-sm text-gray-600 text-center mt-1">
            MECHANICAL - ELECTRICAL - FIRE PROTECTION SYSTEM
          </p>
        </div>

        <div className="mb-4 p-3 bg-blue-50 rounded border border-blue-200">
          <p className="text-xs text-blue-700">
            <strong>Info Login:</strong><br/>
            â€¢ Email: harus @gmail.com<br/>
            â€¢ Silver: password <strong>Supervisor</strong><br/>
            â€¢ Master: password <strong>Management</strong>
          </p>
        </div>

        <label className="mb-2 block text-sm font-medium text-gray-700">
          Email (@gmail.com)
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="user@gmail.com"
          className="mb-4 w-full rounded border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
        />

        <label className="mb-2 block text-sm font-medium text-gray-700">
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder="Eltama01 atau Eltama03"
          className="mb-6 w-full rounded border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-blue-600 py-2 text-white font-medium hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? "Memproses..." : "Login"}
        </button>

        <div className="mt-4 p-3 bg-green-50 rounded border">
          <p className="text-xs text-green-700">
            <strong>ðŸ’¡ Fitur Baru:</strong><br/>
            â€¢ User akan otomatis didaftarkan jika belum ada<br/>
            â€¢ Gunakan password sesuai role (Silver/Master)<br/>
            â€¢ Data tersimpan aman di Supabase Auth
          </p>
        </div>
      </form>
    </div>
  );
}

