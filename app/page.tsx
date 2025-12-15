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
        return;
      }

      let userRole = "user";
      if (password === "Eltama01") userRole = "silver";
      else if (password === "Eltama03") userRole = "master";
      else {
        alert("Password salah.");
        return;
      }

      const { error: signError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      // 🔹 AUTO REGISTER
      if (signError && signError.message.includes("Invalid login credentials")) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { role: userRole },
          },
        });

        if (signUpError) {
          alert("Pendaftaran gagal: " + signUpError.message);
          return;
        }

        const { error: retryError } =
          await supabase.auth.signInWithPassword({
            email,
            password,
          });

        if (retryError) {
          alert("Login gagal setelah pendaftaran");
          return;
        }
      } else if (signError) {
        alert("Login gagal: " + signError.message);
        return;
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

      // 🔹 UPSERT USERS (FIX 2769)
      try {
        await supabase.from("users").upsert(
          {
            email,
            role: userRole,
            last_login: new Date().toISOString(),
          } as any,
          { onConflict: "email" }
        );
      } catch {}

      alert("Login berhasil!");
      router.push("/projects");
    } catch (err) {
      console.error(err);
      alert("Terjadi kesalahan.");
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
        </div>

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="user@gmail.com"
          className="w-full mb-3 border p-2 rounded"
        />

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Eltama01 / Eltama03"
          className="w-full mb-4 border p-2 rounded"
        />

        <button
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded"
        >
          {loading ? "Memproses..." : "Login"}
        </button>
      </form>
    </div>
  );
}
