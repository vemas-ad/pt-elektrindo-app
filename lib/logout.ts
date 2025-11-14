import { supabase } from "./supabaseClient";

// Fungsi logout user dari Supabase
export const handleLogout = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("Logout gagal:", error.message);
    alert("Logout gagal, coba lagi.");
  } else {
    window.location.href = "/"; // Arahkan ke halaman login
  }
};
