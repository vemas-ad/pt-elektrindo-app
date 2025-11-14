"use client";

import React, { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { supabase } from "../../lib/supabaseClient";

// leaflet icon fix
try {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
} catch (e) {
  /* ignore */
}

type Props = {
  projectId?: string | null;
  center?: { lat: number; lng: number } | null;
  zoom?: number;
};

function FlyTo({ center }: { center: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

export default function MapTracking({ projectId, center, zoom = 11 }: Props) {
  const [shipments, setShipments] = useState<any[]>([]);
  const [internalCenter, setInternalCenter] = useState<[number, number]>([
    Number(process.env.NEXT_PUBLIC_MAP_DEFAULT_LAT ?? -6.2),
    Number(process.env.NEXT_PUBLIC_MAP_DEFAULT_LNG ?? 106.816666),
  ]);

  useEffect(() => {
    if (center && typeof center.lat === "number" && typeof center.lng === "number") {
      setInternalCenter([center.lat, center.lng]);
    }
  }, [center]);

  useEffect(() => {
    let mounted = true;
    async function loadInitial() {
      try {
        let q = supabase.from("shipments").select("*");
        if (projectId) q = q.eq("project_id", projectId).order("created_at", { ascending: false });
        const res = await q;
        const data = res.data || [];
        if (!mounted) return;
        setShipments(
          data.map((r: any) => ({
            id: r.id,
            item_name: r.item_name,
            status: r.status,
            last_lat: r.last_lat != null ? Number(r.last_lat) : null,
            last_lng: r.last_lng != null ? Number(r.last_lng) : null,
            updated_at: r.updated_at,
          }))
        );
        const first = data.find((s: any) => s.last_lat != null && s.last_lng != null);
        if (first) setInternalCenter([Number(first.last_lat), Number(first.last_lng)]);
      } catch (err) {
        console.error("loadInitial map:", err);
      }
    }
    loadInitial();

    const chanName = projectId ? `public:shipments:project_${projectId}` : `public:shipments:all`;
    const chan = supabase.channel(chanName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shipments",
          ...(projectId ? { filter: `project_id=eq.${projectId}` } : {}),
        },
        (payload: any) => {
          const eventType = (payload.eventType || payload.type || "").toString().toUpperCase();
          const newRow = payload.new;
          const oldRow = payload.old;
          setShipments((prev) => {
            if (eventType === "INSERT" && newRow) return [newRow, ...prev];
            if (eventType === "UPDATE" && newRow) return prev.map((p) => (p.id === newRow.id ? newRow : p));
            if (eventType === "DELETE" && oldRow) return prev.filter((p) => p.id !== oldRow.id);
            return prev;
          });
          if (newRow && newRow.last_lat != null && newRow.last_lng != null) {
            setInternalCenter([Number(newRow.last_lat), Number(newRow.last_lng)]);
          }
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      try {
        supabase.removeChannel(chan);
      } catch (e) {
        /* ignore */
      }
    };
  }, [projectId]);

  // add current user location as a new shipment (or update existing)
  async function addCurrentLocation() {
    if (!navigator.geolocation) return alert("Geolocation tidak didukung di perangkat ini.");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setInternalCenter([lat, lng]);
        // insert to shipments table
        try {
          const insert = {
            project_id: projectId || null,
            last_lat: lat,
            last_lng: lng,
            status: "in_transit",
            item_name: "Lokasi pengguna",
            updated_at: new Date().toISOString(),
          };
          const { data, error } = await supabase.from("shipments").insert(insert).select().single();
          if (error) {
            console.error("insert shipment error:", error);
            return alert("Gagal menyimpan lokasi: " + error.message);
          }
          alert("Lokasi berhasil ditambahkan ke monitoring.");
        } catch (err) {
          console.error("addCurrentLocation error:", err);
        }
      },
      (err) => {
        console.error("geolocation error:", err);
        alert("Izin lokasi dibutuhkan.");
      },
      { enableHighAccuracy: true }
    );
  }

  return (
    <div className="bg-white p-2 rounded overflow-hidden">
      <div className="flex justify-end mb-2">
        <button onClick={addCurrentLocation} className="bg-blue-600 text-white px-3 py-1 rounded">
          Tambahkan Lokasi Saya
        </button>
      </div>

      <MapContainer center={internalCenter} zoom={zoom} style={{ height: 320, width: "100%" }}>
        <FlyTo center={internalCenter} />
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {shipments.map((s) => {
          const latVal = s.last_lat != null ? Number(s.last_lat) : null;
          const lngVal = s.last_lng != null ? Number(s.last_lng) : null;
          if (latVal == null || lngVal == null) return null;
          return (
            <Marker key={s.id} position={[latVal, lngVal]}>
              <Popup>
                <div className="text-sm">
                  <strong>{s.item_name ?? "Unnamed"}</strong>
                  <br />
                  Status: {s.status ?? "-"}
                  <br />
                  Updated: {s.updated_at ?? "-"}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
