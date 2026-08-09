"use client";
import { useState } from "react";

export type LocationValue = { googleMapsUrl: string; latitude: string; longitude: string; locationAccuracyMeters: string; locationSource?: "DEVICE_GEOLOCATION" | "GOOGLE_MAPS_URL" | "MANUAL" };

export function parseGoogleMapsCoordinates(value: string): { latitude: number; longitude: number } | null {
  const match = value.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/) ?? value.match(/[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const latitude = Number(match[1]); const longitude = Number(match[2]);
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180 ? { latitude, longitude } : null;
}

export function LocationFields({ value, onChange }: { value: LocationValue; onChange: (value: LocationValue) => void }) {
  const [error, setError] = useState<string>();
  const updateUrl = (googleMapsUrl: string) => {
    const parsed = parseGoogleMapsCoordinates(googleMapsUrl);
    onChange(parsed ? { ...value, googleMapsUrl, latitude: String(parsed.latitude), longitude: String(parsed.longitude), locationSource: "GOOGLE_MAPS_URL" } : { ...value, googleMapsUrl });
  };
  const locate = () => {
    if (!navigator.geolocation) return setError("Thiết bị không hỗ trợ định vị.");
    setError(undefined);
    navigator.geolocation.getCurrentPosition(({ coords }) => onChange({ ...value, latitude: String(coords.latitude), longitude: String(coords.longitude), locationAccuracyMeters: String(Math.round(coords.accuracy)), locationSource: "DEVICE_GEOLOCATION" }), (reason) => setError(reason.code === 1 ? "Bạn chưa cấp quyền vị trí." : "Không thể xác định vị trí."), { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 });
  };
  const mapsHref = value.latitude && value.longitude ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${value.latitude},${value.longitude}`)}` : null;
  return <fieldset className="space-y-3 rounded-xl border p-4"><legend className="px-2 font-semibold">Vị trí Marketplace</legend><button type="button" onClick={locate} className="min-h-11 rounded-lg border px-4 font-semibold">Dùng vị trí hiện tại</button><label className="block">Google Maps URL<input value={value.googleMapsUrl} onChange={(event) => updateUrl(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border px-3" placeholder="https://www.google.com/maps/..." /></label><div className="grid gap-3 sm:grid-cols-2"><label>Latitude<input value={value.latitude} onChange={(event) => onChange({ ...value, latitude: event.target.value, locationSource: "MANUAL" })} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label><label>Longitude<input value={value.longitude} onChange={(event) => onChange({ ...value, longitude: event.target.value, locationSource: "MANUAL" })} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label></div>{value.locationAccuracyMeters ? <p className={Number(value.locationAccuracyMeters) > 100 ? "text-amber-700" : "text-slate-600"}>Độ chính xác ±{value.locationAccuracyMeters}m</p> : null}{mapsHref ? <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold text-emerald-700">Xác minh trên Google Maps</a> : null}{error ? <p role="alert" className="text-red-700">{error}</p> : null}</fieldset>;
}
