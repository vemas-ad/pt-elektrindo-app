"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    console.log("SUPABASE URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
    console.log(
      "SUPABASE KEY:",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "ADA" : "KOSONG"
    );
  }, []);

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) router.push("/projects");
    };
    checkSession();
  }, [router]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!email.endsWith("@gmail.com")) {
        alert("Hanya email @gmail.com yang diperbolehkan.");
        setLoading(false);
        return;
      }

      // Validasi password tidak kosong
      if (!password.trim()) {
        alert("Password harus diisi.");
        setLoading(false);
        return;
      }

      // Coba login terlebih dahulu
      const { data: signData, error: signError } = 
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      // 🔹 AUTO REGISTER jika user belum ada
      if (signError && signError.message.includes("Invalid login credentials")) {
        // Determine role berdasarkan pola email atau default ke 'user'
        let userRole = "user";
        if (email.includes("admin") || email.includes("master")) {
          userRole = "master";
        } else if (email.includes("silver") || email.includes("engineer")) {
          userRole = "silver";
        }

        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { role: userRole },
          },
        });

        if (signUpError) {
          alert("Pendaftaran gagal: " + signUpError.message);
          setLoading(false);
          return;
        }

        // Coba login setelah register
        const { error: retryError } =
          await supabase.auth.signInWithPassword({
            email,
            password,
          });

        if (retryError) {
          alert("Login gagal setelah pendaftaran");
          setLoading(false);
          return;
        }
      } else if (signError) {
        alert("Login gagal: " + signError.message);
        setLoading(false);
        return;
      }

      // 🔹 GET USER DATA setelah login berhasil
      const { data: userData } = await supabase.auth.getUser();
      
      // Tentukan role dari user metadata atau default
      let userRole = "user";
      if (userData?.user?.user_metadata?.role) {
        userRole = userData.user.user_metadata.role;
      } else if (email.includes("admin") || email.includes("master")) {
        userRole = "master";
      } else if (email.includes("silver") || email.includes("engineer")) {
        userRole = "silver";
      }

      // 🔹 LOCAL STORAGE
      localStorage.setItem("userEmail", email);
      localStorage.setItem("userRole", userRole);
      localStorage.setItem(
        "userProfile",
        `https://ui-avatars.com/api/?name=${encodeURIComponent(
          email.split("@")[0]
        )}&background=random`
      );

      // 🔹 UPSERT USERS ke tabel users di Supabase
      try {
        await supabase.from("users").upsert(
          {
            email,
            role: userRole,
            last_login: new Date().toISOString(),
            created_at: new Date().toISOString(),
          } as any,
          { onConflict: "email" }
        );
      } catch (err) {
        console.warn("Error upsert user:", err);
        // Lanjutkan meskipun ada error di upsert
      }

      console.log("Login berhasil dengan role:", userRole);
      
      // Redirect berdasarkan role
      if (userRole === "master") {
        router.push("/dashboard/master");
      } else if (userRole === "silver") {
        router.push("/dashboard/silver");
      } else {
        router.push("/projects");
      }
      
    } catch (err) {
      console.error("Login error:", err);
      alert("Terjadi kesalahan sistem.");
    } finally {
      setLoading(false);
    }
  };

  const handleImageError = (
    e: React.SyntheticEvent<HTMLImageElement>
  ) => {
    const parent = e.currentTarget.parentElement;
    if (parent) {
      parent.innerHTML =
        '<div class="w-full h-full bg-blue-600 flex items-center justify-center text-white font-bold">PT EUI</div>';
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-sm bg-white p-6 rounded shadow"
      >
        <div className="mb-4 text-center">
          <img
            src="/logo-eltama.png"
            className="mx-auto mb-2"
            onError={handleImageError}
          />
          <h1 className="font-bold">PT ELEKTRINDO UTAMA INDONESIA</h1>
          <p className="text-sm text-gray-600">MECHANICAL - ELECTRICAL - FIRE PROTECTION</p>
        </div>

        <div className="mb-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email Anda (harus @gmail.com)"
            className="w-full border p-2 rounded"
            required
          />
          <p className="text-xs text-gray-500 mt-1">Contoh: user@gmail.com</p>
        </div>

        <div className="mb-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password Anda"
            className="w-full border p-2 rounded"
            required
          />
          <p className="text-xs text-gray-500 mt-1">
            Password akan dibuat secara otomatis saat pertama kali login
          </p>
        </div>

        <div className="mb-4 text-xs text-gray-600">
          <p className="font-semibold">Informasi:</p>
          <ul className="list-disc pl-4 mt-1">
            <li>Email harus menggunakan @gmail.com</li>
            <li>Sistem akan membuat akun otomatis untuk pertama kali</li>
            <li>Role akan ditentukan berdasarkan email</li>
          </ul>
        </div>

        <button
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Memproses..." : "Login / Buat Akun"}
        </button>

        <div className="mt-4 text-xs text-gray-500 text-center">
          <p>© {new Date().getFullYear()} PT. Elektindo Utama Indonesia</p>
          <p>Project Management System v1.0</p>
        </div>
      </form>
    </div>
  );
}