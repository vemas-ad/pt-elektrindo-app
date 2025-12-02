"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useParams } from "next/navigation";
import { supabase, supabase2, DualStorage } from "../../../../lib/supabaseClient";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

// Import libraries untuk export dan print
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const Spreadsheet = dynamic(() => import("react-spreadsheet"), { ssr: false });
const MapTracking = dynamic(() => import("../../../components/MapTracking"), { ssr: false });

function debounceFn<T extends (...args: any[]) => any>(fn: T, wait = 1000) {
  let timeout: any;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
}

type TaskType = {
  id?: string | null;
  project_id?: string | null;
  row_index?: number | null;
  description?: string | null;
  weight?: number | null;
  plan_progress?: number | null;
  actual_progress?: number | null;
  color?: string | null;
  location?: string | null;
  proof_url?: string | null;
  dates?: Record<string, any> | null;
  style?: any;
};

type DateColsHistory = {
  dateCols: string[];
  rows: TaskType[];
  targetRows: TaskType[];
  realisasiRows: TaskType[];
};

type NoteType = {
  id: string;
  project_id: string;
  content: string;
  audio_url?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
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

type UserPresenceType = {
  id: string;
  email: string;
  user_metadata?: {
    avatar_url?: string;
    full_name?: string;
  };
  last_seen: string;
  active_tab: string;
  editing_task?: string;
};

// ============ PERBAIKAN 2: FORMATTING TOOLBAR YANG BERFUNGSI 100% - VERSI FINAL ============
const FormattingToolbar = () => {
  const [showToolbar, setShowToolbar] = useState(true);
  const [selectedCell, setSelectedCell] = useState<{
    rowIndex: number;
    cellIndex: number;
    value: string | number;
  } | null>(null);
  const [currentStyles, setCurrentStyles] = useState({
    fontWeight: 'normal',
    fontStyle: 'normal',
    textDecoration: 'none',
    textAlign: 'left',
    color: '#000000',
    backgroundColor: '#ffffff'
  });

  useEffect(() => {
    // Listen for cell selection events
    const handleCellSelected = (event: CustomEvent) => {
      const { rowIndex, cellIndex, value } = event.detail;
      setSelectedCell({ rowIndex, cellIndex, value });
      
      // Get current styles from the selected cell
      const cellElement = document.querySelector(`[data-row="${rowIndex}"][data-cell="${cellIndex}"]`);
      if (cellElement instanceof HTMLElement) {
        const styles = {
          fontWeight: cellElement.style.fontWeight || 'normal',
          fontStyle: cellElement.style.fontStyle || 'normal',
          textDecoration: cellElement.style.textDecoration || 'none',
          textAlign: cellElement.style.textAlign || 'left',
          color: cellElement.style.color || '#000000',
          backgroundColor: cellElement.style.backgroundColor || '#ffffff'
        };
        setCurrentStyles(styles);
      }
    };

    window.addEventListener('cell-selected', handleCellSelected as EventListener);
    
    return () => {
      window.removeEventListener('cell-selected', handleCellSelected as EventListener);
    };
  }, []);

  const applyFormatting = (property: string, value: string) => {
    if (!selectedCell) {
      alert('Pilih sel terlebih dahulu di spreadsheet!');
      return;
    }

    // Update current styles
    setCurrentStyles(prev => ({
      ...prev,
      [property]: value
    }));

    // Apply to selected cell
    const cellElement = document.querySelector(`[data-row="${selectedCell.rowIndex}"][data-cell="${selectedCell.cellIndex}"]`);
    if (cellElement instanceof HTMLElement) {
      (cellElement.style as any)[property] = value;
    }

    // Dispatch event untuk spreadsheet component
    const event = new CustomEvent('apply-formatting', {
      detail: { property, value }
    });
    window.dispatchEvent(event);

    // Show success message
    const formatMessages: Record<string, string> = {
      fontWeight: value === 'bold' ? 'Bold diterapkan' : 'Bold dihapus',
      fontStyle: value === 'italic' ? 'Italic diterapkan' : 'Italic dihapus',
      textDecoration: value === 'underline' ? 'Underline diterapkan' : 'Underline dihapus',
      textAlign: `Alignment: ${value}`,
      color: `Warna teks diubah`,
      backgroundColor: `Warna background diubah`
    };
    
    console.log(formatMessages[property] || 'Formatting applied');
  };

  const colors = [
    '#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', 
    '#FF00FF', '#00FFFF', '#FFA500', '#800080', '#008000',
    '#800000', '#008080', '#000080', '#808080', '#A52A2A',
    '#FFC0CB', '#FFD700', '#90EE90', '#ADD8E6', '#DDA0DD'
  ];

  return (
    <div className="bg-white p-3 rounded shadow mb-4">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-semibold text-sm">
          🎨 Formatting Toolbar {selectedCell ? `(Sel: ${selectedCell.rowIndex},${selectedCell.cellIndex})` : ''}
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => setShowToolbar(!showToolbar)}
            className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs flex items-center gap-1"
          >
            {showToolbar ? '▲ Sembunyikan' : '▼ Tampilkan'}
          </button>
        </div>
      </div>
      
      {showToolbar && (
        <>
          <div className="flex flex-wrap gap-1 p-2 bg-gray-50 rounded border mb-3">
            {/* Text Formatting */}
            <button
              onClick={() => applyFormatting('fontWeight', currentStyles.fontWeight === 'bold' ? 'normal' : 'bold')}
              className={`px-3 py-2 border rounded text-sm flex items-center gap-1 transition-colors ${
                currentStyles.fontWeight === 'bold' ? 'bg-blue-100 border-blue-300 font-bold' : 'bg-white hover:bg-gray-100'
              }`}
              title="Bold (Ctrl+B)"
            >
              𝐁
            </button>
            <button
              onClick={() => applyFormatting('fontStyle', currentStyles.fontStyle === 'italic' ? 'normal' : 'italic')}
              className={`px-3 py-2 border rounded text-sm flex items-center gap-1 transition-colors ${
                currentStyles.fontStyle === 'italic' ? 'bg-blue-100 border-blue-300 italic' : 'bg-white hover:bg-gray-100'
              }`}
              title="Italic (Ctrl+I)"
            >
              𝐼
            </button>
            <button
              onClick={() => applyFormatting('textDecoration', currentStyles.textDecoration === 'underline' ? 'none' : 'underline')}
              className={`px-3 py-2 border rounded text-sm flex items-center gap-1 transition-colors ${
                currentStyles.textDecoration === 'underline' ? 'bg-blue-100 border-blue-300 underline' : 'bg-white hover:bg-gray-100'
              }`}
              title="Underline (Ctrl+U)"
            >
              U̲
            </button>
            
            <div className="w-px h-6 bg-gray-300 mx-1"></div>
            
            {/* Alignment */}
            <button
              onClick={() => applyFormatting('textAlign', 'left')}
              className={`px-3 py-2 border rounded text-sm flex items-center gap-1 transition-colors ${
                currentStyles.textAlign === 'left' ? 'bg-blue-100 border-blue-300' : 'bg-white hover:bg-gray-100'
              }`}
              title="Align Left"
            >
              ⎸⎹
            </button>
            <button
              onClick={() => applyFormatting('textAlign', 'center')}
              className={`px-3 py-2 border rounded text-sm flex items-center gap-1 transition-colors ${
                currentStyles.textAlign === 'center' ? 'bg-blue-100 border-blue-300' : 'bg-white hover:bg-gray-100'
              }`}
              title="Align Center"
            >
              ⎸⎹
            </button>
            <button
              onClick={() => applyFormatting('textAlign', 'right')}
              className={`px-3 py-2 border rounded text-sm flex items-center gap-1 transition-colors ${
                currentStyles.textAlign === 'right' ? 'bg-blue-100 border-blue-300' : 'bg-white hover:bg-gray-100'
              }`}
              title="Align Right"
            >
              ⎸⎹
            </button>
            
            <div className="w-px h-6 bg-gray-300 mx-1"></div>
            
            {/* Text Color */}
            <div className="relative">
              <button
                className="px-3 py-2 bg-white hover:bg-gray-100 border rounded text-sm flex items-center gap-1 transition-colors"
                title="Text Color"
                onClick={() => {
                  const colorPicker = document.createElement('input');
                  colorPicker.type = 'color';
                  colorPicker.value = currentStyles.color;
                  colorPicker.onchange = (e: any) => {
                    applyFormatting('color', e.target.value);
                  };
                  colorPicker.click();
                }}
              >
                <span style={{ color: currentStyles.color }}>A</span>
                <span className="text-xs">▼</span>
              </button>
            </div>
            
            {/* Background Color */}
            <div className="relative">
              <button
                className="px-3 py-2 bg-white hover:bg-gray-100 border rounded text-sm flex items-center gap-1 transition-colors"
                title="Background Color"
                onClick={() => {
                  const colorPicker = document.createElement('input');
                  colorPicker.type = 'color';
                  colorPicker.value = currentStyles.backgroundColor;
                  colorPicker.onchange = (e: any) => {
                    applyFormatting('backgroundColor', e.target.value);
                  };
                  colorPicker.click();
                }}
              >
                <span className="px-1" style={{ backgroundColor: currentStyles.backgroundColor }}>A</span>
                <span className="text-xs">▼</span>
              </button>
            </div>
            
            {/* Reset Formatting */}
            <button
              onClick={() => {
                if (!selectedCell) {
                  alert('Pilih sel terlebih dahulu!');
                  return;
                }
                
                const resetStyles = {
                  fontWeight: 'normal',
                  fontStyle: 'normal',
                  textDecoration: 'none',
                  textAlign: 'left',
                  color: '#000000',
                  backgroundColor: '#ffffff'
                };
                
                Object.entries(resetStyles).forEach(([property, value]) => {
                  applyFormatting(property, value);
                });
                
                setCurrentStyles(resetStyles);
                alert('Formatting direset!');
              }}
              className="px-3 py-2 bg-red-50 hover:bg-red-100 border border-red-200 rounded text-sm flex items-center gap-1 transition-colors"
              title="Reset Formatting"
            >
              🔄 Reset
            </button>
          </div>
          
          {/* Demo area untuk melihat hasil formatting */}
          <div className="mt-3 p-3 bg-gray-50 rounded border">
            <h4 className="text-sm font-medium mb-2">🎯 Cara Pakai:</h4>
            <ol className="text-xs text-gray-600 space-y-1 mb-3">
              <li>1. <strong>PILIH SEL</strong> di spreadsheet dengan mengklik sel</li>
              <li>2. <strong>KLIK TOMBOL</strong> formatting di atas (Bold, Italic, dll)</li>
              <li>3. <strong>FORMATTING OTOMATIS</strong> diterapkan ke sel yang dipilih</li>
              <li>4. <strong>WARNA & ALIGN</strong> langsung terlihat di spreadsheet</li>
            </ol>
            
            {selectedCell ? (
              <div className="text-xs text-green-600 bg-green-50 p-2 rounded">
                ✅ <strong>SEL TERPILIH:</strong> Baris {selectedCell.rowIndex}, Kolom {selectedCell.cellIndex}
              </div>
            ) : (
              <div className="text-xs text-yellow-600 bg-yellow-50 p-2 rounded">
                ⚠️ <strong>PILIH SEL DULU:</strong> Klik sel di spreadsheet untuk mulai formatting
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// ============ PERBAIKAN 1: CUSTOM CELL UNTUK INPUT DESIMAL YANG BERFUNGSI 100% ============
const DecimalCell = ({ cell, onChange, ...props }: any) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(cell.value || "");

  const handleChange = (value: string) => {
    // Izinkan angka, koma, titik, dan minus
    const cleanedValue = value.replace(/[^\d,.-]/g, '');
    
    // Validasi: hanya satu koma atau titik
    const commaCount = (cleanedValue.match(/,/g) || []).length;
    const dotCount = (cleanedValue.match(/\./g) || []).length;
    
    if (commaCount <= 1 && dotCount <= 1) {
      setCurrentValue(cleanedValue);
    }
  };

  const handleBlur = () => {
    setIsEditing(false);
    
    let finalValue = currentValue;
    if (finalValue && finalValue.trim() !== '') {
      // Ganti koma dengan titik untuk parsing
      finalValue = finalValue.replace(',', '.');
      
      // Validasi angka
      const numValue = parseFloat(finalValue);
      if (!isNaN(numValue)) {
        // Batasi maksimal 100 dan 2 digit desimal
        finalValue = Math.min(numValue, 100).toFixed(2);
        // Jika 0.00, kembalikan string kosong
        if (finalValue === '0.00') finalValue = '';
      } else {
        finalValue = "";
      }
    } else {
      finalValue = "";
    }
    
    onChange({ ...cell, value: finalValue });
  };

  const handleFocus = () => {
    setIsEditing(true);
    // Tampilkan dengan koma saat edit untuk user-friendly
    const displayValue = cell.value ? 
      cell.value.toString().replace('.', ',') : 
      "";
    setCurrentValue(displayValue);
  };

  // Format untuk display (gunakan koma sebagai separator)
  const displayValue = cell.value ? 
    parseFloat(cell.value.toString()).toFixed(2).replace('.', ',') : 
    "";

  return (
    <div className="w-full h-full">
      {isEditing ? (
        <input
          type="text"
          value={currentValue}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleBlur();
            }
            if (e.key === 'Escape') {
              setIsEditing(false);
              setCurrentValue(cell.value ? cell.value.toString().replace('.', ',') : '');
            }
          }}
          className="w-full h-full p-1 border-2 border-blue-400 outline-none text-sm bg-white"
          placeholder="0,00"
          autoFocus
        />
      ) : (
        <div
          onClick={handleFocus}
          className="w-full h-full p-1 cursor-pointer text-sm flex items-center hover:bg-blue-50 transition-colors"
          title="Klik untuk edit. Gunakan koma (,) atau titik (.) untuk desimal"
          data-row={props.rowIndex}
          data-cell={props.cellIndex}
          style={cell.style || {}}
        >
          {displayValue}
        </div>
      )}
    </div>
  );
};

// PERBAIKAN: Komponen Countdown Timer yang lebih baik
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

  if (timeLeft.isOverdue) {
    return (
      <div className="flex items-center gap-1 text-red-600 font-semibold text-sm">
        <span>⏰</span>
        <span>TELAT</span>
      </div>
    );
  }

  if (timeLeft.days > 30) {
    return (
      <div className="flex items-center gap-1 text-green-600 text-sm">
        <span>📅</span>
        <span>{timeLeft.days} hari</span>
      </div>
    );
  }

  if (timeLeft.days > 7) {
    return (
      <div className="flex items-center gap-1 text-orange-500 text-sm">
        <span>⏳</span>
        <span>{timeLeft.days} hari</span>
      </div>
    );
  }

  if (timeLeft.days > 0) {
    return (
      <div className="flex items-center gap-1 text-red-500 font-semibold text-sm">
        <span>🚨</span>
        <span>{timeLeft.days}d {timeLeft.hours}h</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 text-red-600 font-bold text-sm">
      <span>🔥</span>
      <span>{timeLeft.hours}j {timeLeft.minutes}m</span>
    </div>
  );
};

// PERBAIKAN: Komponen User Profile untuk menampilkan email dan gambar profil
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

// PERBAIKAN: Komponen untuk menampilkan user yang online - DIPERBAIKI
const OnlineUsers = ({ onlineUsers, currentUser }: { onlineUsers: UserPresenceType[], currentUser: any }) => {
  const [showUsers, setShowUsers] = useState(false);

  return (
    <div className="bg-white p-3 rounded shadow mb-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-sm">👥 User Online</h3>
        <button
          onClick={() => setShowUsers(!showUsers)}
          className="px-2 py-1 bg-blue-100 hover:bg-blue-200 rounded text-xs flex items-center gap-1"
        >
          {showUsers ? '▲ Sembunyikan' : '▼ Tampilkan'}
        </button>
      </div>
      
      {showUsers && (
        <div className="mt-2 space-y-2">
          {onlineUsers.map((user) => (
            <div key={user.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded border">
              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
                {user.user_metadata?.avatar_url ? (
                  <img 
                    src={user.user_metadata.avatar_url} 
                    alt={user.user_metadata.full_name || user.email}
                    className="w-8 h-8 rounded-full object-cover"
                    onError={(e) => {
                      // Fallback jika gambar gagal load
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      target.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                ) : null}
                <div className={`${user.user_metadata?.avatar_url ? 'hidden' : ''}`}>
                  {user.email.charAt(0).toUpperCase()}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">
                  {user.user_metadata?.full_name || user.email}
                  {user.id === currentUser?.id && (
                    <span className="ml-1 text-blue-600 text-xs">(Anda)</span>
                  )}
                </div>
                <div className="text-xs text-gray-500 truncate">
                  {user.active_tab === '1' && '📋 Tab Planning'}
                  {user.active_tab === '2' && '📍 Tab Lokasi'}
                  {user.active_tab === '3' && '🎯 Tab Target'}
                  {user.active_tab === '4' && '📊 Tab Realisasi'}
                  {user.active_tab === '5' && '📝 Tab Catatan'}
                  {user.editing_task && ` - Edit: ${user.editing_task}`}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-gray-500">Online</span>
              </div>
            </div>
          ))}
          
          {onlineUsers.length === 0 && (
            <div className="text-center py-4 text-gray-500 text-sm">
              <div className="text-2xl mb-1">👻</div>
              <p>Tidak ada user online</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============ PERBAIKAN 2: Export & Print Controls DIPERBAIKI untuk Cetak 1 Layar Penuh ============
const ExportPrintControls = ({ 
  activeTab, 
  projectName, 
  metaProject, 
  rows, 
  targetRows, 
  realisasiRows, 
  dateCols,
  planningSummary,
  targetSummary,
  realisasiSummary,
  planningChartData,
  targetChartDataNew,
  realisasiChartDataNew
}: {
  activeTab: number;
  projectName: string;
  metaProject: ProjectMetaType;
  rows: TaskType[];
  targetRows: TaskType[];
  realisasiRows: TaskType[];
  dateCols: string[];
  planningSummary: any;
  targetSummary: any;
  realisasiSummary: any;
  planningChartData: any[];
  targetChartDataNew: any[];
  realisasiChartDataNew: any[];
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const email = localStorage.getItem("userEmail");
    setUserEmail(email);
  }, []);

  // Fungsi untuk mendapatkan informasi user yang melakukan aksi
  const getUserInfo = () => {
    return {
      email: userEmail || "Unknown User",
      timestamp: new Date().toLocaleString('id-ID'),
      action: isExporting ? "Export" : isPrinting ? "Print" : "Download"
    };
  };

  // ============ PERBAIKAN 2: Export ke Excel dengan LINE CHART ============
  const exportToExcel = async () => {
    try {
      setIsExporting(true);
      
      const userInfo = getUserInfo();
      const workbook = XLSX.utils.book_new();
      
      // Data untuk setiap tab
      const currentRows = activeTab === 1 ? rows : activeTab === 3 ? targetRows : realisasiRows;
      const currentSummary = activeTab === 1 ? planningSummary : activeTab === 3 ? targetSummary : realisasiSummary;
      const currentChartData = activeTab === 1 ? planningChartData : activeTab === 3 ? targetChartDataNew : realisasiChartDataNew;
      const tabName = activeTab === 1 ? 'Planning' : activeTab === 3 ? 'Target' : 'Realisasi';
      
      // Buat worksheet dengan kop surat
      const wsData = [];
      
      // Kop surat
      wsData.push(["PT ELEKTRINDO UTAMA INDONESIA"]);
      wsData.push(["MECHANICAL - ELECTRICAL - FIRE PROTECTION SYSTEM"]);
      wsData.push(["SILVER APP - INPUT DATA LAPANGAN (DUAL STORAGE SYSTEM)"]);
      wsData.push([]);
      
      // Informasi proyek
      wsData.push(["Kode Proyek", metaProject.project_code || "-"]);
      wsData.push(["Job Name", metaProject.job_name || "-"]);
      wsData.push(["Client", metaProject.client || "-"]);
      wsData.push(["Alamat", metaProject.address || "-"]);
      wsData.push(["Deadline", metaProject.deadline || "-"]);
      wsData.push([]);
      
      // Headers dengan TANGGAL dan TOTAL
      const headers = [
        'No', 
        'Description', 
        'Bobot %', 
        ...(activeTab === 1 ? ['Target (%)', 'Realisasi (%)'] : 
            activeTab === 3 ? ['Target (%)'] : 
            ['Realisasi (%)']),
        'Lokasi',
        ...dateCols,
        'Total'
      ];
      
      wsData.push(headers);
      
      // Data tabel LENGKAP dengan total per baris
      const data = currentRows.map((row, index) => {
        const rowTotal = dateCols.reduce((sum, date) => {
          const value = parseFloat(row.dates?.[date]?.toString() || '0') || 0;
          return sum + value;
        }, 0);
        
        return [
          index + 1,
          row.description || '',
          parseFloat(row.weight?.toString() || '0') || 0,
          ...(activeTab === 1 ? [
            parseFloat(row.plan_progress?.toString() || '0') || 0,
            parseFloat(row.actual_progress?.toString() || '0') || 0
          ] : activeTab === 3 ? [
            parseFloat(row.plan_progress?.toString() || '0') || 0
          ] : [
            parseFloat(row.actual_progress?.toString() || '0') || 0
          ]),
          row.location || '',
          ...dateCols.map(date => parseFloat(row.dates?.[date]?.toString() || '0') || 0),
          rowTotal.toFixed(2)
        ];
      });

      data.forEach(row => wsData.push(row));
      
      // Baris TOTAL untuk setiap kolom tanggal
      const totalRow = ["TOTAL %", "", "", ...(activeTab === 1 ? ["", ""] : activeTab === 3 ? [""] : [""]), ""];
      
      // Hitung total untuk setiap kolom tanggal
      dateCols.forEach(date => {
        const colTotal = currentRows.reduce((sum, row) => {
          return sum + (parseFloat(row.dates?.[date]?.toString() || '0') || 0);
        }, 0);
        totalRow.push(colTotal.toFixed(2));
      });
      
      // Total keseluruhan
      const overallTotal = dateCols.reduce((sum, date) => {
        return sum + currentRows.reduce((rowSum, row) => {
          return rowSum + (parseFloat(row.dates?.[date]?.toString() || '0') || 0);
        }, 0);
      }, 0);
      totalRow.push(overallTotal.toFixed(2));
      
      wsData.push(totalRow);
      
      // Tambahkan summary
      wsData.push([]);
      wsData.push(["SUMMARY"]);
      wsData.push(["Total Bobot", currentSummary.totalWeight.toFixed(2) + '%']);
      if (activeTab === 1) {
        wsData.push(["Plan Progress", currentSummary.plan.toFixed(2) + '%']);
        wsData.push(["Actual Progress", currentSummary.actual.toFixed(2) + '%']);
      } else if (activeTab === 3) {
        wsData.push(["Target Progress", currentSummary.plan.toFixed(2) + '%']);
      } else {
        wsData.push(["Realisasi Progress", currentSummary.actual.toFixed(2) + '%']);
      }
      wsData.push(["Status", currentSummary.isValidWeight ? 'VALID' : 'INVALID']);
      
      // PERBAIKAN 2: Tambahkan LINE CHART DATA ke Excel
      if (currentChartData && currentChartData.length > 0) {
        wsData.push([]);
        wsData.push(["📈 KURVA S - LINE CHART DATA (Untuk Grafik Kurva X-Y)"]);
        
        // Buat header untuk chart data
        const chartHeaders = ["Tanggal", "Total Progress (%)"];
        currentRows.forEach((r, i) => {
          chartHeaders.push(`${r.description || `Task ${i + 1}`} (%)`);
        });
        wsData.push(chartHeaders);
        
        // Data chart untuk Excel - FORMAT LINE CHART ASLI
        currentChartData.forEach(item => {
          const rowData = [item.date, item.totalProgress?.toFixed(2) || '0.00'];
          
          // Tambahkan data untuk setiap task
          currentRows.forEach((r, i) => {
            const taskName = r.description || `Task ${i + 1}`;
            const taskProgress = item.tasks?.[taskName]?.toFixed(2) || '0.00';
            rowData.push(taskProgress);
          });
          
          wsData.push(rowData);
        });
        
        // Instruksi untuk membuat grafik
        wsData.push([]);
        wsData.push(["📊 Cara Membuat Line Chart (Kurva X-Y) di Excel:"]);
        wsData.push(["1. Pilih semua data di atas (termasuk header 'Tanggal', 'Total Progress (%)', dll)"]);
        wsData.push(["2. Klik 'Insert' → 'Charts' → 'Scatter' → 'Scatter with Smooth Lines'"]);
        wsData.push(["3. Atur sumbu X: 'Tanggal', sumbu Y: 'Progress (%)'"]);
        wsData.push(["4. Grafik akan tampil sebagai Kurva S (X-Y Chart)"]);
        wsData.push(["5. Klik kanan pada chart → 'Select Data' → tambahkan series untuk setiap task"]);
      }
      
      // Tambahkan info user di bagian bawah
      wsData.push([]);
      wsData.push(["Info Export"]);
      wsData.push(["Diexport oleh", userInfo.email]);
      wsData.push(["Tanggal Export", userInfo.timestamp]);
      
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      
      // Set orientation to landscape
      if (!ws['!pageSetup']) ws['!pageSetup'] = {};
      ws['!pageSetup'].orientation = 'landscape';
      
      // Set column widths
      const colWidths = [
        { wch: 5 },  // No
        { wch: 30 }, // Description
        { wch: 10 }, // Bobot %
        ...(activeTab === 1 ? [{ wch: 10 }, { wch: 12 }] : 
            activeTab === 3 ? [{ wch: 10 }] : 
            [{ wch: 12 }]), // Target/Realisasi
        { wch: 20 }, // Lokasi
        ...dateCols.map(() => ({ wch: 12 })), // Date columns
        { wch: 10 }  // Total column
      ];
      ws['!cols'] = colWidths;
      
      XLSX.utils.book_append_sheet(workbook, ws, tabName);

      // Generate file name
      const fileName = `${metaProject.project_code || projectName}_${tabName}_${new Date().toISOString().split('T')[0]}.xlsx`;
      
      // Export file
      XLSX.writeFile(workbook, fileName);
      
      alert(`✅ Data berhasil diexport ke ${fileName} termasuk TABEL dan DATA LINE CHART untuk Kurva X-Y!`);
    } catch (error) {
      console.error('Export error:', error);
      alert('❌ Gagal mengexport data. Silakan coba lagi.');
    } finally {
      setIsExporting(false);
    }
  };

  // Fungsi untuk export ke Word - DIPERBAIKI untuk LINE CHART
  const exportToWord = async () => {
    try {
      setIsExporting(true);
      
      const userInfo = getUserInfo();
      
      // Get current tab data
      const currentRows = activeTab === 1 ? rows : activeTab === 3 ? targetRows : realisasiRows;
      const currentSummary = activeTab === 1 ? planningSummary : activeTab === 3 ? targetSummary : realisasiSummary;
      const currentChartData = activeTab === 1 ? planningChartData : activeTab === 3 ? targetChartDataNew : realisasiChartDataNew;
      const tabName = activeTab === 1 ? 'Planning' : activeTab === 3 ? 'Target' : 'Realisasi';
      
      // Create HTML content for Word dengan landscape orientation dan info user
      let htmlContent = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
        <head>
          <meta charset="UTF-8">
          <title>${projectName} - ${tabName}</title>
          <style>
            @page {
              size: landscape;
              margin: 0.5in;
            }
            body { 
              font-family: Arial, sans-serif; 
              margin: 20px;
              transform: rotate(0deg);
            }
            .landscape-container {
              width: 100%;
              min-height: 8.5in;
            }
            h1 { color: #2c5aa0; border-bottom: 2px solid #2c5aa0; padding-bottom: 10px; }
            h2 { color: #2c5aa0; margin-top: 20px; }
            table { border-collapse: collapse; width: 100%; margin: 20px 0; font-size: 10pt; }
            th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
            th { background-color: #f2f2f2; font-weight: bold; }
            .summary { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; border-top: 1px solid #ddd; padding-top: 10px; }
            .project-info { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
            .info-item { margin-bottom: 8px; }
            .user-info { background-color: #f0f8ff; padding: 10px; border-radius: 5px; margin-top: 20px; }
            .chart-data { background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #2c5aa0; }
            .chart-instruction { background-color: #fff8e1; padding: 10px; border-radius: 5px; margin: 10px 0; font-size: 10pt; }
          </style>
        </head>
        <body>
          <div class="landscape-container">
            <!-- Kop Surat -->
            <div style="border-bottom: 2px solid #2c5aa0; padding-bottom: 15px; margin-bottom: 20px;">
              <table style="width: 100%; border: none;">
                <tr>
                  <td style="width: 120px; border: none; vertical-align: top;">
                    <img src="/logo-eltama.png" alt="PT Elektrindo Utama Indonesia" style="width: 100px; height: auto;" />
                  </td>
                  <td style="border: none; vertical-align: top; padding-left: 15px;">
                    <h1 style="margin: 0; color: #2c5aa0; font-size: 18pt;">PT ELEKTRINDO UTAMA INDONESIA</h1>
                    <p style="margin: 5px 0; font-size: 10pt; color: #666;">MECHANICAL - ELECTRICAL - FIRE PROTECTION SYSTEM</p>
                    <p style="margin: 5px 0; font-size: 9pt; color: #2c5aa0; font-weight: bold;">SILVER APP - INPUT DATA LAPANGAN (DUAL STORAGE SYSTEM)</p>
                  </td>
                </tr>
              </table>
            </div>
            
            <h1>${projectName} - ${tabName}</h1>
            
            <div class="project-info">
              <div><strong>Kode Proyek:</strong> ${metaProject.project_code || '-'}</div>
              <div><strong>Job Name:</strong> ${metaProject.job_name || '-'}</div>
              <div><strong>Client:</strong> ${metaProject.client || '-'}</div>
              <div><strong>Alamat:</strong> ${metaProject.address || '-'}</div>
              <div><strong>Deadline:</strong> ${metaProject.deadline || '-'}</div>
              <div><strong>Time Schedule:</strong> ${metaProject.time_schedule || '-'}</div>
            </div>
            
            <h2>Summary</h2>
            <div class="summary">
              <p><strong>Total Bobot:</strong> ${currentSummary.totalWeight.toFixed(2)}%</p>
              ${activeTab === 1 ? `
                <p><strong>Plan Progress:</strong> ${currentSummary.plan.toFixed(2)}%</p>
                <p><strong>Actual Progress:</strong> ${currentSummary.actual.toFixed(2)}%</p>
              ` : activeTab === 3 ? `
                <p><strong>Target Progress:</strong> ${currentSummary.plan.toFixed(2)}%</p>
              ` : `
                <p><strong>Realisasi Progress:</strong> ${currentSummary.actual.toFixed(2)}%</p>
              `}
              <p><strong>Status:</strong> ${currentSummary.isValidWeight ? 'VALID' : 'INVALID'}</p>
            </div>
            
            <h2>Data ${tabName}</h2>
            <table>
              <thead>
                <tr>
                  <th>No</th>
                  <th>Description</th>
                  <th>Bobot %</th>
                  ${activeTab === 1 ? '<th>Target (%)</th><th>Realisasi (%)</th>' : 
                    activeTab === 3 ? '<th>Target (%)</th>' : '<th>Realisasi (%)</th>'}
                  <th>Lokasi</th>
                  ${dateCols.map(date => `<th>${date}</th>`).join('')}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                ${currentRows.map((row, index) => {
                  const rowTotal = dateCols.reduce((sum, date) => {
                    return sum + (parseFloat(row.dates?.[date]?.toString() || '0') || 0);
                  }, 0);
                  
                  return `
                    <tr>
                      <td>${index + 1}</td>
                      <td>${row.description || ''}</td>
                      <td>${parseFloat(row.weight?.toString() || '0')}</td>
                      ${activeTab === 1 ? `
                        <td>${parseFloat(row.plan_progress?.toString() || '0')}</td>
                        <td>${parseFloat(row.actual_progress?.toString() || '0')}</td>
                      ` : activeTab === 3 ? `
                        <td>${parseFloat(row.plan_progress?.toString() || '0')}</td>
                      ` : `
                        <td>${parseFloat(row.actual_progress?.toString() || '0')}</td>
                      `}
                      <td>${row.location || ''}</td>
                      ${dateCols.map(date => `<td>${parseFloat(row.dates?.[date]?.toString() || '0')}</td>`).join('')}
                      <td><strong>${rowTotal.toFixed(2)}</strong></td>
                    </tr>
                  `;
                }).join('')}
                <!-- Total Row -->
                <tr style="background-color: #f2f2f2;">
                  <td colspan="${activeTab === 1 ? 6 : activeTab === 3 ? 5 : 5}"><strong>TOTAL %</strong></td>
                  ${dateCols.map(date => {
                    const colTotal = currentRows.reduce((sum, row) => {
                      return sum + (parseFloat(row.dates?.[date]?.toString() || '0') || 0);
                    }, 0);
                    return `<td><strong>${colTotal.toFixed(2)}</strong></td>`;
                  }).join('')}
                  <td><strong>${
                    dateCols.reduce((sum, date) => {
                      return sum + currentRows.reduce((rowSum, row) => {
                        return rowSum + (parseFloat(row.dates?.[date]?.toString() || '0') || 0);
                      }, 0);
                    }, 0).toFixed(2)
                  }</strong></td>
                </tr>
              </tbody>
            </table>
            
            <!-- LINE CHART DATA SECTION -->
            ${currentChartData && currentChartData.length > 0 ? `
              <h2 style="margin-top: 30px;">📈 Data Kurva S - Line Chart (X-Y Chart)</h2>
              <div class="chart-data">
                <p><strong>Data untuk membuat grafik Kurva S di Excel (X-Y Chart):</strong></p>
                
                <div class="chart-instruction">
                  <strong>📊 Cara membuat Line Chart (X-Y Chart) di Excel:</strong>
                  <ol style="margin: 5px 0 0 0; padding-left: 20px; font-size: 9pt;">
                    <li>Pilih semua data di bawah (termasuk header 'Tanggal', 'Total Progress (%)', dll)</li>
                    <li>Klik 'Insert' → 'Charts' → 'Scatter' → 'Scatter with Smooth Lines'</li>
                    <li>Atur sumbu X: 'Tanggal', sumbu Y: 'Progress (%)'</li>
                    <li>Grafik akan tampil sebagai Kurva S (X-Y Chart)</li>
                    <li>Klik kanan pada chart → 'Select Data' → tambahkan series untuk setiap task</li>
                  </ol>
                </div>
                
                <table style="margin-top: 15px;">
                  <thead>
                    <tr>
                      <th>Tanggal</th>
                      <th>Total Progress (%)</th>
                      ${currentRows.map((r, i) => `<th>${r.description || `Task ${i + 1}`} (%)</th>`).join('')}
                    </tr>
                  </thead>
                  <tbody>
                    ${currentChartData.map(item => `
                      <tr>
                        <td>${item.date}</td>
                        <td>${item.totalProgress?.toFixed(2) || '0.00'}</td>
                        ${currentRows.map((r, i) => {
                          const taskName = r.description || `Task ${i + 1}`;
                          const taskProgress = item.tasks?.[taskName]?.toFixed(2) || '0.00';
                          return `<td>${taskProgress}</td>`;
                        }).join('')}
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : ''}
            
            <div class="user-info">
              <p><strong>Diexport oleh:</strong> ${userInfo.email}</p>
              <p><strong>Tanggal Export:</strong> ${userInfo.timestamp}</p>
            </div>
            
            <div class="footer">
              <p>Dokumen ini dihasilkan secara otomatis dari Silver App PT Elektrindo Utama Indonesia</p>
            </div>
          </div>
        </body>
        </html>
      `;
      
      // Convert to blob and download
      const blob = new Blob([htmlContent], { type: 'application/msword' });
      const fileName = `${metaProject.project_code || projectName}_${tabName}_${new Date().toISOString().split('T')[0]}.doc`;
      
      saveAs(blob, fileName);
      alert(`✅ Data berhasil diexport ke ${fileName} termasuk DATA LINE CHART untuk Kurva X-Y!`);
      
    } catch (error) {
      console.error('Export to Word error:', error);
      alert('❌ Gagal mengexport ke Word. Silakan coba lagi.');
    } finally {
      setIsExporting(false);
    }
  };

  // ============ PERBAIKAN 2: Fungsi untuk print/cetak ke PDF SATU LAYAR PENUH ============
  const printToPDF = async () => {
    try {
      setIsPrinting(true);
      
      // Sembunyikan semua elemen yang tidak perlu dicetak
      const elementsToHide = [
        document.querySelector('header'),
        document.querySelector('.OnlineUsers'),
        document.querySelector('.ExportPrintControls'),
        ...document.querySelectorAll('button'),
        ...document.querySelectorAll('.formatting-toolbar')
      ].filter(el => el !== null);
      
      // Simpan style asli
      const originalStyles: any[] = [];
      elementsToHide.forEach(el => {
        if (el instanceof HTMLElement) {
          originalStyles.push({
            element: el,
            display: el.style.display
          });
          el.style.display = 'none';
        }
      });
      
      // Simpan style untuk body
      const originalBodyStyle = document.body.style.cssText;
      document.body.style.overflow = 'visible';
      document.body.style.height = 'auto';
      
      // Buat clone dari konten yang akan dicetak
      let contentToPrint: HTMLElement;
      
      if (activeTab === 1) {
        contentToPrint = document.getElementById('tab-planning-content') as HTMLElement;
      } else if (activeTab === 2) {
        contentToPrint = document.getElementById('tab-lokasi-content') as HTMLElement;
      } else if (activeTab === 3) {
        contentToPrint = document.getElementById('tab-target-content') as HTMLElement;
      } else if (activeTab === 4) {
        contentToPrint = document.getElementById('tab-realisasi-content') as HTMLElement;
      } else {
        contentToPrint = document.getElementById('tab-catatan-content') as HTMLElement;
      }
      
      if (!contentToPrint) {
        throw new Error('Konten tidak ditemukan');
      }
      
      // Buat container untuk PDF
      const pdfContainer = document.createElement('div');
      pdfContainer.style.width = '1122px'; // A4 landscape width in pixels
      pdfContainer.style.padding = '20px';
      pdfContainer.style.backgroundColor = 'white';
      pdfContainer.style.fontFamily = 'Arial, sans-serif';
      pdfContainer.style.position = 'fixed';
      pdfContainer.style.top = '0';
      pdfContainer.style.left = '0';
      pdfContainer.style.zIndex = '9999';
      
      // Tambahkan kop surat
      const kopSurat = `
        <div style="border-bottom: 2px solid #2c5aa0; padding-bottom: 15px; margin-bottom: 20px;">
          <table style="width: 100%; border: none;">
            <tr>
              <td style="width: 120px; border: none; vertical-align: top;">
                <img src="/logo-eltama.png" alt="PT Elektrindo Utama Indonesia" style="width: 100px; height: auto;" />
              </td>
              <td style="border: none; vertical-align: top; padding-left: 15px;">
                <h1 style="margin: 0; color: #2c5aa0; font-size: 18pt;">PT ELEKTRINDO UTAMA INDONESIA</h1>
                <p style="margin: 5px 0; font-size: 10pt; color: #666;">MECHANICAL - ELECTRICAL - FIRE PROTECTION SYSTEM</p>
                <p style="margin: 5px 0; font-size: 9pt; color: #2c5aa0; font-weight: bold;">SILVER APP - INPUT DATA LAPANGAN (DUAL STORAGE SYSTEM)</p>
              </td>
            </tr>
          </table>
        </div>
      `;
      
      pdfContainer.innerHTML = kopSurat;
      
      // Clone konten utama
      const contentClone = contentToPrint.cloneNode(true) as HTMLElement;
      
      // Hapus tombol-tombol dari clone
      const buttonsInClone = contentClone.querySelectorAll('button');
buttonsInClone.forEach(button => {
  if (button instanceof HTMLElement) {
    button.style.display = 'none';
  }
});
      
      // Hapus formatting toolbar jika ada
      const toolbarsInClone = contentClone.querySelectorAll('.formatting-toolbar');
// SESUDAH (fixed):
toolbarsInClone.forEach(toolbar => {
  if (toolbar instanceof HTMLElement) {
    toolbar.style.display = 'none';
  }
});
      
      pdfContainer.appendChild(contentClone);
      
      // Tambahkan footer info
      const userInfo = getUserInfo();
      const footer = document.createElement('div');
      footer.style.marginTop = '20px';
      footer.style.paddingTop = '10px';
      footer.style.borderTop = '1px solid #ddd';
      footer.style.fontSize = '10px';
      footer.style.color = '#666';
      footer.innerHTML = `
        <p>Dicetak oleh: ${userInfo.email} | Tanggal: ${userInfo.timestamp}</p>
        <p>Dokumen ini dihasilkan secara otomatis dari Silver App PT Elektrindo Utama Indonesia</p>
      `;
      pdfContainer.appendChild(footer);
      
      // Tambahkan ke body
      document.body.appendChild(pdfContainer);
      
      // Capture dengan html2canvas
      const canvas = await html2canvas(pdfContainer, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        width: pdfContainer.scrollWidth,
        height: pdfContainer.scrollHeight,
        windowWidth: pdfContainer.scrollWidth,
        windowHeight: pdfContainer.scrollHeight
      });
      
      // Hapus container
      document.body.removeChild(pdfContainer);
      
      // Restore semua style
      originalStyles.forEach(style => {
        style.element.style.display = style.display;
      });
      document.body.style.cssText = originalBodyStyle;
      
      const imgData = canvas.toDataURL('image/png');
      
      // Buat PDF
      const pdf = new jsPDF('l', 'mm', 'a4'); // Landscape orientation
      const imgWidth = 290; // A4 landscape width in mm
      const pageHeight = 210; // A4 landscape height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      // Add image to PDF
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      
      const fileName = `${metaProject.project_code || projectName}_${activeTab === 1 ? 'Planning' : activeTab === 2 ? 'Lokasi' : activeTab === 3 ? 'Target' : activeTab === 4 ? 'Realisasi' : 'Catatan'}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);
      
      alert(`✅ Dokumen berhasil dicetak ke ${fileName} dengan SEMUA ELEMEN di tab ini!`);
      
    } catch (error) {
      console.error('Print to PDF error:', error);
      alert('❌ Gagal mencetak dokumen. Silakan coba lagi.');
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div className="bg-white p-4 rounded shadow mb-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-lg">🖨️ Export & Print Controls</h3>
        <div className="text-sm text-gray-500">
          Tab Aktif: {activeTab === 1 ? 'Planning' : activeTab === 2 ? 'Lokasi' : activeTab === 3 ? 'Target' : activeTab === 4 ? 'Realisasi' : 'Catatan'}
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Export to Excel */}
        <div className="border rounded-lg p-4 bg-blue-50 hover:bg-blue-100 transition-colors">
          <h4 className="font-semibold text-blue-800 mb-2 flex items-center gap-2">
            <span>📊</span>
            Export to Excel
          </h4>
          <p className="text-sm text-blue-700 mb-3">
            Export data lengkap ke format Excel (.xlsx) termasuk semua tabel, summary, dan DATA LINE CHART untuk Kurva X-Y
          </p>
          <button
            onClick={exportToExcel}
            disabled={isExporting}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white py-2 px-4 rounded flex items-center justify-center gap-2 transition-colors"
          >
            {isExporting ? (
              <>
                <span className="animate-spin">⏳</span>
                <span>Exporting...</span>
              </>
            ) : (
              <>
                <span>📥</span>
                <span>Download Excel</span>
              </>
            )}
          </button>
        </div>

        {/* Export to Word */}
        <div className="border rounded-lg p-4 bg-green-50 hover:bg-green-100 transition-colors">
          <h4 className="font-semibold text-green-800 mb-2 flex items-center gap-2">
            <span>📝</span>
            Export to Word
          </h4>
          <p className="text-sm text-green-700 mb-3">
            Export data ke format Word (.doc) dengan layout yang rapi dan DATA LINE CHART untuk Kurva X-Y
          </p>
          <button
            onClick={exportToWord}
            disabled={isExporting}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white py-2 px-4 rounded flex items-center justify-center gap-2 transition-colors"
          >
            {isExporting ? (
              <>
                <span className="animate-spin">⏳</span>
                <span>Exporting...</span>
              </>
            ) : (
              <>
                <span>📥</span>
                <span>Download Word</span>
              </>
            )}
          </button>
        </div>

        {/* Print to PDF - SATU LAYAR PENUH */}
        <div className="border rounded-lg p-4 bg-red-50 hover:bg-red-100 transition-colors">
          <h4 className="font-semibold text-red-800 mb-2 flex items-center gap-2">
            <span>🖨️</span>
            Print to PDF (Full Screen)
          </h4>
          <p className="text-sm text-red-700 mb-3">
            Cetak TAMPILAN PENUH dari tab aktif saat ini termasuk kop surat, chart, tabel, dan seluruh elemen
          </p>
          <button
            onClick={printToPDF}
            disabled={isPrinting}
            className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white py-2 px-4 rounded flex items-center justify-center gap-2 transition-colors"
          >
            {isPrinting ? (
              <>
                <span className="animate-spin">⏳</span>
                <span>Printing...</span>
              </>
            ) : (
              <>
                <span>📄</span>
                <span>Print Full Screen</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="mt-4 p-3 bg-yellow-50 rounded border">
        <p className="text-sm text-yellow-700 flex items-start gap-2">
          <span className="text-lg">💡</span>
          <span>
            <strong>PERBAIKAN:</strong> Print to PDF sekarang mencetak SATU LAYAR PENUH dari tab aktif (kop surat + chart + tabel + seluruh elemen). Untuk hasil terbaik, pastikan tampilan sudah full screen sebelum melakukan print.
          </span>
        </p>
      </div>
    </div>
  );
};

// PERBAIKAN: Komponen Upload Section yang bisa di-toggle
const UploadSection = ({ 
  currentRows, 
  uploadingFiles, 
  setFile, 
  file, 
  uploadToDualStorage, 
  deleteFileFromDualStorage,
  projectId,
  setRows,
  setTargetRows,
  setRealisasiRows,
  activeTab
}: {
  currentRows: TaskType[];
  uploadingFiles: {[key: string]: boolean};
  setFile: (file: File | null) => void;
  file: File | null;
  uploadToDualStorage: (file: File, taskId?: string | null, rowIndex?: number, description?: string) => Promise<void>;
  deleteFileFromDualStorage: (fileUrl: string) => Promise<void>;
  projectId: string | undefined;
  setRows: React.Dispatch<React.SetStateAction<TaskType[]>>;
    setTargetRows: React.Dispatch<React.SetStateAction<TaskType[]>>;
  setRealisasiRows: React.Dispatch<React.SetStateAction<TaskType[]>>;
  activeTab: number;
}) => {
  const [showUploadSection, setShowUploadSection] = useState(false);

  // Komponen untuk menampilkan file yang sudah diupload dengan option delete
  const FilePreview = ({ fileUrl, onDelete }: { fileUrl: string; onDelete: () => void }) => {
    const [showConfirm, setShowConfirm] = useState(false);
    
    const isImage = fileUrl.match(/\.(jpeg|jpg|gif|png|webp)$/i);
    const fileName = fileUrl.split('/').pop() || 'file';

    return (
      <div className="flex items-center gap-2 p-2 bg-gray-50 rounded border mt-2">
        {isImage ? (
          <img 
            src={fileUrl} 
            alt="Preview" 
            className="w-12 h-12 object-cover rounded"
            onError={(e) => {
              // Fallback jika gambar gagal load
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-12 h-12 bg-blue-100 rounded flex items-center justify-center">
            <span className="text-blue-600 text-xs">📄</span>
          </div>
        )}
        
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate">
            {fileName}
          </div>
          <a 
            href={fileUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline"
          >
            Lihat File
          </a>
        </div>
        
        {showConfirm ? (
          <div className="flex gap-1">
            <button
              onClick={onDelete}
              className="px-2 py-1 bg-red-600 text-white rounded text-xs"
            >
              Yakin
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="px-2 py-1 bg-gray-500 text-white rounded text-xs"
            >
              Batal
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowConfirm(true)}
            className="px-2 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-xs"
          >
            Hapus
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="mt-4 p-3 bg-gray-50 rounded border">
      <div className="flex justify-between items-center mb-2">
        <h4 className="font-semibold text-sm">📎 Upload File ke DUAL Supabase Storage</h4>
        <button
          onClick={() => setShowUploadSection(!showUploadSection)}
          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs flex items-center gap-1"
        >
          {showUploadSection ? '▲ Sembunyikan' : '▼ Tampilkan'}
        </button>
      </div>
      
      {showUploadSection && (
        <>
          <div className="mb-3 p-2 bg-blue-50 rounded">
            <p className="text-xs text-blue-700">
              🔄 <strong>DUAL STORAGE SYSTEM:</strong> File akan diupload ke kedua akun Supabase (Primary & Backup) secara otomatis
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentRows.map((row, index) => {
              const uploadKey = row.id || `row_${index}`;
              const isUploading = uploadingFiles[uploadKey];
              
              return (
                <div key={index} className="flex gap-2 items-start p-2 bg-white rounded border">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">
                      {row.description || `Task ${index + 1}`}
                    </div>
                    <div className="text-xs text-gray-500">
                      Status: {row.proof_url ? "✅ Terupload" : "❌ Belum upload"}
                    </div>
                    {row.proof_url && (
                      <FilePreview 
                        fileUrl={row.proof_url} 
                        onDelete={async () => {
                          if (confirm("Yakin ingin menghapus file ini dari DUAL storage?")) {
                            await deleteFileFromDualStorage(row.proof_url!);
                            // Hapus URL dari database
                            if (row.id) {
                              await supabase
                                .from("tasks")
                                .update({ proof_url: null })
                                .eq("id", row.id);
                              // Refresh data berdasarkan tab aktif
                              try {
                                const { data: refreshedTasks } = await supabase
                                  .from("tasks")
                                  .select("*")
                                  .eq("project_id", projectId)
                                  .order("row_index", { ascending: true });
                                
                                if (refreshedTasks) {
                                  if (activeTab === 1) {
                                    setRows(refreshedTasks as TaskType[]);
                                  } else if (activeTab === 3) {
                                    setTargetRows(refreshedTasks as TaskType[]);
                                  } else if (activeTab === 4) {
                                    setRealisasiRows(refreshedTasks as TaskType[]);
                                  }
                                }
                              } catch (refreshError) {
                                console.error("Refresh error:", refreshError);
                              }
                            }
                          }
                        }}
                      />
                    )}
                  </div>
                  
                  {!row.proof_url && (
                    <div className="flex gap-2 items-center">
                      <input
                        type="file"
                        onChange={(e) => {
                          const selectedFile = e.target.files?.[0];
                          if (selectedFile) {
                            setFile(selectedFile);
                            // Auto upload ketika file dipilih
                            setTimeout(() => {
                              uploadToDualStorage(selectedFile, row.id, index + 1, row.description || `Task ${index + 1}`);
                            }, 100);
                          }
                        }}
                        className="text-xs flex-1"
                        id={`file-${activeTab}-${index}`}
                        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                        disabled={isUploading}
                      />
                      <button
                        onClick={() => {
                          if (file) {
                            uploadToDualStorage(file, row.id, index + 1, row.description || `Task ${index + 1}`);
                          } else {
                            document.getElementById(`file-${activeTab}-${index}`)?.click();
                          }
                        }}
                        disabled={isUploading}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs whitespace-nowrap disabled:bg-gray-400"
                      >
                        {isUploading ? "⏳ Uploading..." : "Upload"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            File akan diupload ke DUAL Supabase Storage (Primary & Backup) secara otomatis
          </p>
        </>
      )}
    </div>
  );
};

// PERBAIKAN UTAMA: Custom Cell untuk input tanggal dengan warna yang DIPERBAIKI - SUPPORT DESIMAL DENGAN VALIDASI REALISASI
const DateCellWithColor = ({ cell, rowIndex, columnIndex, dateCols, currentRows, onChange, ...props }: any) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(cell.value || "");
  
  // PERBAIKAN: Hitung total kumulatif per baris untuk menentukan warna
  const currentRow = currentRows[rowIndex];
  
  // PERBAIKAN: Fungsi untuk parse nilai desimal dengan koma
  const parseDecimalValue = (value: any): number => {
    if (value === null || value === undefined || value === "") return 0;
    
    // Handle string dengan koma atau titik
    if (typeof value === 'string') {
      // Ganti koma dengan titik untuk parsing yang benar
      value = value.replace(',', '.');
      // Hapus karakter non-numerik kecuali titik dan minus
      value = value.replace(/[^\d.-]/g, '');
    }
    
    const num = Number(value);
    return isNaN(num) ? 0 : parseFloat(num.toFixed(2));
  };
  
  // Hitung total kumulatif sampai kolom ini
  const calculateCumulativeUntilColumn = (row: TaskType, currentColumnIndex: number): number => {
    let cumulative = 0;
    const dateKeys = Object.keys(row.dates || {});
    
    // Urutkan berdasarkan posisi kolom dalam dateCols
    for (let i = 0; i <= currentColumnIndex; i++) {
      if (i < dateKeys.length) {
        const dateKey = dateKeys[i];
        const value = parseDecimalValue(row.dates?.[dateKey]);
        cumulative += value;
      }
    }
    
    return cumulative;
  };
  
  // Nilai realisasi untuk baris ini - PERBAIKAN: gunakan parseDecimalValue
  const realisasiValue = parseDecimalValue(currentRow?.actual_progress);
  
  // Total kumulatif sampai kolom ini
  const cumulativeUntilThisColumn = calculateCumulativeUntilColumn(currentRow, columnIndex);
  
  // Nilai sel saat ini - PERBAIKAN: gunakan parseDecimalValue
  const currentCellValue = parseDecimalValue(cell.value);
  
  // PERBAIKAN: Tentukan warna berdasarkan kumulatif per baris - LOGIKA YANG DIPERBAIKI
  let cellColor = '';
  let cellBorder = '';
  
  if (currentCellValue > 0) {
    // Jika kumulatif sampai kolom ini <= realisasi, beri warna hijau
    if (cumulativeUntilThisColumn <= realisasiValue) {
      cellColor = 'bg-green-100';
      cellBorder = 'border-green-400';
    } else {
      // Jika kumulatif melebihi realisasi, beri warna merah
      cellColor = 'bg-red-100';
      cellBorder = 'border-red-400';
    }
  }

  const handleChange = (value: string) => {
    // Use the DecimalCell logic for handling input
    const cleanedValue = value.replace(/[^\d,.-]/g, '');
    const commaCount = (cleanedValue.match(/,/g) || []).length;
    const dotCount = (cleanedValue.match(/\./g) || []).length;
    
    if (commaCount <= 1 && dotCount <= 1) {
      setCurrentValue(cleanedValue);
    }
  };

  const handleBlur = () => {
    setIsEditing(false);
    
    let finalValue = currentValue;
    if (finalValue && finalValue.trim() !== '') {
      // Ganti koma dengan titik untuk parsing
      finalValue = finalValue.replace(',', '.');
      
      // Validasi angka
      const numValue = parseFloat(finalValue);
      if (!isNaN(numValue)) {
        // Batasi maksimal 100 dan 2 digit desimal
        finalValue = Math.min(numValue, 100).toFixed(2);
        // Jika 0.00, kembalikan string kosong
        if (finalValue === '0.00') finalValue = '';
      } else {
        finalValue = "";
      }
    } else {
      finalValue = "";
    }
    
    onChange({ ...cell, value: finalValue });
  };

  const handleFocus = () => {
    setIsEditing(true);
    // Tampilkan dengan koma saat edit untuk user-friendly
    const displayValue = cell.value ? 
      cell.value.toString().replace('.', ',') : 
      "";
    setCurrentValue(displayValue);
  };

  // Format untuk display (gunakan koma sebagai separator)
  const displayValue = cell.value ? 
    parseFloat(cell.value.toString()).toFixed(2).replace('.', ',') : 
    "";

  return (
    <div className={`w-full h-full ${cellColor} ${cellBorder} border-2`}>
      {isEditing ? (
        <input
          type="text"
          value={currentValue}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleBlur();
            }
            if (e.key === 'Escape') {
              setIsEditing(false);
              setCurrentValue(cell.value ? cell.value.toString().replace('.', ',') : '');
            }
          }}
          className="w-full h-full p-1 border-none outline-none text-sm bg-transparent"
          placeholder="0,00"
          autoFocus
        />
      ) : (
        <div
          onClick={handleFocus}
          className="w-full h-full p-1 cursor-pointer text-sm flex items-center justify-center hover:bg-blue-50 transition-colors"
          title="Klik untuk edit. Gunakan koma (,) atau titik (.) untuk desimal"
          data-row={rowIndex}
          data-cell={columnIndex}
        >
          {displayValue}
        </div>
      )}
    </div>
  );
};

// ============ PERBAIKAN 3 & 4: Location Tab dengan FIX untuk insert error dan GPS valid ============
const LocationTab = ({ projectId, metaProject }: { projectId: string | undefined, metaProject: ProjectMetaType }) => {
  const [currentLocation, setCurrentLocation] = useState<{
    latitude: number | null;
    longitude: number | null;
    accuracy: number | null;
    address: string;
    timestamp: string | null;
  }>({
    latitude: null,
    longitude: null,
    accuracy: null,
    address: "Belum mendapatkan lokasi",
    timestamp: null
  });

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fungsi untuk mendapatkan lokasi saat ini
  const getCurrentLocation = async (manualUpdate = false) => {
    if (!navigator.geolocation) {
      setErrorMessage("Geolocation tidak didukung oleh browser Anda");
      alert("Geolocation tidak didukung oleh browser Anda");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          resolve, 
          reject, 
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
          }
        );
      });

      const { latitude, longitude, accuracy } = position.coords;
      
      // Deteksi lokasi user (Gresik atau Surabaya)
      let address = "Lokasi tidak diketahui";
      let detectedCity = "Unknown";
      
      try {
        // Gunakan API geocoding untuk mendapatkan alamat
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`
        );
        
        if (response.ok) {
          const data = await response.json();
          
          if (data.display_name) {
            address = data.display_name;
            
            // Deteksi kota berdasarkan address details
            const city = data.address?.city || 
                         data.address?.town || 
                         data.address?.village || 
                         data.address?.county ||
                         "Unknown";
            
            detectedCity = city;
            
            // Log untuk debugging
            console.log("Lokasi terdeteksi:", {
              latitude,
              longitude,
              city: detectedCity,
              fullAddress: address,
              addressDetails: data.address
            });
          }
        }
      } catch (e) {
        console.warn("Gagal mendapatkan alamat dari API:", e);
        // Fallback: tentukan kota berdasarkan koordinat
        if (latitude > -7.3 && latitude < -7.1 && longitude > 112.5 && longitude < 112.8) {
          detectedCity = "Gresik";
          address = `Gresik, Jawa Timur (${latitude.toFixed(6)}, ${longitude.toFixed(6)})`;
        } else if (latitude > -7.4 && latitude < -7.0 && longitude > 112.6 && longitude < 113.0) {
          detectedCity = "Surabaya";
          address = `Surabaya, Jawa Timur (${latitude.toFixed(6)}, ${longitude.toFixed(6)})`;
        } else {
          address = `Koordinat: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        }
      }

      // Update state lokasi saat ini
      setCurrentLocation({
        latitude,
        longitude,
        accuracy,
        address,
        timestamp: new Date().toISOString()
      });

      if (manualUpdate) {
        // Kirim ke database
        await sendLocationToDatabase(latitude, longitude, accuracy, address);
      }

    } catch (error: any) {
      console.error("Error getting location:", error);
      
      let errorMsg = "Gagal mengambil lokasi";
      if (error.code === error.PERMISSION_DENIED) {
        errorMsg = "Akses lokasi ditolak. Silakan izinkan akses lokasi di pengaturan browser Anda.";
      } else if (error.code === error.TIMEOUT) {
        errorMsg = "Timeout saat mengambil lokasi. Pastikan GPS aktif dan coba lagi.";
      } else if (error.message) {
        errorMsg = error.message;
      }
      
      setErrorMessage(errorMsg);
      
      if (manualUpdate) {
        alert(errorMsg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Fungsi untuk mengirim lokasi ke database - PERBAIKAN UTAMA: Fixed insert error
  const sendLocationToDatabase = async (
    latitude: number, 
    longitude: number, 
    accuracy: number | null, 
    address: string
  ) => {
    try {
      if (!projectId) {
        throw new Error("Project ID tidak ditemukan");
      }

      const insertData = {
        project_id: projectId,
        last_lat: latitude,
        last_lng: longitude,
        accuracy: accuracy,
        address: address,
        status: "manual",
        recorded_at: new Date().toISOString()
      };

      console.log("Mengirim lokasi ke database:", insertData);

      // PERBAIKAN UTAMA: Gunakan insert tanpa .single() untuk menghindari error
      const { data, error } = await supabase
        .from("shipments")
        .insert(insertData);

      if (error) {
        console.error("Insert shipment error:", error);
        throw error;
      }

      console.log("Lokasi berhasil dikirim:", data);
      
      alert(`📍 Lokasi berhasil dikirim!\n\nKoordinat: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}\nAkurasi: ${accuracy ? accuracy + 'm' : 'N/A'}\nAlamat: ${address}`);
      
      return data;
      
    } catch (error: any) {
      console.error("Error sending location to database:", error);
      
      // Fallback: simpan ke localStorage jika database error
      const fallbackData = {
        project_id: projectId,
        latitude,
        longitude,
        accuracy,
        address,
        timestamp: new Date().toISOString()
      };
      
      localStorage.setItem(`shipment_fallback_${projectId}_${Date.now()}`, JSON.stringify(fallbackData));
      
      alert(`⚠️ Lokasi berhasil direkam lokal, tapi gagal ke server.\nKoordinat: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}\n\nData tersimpan di localStorage.`);
      
      throw error;
    }
  };

  // Load current location saat component mount
  useEffect(() => {
    getCurrentLocation(false);
  }, []);

  // Format waktu
  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return "-";
    return new Date(timestamp).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Format tanggal
  const formatDate = (timestamp: string | null) => {
    if (!timestamp) return "-";
    return new Date(timestamp).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  return (
    <div className="space-y-6" id="tab-lokasi-content">
      {/* Status Lokasi Terkini */}
      <div className="bg-white p-6 rounded shadow">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <span className="text-2xl">📍</span>
          <span>Lokasi Terkini & GPS Tracking</span>
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-blue-50 border border-blue-200 rounded p-4">
            <h4 className="font-semibold text-blue-800 mb-2">📍 Lokasi Anda Sekarang</h4>
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-700"></div>
                <span className="text-blue-700">Mendeteksi lokasi...</span>
              </div>
            ) : currentLocation.latitude ? (
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-gray-600">Latitude:</span>
                  <span className="font-semibold">{currentLocation.latitude.toFixed(6)}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-gray-600">Longitude:</span>
                  <span className="font-semibold">{currentLocation.longitude!.toFixed(6)}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-gray-600">Akurasi:</span>
                  <span className="font-semibold">{currentLocation.accuracy ? `${currentLocation.accuracy.toFixed(1)} m` : 'N/A'}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-gray-600">Alamat:</span>
                  <span className="font-semibold">{currentLocation.address}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-gray-600">Terakhir Update:</span>
                  <span className="font-semibold">{formatTime(currentLocation.timestamp)} {formatDate(currentLocation.timestamp)}</span>
                </div>
              </div>
            ) : (
              <div className="text-yellow-600">
                ⚠️ Lokasi belum terdeteksi. Klik tombol di bawah untuk mendapatkan lokasi.
              </div>
            )}
            
            {errorMessage && (
              <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                ⚠️ {errorMessage}
              </div>
            )}
          </div>
          
          <div className="bg-green-50 border border-green-200 rounded p-4">
            <h4 className="font-semibold text-green-800 mb-2">📊 Informasi Proyek</h4>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <span className="text-gray-600">Kode Proyek:</span>
                <span className="font-semibold">{metaProject.project_code || '-'}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-gray-600">Job Name:</span>
                <span className="font-semibold">{metaProject.job_name || '-'}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-gray-600">Lokasi Proyek:</span>
                <span className="font-semibold">{metaProject.address || '-'}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-gray-600">Client:</span>
                <span className="font-semibold">{metaProject.client || '-'}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-4">
          <h4 className="font-semibold text-yellow-800 mb-2">🚀 Update & Kirim Lokasi</h4>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => getCurrentLocation(false)}
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-white flex items-center gap-2 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Mendeteksi...</span>
                </>
              ) : (
                <>
                  <span>🔄</span>
                  <span>Perbarui Lokasi</span>
                </>
              )}
            </button>
            
            <button
              onClick={() => getCurrentLocation(true)}
              disabled={isLoading || !currentLocation.latitude}
              className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded text-white flex items-center gap-2 disabled:opacity-50"
            >
              <span>📤</span>
              <span>Kirim Lokasi ke Server</span>
            </button>
            
            <button
              onClick={() => {
                if (currentLocation.latitude && currentLocation.longitude) {
                  const url = `https://www.google.com/maps?q=${currentLocation.latitude},${currentLocation.longitude}`;
                  window.open(url, '_blank');
                } else {
                  alert("Lokasi belum tersedia. Perbarui lokasi terlebih dahulu.");
                }
              }}
              disabled={!currentLocation.latitude}
              className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded text-white flex items-center gap-2 disabled:opacity-50"
            >
              <span>🗺️</span>
              <span>Buka di Google Maps</span>
            </button>
          </div>
          
          <p className="text-xs text-yellow-700 mt-3">
            • Pastikan GPS aktif dan izinkan akses lokasi<br/>
            • "Perbarui Lokasi" hanya menampilkan lokasi<br/>
            • "Kirim Lokasi ke Server" menyimpan ke database<br/>
            • Data disimpan dengan akurasi tinggi
          </p>
        </div>
      </div>

      {/* Peta Tracking - PERBAIKAN UTAMA: MapTracking dengan lokasi user yang valid */}
      <div className="bg-white p-6 rounded shadow">
        <h3 className="font-semibold mb-4">🗺️ Peta & Monitor Lokasi</h3>
        
        {projectId ? (
          <div className="space-y-4">
            {/* PERBAIKAN: MapTracking dengan center yang sesuai lokasi user */}
            <MapTracking 
              projectId={projectId} 
              center={currentLocation.latitude && currentLocation.longitude ? 
                { lat: currentLocation.latitude, lng: currentLocation.longitude } : 
                { lat: -7.155, lng: 112.65 } // Default ke Gresik jika lokasi belum didapat
              }
            />
            
            <div className="p-4 bg-gray-50 rounded border">
              <h4 className="font-semibold text-gray-800 mb-2">ℹ️ Petunjuk Penggunaan</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Peta akan menampilkan semua lokasi yang telah dikirim</li>
                <li>• Titik biru menunjukkan lokasi terkini Anda</li>
                <li>• Titik merah menunjukkan lokasi sebelumnya</li>
                <li>• Klik pada marker untuk melihat detail lokasi</li>
                <li>• Gunakan tombol di atas untuk mengirim lokasi baru</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p>Project ID tidak ditemukan</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ============ Komponen utama ============
export default function SilverPage(): JSX.Element {
  const router = useRouter();
  const params = useParams();
  const projectId = (params as any)?.projectId as string | undefined;

  const [projectName, setProjectName] = useState<string>("Project");
  const [rows, setRows] = useState<TaskType[]>([]);
  const [dateCols, setDateCols] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [metaProject, setMetaProject] = useState<ProjectMetaType>({});
  const [activeTab, setActiveTab] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [logoError, setLogoError] = useState(false);
  const [isEditingMeta, setIsEditingMeta] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<{[key: string]: boolean}>({});

  const [targetRows, setTargetRows] = useState<TaskType[]>([]);
  const [realisasiRows, setRealisasiRows] = useState<TaskType[]>([]);
  const [targetChartData, setTargetChartData] = useState<any[]>([]);
  const [realisasiChartData, setRealisasiChartData] = useState<any[]>([]);

  const [notes, setNotes] = useState<NoteType[]>([]);
  const [newNote, setNewNote] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);

  // State baru untuk fitur yang diminta
  const [onlineUsers, setOnlineUsers] = useState<UserPresenceType[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [showDeleteDate, setShowDeleteDate] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<string | null>(null);

  const undoStack = useRef<TaskType[][]>([]);
  const redoStack = useRef<TaskType[][]>([]);
  const targetUndoStack = useRef<TaskType[][]>([]);
  const targetRedoStack = useRef<TaskType[][]>([]);
  const realisasiUndoStack = useRef<TaskType[][]>([]);
  const realisasiRedoStack = useRef<TaskType[][]>([]);
  
  const dateColsUndoStack = useRef<DateColsHistory[]>([]);
  const dateColsRedoStack = useRef<DateColsHistory[]>([]);

  const LS_KEY = `silver:${projectId}:rows`;
  const LS_TARGET_KEY = `silver:${projectId}:target_rows`;
  const LS_REALISASI_KEY = `silver:${projectId}:realisasi_rows`;
  const LS_DATE_COLS = `silver:${projectId}:date_cols`;

  // PERBAIKAN: Ambil data user dari localStorage
  useEffect(() => {
    const email = localStorage.getItem("userEmail");
    const profile = localStorage.getItem("userProfile");
    setUserEmail(email);
    setUserProfile(profile);
  }, []);

  // PERBAIKAN UTAMA: Fungsi untuk parse nilai desimal yang lebih baik dengan support koma
  const parseDecimalValue = (value: any): number => {
    if (value === null || value === undefined || value === "") return 0;
    
    // Handle string dengan koma atau titik
    if (typeof value === 'string') {
      // Ganti koma dengan titik untuk parsing yang benar
      value = value.replace(',', '.');
      // Hapus karakter non-numerik kecuali titik dan minus
      value = value.replace(/[^\d.-]/g, '');
    }
    
    const num = Number(value);
    return isNaN(num) ? 0 : parseFloat(num.toFixed(2));
  };

  // PERBAIKAN UTAMA: Format nilai untuk spreadsheet (mengizinkan koma)
  const formatDecimalForSpreadsheet = (value: any): string => {
    if (value === null || value === undefined || value === "") return "";
    const num = parseDecimalValue(value);
    return num === 0 ? "" : num.toString().replace('.', ',');
  };

  // PERBAIKAN UTAMA: Fungsi untuk menangani input desimal dengan koma
  const handleDecimalInput = (value: string): number => {
    if (!value) return 0;
    
    // Ganti koma dengan titik untuk parsing
    const normalizedValue = value.replace(',', '.');
    // Hapus karakter non-numerik kecuali titik dan minus
    const cleanValue = normalizedValue.replace(/[^\d.-]/g, '');
    
    const num = Number(cleanValue);
    return isNaN(num) ? 0 : parseFloat(num.toFixed(2));
  };

  // PERBAIKAN: Fungsi untuk input tanggal yang menerima angka berkoma
  const handleDateInput = (value: string): number => {
    return handleDecimalInput(value);
  };

  const totalWeight = useMemo(() => {
    return rows.reduce((sum, row) => sum + parseDecimalValue(row.weight), 0);
  }, [rows]);

  const totalTargetWeight = useMemo(() => {
    return targetRows.reduce((sum, row) => sum + parseDecimalValue(row.weight), 0);
  }, [targetRows]);

  const validateProgressValues = (weight: number, planProgress: number, actualProgress: number) => {
    const maxAllowed = weight;
    const validPlanProgress = Math.min(planProgress, maxAllowed);
    const validActualProgress = Math.min(actualProgress, maxAllowed);
    return { validPlanProgress, validActualProgress };
  };

  // PERBAIKAN: Fungsi validasi untuk kolom tanggal - LOGIKA YANG DIPERBAIKI
  const validateDateValue = (dateValue: number, weight: number, planProgress: number, actualProgress: number, cumulativeUntilNow: number = 0): number => {
    // Nilai maksimum yang diizinkan adalah realisasi progress dikurangi kumulatif sebelumnya
    const maxAllowed = Math.max(0, actualProgress - cumulativeUntilNow);
    return Math.min(dateValue, maxAllowed);
  };

  const validateTargetDateValue = (dateValue: number, weight: number, planProgress: number): number => {
    const minValue = Math.min(weight, planProgress);
    const maxAllowed = Math.max(0, minValue - 1);
    return Math.min(dateValue, maxAllowed);
  };

  const validateRealisasiDateValue = (dateValue: number, weight: number, actualProgress: number, cumulativeUntilNow: number = 0): number => {
    // PERBAIKAN: Untuk realisasi, nilai maksimum adalah actual progress dikurangi kumulatif sebelumnya
    const maxAllowed = Math.max(0, actualProgress - cumulativeUntilNow);
    return Math.min(dateValue, maxAllowed);
  };

  // PERBAIKAN: Fungsi untuk menghitung % total dari seluruh data tanggal
  const calculateDateTotals = (rowsData: TaskType[]) => {
    const totals: Record<string, number> = {};
    
    dateCols.forEach(date => {
      totals[date] = 0;
      rowsData.forEach(row => {
        const dateValue = parseDecimalValue(row.dates?.[date]);
        totals[date] += dateValue;
      });
    });
    
    return totals;
  };

  const planningSummary = useMemo(() => {
    const totalWeight = rows.reduce((s, r) => s + parseDecimalValue(r.weight), 0);
    const normalizationFactor = totalWeight > 100 ? 100 / totalWeight : 1;
    
    const weightedPlan = totalWeight > 0 ? 
      rows.reduce((s, r) => s + (parseDecimalValue(r.weight) * parseDecimalValue(r.plan_progress) / 100 * normalizationFactor), 0) : 0;
    const weightedActual = totalWeight > 0 ? 
      rows.reduce((s, r) => s + (parseDecimalValue(r.weight) * parseDecimalValue(r.actual_progress) / 100 * normalizationFactor), 0) : 0;

    return {
      plan: weightedPlan,
      accumPlan: weightedPlan,
      actual: weightedActual,
      accumActual: weightedActual,
      totalWeight: totalWeight,
      isValidWeight: totalWeight <= 100
    };
  }, [rows]);

  const targetSummary = useMemo(() => {
    const totalWeight = targetRows.reduce((s, r) => s + parseDecimalValue(r.weight), 0);
    const normalizationFactor = totalWeight > 100 ? 100 / totalWeight : 1;
    
    const weightedPlan = totalWeight > 0 ? 
      targetRows.reduce((s, r) => s + (parseDecimalValue(r.weight) * parseDecimalValue(r.plan_progress) / 100 * normalizationFactor), 0) : 0;

    return {
      plan: weightedPlan,
      accumPlan: weightedPlan,
      actual: 0,
      accumActual: 0,
      totalWeight: totalWeight,
      isValidWeight: totalWeight <= 100
    };
  }, [targetRows]);

  const realisasiSummary = useMemo(() => {
    const totalWeight = realisasiRows.reduce((s, r) => s + parseDecimalValue(r.weight), 0);
    const normalizationFactor = totalWeight > 100 ? 100 / totalWeight : 1;
    
    const weightedActual = totalWeight > 0 ? 
      realisasiRows.reduce((s, r) => s + (parseDecimalValue(r.weight) * parseDecimalValue(r.actual_progress) / 100 * normalizationFactor), 0) : 0;

    return {
      plan: 0,
      accumPlan: 0,
      actual: weightedActual,
      accumActual: weightedActual,
      totalWeight: totalWeight,
      isValidWeight: totalWeight <= 100
    };
  }, [realisasiRows]);

  // PERBAIKAN: Menghitung % total untuk setiap tab
  const planningDateTotals = useMemo(() => calculateDateTotals(rows), [rows, dateCols]);
  const targetDateTotals = useMemo(() => calculateDateTotals(targetRows), [targetRows, dateCols]);
  const realisasiDateTotals = useMemo(() => calculateDateTotals(realisasiRows), [realisasiRows, dateCols]);

  const currentSummary = useMemo(() => {
    switch (activeTab) {
      case 1: return planningSummary;
      case 3: return targetSummary;
      case 4: return realisasiSummary;
      default: return planningSummary;
    }
  }, [activeTab, planningSummary, targetSummary, realisasiSummary]);

  // PERBAIKAN 2: planningChartData untuk LINE CHART (X-Y Chart)
  const planningChartData = useMemo(() => {
    if (!dateCols.length) return [];

    const allDataPoints: any[] = [];
    
    rows.forEach((row, rowIndex) => {
      const description = row.description || `Task ${rowIndex + 1}`;
      
      dateCols.forEach((date, dateIndex) => {
        const dateValue = parseDecimalValue(row.dates?.[date]);
        const maxAllowed = parseDecimalValue(row.weight);
        const validatedValue = validateDateValue(dateValue, maxAllowed, parseDecimalValue(row.plan_progress), parseDecimalValue(row.actual_progress));
        
        if (validatedValue > 0) {
          allDataPoints.push({
            date,
            task: description,
            progress: validatedValue,
            rowIndex
          });
        }
      });
    });

    const dateMap = new Map();
    
    allDataPoints.forEach(point => {
      if (!dateMap.has(point.date)) {
        dateMap.set(point.date, {
          date: point.date,
          totalProgress: 0,
          tasks: {}
        });
      }
      
      const dateData = dateMap.get(point.date);
      dateData.tasks[point.task] = point.progress;
      dateData.totalProgress += point.progress;
    });

    return Array.from(dateMap.values());
  }, [rows, dateCols]);

  // PERBAIKAN 2: targetChartDataNew untuk LINE CHART (X-Y Chart)
  const targetChartDataNew = useMemo(() => {
    if (!dateCols.length) return [];

    const allDataPoints: any[] = [];
    
    targetRows.forEach((row, rowIndex) => {
      const description = row.description || `Task ${rowIndex + 1}`;
      
      dateCols.forEach((date, dateIndex) => {
        const dateValue = parseDecimalValue(row.dates?.[date]);
        const maxAllowed = parseDecimalValue(row.weight);
        const validatedValue = validateTargetDateValue(dateValue, maxAllowed, parseDecimalValue(row.plan_progress));
        
        if (validatedValue > 0) {
          allDataPoints.push({
            date,
            task: description,
            progress: validatedValue,
            rowIndex
          });
        }
      });
    });

    const dateMap = new Map();
    
    allDataPoints.forEach(point => {
      if (!dateMap.has(point.date)) {
        dateMap.set(point.date, {
          date: point.date,
          totalProgress: 0,
          tasks: {}
        });
      }
      
      const dateData = dateMap.get(point.date);
      dateData.tasks[point.task] = point.progress;
      dateData.totalProgress += point.progress;
    });

    return Array.from(dateMap.values());
  }, [targetRows, dateCols]);

  // PERBAIKAN 2: realisasiChartDataNew untuk LINE CHART (X-Y Chart)
  const realisasiChartDataNew = useMemo(() => {
    if (!dateCols.length) return [];

    const allDataPoints: any[] = [];
    
    realisasiRows.forEach((row, rowIndex) => {
      const description = row.description || `Task ${rowIndex + 1}`;
      
      dateCols.forEach((date, dateIndex) => {
        const dateValue = parseDecimalValue(row.dates?.[date]);
        const maxAllowed = parseDecimalValue(row.weight);
        
        // Hitung kumulatif sampai tanggal sebelumnya
        let cumulativeUntilNow = 0;
        for (let i = 0; i < dateIndex; i++) {
          const prevDate = dateCols[i];
          cumulativeUntilNow += parseDecimalValue(row.dates?.[prevDate]);
        }
        
        const validatedValue = validateRealisasiDateValue(dateValue, maxAllowed, parseDecimalValue(row.actual_progress), cumulativeUntilNow);
        
        if (validatedValue > 0) {
          allDataPoints.push({
            date,
            task: description,
            progress: validatedValue,
            rowIndex,
            cumulativeUntilNow
          });
        }
      });
    });

    const dateMap = new Map();
    
    allDataPoints.forEach(point => {
      if (!dateMap.has(point.date)) {
        dateMap.set(point.date, {
          date: point.date,
          totalProgress: 0,
          tasks: {}
        });
      }
      
      const dateData = dateMap.get(point.date);
      dateData.tasks[point.task] = point.progress;
      dateData.totalProgress += point.progress;
    });

    return Array.from(dateMap.values());
  }, [realisasiRows, dateCols]);

  // PERBAIKAN 2: Combined chart data untuk tab realisasi
  const combinedRealisasiChartData = useMemo(() => {
    if (!dateCols.length) return [];

    // Gabungkan data dari planning dan realisasi
    const combinedDataMap = new Map();

    // Tambahkan data dari planning (tab 1)
    planningChartData.forEach(item => {
      combinedDataMap.set(item.date, {
        date: item.date,
        planningTotal: item.totalProgress,
        realisasiTotal: 0,
        tasks: { ...item.tasks }
      });
    });

    // Tambahkan atau update dengan data dari realisasi (tab 4)
    realisasiChartDataNew.forEach(item => {
      if (combinedDataMap.has(item.date)) {
        const existing = combinedDataMap.get(item.date);
        combinedDataMap.set(item.date, {
          ...existing,
          realisasiTotal: item.totalProgress,
          realisasiTasks: { ...item.tasks }
        });
      } else {
        combinedDataMap.set(item.date, {
          date: item.date,
          planningTotal: 0,
          realisasiTotal: item.totalProgress,
          realisasiTasks: { ...item.tasks }
        });
      }
    });

    return Array.from(combinedDataMap.values());
  }, [planningChartData, realisasiChartDataNew, dateCols]);

  const autosave = useRef(
    debounceFn(async (projectIdArg: string | undefined, snapshotRows: TaskType[]) => {
      if (!projectIdArg) return;
      try {
        await Promise.all(
          snapshotRows.map(async (r) => {
            const payload: any = {
              description: r.description ?? null,
              weight: parseDecimalValue(r.weight),
              plan_progress: parseDecimalValue(r.plan_progress),
              actual_progress: parseDecimalValue(r.actual_progress),
              color: r.color ?? "",
              location: r.location ?? null,
              dates: r.dates ?? {},
              project_id: projectIdArg,
              row_index: r.row_index ?? 0,
            };
            if (r.id) {
              await supabase.from("tasks").update(payload).eq("id", r.id);
            } else {
              await supabase.from("tasks").upsert(payload);
            }
          })
        );
      } catch (err) {
        console.error("autosave error:", err);
      }
    }, 1100)
  ).current;

  // Generate kode proyek otomatis - DIPERBAIKI
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

  // Upload function menggunakan DUAL Supabase Storage - DIPERBAIKI
  const uploadToDualStorage = async (file: File, taskId?: string | null, rowIndex?: number, description?: string) => {
    if (!file) {
      alert("Pilih file terlebih dahulu!");
      return;
    }

    const uploadKey = taskId || `row_${rowIndex}`;
    setUploadingFiles(prev => ({ ...prev, [uploadKey]: true }));

    try {
      console.log("🚀 Starting upload to DUAL Supabase Storage...", file.name, file.size);
      
      // Validasi file
      if (file.size > 10 * 1024 * 1024) {
        alert("File terlalu besar. Maksimal 10MB.");
        setUploadingFiles(prev => ({ ...prev, [uploadKey]: false }));
        return;
      }

      const allowedTypes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ];

      if (!allowedTypes.includes(file.type)) {
        alert("Tipe file tidak didukung. Gunakan gambar, PDF, atau dokumen Office.");
        setUploadingFiles(prev => ({ ...prev, [uploadKey]: false }));
        return;
      }

      alert(`Mengupload ${file.name} ke DUAL STORAGE...`);

      // Generate nama file yang unik
      const fileExtension = file.name.split('.').pop();
      const timestamp = new Date().getTime();
      const safeDescription = (description || `task_${rowIndex}`).replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `${projectId}/${safeDescription}_${timestamp}.${fileExtension}`;

      console.log("📤 Uploading to DUAL Storage:", fileName);

      // Upload ke DUAL Storage menggunakan class DualStorage
      const result = await DualStorage.upload(file, fileName, 'proofs');

      if (!result.success) {
        console.error("❌ Dual storage upload error:", result.errors);
        throw new Error(`Upload gagal: ${result.errors?.join(', ')}`);
      }

      console.log("✅ Dual upload successful:", result);

      // Dapatkan URL publik dari primary storage
      const publicUrl = result.url || DualStorage.getPublicUrl(fileName, 'primary');
      console.log("🔗 Public URL:", publicUrl);

      // Simpan URL ke database jika ada taskId
      if (taskId) {
        console.log('💾 Saving to database for task:', taskId);
        
        const { error: updateError } = await supabase
          .from("tasks")
          .update({ 
            proof_url: publicUrl,
            updated_at: new Date().toISOString()
          })
          .eq("id", taskId);

        if (updateError) {
          console.error("❌ Database update error:", updateError);
          // Jangan throw error di sini, karena upload sudah berhasil
        } else {
          console.log("✅ Database update successful");
        }
      }
      
      setFile(null);
      
      // Success message dengan info dual storage
      const storageInfo = result.primary && result.secondary ? 
        "✅ File tersimpan di KEDUA storage (Primary & Backup)" :
        result.primary ? 
        "⚠️ File hanya tersimpan di PRIMARY storage (Backup gagal)" :
        "⚠️ File hanya tersimpan di BACKUP storage (Primary gagal)";
      
      alert(`✅ File berhasil diupload!\n\n📁 File: ${file.name}\n📝 Task: ${description}\n🔄 ${storageInfo}\n\nLink: ${publicUrl}`);
      
      // Refresh data tasks
      try {
        const { data: refreshedTasks } = await supabase
          .from("tasks")
          .select("*")
          .eq("project_id", projectId)
          .order("row_index", { ascending: true });
        
        if (refreshedTasks) {
          setRows(refreshedTasks as TaskType[]);
        }
      } catch (refreshError) {
        console.error("Refresh error:", refreshError);
      }
      
    } catch (err: any) {
      console.error("❌ Dual upload error:", err);
      
      let errorMessage = "Upload gagal: ";
      if (err.message.includes('database') || err.message.includes('simpan')) {
        errorMessage = "✅ File berhasil diupload ke storage, tapi gagal menyimpan link ke database. File tetap aman di storage.";
      } else {
        errorMessage += err.message || "Silakan coba lagi.";
      }
      
      alert(errorMessage);
    } finally {
      setUploadingFiles(prev => ({ ...prev, [uploadKey]: false }));
    }
  };

  // Fungsi untuk menghapus file dari dual storage
  const deleteFileFromDualStorage = async (fileUrl: string) => {
    try {
      // Extract file path dari URL
      const urlParts = fileUrl.split('/');
      const fileName = urlParts[urlParts.length - 1];
      const filePath = `${projectId}/${fileName}`;

      // Hapus dari kedua storage dengan error handling
      const deletePromises = [];

      // Primary storage (selalu ada)
      deletePromises.push(
        supabase.storage.from('proofs').remove([filePath])
      );

      // Secondary storage (jika ada)
      if (supabase2) {
        deletePromises.push(
          supabase2.storage.from('proofs').remove([filePath])
        );
      }

      const results = await Promise.allSettled(deletePromises);
      
      console.log("Primary delete result:", results[0]);
      if (supabase2) {
        console.log("Secondary delete result:", results[1]);
      }

    } catch (error) {
      console.error("Error in deleteFileFromDualStorage:", error);
    }
  };

  // Fungsi untuk menghapus kolom tanggal
  const deleteDateColumn = (dateToDelete: string) => {
    if (!confirm(`Yakin ingin menghapus kolom tanggal "${dateToDelete}"?`)) {
      return;
    }

    // Save current state to undo stack
    dateColsUndoStack.current.push({
      dateCols: [...dateCols],
      rows: JSON.parse(JSON.stringify(rows)),
      targetRows: JSON.parse(JSON.stringify(targetRows)),
      realisasiRows: JSON.parse(JSON.stringify(realisasiRows))
    });
    
    // Hapus dari dateCols
    const newDateCols = dateCols.filter(date => date !== dateToDelete);
    setDateCols(newDateCols);
    localStorage.setItem(LS_DATE_COLS, JSON.stringify(newDateCols));
    
    // Hapus dari semua rows
    const newRows = rows.map(row => {
      const newDates = { ...row.dates };
      delete newDates[dateToDelete];
      return { ...row, dates: newDates };
    });
    
    const newTargetRows = targetRows.map(row => {
      const newDates = { ...row.dates };
      delete newDates[dateToDelete];
      return { ...row, dates: newDates };
    });
    
    const newRealisasiRows = realisasiRows.map(row => {
      const newDates = { ...row.dates };
      delete newDates[dateToDelete];
      return { ...row, dates: newDates };
    });
    
    setRows(newRows);
    setTargetRows(newTargetRows);
    setRealisasiRows(newRealisasiRows);
    
    localStorage.setItem(LS_KEY, JSON.stringify(newRows));
    localStorage.setItem(LS_TARGET_KEY, JSON.stringify(newTargetRows));
    localStorage.setItem(LS_REALISASI_KEY, JSON.stringify(newRealisasiRows));
    
    autosave(projectId, newRows);
    
    alert(`Kolom tanggal "${dateToDelete}" berhasil dihapus`);
  };

  // PERBAIKAN: Fungsi untuk update user presence - DIPERBAIKI (FIXED)
  const updateUserPresence = async () => {
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      
      if (userError) {
        console.log('Auth error in updateUserPresence:', userError);
        return;
      }
      
      if (!userData.user) {
        console.log('No user found in updateUserPresence');
        return;
      }

      const userPresence = {
        id: userData.user.id,
        email: userData.user.email!,
        user_metadata: userData.user.user_metadata,
        last_seen: new Date().toISOString(),
        active_tab: activeTab.toString(),
        editing_task: `Tab ${activeTab}`
      };

      // Simpan ke table user_presence
      const { error } = await supabase
        .from('user_presence')
        .upsert({
          user_id: userData.user.id,
          project_id: projectId,
          last_seen: userPresence.last_seen,
          active_tab: userPresence.active_tab,
          editing_task: userPresence.editing_task,
          user_data: userPresence
        }, {
          onConflict: 'user_id,project_id'
        });

      if (error) {
        console.log('Database error in updateUserPresence:', error);
      }
    } catch (error) {
      console.log('Exception in updateUserPresence:', error);
    }
  };

  // PERBAIKAN: Fungsi untuk load online users - DIPERBAIKI (FIXED)
  const loadOnlineUsers = async () => {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      
      const { data, error } = await supabase
        .from('user_presence')
        .select('*')
        .eq('project_id', projectId)
        .gte('last_seen', fiveMinutesAgo)
        .order('last_seen', { ascending: false });

      if (error) {
        console.log('Database error in loadOnlineUsers:', error);
        return;
      }

      if (data) {
        const users = data.map(item => item.user_data as UserPresenceType);
        setOnlineUsers(users);
      }
    } catch (error) {
      console.log('Exception in loadOnlineUsers:', error);
    }
  };

  useEffect(() => {
    if (!projectId) {
      router.push("/projects");
      return;
    }
    let mounted = true;

    async function load() {
      setLoading(true);
      try {
        // Load current user
        const { data: userData } = await supabase.auth.getUser();
        setCurrentUser(userData.user);

        const pr = await supabase.from("projects").select("name, meta, created_at, deadline").eq("id", projectId).single();
        setProjectName(pr.data?.name || `Project ${projectId || 'Unknown'}`);
        
        // Generate kode proyek otomatis
        const autoProjectCode = await generateProjectCode();

        // Helper function untuk mendapatkan deadline
        const getDeadline = (data: any) => {
          return data?.deadline || data?.meta?.deadline || "";
        };

        if (pr.data?.meta && typeof pr.data.meta === "object") {
          setMetaProject({
            project_code: pr.data.meta.project_code || autoProjectCode,
            job_name: pr.data.meta.job_name || "",
            no_rks: pr.data.meta.no_rks || "",
            date: pr.data.meta.date || "",
            client: pr.data.meta.client || "",
            address: pr.data.meta.address || "",
            time_schedule: pr.data.meta.time_schedule || "",
            deadline: getDeadline(pr.data)
          });
        } else {
          setMetaProject({
            project_code: autoProjectCode,
            job_name: "",
            no_rks: "",
            date: "",
            client: "",
            address: "",
            time_schedule: "",
            deadline: getDeadline(pr.data)
          });
        }

        const t = await supabase.from("tasks").select("*").eq("project_id", projectId).order("row_index", { ascending: true });
        let taskList: TaskType[] = (t.data as TaskType[]) || [];

        const savedDateCols = localStorage.getItem(LS_DATE_COLS);
        if (savedDateCols) {
          try {
            const parsedDateCols = JSON.parse(savedDateCols);
            if (Array.isArray(parsedDateCols)) {
              setDateCols(parsedDateCols);
            }
          } catch (e) {
            console.warn("invalid date columns snapshot:", e);
          }
        }

        const localRaw = localStorage.getItem(LS_KEY);
        if (localRaw) {
          try {
            const localRows = JSON.parse(localRaw) as TaskType[];
            if (Array.isArray(localRows) && localRows.length) {
              const byIndex = new Map<number, TaskType>();
              taskList.forEach((s) => { if (s.row_index) byIndex.set(Number(s.row_index), s); });
              taskList = localRows.map((lr, i) => {
                const ri = Number(lr.row_index ?? i + 1);
                const server = byIndex.get(ri);
                return { ...server, ...lr };
              });
            }
          } catch (e) {
            console.warn("invalid local snapshot:", e);
          }
        }

        const targetRaw = localStorage.getItem(LS_TARGET_KEY);
        if (targetRaw) {
          try {
            const targetData = JSON.parse(targetRaw) as TaskType[];
            if (Array.isArray(targetData)) {
              setTargetRows(targetData);
            }
          } catch (e) {
            console.warn("invalid target snapshot:", e);
          }
        }

        const realisasiRaw = localStorage.getItem(LS_REALISASI_KEY);
        if (realisasiRaw) {
          try {
            const realisasiData = JSON.parse(realisasiRaw) as TaskType[];
            if (Array.isArray(realisasiData)) {
              setRealisasiRows(realisasiData);
            }
          } catch (e) {
            console.warn("invalid realisasi snapshot:", e);
          }
        }

        const n = await supabase
          .from("project_notes")
          .select("*")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false });
        setNotes(n.data || []);

        if (!savedDateCols) {
          const datesSet = new Set<string>();
          taskList.forEach((r) => { if (r.dates) Object.keys(r.dates).forEach((k) => datesSet.add(k)); });
          targetRows.forEach((r) => { if (r.dates) Object.keys(r.dates).forEach((k) => datesSet.add(k)); });
          realisasiRows.forEach((r) => { if (r.dates) Object.keys(r.dates).forEach((k) => datesSet.add(k)); });
          setDateCols(Array.from(datesSet));
        }

        setRows(taskList);

        // PERBAIKAN: Load online users dan setup realtime presence
        await loadOnlineUsers();
        await updateUserPresence();
      } catch (err) {
        console.error("load error:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();

    const taskCh = supabase
      .channel(`public:tasks:project_${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `project_id=eq.${projectId}` }, async () => {
        try {
          const res = await supabase.from("tasks").select("*").eq("project_id", projectId).order("row_index", { ascending: true });
          const serverRows = (res.data as TaskType[]) || [];
          const localRaw = localStorage.getItem(LS_KEY);
          if (localRaw) {
            try {
              const localRows = JSON.parse(localRaw) as TaskType[];
              if (Array.isArray(localRows) && localRows.length) {
                const byIndex = new Map<number, TaskType>();
                serverRows.forEach((sr) => { if (sr.row_index) byIndex.set(Number(sr.row_index), sr); });
                const merged = localRows.map((lr, i) => {
                  const ri = Number(lr.row_index ?? i + 1);
                  const srv = byIndex.get(ri);
                  return { ...srv, ...lr };
                });
                setRows(merged);
                return;
              }
            } catch {}
          }
          setRows(serverRows);
        } catch (e) {
          console.error("realtime refresh error:", e);
        }
      })
      .subscribe();

    const noteCh = supabase
      .channel(`public:project_notes:project_${projectId}`)
      .on(
        "postgres_changes" as any,
        { 
          event: "*", 
          schema: "public", 
          table: "project_notes", 
          filter: `project_id=eq.${projectId}` 
        },
        (payload: { new: NoteType }) => {
          if (payload.new) setNotes((prev) => [payload.new, ...prev]);
        }
      )
      .subscribe();

    // PERBAIKAN: Subscribe to user presence changes
    const presenceCh = supabase
      .channel(`user_presence:project_${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_presence',
          filter: `project_id=eq.${projectId}`
        },
        (payload) => {
          loadOnlineUsers();
        }
      )
      .subscribe();

    // PERBAIKAN: Update user presence every 30 seconds
    const presenceInterval = setInterval(() => {
      updateUserPresence();
      loadOnlineUsers();
    }, 30000);

    return () => {
      try { 
        supabase.removeChannel(taskCh);
        supabase.removeChannel(noteCh);
        supabase.removeChannel(presenceCh);
      } catch {}
      clearInterval(presenceInterval);
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    // Update user presence when tab changes
    updateUserPresence();
  }, [activeTab]);

  useEffect(() => {
    setChartData(rows.map((r, i) => ({
      name: (r.description || `Task ${i + 1}`).slice(0, 18),
      Target: parseDecimalValue(r.plan_progress),
      Realisasi: parseDecimalValue(r.actual_progress),
    })));
  }, [rows]);

  useEffect(() => {
    setTargetChartData(targetRows.map((r, i) => ({
      name: (r.description || `Task ${i + 1}`).slice(0, 18),
      Target: parseDecimalValue(r.plan_progress),
    })));
  }, [targetRows]);

  useEffect(() => {
    setRealisasiChartData(realisasiRows.map((r, i) => ({
      name: (r.description || `Task ${i + 1}`).slice(0, 18),
      Realisasi: parseDecimalValue(r.actual_progress),
    })));
  }, [realisasiRows]);

  const pushUndo = (snapshot: TaskType[], stack: React.MutableRefObject<TaskType[][]>) => {
    stack.current.push(JSON.parse(JSON.stringify(snapshot)));
  };

  const pushDateColsUndo = () => {
    dateColsUndoStack.current.push({
      dateCols: [...dateCols],
      rows: JSON.parse(JSON.stringify(rows)),
      targetRows: JSON.parse(JSON.stringify(targetRows)),
      realisasiRows: JSON.parse(JSON.stringify(realisasiRows))
    });
    dateColsRedoStack.current = [];
  };

  const undo = (currentRows: TaskType[], setRowsFn: React.Dispatch<React.SetStateAction<TaskType[]>>, 
                undoStack: React.MutableRefObject<TaskType[][]>, redoStack: React.MutableRefObject<TaskType[][]>,
                storageKey?: string) => {
    if (!undoStack.current.length) return;
    const last = undoStack.current.pop()!;
    redoStack.current.push(JSON.parse(JSON.stringify(currentRows)));
    setRowsFn(last);
    if (storageKey) {
      try { localStorage.setItem(storageKey, JSON.stringify(last)); } catch {}
    }
  };

  const redo = (currentRows: TaskType[], setRowsFn: React.Dispatch<React.SetStateAction<TaskType[]>>, 
                undoStack: React.MutableRefObject<TaskType[][]>, redoStack: React.MutableRefObject<TaskType[][]>,
                storageKey?: string) => {
    if (!redoStack.current.length) return;
    const last = redoStack.current.pop()!;
    undoStack.current.push(JSON.parse(JSON.stringify(currentRows)));
    setRowsFn(last);
    if (storageKey) {
      try { localStorage.setItem(storageKey, JSON.stringify(last)); } catch {}
    }
  };

  const undoDateCols = () => {
    if (!dateColsUndoStack.current.length) return;
    const last = dateColsUndoStack.current.pop()!;
    dateColsRedoStack.current.push({
      dateCols: [...dateCols],
      rows: JSON.parse(JSON.stringify(rows)),
      targetRows: JSON.parse(JSON.stringify(targetRows)),
      realisasiRows: JSON.parse(JSON.stringify(realisasiRows))
    });
    
    setDateCols(last.dateCols);
    setRows(last.rows);
    setTargetRows(last.targetRows);
    setRealisasiRows(last.realisasiRows);
    
    localStorage.setItem(LS_DATE_COLS, JSON.stringify(last.dateCols));
    localStorage.setItem(LS_KEY, JSON.stringify(last.rows));
    localStorage.setItem(LS_TARGET_KEY, JSON.stringify(last.targetRows));
    localStorage.setItem(LS_REALISASI_KEY, JSON.stringify(last.realisasiRows));
  };

  const redoDateCols = () => {
    if (!dateColsRedoStack.current.length) return;
    const last = dateColsRedoStack.current.pop()!;
    dateColsUndoStack.current.push({
      dateCols: [...dateCols],
      rows: JSON.parse(JSON.stringify(rows)),
      targetRows: JSON.parse(JSON.stringify(targetRows)),
      realisasiRows: JSON.parse(JSON.stringify(realisasiRows))
    });
    
    setDateCols(last.dateCols);
    setRows(last.rows);
    setTargetRows(last.targetRows);
    setRealisasiRows(last.realisasiRows);
    
    localStorage.setItem(LS_DATE_COLS, JSON.stringify(last.dateCols));
    localStorage.setItem(LS_KEY, JSON.stringify(last.rows));
    localStorage.setItem(LS_TARGET_KEY, JSON.stringify(last.targetRows));
    localStorage.setItem(LS_REALISASI_KEY, JSON.stringify(last.realisasiRows));
  };

  async function addRow() {
    if (totalWeight >= 100) {
      alert("Total bobot sudah mencapai 100%. Tidak bisa menambah baris baru.");
      return;
    }

    pushUndo(rows, undoStack);
    const nextIndex = rows.length ? Math.max(...rows.map(r => Number(r.row_index ?? 0))) + 1 : 1;
    const payload: TaskType = {
      project_id: projectId,
      row_index: nextIndex,
      description: "New task",
      weight: 0,
      plan_progress: 0,
      actual_progress: 0,
      color: "",
      location: metaProject.address || "",
      dates: {},
    };
    try {
      const { data, error } = await supabase.from("tasks").insert(payload).select().single();
      if (error || !data) {
        const next = [...rows, payload];
        setRows(next);
        localStorage.setItem(LS_KEY, JSON.stringify(next));
        return;
      }
      const next = [...rows, (data as TaskType) || payload];
      setRows(next);
        localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch (e) {
      console.error("addRow exception:", e);
      const next = [...rows, payload];
      setRows(next);
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    }
  }

  async function removeLastRow() {
    if (!rows.length) return;
    pushUndo(rows, undoStack);
    const last = rows[rows.length - 1];
    try { if (last.id) await supabase.from("tasks").delete().eq("id", last.id); } catch (e) { console.warn(e); }
    const next = rows.slice(0, -1).map((r, i) => ({ ...r, row_index: i + 1 }));
    setRows(next);
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    try {
      await Promise.all(next.map(nr => nr.id ? supabase.from("tasks").update({ row_index: nr.row_index }).eq("id", nr.id) : Promise.resolve()));
    } catch {}
  }

  function addDateColumn() {
    pushDateColsUndo();
    
    const d = new Date();
    let k = d.toLocaleDateString();
    let counter = 1;
    
    while (dateCols.includes(k)) {
      k = `${d.toLocaleDateString()} (${counter})`;
      counter++;
    }
    
    const next = [...dateCols, k];
    setDateCols(next);
    
    localStorage.setItem(LS_DATE_COLS, JSON.stringify(next));
    
    const newRows = rows.map(r => ({ ...r, dates: { ...(r.dates || {}), [k]: "" } }));
    const newTargetRows = targetRows.map(r => ({ ...r, dates: { ...(r.dates || {}), [k]: "" } }));
    const newRealisasiRows = realisasiRows.map(r => ({ ...r, dates: { ...(r.dates || {}), [k]: "" } }));
    
    setRows(newRows);
    setTargetRows(newTargetRows);
    setRealisasiRows(newRealisasiRows);
    
    try { 
      localStorage.setItem(LS_KEY, JSON.stringify(newRows));
      localStorage.setItem(LS_TARGET_KEY, JSON.stringify(newTargetRows));
      localStorage.setItem(LS_REALISASI_KEY, JSON.stringify(newRealisasiRows));
    } catch (e) { /* ignore */ }
    
    autosave(projectId, newRows);
  }

  const addNote = async () => {
    if (!newNote.trim() || !projectId) return;

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    let audioUrl = null;
    
    if (audioFile) {
      try {
        const safeProject = encodeURIComponent(projectId);
        const safeFileName = `${Date.now()}_${audioFile.name}`;
        const remoteName = `${safeProject}/notes/${safeFileName}`;
        
        // Upload audio ke dual storage
        const result = await DualStorage.upload(audioFile, remoteName, 'proofs');
        
        if (result.success && result.url) {
          audioUrl = result.url;
        }
      } catch (error) {
        console.error("Error uploading audio:", error);
      }
    }

    const { error } = await supabase.from("project_notes").insert({
      project_id: projectId,
      content: newNote,
      audio_url: audioUrl,
      created_by: userId || "unknown",
    });

    if (!error) {
      setNewNote("");
      setAudioFile(null);
      alert("Catatan berhasil disimpan!");
    } else {
      console.error("Error saving note:", error);
      alert("Gagal menyimpan catatan");
    }
  };

  // PERBAIKAN UTAMA: Fungsi untuk membuat komponen DateCell dengan warna yang DIPERBAIKI
  const createDateCellWithColor = (currentRows: TaskType[], dateCols: string[]) => {
    return ({ cell, rowIndex, columnIndex, onChange, ...props }: any) => {
      return (
        <DateCellWithColor
          cell={cell}
          rowIndex={rowIndex}
          columnIndex={columnIndex}
          dateCols={dateCols}
          currentRows={currentRows}
          onChange={onChange}
          {...props}
        />
      );
    };
  };

  // Sheet data dengan format desimal yang benar dan custom cells
  const sheetData = useMemo(() => (
    rows.map((r, idx) => {
      const base = [
        { value: r.description ?? "" },
        { value: formatDecimalForSpreadsheet(r.weight), component: DecimalCell },
        { value: formatDecimalForSpreadsheet(r.plan_progress), component: DecimalCell },
        { value: formatDecimalForSpreadsheet(r.actual_progress), component: DecimalCell },
        { value: metaProject.address || r.location || "" },
      ];
      
      // PERBAIKAN: Gunakan DateCell dengan warna untuk kolom tanggal
      const dates = dateCols.map((c, colIdx) => ({ 
        value: formatDecimalForSpreadsheet(r.dates?.[c]), 
        component: createDateCellWithColor(rows, dateCols),
        columnIndex: 5 + colIdx,
        rowIndex: idx
      }));
      
      const hasProof = r.proof_url ? "✅" : "❌";
      const uploadColumn = [{ value: hasProof, readOnly: true }];
      
      return [...base, ...dates, ...uploadColumn];
    })
  ), [rows, dateCols, metaProject.address]);

  const targetSheetData = useMemo(() => (
    targetRows.map((r, idx) => {
      const base = [
        { value: r.description ?? "" },
        { value: formatDecimalForSpreadsheet(r.weight), component: DecimalCell },
        { value: formatDecimalForSpreadsheet(r.plan_progress), component: DecimalCell },
        { value: metaProject.address || r.location || "" },
      ];
      
      // PERBAIKAN: Gunakan DateCell dengan warna untuk kolom tanggal di tab target
      const dates = dateCols.map((c, colIdx) => ({ 
        value: formatDecimalForSpreadsheet(r.dates?.[c]), 
        component: createDateCellWithColor(targetRows, dateCols),
        columnIndex: 4 + colIdx,
        rowIndex: idx
      }));
      
      const hasProof = r.proof_url ? "✅" : "❌";
      const uploadColumn = [{ value: hasProof, readOnly: true }];
      return [...base, ...dates, ...uploadColumn];
    })
  ), [targetRows, dateCols, metaProject.address]);

  const realisasiSheetData = useMemo(() => (
    realisasiRows.map((r, idx) => {
      const base = [
        { value: r.description ?? "" },
        { value: formatDecimalForSpreadsheet(r.weight), component: DecimalCell },
        { value: formatDecimalForSpreadsheet(r.actual_progress), component: DecimalCell },
        { value: metaProject.address || r.location || "" },
      ];
      
      // PERBAIKAN: Gunakan DateCell dengan warna untuk kolom tanggal di tab realisasi
      const dates = dateCols.map((c, colIdx) => ({ 
        value: formatDecimalForSpreadsheet(r.dates?.[c]), 
        component: createDateCellWithColor(realisasiRows, dateCols),
        columnIndex: 4 + colIdx,
        rowIndex: idx
      }));
      
      const hasProof = r.proof_url ? "✅" : "❌";
      const uploadColumn = [{ value: hasProof, readOnly: true }];
      return [...base, ...dates, ...uploadColumn];
    })
  ), [realisasiRows, dateCols, metaProject.address]);

  // PERBAIKAN: Tambahkan baris % total di sheet data dengan total keseluruhan di kolom upload
  const sheetDataWithTotals = useMemo(() => {
    const dataRows = [...sheetData];
    
    // Tambahkan baris total hanya jika ada kolom tanggal
    if (dateCols.length > 0) {
      // Hitung total keseluruhan dari semua tanggal
      const totalAllDates = Object.values(planningDateTotals).reduce((sum, total) => sum + total, 0);
      
      const totalRow = [
        { value: "TOTAL %", readOnly: true, className: "bg-blue-50 font-semibold" },
        { value: "", readOnly: true },
        { value: "", readOnly: true },
        { value: "", readOnly: true },
        { value: "", readOnly: true },
        ...dateCols.map(date => ({ 
          value: formatDecimalForSpreadsheet(planningDateTotals[date]),
          readOnly: true,
          className: "bg-blue-50 font-semibold"
        })),
        { 
          value: formatDecimalForSpreadsheet(totalAllDates),
          readOnly: true,
          className: "bg-blue-50 font-semibold"
        }
      ];
      dataRows.push(totalRow);
    }
    
    return dataRows;
  }, [sheetData, dateCols, planningDateTotals]);

  const targetSheetDataWithTotals = useMemo(() => {
    const dataRows = [...targetSheetData];
    
    if (dateCols.length > 0) {
      // Hitung total keseluruhan dari semua tanggal
      const totalAllDates = Object.values(targetDateTotals).reduce((sum, total) => sum + total, 0);
      
      const totalRow = [
        { value: "TOTAL %", readOnly: true, className: "bg-blue-50 font-semibold" },
        { value: "", readOnly: true },
        { value: "", readOnly: true },
        { value: "", readOnly: true },
        ...dateCols.map(date => ({ 
          value: formatDecimalForSpreadsheet(targetDateTotals[date]),
          readOnly: true,
          className: "bg-blue-50 font-semibold"
        })),
        { 
          value: formatDecimalForSpreadsheet(totalAllDates),
          readOnly: true,
          className: "bg-blue-50 font-semibold"
        }
      ];
      dataRows.push(totalRow);
    }
    
    return dataRows;
  }, [targetSheetData, dateCols, targetDateTotals]);

  const realisasiSheetDataWithTotals = useMemo(() => {
    const dataRows = [...realisasiSheetData];
    
    if (dateCols.length > 0) {
      // Hitung total keseluruhan dari semua tanggal
      const totalAllDates = Object.values(realisasiDateTotals).reduce((sum, total) => sum + total, 0);
      
      const totalRow = [
        { value: "TOTAL %", readOnly: true, className: "bg-blue-50 font-semibold" },
        { value: "", readOnly: true },
        { value: "", readOnly: true },
        { value: "", readOnly: true },
        ...dateCols.map(date => ({ 
          value: formatDecimalForSpreadsheet(realisasiDateTotals[date]),
          readOnly: true,
          className: "bg-blue-50 font-semibold"
        })),
        { 
          value: formatDecimalForSpreadsheet(totalAllDates),
          readOnly: true,
          className: "bg-blue-50 font-semibold"
        }
      ];
      dataRows.push(totalRow);
    }
    
    return dataRows;
  }, [realisasiSheetData, dateCols, realisasiDateTotals]);

  function handleSpreadsheetFullChange(newData: any[][]) {
    pushUndo(rows, undoStack);

    // Filter out the total row if present
    const dataWithoutTotals = newData.filter(row => 
      !row[0]?.value?.includes("TOTAL %")
    );

    const updated = dataWithoutTotals.map((row, i) => {
      const weight = handleDecimalInput(row[1]?.value);
      const planProgress = handleDecimalInput(row[2]?.value);
      const actualProgress = handleDecimalInput(row[3]?.value);
      
      const { validPlanProgress, validActualProgress } = validateProgressValues(weight, planProgress, actualProgress);

      const base: TaskType = {
        project_id: projectId,
        row_index: i + 1,
        description: row[0]?.value || "",
        weight: weight,
        plan_progress: validPlanProgress,
        actual_progress: validActualProgress,
        color: "",
        location: metaProject.address || row[4]?.value || "",
        dates: {},
      };

      dateCols.forEach((c, idx) => {
        // PERBAIKAN: Gunakan handleDateInput untuk input tanggal
        const dateValue = handleDateInput(row[5 + idx]?.value);
        
        // PERBAIKAN: Validasi total untuk kolom tanggal
        const currentTotal = Object.values(planningDateTotals).reduce((sum, total) => sum + total, 0);
        const currentCellValue = parseDecimalValue(row[5 + idx]?.value);
        const newTotal = currentTotal - planningDateTotals[c] + currentCellValue;
        
        if (newTotal > 100) {
          alert(`Total untuk semua kolom tanggal tidak boleh melebihi 100%. Nilai ${currentCellValue} akan disesuaikan.`);
          base.dates![c] = Math.max(0, 100 - (currentTotal - planningDateTotals[c]));
        } else {
          base.dates![c] = validateDateValue(dateValue, weight, planProgress, actualProgress);
        }
      });

      if (rows[i]?.id) base.id = rows[i].id;

      return base;
    });

    setRows(updated);
    localStorage.setItem(LS_KEY, JSON.stringify(updated));
    autosave(projectId, updated);
  }

  function handleTargetSpreadsheetChange(newData: any[][]) {
    pushUndo(targetRows, targetUndoStack);

    // Filter out the total row if present
    const dataWithoutTotals = newData.filter(row => 
      !row[0]?.value?.includes("TOTAL %")
    );

    const updated = dataWithoutTotals.map((row, i) => {
      const weight = handleDecimalInput(row[1]?.value);
      const planProgress = handleDecimalInput(row[2]?.value);
      
      const validPlanProgress = Math.min(planProgress, weight);

      const base: TaskType = {
        project_id: projectId,
        row_index: i + 1,
        description: row[0]?.value || "",
        weight: weight,
        plan_progress: validPlanProgress,
        actual_progress: 0,
        color: "",
        location: metaProject.address || row[3]?.value || "",
        dates: {},
      };

      dateCols.forEach((c, idx) => {
        // PERBAIKAN: Gunakan handleDateInput untuk input tanggal di tab target
        const dateValue = handleDateInput(row[4 + idx]?.value);
        
        // PERBAIKAN: Validasi total untuk kolom tanggal
        const currentTotal = Object.values(targetDateTotals).reduce((sum, total) => sum + total, 0);
        const currentCellValue = parseDecimalValue(row[4 + idx]?.value);
        const newTotal = currentTotal - targetDateTotals[c] + currentCellValue;
        
        if (newTotal > 100) {
          alert(`Total untuk semua kolom tanggal tidak boleh melebihi 100%. Nilai ${currentCellValue} akan disesuaikan.`);
          base.dates![c] = Math.max(0, 100 - (currentTotal - targetDateTotals[c]));
        } else {
          base.dates![c] = validateTargetDateValue(dateValue, weight, planProgress);
        }
      });

      if (targetRows[i]?.id) base.id = targetRows[i].id;

      return base;
    });

    setTargetRows(updated);
    localStorage.setItem(LS_TARGET_KEY, JSON.stringify(updated));
  }

  // PERBAIKAN: Fungsi handleRealisasiSpreadsheetChange yang DIPERBAIKI (FIXED ERROR)
  function handleRealisasiSpreadsheetChange(newData: any[][]) {
    pushUndo(realisasiRows, realisasiUndoStack);

    // Filter out the total row if present
    const dataWithoutTotals = newData.filter(row => 
      !row[0]?.value?.includes("TOTAL %")
    );

    const updated = dataWithoutTotals.map((row, i) => {
      const weight = handleDecimalInput(row[1]?.value);
      const actualProgress = handleDecimalInput(row[2]?.value);
      
      const validActualProgress = Math.min(actualProgress, weight);

      const base: TaskType = {
        project_id: projectId,
        row_index: i + 1,
        description: row[0]?.value || "",
        weight: weight,
        plan_progress: 0,
        actual_progress: validActualProgress,
        color: "",
        location: metaProject.address || row[3]?.value || "",
        dates: {},
      };

      dateCols.forEach((c, idx) => {
        // PERBAIKAN: Gunakan handleDateInput untuk input tanggal di tab realisasi
        const dateValue = handleDateInput(row[4 + idx]?.value);
        
        // PERBAIKAN: Hitung kumulatif sampai tanggal sebelumnya untuk validasi
        let cumulativeUntilNow = 0;
        for (let j = 0; j < idx; j++) {
          const prevDate = dateCols[j];
          // PERBAIKAN: Gunakan nilai dari row saat ini, bukan dari array 'updated' yang belum selesai
          const prevValue = parseDecimalValue(row[4 + j]?.value);
          cumulativeUntilNow += prevValue;
        }
        
        // PERBAIKAN: Validasi dengan mempertimbangkan kumulatif sebelumnya
        const validatedValue = validateRealisasiDateValue(dateValue, weight, actualProgress, cumulativeUntilNow);
        
        base.dates![c] = validatedValue;
      });

      if (realisasiRows[i]?.id) base.id = realisasiRows[i].id;

      return base;
    });

    setRealisasiRows(updated);
    localStorage.setItem(LS_REALISASI_KEY, JSON.stringify(updated));
  }

  function addTargetRow() {
    if (totalTargetWeight >= 100) {
      alert("Total bobot sudah mencapai 100%. Tidak bisa menambah baris baru.");
      return;
    }

    pushUndo(targetRows, targetUndoStack);
    const nextIndex = targetRows.length ? Math.max(...targetRows.map(r => Number(r.row_index ?? 0))) + 1 : 1;
    const payload: TaskType = {
      project_id: projectId,
      row_index: nextIndex,
      description: "New task",
      weight: 0,
      plan_progress: 0,
      actual_progress: 0,
      color: "",
      location: metaProject.address || "",
      dates: {},
    };
    const next = [...targetRows, payload];
    setTargetRows(next);
    localStorage.setItem(LS_TARGET_KEY, JSON.stringify(next));
  }

  function addRealisasiRow() {
    if (realisasiRows.reduce((sum, row) => sum + (parseDecimalValue(row.weight)), 0) >= 100) {
      alert("Total bobot sudah mencapai 100%. Tidak bisa menambah baris baru.");
      return;
    }

    pushUndo(realisasiRows, realisasiUndoStack);
    const nextIndex = realisasiRows.length ? Math.max(...realisasiRows.map(r => Number(r.row_index ?? 0))) + 1 : 1;
    const payload: TaskType = {
      project_id: projectId,
      row_index: nextIndex,
      description: "New task",
      weight: 0,
      plan_progress: 0,
      actual_progress: 0,
      color: "",
      location: metaProject.address || "",
      dates: {},
    };
    const next = [...realisasiRows, payload];
    setRealisasiRows(next);
    localStorage.setItem(LS_REALISASI_KEY, JSON.stringify(next));
  }

  function removeLastTargetRow() {
    if (!targetRows.length) return;
    pushUndo(targetRows, targetUndoStack);
    const next = targetRows.slice(0, -1).map((r, i) => ({ ...r, row_index: i + 1 }));
    setTargetRows(next);
    localStorage.setItem(LS_TARGET_KEY, JSON.stringify(next));
  }

  function removeLastRealisasiRow() {
    if (!realisasiRows.length) return;
    pushUndo(realisasiRows, realisasiUndoStack);
    const next = realisasiRows.slice(0, -1).map((r, i) => ({ ...r, row_index: i + 1 }));
    setRealisasiRows(next);
    localStorage.setItem(LS_REALISASI_KEY, JSON.stringify(next));
  }

  // Format tanggal untuk display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  // Save project meta yang benar-benar diperbaiki
  async function handleSaveProjectMeta() {
    if (!projectId) {
      alert("Project ID tidak ditemukan");
      return;
    }

    try {
      setSavingMeta(true);

      // Validasi data sebelum menyimpan
      if (!metaProject.job_name?.trim()) {
        alert("Job Name harus diisi!");
        setSavingMeta(false);
        return;
      }

      // Pastikan kode proyek ada
      const finalMeta = {
        ...metaProject,
        project_code: metaProject.project_code || await generateProjectCode()
      };

      const { error } = await supabase
        .from("projects")
        .update({ 
          name: finalMeta.job_name,
          meta: finalMeta 
        })
        .eq("id", projectId);

      if (error) {
        console.error("Error saving project meta:", error);
        throw error;
      }
      
      // Update state lokal
      setMetaProject(finalMeta);
      setIsEditingMeta(false);
      setProjectName(finalMeta.job_name || projectName || "Project");
      alert("✅ Data proyek berhasil disimpan!");
    } catch (err) {
      console.error("Error saving project meta:", err);
      alert("❌ Gagal menyimpan data proyek. Silakan coba lagi.");
    } finally {
      setSavingMeta(false);
    }
  }

  async function handleSaveSummary() {
    try {
      await supabase.from("projects").update({ meta: metaProject }).eq("id", projectId);
      await Promise.all(rows.map(async (r) => {
        const payload: any = {
          description: r.description ?? null,
          weight: parseDecimalValue(r.weight),
          plan_progress: parseDecimalValue(r.plan_progress),
          actual_progress: parseDecimalValue(r.actual_progress),
          color: r.color ?? "",
          location: r.location ?? null,
          dates: r.dates ?? {},
          project_id: projectId,
          row_index: r.row_index,
        };
        if (r.id) await supabase.from("tasks").update(payload).eq("id", r.id);
        else await supabase.from("tasks").insert(payload);
      }));
      localStorage.removeItem(LS_KEY);
      alert("Simpan berhasil");
    } catch (err) {
      console.error("save summary error", err);
      alert("Gagal simpan");
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-screen text-gray-600">Memuat data...</div>;
  }

  // ============ PERBAIKAN: Komponen spreadsheet dengan % total dan input tanggal yang diperbaiki - FORMATTING TOOLBAR DIPINDAHKAN ke bawah ============
  const renderSpreadsheetWithControls = (
    data: any[][],
    onAddRow: () => void,
    onRemoveLastRow: () => void,
    onChange: (data: any[][]) => void,
    title: string,
    showTargetColumn: boolean = true,
    showRealisasiColumn: boolean = true,
    currentRows: TaskType[],
    undoStack: React.MutableRefObject<TaskType[][]>,
    redoStack: React.MutableRefObject<TaskType[][]>,
    storageKey?: string
  ) => {
    const header = ["Description", "Bobot %", 
      ...(showTargetColumn && showRealisasiColumn ? ["Target (%)", "Realisasi (%)"] : 
          showTargetColumn ? ["Target (%)"] : 
          showRealisasiColumn ? ["Realisasi (%)"] : []),
      "Lokasi", ...dateCols, "Total"];

    const displayData = sheetDataWithTotals;

    return (
      <div className="bg-white p-4 rounded shadow mb-6">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold">📋 {title}</h3>
          <div className="text-sm text-gray-500">
            Scroll horizontal untuk lihat kolom tanggal & total
          </div>
        </div>

        {totalWeight > 100 && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded">
            <div className="flex items-center gap-2 text-red-700">
              <span>⚠️</span>
              <span className="font-medium">Total bobot melebihi 100%: {totalWeight}%</span>
            </div>
            <p className="text-sm text-red-600 mt-1">
              Nilai akan dinormalisasi ke 100% untuk perhitungan progress.
            </p>
          </div>
        )}

        <div style={{ overflowX: "auto" }}>
          <Spreadsheet
            data={displayData}
            onChange={onChange}
            columnLabels={header}
          />
        </div>

        {/* PERBAIKAN 2: Formatting Toolbar DIPINDAHKAN ke bawah tabel */}
        <FormattingToolbar />

        <div className="mt-3 flex flex-wrap gap-1 items-center">
          <div className="flex gap-1 border-r pr-2">
            <button className="px-2 py-1 bg-blue-50 hover:bg-blue-100 border rounded text-xs flex items-center gap-1">
              💾 Save
            </button>
          </div>

          <div className="flex gap-1 border-r pr-2">
            <button 
              onClick={() => undo(currentRows, 
                showTargetColumn && showRealisasiColumn ? setRows : 
                showTargetColumn ? setTargetRows : setRealisasiRows, 
                undoStack, redoStack, storageKey)} 
              className="px-2 py-1 bg-gray-50 hover:bg-gray-100 border rounded text-xs flex items-center gap-1"
              disabled={undoStack.current.length === 0}
              title="Undo"
            >
              ↩️
            </button>
            <button 
              onClick={() => redo(currentRows, 
                showTargetColumn && showRealisasiColumn ? setRows : 
                showTargetColumn ? setTargetRows : setRealisasiRows, 
                undoStack, redoStack, storageKey)} 
              className="px-2 py-1 bg-gray-50 hover:bg-gray-100 border rounded text-xs flex items-center gap-1"
              disabled={redoStack.current.length === 0}
              title="Redo"
            >
              ↪️
            </button>
          </div>

          <div className="flex gap-1 border-r pr-2">
            <button onClick={onAddRow} className="px-2 py-1 bg-blue-50 hover:bg-blue-100 border rounded text-xs" title="Insert Row">
              ➕ Row
            </button>
            <button onClick={onRemoveLastRow} className="px-2 py-1 bg-red-50 hover:bg-red-100 border rounded text-xs" title="Delete Row">
              ➖ Row
            </button>
          </div>

          <div className="flex gap-1">
            <button
              onClick={addDateColumn}
              className="px-2 py-1 bg-green-50 hover:bg-green-100 border rounded text-xs flex items-center gap-1"
              title="Add Date Column"
            >
              📅 Add Date
            </button>
            
            <button
              onClick={() => setShowDeleteDate(!showDeleteDate)}
              className={`px-2 py-1 border rounded text-xs flex items-center gap-1 ${
                showDeleteDate ? 'bg-red-100 hover:bg-red-200 text-red-700' : 'bg-gray-50 hover:bg-gray-100'
              }`}
              title="Delete Date Columns"
            >
              {showDeleteDate ? '❌ Hide Delete' : '🗑️ Delete Date'}
            </button>
          </div>

          {showTargetColumn && showRealisasiColumn && (
            <button
              onClick={handleSaveSummary}
              className="ml-auto px-2 py-1 bg-green-600 hover:bg-green-700 text-white border rounded text-xs"
            >
              💾 Save All
            </button>
          )}
        </div>

        {showDeleteDate && dateCols.length > 0 && (
          <div className="mt-4 p-3 bg-red-50 rounded border">
            <h4 className="font-semibold text-red-800 mb-2 text-sm">🗑️ Hapus Kolom Tanggal</h4>
            <div className="flex flex-wrap gap-2">
              {dateCols.map((date) => (
                <button
                  key={date}
                  onClick={() => deleteDateColumn(date)}
                  className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded text-xs flex items-center gap-1"
                  title={`Hapus ${date}`}
                >
                  ❌ {date}
                </button>
              ))}
            </div>
          </div>
        )}

        <UploadSection
          currentRows={currentRows}
          uploadingFiles={uploadingFiles}
          setFile={setFile}
          file={file}
          uploadToDualStorage={uploadToDualStorage}
          deleteFileFromDualStorage={deleteFileFromDualStorage}
          projectId={projectId}
          setRows={setRows}
          setTargetRows={setTargetRows}
          setRealisasiRows={setRealisasiRows}
          activeTab={activeTab}
        />
      </div>
    );
  };

  const renderTargetSpreadsheetWithControls = (
    data: any[][],
    onAddRow: () => void,
    onRemoveLastRow: () => void,
    onChange: (data: any[][]) => void,
    title: string,
    currentRows: TaskType[],
    undoStack: React.MutableRefObject<TaskType[][]>,
    redoStack: React.MutableRefObject<TaskType[][]>,
    storageKey?: string
  ) => {
    const header = ["Description", "Bobot %", "Target (%)", "Lokasi", ...dateCols, "Total"];

    // Gunakan data dengan total
    const displayData = targetSheetDataWithTotals;

    return (
      <div className="bg-white p-4 rounded shadow mb-6">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold">📋 {title}</h3>
          <div className="text-sm text-gray-500">
            Scroll horizontal untuk lihat kolom tanggal & total
          </div>
        </div>

        {totalTargetWeight > 100 && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded">
            <div className="flex items-center gap-2 text-red-700">
              <span>⚠️</span>
              <span className="font-medium">Total bobot melebihi 100%: {totalTargetWeight}%</span>
            </div>
            <p className="text-sm text-red-600 mt-1">
              Nilai akan dinormalisasi ke 100% untuk perhitungan progress.
            </p>
          </div>
        )}

        <div style={{ overflowX: "auto" }}>
          <Spreadsheet
            data={displayData}
            onChange={onChange}
            columnLabels={header}
          />
        </div>

        {/* PERBAIKAN 2: Formatting Toolbar DIPINDAHKAN ke bawah tabel */}
        <FormattingToolbar />

        <div className="mt-3 flex flex-wrap gap-1 items-center">
          <div className="flex gap-1 border-r pr-2">
            <button className="px-2 py-1 bg-blue-50 hover:bg-blue-100 border rounded text-xs flex items-center gap-1">
              💾 Save
            </button>
          </div>

          <div className="flex gap-1 border-r pr-2">
            <button 
              onClick={() => undo(currentRows, setTargetRows, undoStack, redoStack, storageKey)} 
              className="px-2 py-1 bg-gray-50 hover:bg-gray-100 border rounded text-xs flex items-center gap-1"
              disabled={undoStack.current.length === 0}
              title="Undo"
            >
              ↩️
            </button>
            <button 
              onClick={() => redo(currentRows, setTargetRows, undoStack, redoStack, storageKey)} 
              className="px-2 py-1 bg-gray-50 hover:bg-gray-100 border rounded text-xs flex items-center gap-1"
              disabled={redoStack.current.length === 0}
              title="Redo"
            >
              ↪️
            </button>
          </div>

          <div className="flex gap-1 border-r pr-2">
            <button onClick={onAddRow} className="px-2 py-1 bg-blue-50 hover:bg-blue-100 border rounded text-xs" title="Insert Row">
              ➕ Row
            </button>
            <button onClick={onRemoveLastRow} className="px-2 py-1 bg-red-50 hover:bg-red-100 border rounded text-xs" title="Delete Row">
              ➖ Row
            </button>
          </div>

          <div className="flex gap-1">
            <button
              onClick={addDateColumn}
              className="px-2 py-1 bg-green-50 hover:bg-green-100 border rounded text-xs flex items-center gap-1"
              title="Add Date Column"
            >
              📅 Add Date
            </button>
            
            {/* Toggle Delete Date */}
            <button
              onClick={() => setShowDeleteDate(!showDeleteDate)}
              className={`px-2 py-1 border rounded text-xs flex items-center gap-1 ${
                showDeleteDate ? 'bg-red-100 hover:bg-red-200 text-red-700' : 'bg-gray-50 hover:bg-gray-100'
              }`}
              title="Delete Date Columns"
            >
              {showDeleteDate ? '❌ Hide Delete' : '🗑️ Delete Date'}
            </button>
          </div>
        </div>

        {/* Tampilkan opsi hapus tanggal jika toggle aktif */}
        {showDeleteDate && dateCols.length > 0 && (
          <div className="mt-4 p-3 bg-red-50 rounded border">
            <h4 className="font-semibold text-red-800 mb-2 text-sm">🗑️ Hapus Kolom Tanggal</h4>
            <div className="flex flex-wrap gap-2">
              {dateCols.map((date) => (
                <button
                  key={date}
                  onClick={() => deleteDateColumn(date)}
                  className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded text-xs flex items-center gap-1"
                  title={`Hapus ${date}`}
                >
                  ❌ {date}
                </button>
              ))}
            </div>
            <p className="text-xs text-red-600 mt-2">
              Pilih tanggal yang ingin dihapus. Aksi ini tidak dapat dibatalkan.
            </p>
          </div>
        )}

        {/* PERBAIKAN: Gunakan UploadSection yang bisa di-toggle */}
        <UploadSection
          currentRows={currentRows}
          uploadingFiles={uploadingFiles}
          setFile={setFile}
          file={file}
          uploadToDualStorage={uploadToDualStorage}
          deleteFileFromDualStorage={deleteFileFromDualStorage}
          projectId={projectId}
          setRows={setRows}
          setTargetRows={setTargetRows}
          setRealisasiRows={setRealisasiRows}
          activeTab={activeTab}
        />
      </div>
    );
  };

  // PERBAIKAN: Fungsi renderRealisasiSpreadsheetWithControls yang DIPERBAIKI (FIXED ERROR)
  const renderRealisasiSpreadsheetWithControls = (
    data: any[][],
    onAddRow: () => void,
    onRemoveLastRow: () => void,
    onChange: (data: any[][]) => void,
    title: string,
    currentRows: TaskType[],
    undoStack: React.MutableRefObject<TaskType[][]>,
    redoStack: React.MutableRefObject<TaskType[][]>,
    storageKey?: string
  ) => {
    const header = ["Description", "Bobot %", "Realisasi (%)", "Lokasi", ...dateCols, "Total"];

    // Gunakan data dengan total
    const displayData = realisasiSheetDataWithTotals;

    return (
      <div className="bg-white p-4 rounded shadow mb-6">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold">📋 {title}</h3>
          <div className="text-sm text-gray-500">
            Scroll horizontal untuk lihat kolom tanggal & total
          </div>
        </div>

        {realisasiRows.reduce((sum, row) => sum + (parseDecimalValue(row.weight)), 0) > 100 && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded">
            <div className="flex items-center gap-2 text-red-700">
              <span>⚠️</span>
              <span className="font-medium">Total bobot melebihi 100%: {realisasiRows.reduce((sum, row) => sum + (parseDecimalValue(row.weight)), 0)}%</span>
            </div>
            <p className="text-sm text-red-600 mt-1">
              Nilai akan dinormalisasi ke 100% untuk perhitungan progress.
            </p>
          </div>
        )}

        <div style={{ overflowX: "auto" }}>
          <Spreadsheet
            data={displayData}
            onChange={onChange}
            columnLabels={header}
          />
        </div>

        {/* PERBAIKAN 2: Formatting Toolbar DIPINDAHKAN ke bawah tabel */}
        <FormattingToolbar />

        <div className="mt-3 flex flex-wrap gap-1 items-center">
          <div className="flex gap-1 border-r pr-2">
            <button className="px-2 py-1 bg-blue-50 hover:bg-blue-100 border rounded text-xs flex items-center gap-1">
              💾 Save
            </button>
          </div>

          <div className="flex gap-1 border-r pr-2">
            <button 
              onClick={() => undo(currentRows, setRealisasiRows, undoStack, redoStack, storageKey)} 
              className="px-2 py-1 bg-gray-50 hover:bg-gray-100 border rounded text-xs flex items-center gap-1"
              disabled={undoStack.current.length === 0}
              title="Undo"
            >
              ↩️
            </button>
            <button 
              onClick={() => redo(currentRows, setRealisasiRows, undoStack, redoStack, storageKey)} 
              className="px-2 py-1 bg-gray-50 hover:bg-gray-100 border rounded text-xs flex items-center gap-1"
              disabled={redoStack.current.length === 0}
              title="Redo"
            >
              ↪️
            </button>
          </div>

          <div className="flex gap-1 border-r pr-2">
            <button onClick={onAddRow} className="px-2 py-1 bg-blue-50 hover:bg-blue-100 border rounded text-xs" title="Insert Row">
              ➕ Row
            </button>
            <button onClick={onRemoveLastRow} className="px-2 py-1 bg-red-50 hover:bg-red-100 border rounded text-xs" title="Delete Row">
              ➖ Row
            </button>
          </div>

          <div className="flex gap-1">
            <button
              onClick={addDateColumn}
              className="px-2 py-1 bg-green-50 hover:bg-green-100 border rounded text-xs flex items-center gap-1"
              title="Add Date Column"
            >
              📅 Add Date
            </button>
            
            {/* Toggle Delete Date */}
            <button
              onClick={() => setShowDeleteDate(!showDeleteDate)}
              className={`px-2 py-1 border rounded text-xs flex items-center gap-1 ${
                showDeleteDate ? 'bg-red-100 hover:bg-red-200 text-red-700' : 'bg-gray-50 hover:bg-gray-100'
              }`}
              title="Delete Date Columns"
            >
              {showDeleteDate ? '❌ Hide Delete' : '🗑️ Delete Date'}
            </button>
          </div>
        </div>

        {/* Tampilkan opsi hapus tanggal jika toggle aktif */}
        {showDeleteDate && dateCols.length > 0 && (
          <div className="mt-4 p-3 bg-red-50 rounded border">
            <h4 className="font-semibold text-red-800 mb-2 text-sm">🗑️ Hapus Kolom Tanggal</h4>
            <div className="flex flex-wrap gap-2">
              {dateCols.map((date) => (
                <button
                  key={date}
                  onClick={() => deleteDateColumn(date)}
                  className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded text-xs flex items-center gap-1"
                  title={`Hapus ${date}`}
                >
                  ❌ {date}
                </button>
              ))}
            </div>
            <p className="text-xs text-red-600 mt-2">
              Pilih tanggal yang ingin dihapus. Aksi ini tidak dapat dibatalkan.
            </p>
          </div>
        )}

        {/* PERBAIKAN: Gunakan UploadSection yang bisa di-toggle */}
        <UploadSection
          currentRows={currentRows}
          uploadingFiles={uploadingFiles}
          setFile={setFile}
          file={file}
          uploadToDualStorage={uploadToDualStorage}
          deleteFileFromDualStorage={deleteFileFromDualStorage}
          projectId={projectId}
          setRows={setRows}
          setTargetRows={setTargetRows}
          setRealisasiRows={setRealisasiRows}
          activeTab={activeTab}
        />
      </div>
    );
  };

  const renderPlanningChart = () => {
    if (!planningChartData.length) {
      return (
        <div className="bg-white p-4 rounded shadow mb-6">
          <h2 className="font-semibold mb-3">📈 Kurva S - Progress Berkelanjutan per Tanggal</h2>
          <div className="text-center py-8 text-gray-500">
            Tambah kolom tanggal terlebih dahulu untuk melihat chart
          </div>
        </div>
      );
    }

    const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'];
    
    return (
      <div className="bg-white p-4 rounded shadow mb-6" id="planning-chart">
        <h2 className="font-semibold mb-3">📈 Kurva S - Progress Berkelanjutan per Tanggal</h2>
        <div style={{ width: "100%", height: 400 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={planningChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                angle={-45}
                textAnchor="end"
                height={80}
                interval={0}
                tick={{ fontSize: 12 }}
              />
              <YAxis 
                label={{ 
                  value: 'Progress (%)', 
                  angle: -90, 
                  position: 'insideLeft',
                  offset: -10,
                  style: { textAnchor: 'middle' }
                }}
              />
              <Tooltip />
              <Legend />
              {rows.map((row, index) => (
                <Line
                  key={index}
                  type="monotone"
                  dataKey={`tasks.${row.description || `Task ${index + 1}`}`}
                  stroke={colors[index % colors.length]}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                  name={row.description || `Task ${index + 1}`}
                />
              ))}
              <Line
                type="monotone"
                dataKey="totalProgress"
                stroke="rgba(0, 0, 0, 0.3)"
                strokeWidth={3}
                strokeDasharray="5 5"
                dot={{ r: 5 }}
                activeDot={{ r: 7 }}
                name="Total Progress"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 text-sm text-gray-600">
          <p>• Garis berwarna: Progress masing-masing task</p>
          <p>• Garis abu-abu transparan: Total progress kumulatif</p>
          <p>• Chart menunjukkan progress berkelanjutan antar task</p>
        </div>
      </div>
    );
  };

  const renderTargetChart = () => {
    if (!targetChartDataNew.length) {
      return (
        <div className="bg-white p-4 rounded shadow mb-6">
          <h2 className="font-semibold mb-3">📈 Kurva S Target - Progress Berkelanjutan per Tanggal</h2>
          <div className="text-center py-8 text-gray-500">
            Tambah kolom tanggal terlebih dahulu untuk melihat chart
          </div>
        </div>
      );
    }

    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];
    
    return (
      <div className="bg-white p-4 rounded shadow mb-6" id="target-chart">
        <h2 className="font-semibold mb-3">📈 Kurva S Target - Progress Berkelanjutan per Tanggal</h2>
        <div style={{ width: "100%", height: 400 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={targetChartDataNew}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                angle={-45}
                textAnchor="end"
                height={80}
                interval={0}
                tick={{ fontSize: 12 }}
              />
              <YAxis 
                label={{ 
                  value: 'Progress (%)', 
                  angle: -90, 
                  position: 'insideLeft',
                  offset: -10,
                  style: { textAnchor: 'middle' }
                }}
              />
              <Tooltip />
              <Legend />
              {targetRows.map((row, index) => (
                <Line
                  key={index}
                  type="monotone"
                  dataKey={`tasks.${row.description || `Task ${index + 1}`}`}
                  stroke={colors[index % colors.length]}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                  name={row.description || `Task ${index + 1}`}
                />
              ))}
              <Line
                type="monotone"
                dataKey="totalProgress"
                stroke="rgba(0, 0, 0, 0.3)"
                strokeWidth={3}
                strokeDasharray="5 5"
                dot={{ r: 5 }}
                activeDot={{ r: 7 }}
                name="Total Progress"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 text-sm text-gray-600">
          <p>• Garis berwarna: Progress target masing-masing task</p>
          <p>• Garis abu-abu transparan: Total progress kumulatif</p>
          <p>• Chart menunjukkan progress berkelanjutan antar task</p>
        </div>
      </div>
    );
  };

  // PERBAIKAN 2: Render combined chart untuk tab realisasi dengan LINE CHART
  const renderRealisasiChart = () => {
    if (!combinedRealisasiChartData.length) {
      return (
        <div className="bg-white p-4 rounded shadow mb-6">
          <h2 className="font-semibold mb-3">📈 Kurva S Realisasi - Progress Berkelanjutan per Tanggal</h2>
          <div className="text-center py-8 text-gray-500">
            Tambah kolom tanggal terlebih dahulu untuk melihat chart
          </div>
        </div>
      );
    }

    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444'];
    
    return (
      <div className="bg-white p-4 rounded shadow mb-6" id="realisasi-chart">
        <h2 className="font-semibold mb-3">📈 Kurva S Realisasi - Progress Berkelanjutan per Tanggal</h2>
        
        {/* Keterangan chart */}
        <div className="mb-4 p-3 bg-blue-50 rounded border">
          <div className="flex items-center gap-2 text-blue-700">
            <span>💡</span>
            <span className="font-medium">Keterangan Chart:</span>
          </div>
          <div className="flex flex-wrap gap-4 mt-2 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500 rounded"></div>
              <span>Planning (Tab 1)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded"></div>
              <span>Realisasi (Tab 4)</span>
            </div>
          </div>
        </div>
        
        <div style={{ width: "100%", height: 400 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={combinedRealisasiChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                angle={-45}
                textAnchor="end"
                height={80}
                interval={0}
                tick={{ fontSize: 12 }}
              />
              <YAxis 
                label={{ 
                  value: 'Progress (%)', 
                  angle: -90, 
                  position: 'insideLeft',
                  offset: -10,
                  style: { textAnchor: 'middle' }
                }}
              />
              <Tooltip />
              <Legend />
              
              {/* Planning lines */}
              {rows.map((row, index) => (
                <Line
                  key={`planning-${index}`}
                  type="monotone"
                  dataKey={`tasks.${row.description || `Task ${index + 1}`}`}
                  stroke={colors[index % colors.length]}
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  name={`Planning: ${row.description || `Task ${index + 1}`}`}
                />
              ))}
              
              {/* Realisasi lines */}
              {realisasiRows.map((row, index) => (
                <Line
                  key={`realisasi-${index}`}
                  type="monotone"
                  dataKey={`realisasiTasks.${row.description || `Task ${index + 1}`}`}
                  stroke={colors[index % colors.length]}
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                  name={`Realisasi: ${row.description || `Task ${index + 1}`}`}
                />
              ))}
              
              {/* Total Progress Lines */}
              <Line
                type="monotone"
                dataKey="planningTotal"
                stroke="#3b82f6"
                strokeWidth={3}
                strokeDasharray="5 5"
                dot={{ r: 5 }}
                activeDot={{ r: 7 }}
                name="Total Planning"
              />
              <Line
                type="monotone"
                dataKey="realisasiTotal"
                stroke="#10b981"
                strokeWidth={3}
                dot={{ r: 5 }}
                activeDot={{ r: 7 }}
                name="Total Realisasi"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 text-sm text-gray-600">
          <p>• Garis biru (putus-putus): Progress planning dari Tab 1</p>
          <p>• Garis hijau (solid): Progress realisasi dari Tab 4</p>
          <p>• Chart menunjukkan perbandingan antara planning dan realisasi</p>
        </div>
      </div>
    );
  };

  const renderChart = (data: any[], title: string, showTarget: boolean = true, showRealisasi: boolean = true) => (
    <div className="bg-white p-4 rounded shadow mb-6">
      <h2 className="font-semibold mb-3">📈 {title}</h2>
      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            {showTarget && (
              <Line
                type="monotone"
                dataKey="Target"
                stroke="#3b82f6"
                dot={{ r: 3 }}
              />
            )}
            {showRealisasi && (
              <Line
                type="monotone"
                dataKey="Realisasi"
                stroke="#ef4444"
                dot={{ r: 3 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  const renderNotesTab = () => (
    <div className="space-y-6" id="tab-catatan-content">
      <div className="bg-white p-6 rounded shadow">
        <h3 className="font-semibold mb-4">Tambah Catatan Lapangan</h3>
        <div className="space-y-4">
          <textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Tulis catatan lapangan di sini... (laporan harian, kendala, progress, dll)"
            className="w-full h-32 p-3 border rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tambah Voice Note (Opsional)
              </label>
              <input
                type="file"
                accept="audio/*"
                onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
                className="w-full"
              />
            </div>
            <button
              onClick={addNote}
              disabled={!newNote.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg font-medium mt-6"
            >
              Simpan Catatan
            </button>
          </div>
          {audioFile && (
            <p className="text-sm text-green-600">
              ✅ File audio siap diupload ke DUAL storage: {audioFile.name}
            </p>
          )}
        </div>
      </div>

      <div className="bg-white p-6 rounded shadow">
        <h3 className="font-semibold mb-4">Catatan Lapangan Terkini</h3>
        <div className="space-y-4">
          {notes.map((note) => (
            <div key={note.id} className="border rounded-lg p-4 hover:bg-gray-50">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  <span className="text-sm text-gray-600">
                    {new Date(note.created_at).toLocaleString()}
                  </span>
                </div>
                <span className="text-xs text-gray-500">By: {note.created_by}</span>
              </div>
              <p className="text-gray-800 whitespace-pre-wrap">{note.content}</p>
              {note.audio_url && (
                <div className="mt-3 pt-3 border-t">
                  <audio controls className="w-full">
                    <source src={note.audio_url} type="audio/mpeg" />
                    Browser Anda tidak mendukung pemutar audio.
                  </audio>
                </div>
              )}
            </div>
          ))}
          {notes.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <div className="text-4xl mb-2">📝</div>
              <p>Belum ada catatan lapangan</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Template deskripsi proyek yang akan digandakan ke semua tab
  const renderProjectInfo = () => (
    <div className="bg-white p-4 rounded shadow mb-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold">📋 Deskripsi Proyek</h3>
        <div className="flex gap-2">
          {isEditingMeta ? (
            <>
              <button
                onClick={handleSaveProjectMeta}
                disabled={savingMeta}
                className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm disabled:bg-gray-400"
              >
                {savingMeta ? "⏳ Menyimpan..." : "💾 Simpan"}
              </button>
              <button
                onClick={() => setIsEditingMeta(false)}
                className="px-3 py-1 bg-gray-500 hover:bg-gray-600 text-white rounded text-sm"
              >
                ❌ Batal
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsEditingMeta(true)}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
            >
              ✏️ Edit
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">KODE PROYEK</label>
          <div className="font-semibold text-gray-800 p-2 border rounded bg-gray-50 min-h-[42px]">
            {metaProject.project_code || "P-EUI-000-Tanggal"}
          </div>
          <p className="text-xs text-gray-500 mt-1">Auto-generated</p>
        </div>
        
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">JOB NAME *</label>
          {isEditingMeta ? (
            <input
              type="text"
              value={metaProject.job_name || ""}
              onChange={(e) => setMetaProject(prev => ({ ...prev, job_name: e.target.value }))}
              className="w-full p-2 border rounded text-sm"
              placeholder="Masukkan job name"
              required
            />
          ) : (
            <div className="font-semibold text-gray-800 p-2 border rounded bg-gray-50 min-h-[42px]">
              {metaProject.job_name || "-"}
            </div>
          )}
        </div>
        
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">NO RKS</label>
          {isEditingMeta ? (
            <input
              type="text"
              value={metaProject.no_rks || ""}
              onChange={(e) => setMetaProject(prev => ({ ...prev, no_rks: e.target.value }))}
              className="w-full p-2 border rounded text-sm"
              placeholder="Masukkan no RKS"
            />
          ) : (
            <div className="font-semibold text-gray-800 p-2 border rounded bg-gray-50 min-h-[42px]">
              {metaProject.no_rks || "-"}
            </div>
          )}
        </div>
        
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">DATE</label>
          {isEditingMeta ? (
            <input
              type="date"
              value={metaProject.date || ""}
              onChange={(e) => setMetaProject(prev => ({ ...prev, date: e.target.value }))}
              className="w-full p-2 border rounded text-sm"
            />
          ) : (
            <div className="font-semibold text-gray-800 p-2 border rounded bg-gray-50 min-h-[42px]">
              {metaProject.date || "-"}
            </div>
          )}
        </div>
        
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">CLIENT</label>
          {isEditingMeta ? (
            <input
              type="text"
              value={metaProject.client || ""}
              onChange={(e) => setMetaProject(prev => ({ ...prev, client: e.target.value }))}
              className="w-full p-2 border rounded text-sm"
              placeholder="Masukkan nama client"
            />
          ) : (
            <div className="font-semibold text-gray-800 p-2 border rounded bg-gray-50 min-h-[42px]">
              {metaProject.client || "-"}
            </div>
          )}
        </div>
        
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">ADDRESS</label>
          {isEditingMeta ? (
            <input
              type="text"
              value={metaProject.address || ""}
              onChange={(e) => setMetaProject(prev => ({ ...prev, address: e.target.value }))}
              className="w-full p-2 border rounded text-sm"
              placeholder="Masukkan alamat proyek"
            />
          ) : (
            <div className="font-semibold text-gray-800 p-2 border rounded bg-gray-50 min-h-[42px]">
              {metaProject.address || "-"}
            </div>
          )}
        </div>
        
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">TIME SCHEDULE</label>
          {isEditingMeta ? (
            <input
              type="text"
              value={metaProject.time_schedule || ""}
              onChange={(e) => setMetaProject(prev => ({ ...prev, time_schedule: e.target.value }))}
              className="w-full p-2 border rounded text-sm"
              placeholder="Masukkan time schedule"
            />
          ) : (
            <div className="font-semibold text-gray-800 p-2 border rounded bg-gray-50 min-h-[42px]">
              {metaProject.time_schedule || "-"}
            </div>
          )}
        </div>

        {/* KOLOM DEADLINE BARU */}
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">DEADLINE *</label>
          {isEditingMeta ? (
            <input
              type="date"
              value={metaProject.deadline || ""}
              onChange={(e) => setMetaProject(prev => ({ ...prev, deadline: e.target.value }))}
              className="w-full p-2 border rounded text-sm"
              min={new Date().toISOString().split('T')[0]}
              required
            />
          ) : (
            <div className="font-semibold text-gray-800 p-2 border rounded bg-gray-50 min-h-[42px] flex items-center justify-between">
              <span>{metaProject.deadline ? formatDate(metaProject.deadline) : "-"}</span>
              {metaProject.deadline && (
                <CountdownTimer deadline={metaProject.deadline} />
              )}
            </div>
          )}
          <p className="text-xs text-gray-500 mt-1">Batas akhir pengerjaan proyek</p>
        </div>
      </div>

      {isEditingMeta && (
        <div className="mt-4 p-3 bg-blue-50 rounded border">
          <p className="text-sm text-blue-700">
            💡 <strong>Kode proyek otomatis:</strong> P-EUI-NoUrut-Tanggal. Isi Job Name (wajib) dan data lainnya lalu klik "Simpan".
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div className="p-6 bg-gray-50 min-h-screen" id="silver-app-content">
      {/* PERBAIKAN: Header dengan User Profile */}
      <header className="flex justify-between items-center mb-6">
        <div className="bg-white p-4 rounded shadow">
          <div className="flex items-center gap-4">
            {!logoError ? (
              <img 
                src="/logo-eltama.png" 
                alt="PT Elektrindo Utama Indonesia" 
                style={{ width: 140 }}
                onError={() => setLogoError(true)}
              />
            ) : (
              <div className="w-32 h-16 bg-blue-600 flex items-center justify-center rounded">
                <span className="text-white font-bold text-sm text-center">PT EUI</span>
              </div>
            )}
            <div>
              <div className="text-xl font-bold">PT ELEKTRINDO UTAMA INDONESIA</div>
              <div className="text-sm text-gray-600">
                MECHANICAL - ELECTRICAL - FIRE PROTECTION SYSTEM
              </div>
              <div className="text-xs text-blue-600 font-semibold mt-1">
                SILVER APP - INPUT DATA LAPANGAN (DUAL STORAGE SYSTEM)
              </div>
            </div>
          </div>
        </div>
        <UserProfile />
      </header>

      {/* PERBAIKAN: Tampilkan Online Users - DIPERBAIKI */}
      <OnlineUsers onlineUsers={onlineUsers} currentUser={currentUser} />

      {/* Template deskripsi proyek ditampilkan di semua tab */}
      {renderProjectInfo()}

      {/* Export & Print Controls - Tampil di semua tab */}
      <ExportPrintControls
        activeTab={activeTab}
        projectName={projectName}
        metaProject={metaProject}
        rows={rows}
        targetRows={targetRows}
        realisasiRows={realisasiRows}
        dateCols={dateCols}
        planningSummary={planningSummary}
        targetSummary={targetSummary}
        realisasiSummary={realisasiSummary}
        planningChartData={planningChartData}
        targetChartDataNew={targetChartDataNew}
        realisasiChartDataNew={realisasiChartDataNew}
      />

      <div className="mb-4 flex gap-2 items-center flex-wrap">
        <button
          onClick={() => setActiveTab(1)}
          className={`px-3 py-1 rounded ${
            activeTab === 1 ? "bg-blue-600 text-white" : "bg-white border"
          }`}
        >
          Tab 1 — Planning
        </button>
        <button
          onClick={() => setActiveTab(2)}
          className={`px-3 py-1 rounded ${
            activeTab === 2 ? "bg-blue-600 text-white" : "bg-white border"
          }`}
        >
          Tab 2 — Lokasi
        </button>
        <button
          onClick={() => setActiveTab(3)}
          className={`px-3 py-1 rounded ${
            activeTab === 3 ? "bg-blue-600 text-white" : "bg-white border"
          }`}
        >
          Tab Target
        </button>
        <button
          onClick={() => setActiveTab(4)}
          className={`px-3 py-1 rounded ${
            activeTab === 4 ? "bg-blue-600 text-white" : "bg-white border"
          }`}
        >
          Tab Realisasi
        </button>
        <button
          onClick={() => setActiveTab(5)}
          className={`px-3 py-1 rounded ${
            activeTab === 5 ? "bg-blue-600 text-white" : "bg-white border"
          }`}
        >
          Tab Catatan
        </button>
      </div>

      {activeTab === 1 && (
        <div id="tab-planning-content">
          {renderPlanningChart()}
          {renderSpreadsheetWithControls(
            sheetData,
            addRow,
            removeLastRow,
            handleSpreadsheetFullChange,
            "Tabel Planning (Excel-like)",
            true,
            true,
            rows,
            undoStack,
            redoStack,
            LS_KEY
          )}
        </div>
      )}

      {activeTab === 2 && (
        <div id="tab-lokasi-content">
          {/* PERBAIKAN 3 & 4: Location Tab dengan FIX untuk insert error dan GPS valid */}
          <LocationTab projectId={projectId} metaProject={metaProject} />
        </div>
      )}

      {activeTab === 3 && (
        <div id="tab-target-content">
          {renderTargetChart()}
          {renderTargetSpreadsheetWithControls(
            targetSheetData,
            addTargetRow,
            removeLastTargetRow,
            handleTargetSpreadsheetChange,
            "Tabel Target",
            targetRows,
            targetUndoStack,
            targetRedoStack,
            LS_TARGET_KEY
          )}
        </div>
      )}

      {activeTab === 4 && (
        <div id="tab-realisasi-content">
          {renderRealisasiChart()}
          {renderRealisasiSpreadsheetWithControls(
            realisasiSheetData,
            addRealisasiRow,
            removeLastRealisasiRow,
            handleRealisasiSpreadsheetChange,
            "Tabel Realisasi",
            realisasiRows,
            realisasiUndoStack,
            realisasiRedoStack,
            LS_REALISASI_KEY
          )}
        </div>
      )}

      {activeTab === 5 && renderNotesTab()}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
        <div className="bg-white p-4 rounded shadow">
          <div className="text-xs text-gray-500">TOTAL BOBOT %</div>
          <div className={`text-xl font-semibold ${currentSummary.totalWeight > 100 ? 'text-red-600' : 'text-green-600'}`}>
            {currentSummary.totalWeight.toFixed(2)}%
            {currentSummary.totalWeight > 100 && <span className="text-xs block text-red-500">(Melebihi 100%)</span>}
          </div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <div className="text-xs text-gray-500">PLAN PROGRESS %</div>
          <div className="text-xl font-semibold">
            {currentSummary.plan.toFixed(2)}%
          </div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <div className="text-xs text-gray-500">ACTUAL PROGRESS %</div>
          <div className="text-xl font-semibold">
            {currentSummary.actual.toFixed(2)}%
          </div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <div className="text-xs text-gray-500">STATUS</div>
          <div className={`text-xl font-semibold ${currentSummary.isValidWeight ? 'text-green-600' : 'text-red-600'}`}>
            {currentSummary.isValidWeight ? 'VALID' : 'INVALID'}
          </div>
        </div>
      </div>

      <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center gap-3">
          <div className="text-green-600 text-lg">🔄</div>
          <div>
            <h4 className="font-semibold text-green-800">DUAL STORAGE SYSTEM AKTIF</h4>
            <p className="text-sm text-green-700">
              Semua file sekarang disimpan di DUA akun Supabase (Primary & Backup) secara otomatis. 
              Data Anda lebih aman dengan redundansi ganda.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
} 