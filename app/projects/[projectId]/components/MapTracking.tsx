"use client";

import React, { useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { supabase } from "../../../../lib/supabaseClient";

// Dynamically import Leaflet components
const MapContainer = dynamic(
  () => import("react-leaflet").then((mod) => mod.MapContainer),
  { ssr: false }
);

const TileLayer = dynamic(
  () => import("react-leaflet").then((mod) => mod.TileLayer),
  { ssr: false }
);

const Marker = dynamic(
  () => import("react-leaflet").then((mod) => mod.Marker),
  { ssr: false }
);

const Popup = dynamic(
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

// Fix Leaflet icon issue
if (typeof window !== 'undefined') {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

export type MapTrackingProps = {
  projectId?: string;
  center?: CenterObj;
  height?: number;
  [key: string]: any;
};

export default function MapTracking({
  projectId,
  center,
  height = 400,
  ...props
}: MapTrackingProps) {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [internalCenter, setInternalCenter] = useState<[number, number]>([
    -7.155, 112.65, // Default Gresik coordinates
  ]);
  const [zoom, setZoom] = useState<number>(13);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<any>(null);
  const mapKey = useRef(`map-${Date.now()}`);

  // Initialize map dengan lokasi user
  useEffect(() => {
    // Coba dapatkan lokasi user saat ini
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          console.log("📍 GPS User Location:", latitude, longitude);
          setInternalCenter([latitude, longitude]);
          setZoom(15);
        },
        (error) => {
          console.warn("Geolocation error:", error);
          // Jika gagal, gunakan lokasi default Gresik
          setInternalCenter([-7.155, 112.65]);
          setZoom(13);
        }
      );
    } else {
      // Default ke Gresik
      setInternalCenter([-7.155, 112.65]);
      setZoom(13);
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
  }, []);

  // Load shipments data dengan error handling
  useEffect(() => {
    if (!projectId) {
      console.log("No projectId provided");
      setIsLoading(false);
      return;
    }

    let mounted = true;

    const parseRow = (r: any): Shipment => ({
      id: String(r.id),
      tracking_code: r.tracking_code ?? null,
      item_name: r.item_name ?? `Location ${r.id}`,
      quantity: r.quantity != null ? Number(r.quantity) : null,
      status: r.status ?? "active",
      last_lat: r.last_lat != null ? Number(r.last_lat) : null,
      last_lng: r.last_lng != null ? Number(r.last_lng) : null,
      updated_at: r.updated_at ?? null,
      created_at: r.created_at ?? null,
      project_id: r.project_id ?? null,
      address: r.address ?? null,
      accuracy: r.accuracy != null ? Number(r.accuracy) : null,
      recorded_at: r.recorded_at ?? null,
    });

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
          const parsed = (data as any[]).map(parseRow);
          setShipments(parsed);

          // Update center ke lokasi terbaru
          const first = parsed.find((s) => s.last_lat != null && s.last_lng != null);
          if (first) {
            setInternalCenter([first.last_lat!, first.last_lng!]);
            setZoom(15);
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

    // Setup realtime subscription dengan error handling
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
              const eventType = (payload.eventType || payload.type || "").toString().toUpperCase();
              
              const parseRow = (r: any): Shipment => ({
                id: String(r.id),
                tracking_code: r.tracking_code ?? null,
                item_name: r.item_name ?? `Location ${r.id}`,
                quantity: r.quantity != null ? Number(r.quantity) : null,
                status: r.status ?? "active",
                last_lat: r.last_lat != null ? Number(r.last_lat) : null,
                last_lng: r.last_lng != null ? Number(r.last_lng) : null,
                updated_at: r.updated_at ?? null,
                created_at: r.created_at ?? null,
                project_id: r.project_id ?? null,
                address: r.address ?? null,
                accuracy: r.accuracy != null ? Number(r.accuracy) : null,
                recorded_at: r.recorded_at ?? null,
              });

              const newRow = payload.new ? parseRow(payload.new) : null;
              const oldRow = payload.old ? parseRow(payload.old) : null;

              setShipments((prev) => {
                if (eventType === "INSERT" && newRow) {
                  return [newRow, ...prev.slice(0, 49)];
                }
                if (eventType === "UPDATE" && newRow) {
                  return prev.map((p) => (p.id === newRow.id ? newRow : p));
                }
                if (eventType === "DELETE" && oldRow) {
                  return prev.filter((p) => p.id !== oldRow.id);
                }
                return prev;
              });

              if (newRow?.last_lat != null && newRow?.last_lng != null) {
                setInternalCenter([newRow.last_lat, newRow.last_lng]);
              }
            }
          )
          .subscribe();
        
        channelRef.current = chan;
      } catch (channelError) {
        console.error("Channel subscription error:", channelError);
      }
    }

    return () => {
      mounted = false;
    };
  }, [projectId]);

  // Fungsi untuk mendapatkan lokasi user saat ini - DIPERBAIKI untuk GPS valid
  const getCurrentUserLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation tidak didukung oleh browser Anda");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        console.log("📍 GPS Location Retrieved:", latitude, longitude);
        
        // Validasi koordinat (harus dalam range Indonesia)
        if (latitude < -11 || latitude > 6 || longitude < 95 || longitude > 141) {
          alert("Koordinat GPS tidak valid untuk lokasi Indonesia. Pastikan GPS aktif dan terhubung.");
          return;
        }
        
        setInternalCenter([latitude, longitude]);
        setZoom(15);
        
        // Reverse geocoding untuk mendapatkan alamat
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`)
          .then(response => response.json())
          .then(data => {
            const address = data.display_name || `Koordinat: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
            
            // Update marker di peta
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

  // PERBAIKAN: Fungsi untuk menyimpan lokasi ke database - FIXED INSERT ERROR
  const saveLocationToDatabase = async (latitude: number, longitude: number, accuracy: number, address: string) => {
    if (!projectId) {
      alert("Project ID tidak ditemukan");
      return;
    }

    try {
      console.log("📤 Menyimpan lokasi ke database...");
      
      // PERBAIKAN: Gunakan insert yang lebih sederhana tanpa .single()
      const { error } = await supabase
        .from("shipments")
        .insert({
          project_id: projectId,
          last_lat: latitude,
          last_lng: longitude,
          accuracy: accuracy,
          address: address,
          status: "manual",
          recorded_at: new Date().toISOString(),
          item_name: "Lokasi Manual"
        });

      if (error) {
        console.error("❌ Insert shipment error:", error);
        throw error;
      }

      console.log("✅ Lokasi berhasil disimpan ke database");
      
    } catch (err: any) {
      console.error("Error saving location:", err);
      alert("⚠️ Lokasi berhasil ditampilkan di peta, tetapi gagal disimpan ke database. Silakan coba lagi nanti.");
    }
  };

  // Fungsi untuk menyimpan lokasi manual
  const saveCurrentLocation = async () => {
    if (!navigator.geolocation) {
      alert("Geolocation tidak didukung oleh browser Anda");
      return;
    }

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
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
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
        const data = await response.json();
        if (data.display_name) {
          address = data.display_name;
        }
      } catch (e) {
        console.warn("Gagal mendapatkan alamat:", e);
      }

      // Simpan ke database
      await saveLocationToDatabase(latitude, longitude, accuracy, address);
      
      // Update peta
      setInternalCenter([latitude, longitude]);
      setZoom(15);
      
      // Tambahkan ke daftar shipments
      const newShipment: Shipment = {
        id: `manual-${Date.now()}`,
        item_name: "Lokasi Tersimpan",
        last_lat: latitude,
        last_lng: longitude,
        accuracy: accuracy,
        address: address,
        status: "saved",
        recorded_at: new Date().toISOString()
      };
      
      setShipments(prev => [newShipment, ...prev]);
      
      alert(`✅ Lokasi berhasil disimpan!\n\n📍 ${address}\n\nKoordinat: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}\nAkurasi: ${accuracy}m`);
      
    } catch (error: any) {
      console.error("Error getting location:", error);
      if (error.code === error.PERMISSION_DENIED) {
        alert("Akses lokasi ditolak. Silakan izinkan akses lokasi di pengaturan browser Anda.");
      } else if (error.code === error.TIMEOUT) {
        alert("Timeout saat mengambil lokasi. Pastikan GPS aktif dan coba lagi.");
      } else {
        alert("Gagal mengambil lokasi: " + error.message);
      }
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
        Menampilkan titik lokasi. Klik "Lokasi Saya" untuk melihat posisi Anda saat ini, atau "Simpan Lokasi" untuk menyimpan ke database.
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