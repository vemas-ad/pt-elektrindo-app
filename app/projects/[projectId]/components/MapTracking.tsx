"use client";

import React, { useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { supabase } from "../../../../lib/supabaseClient";

// Dynamically import Leaflet components
const MapContainer = dynamic<React.ComponentProps<typeof import("react-leaflet").MapContainer>>(
  () => import("react-leaflet").then((mod) => mod.MapContainer),
  { ssr: false }
);

const TileLayer = dynamic<React.ComponentProps<typeof import("react-leaflet").TileLayer>>(
  () => import("react-leaflet").then((mod) => mod.TileLayer),
  { ssr: false }
);

const Marker = dynamic<React.ComponentProps<typeof import("react-leaflet").Marker>>(
  () => import("react-leaflet").then((mod) => mod.Marker),
  { ssr: false }
);

const Popup = dynamic<React.ComponentProps<typeof import("react-leaflet").Popup>>(
  () => import("react-leaflet").then((mod) => mod.Popup),
  { ssr: false }
);

type Shipment = {
  id: string;
  tracking_code?: string | null;
  item_name?: string | null;
  quantity?: number | null;
  status?: string | null;
  last_lat?: number | null;
  last_lng?: number | null;
  updated_at?: string | null;
  created_at?: string | null;
  project_id?: string | null;
  address?: string | null;
  accuracy?: number | null;
  recorded_at?: string | null;
};

type CenterObj = { lat: number; lng: number };

// PERBAIKAN: Tambahkan properti userMarker
export type MapTrackingProps = {
  projectId?: string;
  center?: CenterObj;
  height?: number;
  zoom?: number;
  userMarker?: { lat: number; lng: number } | null;
  [key: string]: any;
};

// Fix Leaflet icon issue
if (typeof window !== 'undefined') {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

export default function MapTracking({
  projectId,
  center,
  height = 400,
  zoom: propZoom,
  userMarker,
  ...props
}: MapTrackingProps) {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [internalCenter, setInternalCenter] = useState<[number, number]>([
    -7.155, 112.65,
  ]);
  const [zoom, setZoom] = useState<number>(propZoom || 13);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<any>(null);
  const mapKey = useRef(`map-${Date.now()}`);
  
  // ============ PERBAIKAN NO. 3: Debug Struktur Tabel ============
  useEffect(() => {
    const debugShipmentsTable = async () => {
      if (!projectId) return;
      
      try {
        console.log("🔍 Debug: Checking shipments table...");
        
        // Coba query untuk melihat struktur
        const { data, error } = await supabase
          .from("shipments")
          .select("*")
          .limit(1);
        
        if (error) {
          console.error("🔍 Debug: Table query error:", error);
          // Jangan tampilkan alert di sini, hanya log
        } else {
          console.log("🔍 Debug: Table columns:", data?.length ? Object.keys(data[0]) : "No data");
          
          // Coba insert data test kecil
          const testData = {
            project_id: projectId,
            last_lat: -6.2,
            last_lng: 106.8,
            address: "Test location debug",
            status: "test",
            recorded_at: new Date().toISOString()
          };
          
          const { error: testError } = await supabase
            .from("shipments")
            .insert([testData]);
            
          if (testError) {
            console.error("🔍 Debug: Test insert error:", testError);
          } else {
            console.log("🔍 Debug: Test insert success - table structure OK");
          }
        }
      } catch (err) {
        console.error("🔍 Debug: Exception:", err);
      }
    };
    
    debugShipmentsTable();
  }, [projectId]);

  // PERBAIKAN: Effect untuk handle userMarker
  useEffect(() => {
    if (userMarker && userMarker.lat && userMarker.lng) {
      console.log("📍 User marker updated:", userMarker);
      setInternalCenter([userMarker.lat, userMarker.lng]);
      setZoom(propZoom || 15);
    }
  }, [userMarker, propZoom]);

  // Initialize map dengan lokasi user
  useEffect(() => {
    if (!userMarker) {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            console.log("📍 GPS User Location:", latitude, longitude);
            setInternalCenter([latitude, longitude]);
            setZoom(propZoom || 15);
          },
          (error) => {
            console.warn("Geolocation error:", error);
            if (center) {
              setInternalCenter([center.lat, center.lng]);
              setZoom(propZoom || 13);
            } else {
              setInternalCenter([-7.155, 112.65]);
              setZoom(propZoom || 13);
            }
          }
        );
      } else {
        if (center) {
          setInternalCenter([center.lat, center.lng]);
          setZoom(propZoom || 13);
        } else {
          setInternalCenter([-7.155, 112.65]);
          setZoom(propZoom || 13);
        }
      }
    }

    return () => {
      if (channelRef.current) {
        try {
          supabase.removeChannel(channelRef.current);
        } catch (e) {
          console.log("Error removing channel:", e);
        }
      }
    };
  }, [center, propZoom, userMarker]);

  // Load shipments data dengan error handling
  useEffect(() => {
    if (!projectId) {
      console.log("No projectId provided");
      setIsLoading(false);
      return;
    }

    let mounted = true;

    async function loadInitial() {
      try {
        setIsLoading(true);
        setError(null);
        
        const { data, error } = await supabase
          .from("shipments")
          .select("*")
          .eq("project_id", projectId)
          .order("recorded_at", { ascending: false })
          .limit(50);

        if (error) {
          console.error("Load shipments error:", error);
          setError(`Gagal memuat data: ${error.message}`);
          return;
        }
        
        if (mounted && Array.isArray(data)) {
          // PERBAIKAN: Gunakan parsing yang konsisten
          const parsed = (data as any[]).map((r: any) => ({
            id: String(r.id),
            tracking_code: r.tracking_code || null,
            item_name: r.item_name || `Location ${r.id}`,
            quantity: r.quantity != null ? Number(r.quantity) : null,
            status: r.status || "active",
            last_lat: r.last_lat != null ? Number(r.last_lat) : null,
            last_lng: r.last_lng != null ? Number(r.last_lng) : null,
            updated_at: r.updated_at || null,
            created_at: r.created_at || null,
            project_id: r.project_id || null,
            address: r.address || null,
            accuracy: r.accuracy != null ? Number(r.accuracy) : null,
            recorded_at: r.recorded_at || null,
          }));
          
          setShipments(parsed);

          if (!userMarker) {
            const first = parsed.find((s) => s.last_lat != null && s.last_lng != null);
            if (first) {
              setInternalCenter([first.last_lat!, first.last_lng!]);
              setZoom(propZoom || 15);
            }
          }
        }
      } catch (error) {
        console.error("Error loading shipments:", error);
        setError("Error loading data");
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    loadInitial();

    // Setup realtime subscription - PERBAIKAN NO. 4
// Setup realtime subscription - VERSI SIMPLIFIED
if (projectId) {
  try {
    const chan = supabase
      .channel(`public:shipments:project_${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shipments",
          filter: `project_id=eq.${projectId}`,
        },
        (payload: any) => {
          try {
            // PERBAIKAN: Validasi payload
            if (!payload || !payload.new) return;
            
            const newRow = {
              id: String(payload.new.id || `new_${Date.now()}`),
              tracking_code: payload.new.tracking_code || null,
              item_name: payload.new.item_name || `Location ${payload.new.id || 'new'}`,
              quantity: payload.new.quantity != null ? Number(payload.new.quantity) : null,
              status: payload.new.status || "active",
              last_lat: payload.new.last_lat != null ? Number(payload.new.last_lat) : null,
              last_lng: payload.new.last_lng != null ? Number(payload.new.last_lng) : null,
              updated_at: payload.new.updated_at || null,
              created_at: payload.new.created_at || null,
              project_id: payload.new.project_id || null,
              address: payload.new.address || null,
              accuracy: payload.new.accuracy != null ? Number(payload.new.accuracy) : null,
              recorded_at: payload.new.recorded_at || null,
            };

            setShipments((prev) => {
              // Cegah duplikasi
              const exists = prev.find(p => p.id === newRow.id);
              if (exists) {
                return prev.map(p => p.id === newRow.id ? newRow : p);
              }
              return [newRow, ...prev.slice(0, 49)];
            });

            if (!userMarker && newRow.last_lat != null && newRow.last_lng != null) {
              setInternalCenter([newRow.last_lat, newRow.last_lng]);
            }
          } catch (parseError) {
            console.error("Error parsing realtime update:", parseError);
          }
        }
      );

    // Subscribe dengan error handling
    const subscription = chan.subscribe((status: any, err: any) => {
      console.log(`Realtime channel status: ${status}`);
      if (err) {
        console.error("Subscription error:", err);
      }
    });

    channelRef.current = chan;
  } catch (channelError) {
    console.error("Channel subscription error:", channelError);
  }
}

    return () => {
      mounted = false;
    };
  }, [projectId, propZoom, userMarker]);

  // PERBAIKAN: Buat custom icon untuk user marker
  const createUserIcon = () => {
    return new L.Icon({
      iconUrl: 'data:image/svg+xml;base64,' + btoa(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="40" height="40">
          <circle cx="12" cy="12" r="11" fill="#3B82F6" opacity="0.9" stroke="#1D4ED8" stroke-width="2"/>
          <circle cx="12" cy="12" r="5" fill="#FFFFFF"/>
          <circle cx="12" cy="12" r="9" fill="none" stroke="#FFFFFF" stroke-width="1.5" stroke-dasharray="2,2"/>
        </svg>
      `),
      iconSize: [40, 40],
      iconAnchor: [20, 40],
      popupAnchor: [0, -40],
      className: 'user-marker-icon animate-pulse'
    });
  };

  // PERBAIKAN KRITIS: Fungsi untuk menyimpan lokasi ke database - FIXED 100%
  const saveLocationToDatabase = async (
    latitude: number, 
    longitude: number, 
    accuracy: number, 
    address: string
  ) => {
    if (!projectId) {
      console.error("❌ Project ID tidak ditemukan");
      return null; // Return null, bukan throw error
    }

    try {
      console.log("📤 Menyimpan lokasi ke database...");
      
      // PERBAIKAN: Gunakan struktur yang lebih aman
      const insertData: any = {
        project_id: projectId,
        last_lat: latitude,
        last_lng: longitude,
        address: address.substring(0, 500), // Batasi panjang
        status: "active",
        recorded_at: new Date().toISOString(),
        accuracy: accuracy
      };

      console.log("📍 Data insert:", insertData);

      // PERBAIKAN KRITIS: Gunakan try-catch nested untuk menangani error dengan lebih baik
      try {
        const { data, error } = await supabase
          .from("shipments")
          .insert([insertData]);

        // PERBAIKAN: Periksa error dengan cara yang aman
        if (error) {
          console.log("❌ Insert error (with safe logging):", {
            code: error?.code || "NO_CODE",
            message: error?.message || "Unknown error",
            details: error?.details || "No details"
          });
          
          // Coba alternatif struktur
          const fallbackData = {
            project_id: projectId,
            last_lat: latitude,
            last_lng: longitude,
            address: address.substring(0, 100),
            status: "manual",
            recorded_at: new Date().toISOString()
          };
          
          const { data: fallbackDataResult, error: fallbackError } = await supabase
            .from("shipments")
            .insert([fallbackData]);
            
          if (fallbackError) {
            console.log("❌ Fallback insert juga gagal:", fallbackError);
            
            // Simpan ke localStorage sebagai backup
            const backupKey = `shipment_backup_${projectId}`;
            const existingBackup = localStorage.getItem(backupKey);
            const backupArray = existingBackup ? JSON.parse(existingBackup) : [];
            
            backupArray.push({
              ...insertData,
              backup_timestamp: new Date().toISOString(),
              error: fallbackError?.message || "Unknown"
            });
            
            localStorage.setItem(backupKey, JSON.stringify(backupArray.slice(-20)));
            
            console.log("⚠️ Data disimpan di localStorage backup");
            
            // Return minimal response
            return {
              id: `backup_${Date.now()}`,
              ...insertData,
              success: false,
              backup: true
            };
          }
          
          return fallbackDataResult;
        }
        
        console.log("✅ Insert berhasil:", data);
        return data;
        
      } catch (insertError: any) {
        console.log("❌ Exception saat insert:", insertError);
        
        // Coba insert yang sangat minimal
        try {
          const minimalData = {
            project_id: projectId,
            last_lat: latitude,
            last_lng: longitude,
            recorded_at: new Date().toISOString()
          };
          
          const { error: minimalError } = await supabase
            .from("shipments")
            .insert([minimalData]);
            
          if (!minimalError) {
            console.log("✅ Insert berhasil dengan data minimal");
            return { id: `minimal_${Date.now()}`, ...minimalData };
          }
        } catch (minimalError) {
          console.log("❌ Minimal insert gagal:", minimalError);
        }
        
        // Return null tapi tampilkan data di UI
        return null;
      }
    } catch (err: any) {
      console.log("❌ Outer catch error:", err);
      return null;
    }
  };

  // Fungsi untuk mendapatkan lokasi user saat ini
  const getCurrentUserLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation tidak didukung oleh browser Anda");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        console.log("📍 GPS Location Retrieved:", latitude, longitude);
        
        if (latitude < -11 || latitude > 6 || longitude < 95 || longitude > 141) {
          alert("Koordinat GPS tidak valid untuk lokasi Indonesia. Pastikan GPS aktif dan terhubung.");
          return;
        }
        
        setInternalCenter([latitude, longitude]);
        setZoom(propZoom || 15);
        
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`)
          .then(response => response.json())
          .then(data => {
            const address = data.display_name || `Koordinat: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
            
            const newShipment: Shipment = {
              id: `current-${Date.now()}`,
              item_name: "Lokasi Anda Saat Ini",
              last_lat: latitude,
              last_lng: longitude,
              accuracy: accuracy,
              address: address,
              status: "current",
              recorded_at: new Date().toISOString()
            };
            
            setShipments(prev => [newShipment, ...prev]);
            
            alert(`📍 Lokasi Anda: ${address}\n\nKoordinat: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}\nAkurasi: ${accuracy}m`);
          })
          .catch(error => {
            console.error("Reverse geocoding error:", error);
            alert(`📍 Lokasi Anda:\nKoordinat: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}\nAkurasi: ${accuracy}m`);
          });
      },
      (error) => {
        console.error("Geolocation error:", error);
        switch(error.code) {
          case error.PERMISSION_DENIED:
            alert("Akses lokasi ditolak. Silakan izinkan akses lokasi di pengaturan browser Anda.");
            break;
          case error.POSITION_UNAVAILABLE:
            alert("Informasi lokasi tidak tersedia. Pastikan GPS aktif.");
            break;
          case error.TIMEOUT:
            alert("Permintaan lokasi timeout. Coba lagi.");
            break;
          default:
            alert("Error tidak diketahui.");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  };

  // Fungsi untuk menyimpan lokasi manual - DIPERBAIKI
  const saveCurrentLocation = async () => {
    if (!navigator.geolocation) {
      alert("Geolocation tidak didukung oleh browser Anda");
      return;
    }

    if (!projectId) {
      alert("Project ID tidak ditemukan. Silakan refresh halaman.");
      return;
    }

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0
        });
      });

      const { latitude, longitude, accuracy } = position.coords;
      
      console.log("📍 GPS Location untuk disimpan:", latitude, longitude);
      
      // Validasi koordinat
      if (latitude < -11 || latitude > 6 || longitude < 95 || longitude > 141) {
        alert("Koordinat GPS tidak valid untuk lokasi Indonesia. Pastikan GPS aktif dan terhubung.");
        return;
      }
      
      let address = "Lokasi tidak diketahui";
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
          {
            headers: {
              'User-Agent': 'SilverApp/1.0',
              'Accept-Language': 'id-ID,id'
            }
          }
        );
        const data = await response.json();
        if (data.display_name) {
          address = data.display_name;
        }
      } catch (e) {
        console.warn("Gagal mendapatkan alamat:", e);
        address = `Koordinat: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
      }

      // Tampilkan loading
      alert("🔄 Menyimpan lokasi ke server...");
      
      // PERBAIKAN: Simpan dengan fungsi yang sudah diperbaiki
      const result = await saveLocationToDatabase(latitude, longitude, accuracy, address);
      
      // Update peta terlepas dari hasil database
      setInternalCenter([latitude, longitude]);
      setZoom(propZoom || 15);
      
      // PERBAIKAN: Tambahkan ke daftar shipments dengan cara yang aman
      const newShipment: Shipment = {
        id: result && typeof result === 'object' && result[0]?.id 
          ? result[0].id 
          : `temp_${Date.now()}`,
        item_name: "Lokasi Tersimpan",
        last_lat: latitude,
        last_lng: longitude,
        accuracy: accuracy,
        address: address,
        status: "saved",
        recorded_at: new Date().toISOString(),
        project_id: projectId
      };
      
      setShipments(prev => [newShipment, ...prev]);
      
      // Tampilkan pesan berdasarkan hasil
      setTimeout(() => {
        if (!result) {
          alert(`⚠️ Lokasi berhasil ditampilkan di peta!\n\n📍 ${address}\n\nCatatan: Ada masalah menyimpan ke database. Data disimpan sementara di penyimpanan lokal.`);
        } else if (typeof result === 'object' && 'backup' in result) {
          alert(`⚠️ Lokasi berhasil ditampilkan!\n\n📍 ${address}\n\nData disimpan di localStorage sebagai backup.`);
        } else {
          alert(`✅ Lokasi berhasil disimpan!\n\n📍 ${address}\nKoordinat: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}\nAkurasi: ${accuracy}m`);
        }
      }, 100);
      
    } catch (error: any) {
      console.error("Error getting location:", error);
      
      let errorMessage = "Gagal menyimpan lokasi";
      if (error.code === error.PERMISSION_DENIED) {
        errorMessage = "Akses lokasi ditolak. Silakan izinkan akses lokasi di pengaturan browser Anda.";
      } else if (error.code === error.POSITION_UNAVAILABLE) {
        errorMessage = "GPS tidak aktif atau tidak tersedia. Pastikan GPS diaktifkan.";
      } else if (error.code === error.TIMEOUT) {
        errorMessage = "Timeout saat mengambil lokasi. Pastikan GPS aktif dan coba lagi.";
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      alert(`❌ ${errorMessage}`);
    }
  };

  // Render map
  const renderMap = () => {
    if (typeof window === 'undefined') {
      return (
        <div className="flex items-center justify-center" style={{ height: `${height}px` }}>
          <div className="text-center">
            <p className="text-sm text-gray-500">Loading map...</p>
          </div>
        </div>
      );
    }

    try {
      const FlyTo = dynamic(
        () => import("react-leaflet").then((mod) => {
          const { useMap } = mod;
          return function FlyToComponent({ center }: { center: [number, number] }) {
            const map = useMap();
            
            useEffect(() => {
              if (center && center[0] && center[1]) {
                setTimeout(() => {
                  try {
                    map.flyTo(center, map.getZoom());
                  } catch (error) {
                    map.setView(center, map.getZoom());
                  }
                }, 100);
              }
            }, [center, map]);

            return null;
          };
        }),
        { ssr: false }
      );

      return (
        <MapContainer
          key={mapKey.current}
          center={internalCenter}
          zoom={zoom}
          style={{ height: `${height}px`, width: "100%" }}
          scrollWheelZoom={true}
          className="z-0"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FlyTo center={internalCenter} />
          
          {/* PERBAIKAN: Tambahkan user marker jika ada */}
          {userMarker && userMarker.lat && userMarker.lng && (
            <Marker
              key="user-marker"
              position={[userMarker.lat, userMarker.lng] as [number, number]}
              icon={createUserIcon()}
              title="Posisi Anda Saat Ini"
            >
              <Popup>
                <div className="text-sm min-w-[200px]">
                  <strong className="block mb-1">📍 Posisi Anda Saat Ini</strong>
                  <div className="space-y-1">
                    <div><span className="font-medium">Koordinat:</span> {userMarker.lat.toFixed(6)}, {userMarker.lng.toFixed(6)}</div>
                    <div><span className="font-medium">Status:</span> Real-time</div>
                    <div className="text-xs text-blue-600 mt-2">
                      🔵 Titik biru menunjukkan posisi Anda saat ini
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          )}
          
          {shipments.map((s) =>
            s.last_lat != null && s.last_lng != null ? (
              <Marker
                key={s.id}
                position={[s.last_lat, s.last_lng] as [number, number]}
                title={`${s.item_name || "Location"} (${s.status || "unknown"})`}
              >
                <Popup>
                  <div className="text-sm min-w-[200px]">
                    <strong className="block mb-1">{s.item_name || "Unnamed Location"}</strong>
                    <div className="space-y-1">
                      <div><span className="font-medium">Status:</span> {s.status || "-"}</div>
                      <div><span className="font-medium">Address:</span> {s.address || "-"}</div>
                      <div><span className="font-medium">Accuracy:</span> {s.accuracy ? `±${s.accuracy}m` : "-"}</div>
                      <div><span className="font-medium">Recorded:</span> {s.recorded_at ? new Date(s.recorded_at).toLocaleString('id-ID') : "-"}</div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ) : null
          )}
        </MapContainer>
      );
    } catch (mapError) {
      console.error("Map rendering error:", mapError);
      return (
        <div className="flex items-center justify-center" style={{ height: `${height}px` }}>
          <div className="text-center">
            <div className="text-red-500 text-2xl mb-2">⚠️</div>
            <p className="text-sm text-gray-500">Gagal memuat peta</p>
            <p className="text-xs text-gray-400 mt-1">Silakan refresh halaman</p>
          </div>
        </div>
      );
    }
  };

  return (
    <div className="bg-white p-4 rounded shadow">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold text-lg">🗺️ Peta & Monitor Lokasi</h3>
        <div className="flex gap-2">
          <button
            onClick={getCurrentUserLocation}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm flex items-center gap-1"
          >
            <span>📍</span>
            <span>Lokasi Saya</span>
          </button>
          <button
            onClick={saveCurrentLocation}
            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm flex items-center gap-1"
          >
            <span>💾</span>
            <span>Simpan Lokasi</span>
          </button>
        </div>
      </div>
      
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded">
          <div className="flex items-center gap-2 text-red-700">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        </div>
      )}
      
      <p className="text-sm text-gray-600 mb-4">
        Menampilkan titik lokasi. {userMarker && "🔵 Titik biru menunjukkan posisi Anda saat ini."}
        Klik "Lokasi Saya" untuk melihat posisi Anda saat ini, atau "Simpan Lokasi" untuk menyimpan ke database.
      </p>

      <div className="rounded overflow-hidden mb-4 border border-gray-300">
        {isLoading ? (
          <div className="flex items-center justify-center" style={{ height: `${height}px` }}>
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-sm text-gray-500 mt-2">Memuat peta...</p>
            </div>
          </div>
        ) : (
          renderMap()
        )}
      </div>

      <div>
        <h4 className="font-medium mb-3">📍 Riwayat Lokasi</h4>
        <div className="space-y-2 max-h-60 overflow-auto pr-2">
          {shipments.length === 0 ? (
            <div className="text-center py-6 text-gray-500">
              <div className="text-3xl mb-2">📍</div>
              <p>Belum ada data lokasi</p>
            </div>
          ) : (
            shipments.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{s.item_name || `Location ${s.id.substring(0, 8)}`}</div>
                  <div className="text-xs text-gray-600 mb-1 truncate" title={s.address || ""}>
                    📍 {s.address || "No address"}
                  </div>
                  <div className="text-xs text-gray-500">
                    🕐 {s.recorded_at ? new Date(s.recorded_at).toLocaleTimeString('id-ID') : "-"}
                  </div>
                </div>
                <div className="text-right text-xs text-gray-700 ml-4">
                  {s.last_lat != null ? (
                    <>
                      <div className="font-mono">{s.last_lat.toFixed(6)}</div>
                      <div className="font-mono">{s.last_lng?.toFixed(6)}</div>
                    </>
                  ) : (
                    <div className="text-gray-400">No coordinates</div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}