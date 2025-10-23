import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export default function MapTracking({ lat, lng }) {
  return (
    <MapContainer center={[lat, lng]} zoom={13} style={{ height: "300px", width: "100%" }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Marker position={[lat, lng]}>
        <Popup>Lokasi Barang Saat Ini</Popup>
      </Marker>
    </MapContainer>
  );
}
