import { supabase } from "./supabaseClient";

// Fungsi logout user dari Supabase
export const handleLogout = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("Logout gagal:", error.message);
    alert("Logout gagal, coba lagi.");
  } else {
    // Hapus semua data dari localStorage
    localStorage.removeItem("userEmail");
    localStorage.removeItem("userRole");
    localStorage.removeItem("userProfile");
    localStorage.removeItem("selectedProject");
    
    window.location.href = "/"; // Arahkan ke halaman login
  }
};