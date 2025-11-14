// components/MapTracking.tsx
"use client";

import React, { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { supabase } from "../../../../lib/supabaseClient"; // sesuaikan relatif path jika lokasi file berbeda

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
};

type CenterObj = { lat: number; lng: number };

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export default function MapTracking({
  projectId,
  center,
}: {
  projectId?: string;
  center?: CenterObj;
}) {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  // internal center stored as [lat, lng] for MapContainer
  const [internalCenter, setInternalCenter] = useState<[number, number]>([
    Number(process.env.NEXT_PUBLIC_MAP_DEFAULT_LAT ?? -6.2),
    Number(process.env.NEXT_PUBLIC_MAP_DEFAULT_LNG ?? 106.816666),
  ]);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    // if parent passed center prop, sync internal center
    if (center && typeof center.lat === "number" && typeof center.lng === "number") {
      setInternalCenter([center.lat, center.lng]);
    }
  }, [center]);

  useEffect(() => {
    if (projectId === undefined) {
      // still load global shipments if no projectId
      loadInitial();
      return;
    }

    let mounted = true;

    const parseRow = (r: any): Shipment => ({
      id: String(r.id),
      tracking_code: r.tracking_code ?? null,
      item_name: r.item_name ?? null,
      quantity: r.quantity != null ? Number(r.quantity) : null,
      status: r.status ?? null,
      last_lat: r.last_lat != null ? Number(r.last_lat) : null,
      last_lng: r.last_lng != null ? Number(r.last_lng) : null,
      updated_at: r.updated_at ?? null,
      created_at: r.created_at ?? null,
    });

    async function loadInitial() {
      const { data, error } = await supabase
        .from("shipments")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Load shipments error:", error);
        return;
      }
      if (mounted && Array.isArray(data)) {
        const parsed = (data as any[]).map(parseRow);
        setShipments(parsed);

        const first = parsed.find((s) => s.last_lat != null && s.last_lng != null);
        if (first) setInternalCenter([first.last_lat!, first.last_lng!]);
      }
    }

    loadInitial();

    const chan = supabase.channel(`public:shipments:project_${projectId}`);
    chan.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "shipments",
        filter: `project_id=eq.${projectId}`,
      },
      (payload: any) => {
        const eventType = (payload.eventType || payload.type || "").toString().toUpperCase();
        if (!payload.new && !payload.old) return;

        const newRow = payload.new ? parseRow(payload.new) : null;
        const oldRow = payload.old ? parseRow(payload.old) : null;

        setShipments((prev) => {
          if (eventType === "INSERT" && newRow) {
            return [newRow, ...prev];
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
    );
    chan.subscribe();
    channelRef.current = chan;

    return () => {
      mounted = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [projectId]);

  // If parent provided center prop, prefer it (already synced in effect),
  // else internalCenter comes from shipments or env defaults.
  const mapCenter: [number, number] = internalCenter;

  return (
    <div className="bg-white p-4 rounded shadow">
      <h3 className="font-semibold mb-2">📦 Lokasi Pengiriman (Realtime)</h3>
      <p className="text-sm text-gray-600 mb-3">
        Menampilkan titik lokasi terakhir untuk setiap shipment. Perubahan posisi
        akan muncul otomatis tanpa refresh.
      </p>

      <div className="rounded overflow-hidden mb-4">
        <MapContainer
          center={mapCenter}
          zoom={Number(process.env.NEXT_PUBLIC_MAP_DEFAULT_ZOOM ?? 12)}
          style={{ height: "320px", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {shipments.map(
            (s) =>
              s.last_lat != null &&
              s.last_lng != null && (
                <Marker
                  key={s.id}
                  position={[s.last_lat!, s.last_lng!] as [number, number]}
                  title={`${s.item_name ?? "Shipment"} (${s.status ?? "unknown"})`}
                >
                  <Popup>
                    <div className="text-sm">
                      <strong>{s.item_name ?? "Unnamed"}</strong>
                      <br />
                      Status: {s.status ?? "-"}
                      <br />
                      Qty: {s.quantity ?? "-"}
                      <br />
                      Updated: {s.updated_at ?? "-"}
                    </div>
                  </Popup>
                </Marker>
              )
          )}
        </MapContainer>
      </div>

      <div>
        <h4 className="font-medium mb-2">Daftar Pengiriman</h4>
        <div className="space-y-2 max-h-44 overflow-auto">
          {shipments.length === 0 && (
            <div className="text-sm text-gray-500">Belum ada data pengiriman.</div>
          )}
          {shipments.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between p-2 border rounded"
            >
              <div>
                <div className="font-semibold">{s.item_name ?? "Unnamed item"}</div>
                <div className="text-xs text-gray-500">
                  {s.tracking_code ? `#${s.tracking_code} · ` : ""}
                  status: {s.status ?? "-"} · qty: {s.quantity ?? "-"}
                </div>
                <div className="text-xs text-gray-400">
                  updated: {s.updated_at ?? "-"}
                </div>
              </div>
              <div className="text-right text-xs text-gray-500">
                {s.last_lat != null ? `${s.last_lat.toFixed(4)}, ${s.last_lng?.toFixed(4)}` : "-"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
