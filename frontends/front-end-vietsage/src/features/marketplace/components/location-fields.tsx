"use client";

import { useState } from "react";
import { toast } from "sonner";

export type LocationValue = {
  googleMapsUrl: string;
  latitude: string;
  longitude: string;
  locationAccuracyMeters: string;
  locationSource?: "DEVICE_GEOLOCATION" | "GOOGLE_MAPS_URL" | "MANUAL";
};

export function parseGoogleMapsCoordinates(
  value: string,
): { latitude: number; longitude: number } | null {
  const match =
    value.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/) ??
    value.match(/[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
    ? { latitude, longitude }
    : null;
}

const inputClass =
  "h-12 w-full rounded-xl border border-[#dcd3c1] bg-[#f9f6f0] px-4 text-sm sm:text-base font-semibold text-[#17201b] placeholder:text-[#8a958e] focus:bg-white focus:border-[#8c6d29] focus:outline-none focus:ring-4 focus:ring-[#8c6d29]/10 transition-all";

const labelClass = "block text-xs sm:text-sm font-semibold text-[#3d4942] mb-1.5";

export function LocationFields({
  value,
  onChange,
  hideLocateButton = false,
  isLocatingExternal = false,
  onLocateExternal,
}: {
  value: LocationValue;
  onChange: (value: LocationValue) => void;
  hideLocateButton?: boolean;
  isLocatingExternal?: boolean;
  onLocateExternal?: () => void;
}) {
  const [error, setError] = useState<string>();
  const [isLocatingInternal, setIsLocatingInternal] = useState<boolean>(false);

  const isLocating = isLocatingExternal || isLocatingInternal;

  const updateUrl = (googleMapsUrl: string) => {
    const parsed = parseGoogleMapsCoordinates(googleMapsUrl);
    if (parsed) {
      toast.success("Đã phân tích tọa độ từ Google Maps URL!");
      onChange({
        ...value,
        googleMapsUrl,
        latitude: String(parsed.latitude),
        longitude: String(parsed.longitude),
        locationSource: "GOOGLE_MAPS_URL",
      });
    } else {
      onChange({ ...value, googleMapsUrl });
    }
  };

  const locate = () => {
    if (onLocateExternal) {
      onLocateExternal();
      return;
    }

    if (!navigator.geolocation) {
      const msg = "Thiết bị không hỗ trợ định vị.";
      setError(msg);
      toast.error(msg);
      return;
    }

    setError(undefined);
    setIsLocatingInternal(true);

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setIsLocatingInternal(false);
        toast.success("Đã quét vị trí GPS thành công!");
        onChange({
          ...value,
          latitude: String(coords.latitude),
          longitude: String(coords.longitude),
          locationAccuracyMeters: String(Math.round(coords.accuracy)),
          locationSource: "DEVICE_GEOLOCATION",
        });
      },
      (reason) => {
        setIsLocatingInternal(false);
        const errMsg =
          reason.code === 1
            ? "Bạn chưa cấp quyền truy cập vị trí."
            : "Không thể định vị vị trí hiện tại.";
        setError(errMsg);
        toast.error(errMsg);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  };

  const latNum = Number(value.latitude);
  const lngNum = Number(value.longitude);
  const hasValidCoords =
    !Number.isNaN(latNum) &&
    !Number.isNaN(lngNum) &&
    latNum >= -90 &&
    latNum <= 90 &&
    lngNum >= -180 &&
    lngNum <= 180 &&
    value.latitude.trim() !== "" &&
    value.longitude.trim() !== "";

  const mapEmbedUrl = hasValidCoords
    ? `https://maps.google.com/maps?q=${latNum},${lngNum}&z=16&output=embed`
    : null;

  return (
    <div className="space-y-4">
      {!hideLocateButton ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={locate}
            disabled={isLocating}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#e8b363] px-5 text-sm font-bold text-[#17201b] shadow-xs transition-all hover:bg-[#dfa652] disabled:opacity-60"
          >
            {isLocating ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#17201b] border-t-transparent" />
                <span>Đang quét vị trí GPS...</span>
              </>
            ) : (
              <>
                <span>🎯</span>
                <span>Dùng vị trí hiện tại</span>
              </>
            )}
          </button>

          {value.locationAccuracyMeters ? (
            <span
              className={`text-xs sm:text-sm font-bold px-3 py-1.5 rounded-lg border ${
                Number(value.locationAccuracyMeters) > 100
                  ? "bg-[#fff3db] text-[#b2720d] border-[#f3d6a2]"
                  : "bg-[#e8f2ee] text-[#1c553f] border-[#c1e0d3]"
              }`}
            >
              Độ chính xác: ±{value.locationAccuracyMeters}m
            </span>
          ) : null}
        </div>
      ) : null}

      <div>
        <label htmlFor="loc-url" className={labelClass}>
          Google Maps URL
        </label>
        <input
          id="loc-url"
          value={value.googleMapsUrl}
          onChange={(event) => updateUrl(event.target.value)}
          className={inputClass}
          placeholder="Dán đường dẫn https://www.google.com/maps/..."
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="loc-lat" className={labelClass}>
            Vĩ độ (Latitude)
          </label>
          <input
            id="loc-lat"
            value={value.latitude}
            onChange={(event) =>
              onChange({ ...value, latitude: event.target.value, locationSource: "MANUAL" })
            }
            className={inputClass}
            placeholder="Ví dụ: 20.960734"
          />
        </div>

        <div>
          <label htmlFor="loc-lng" className={labelClass}>
            Kinh độ (Longitude)
          </label>
          <input
            id="loc-lng"
            value={value.longitude}
            onChange={(event) =>
              onChange({ ...value, longitude: event.target.value, locationSource: "MANUAL" })
            }
            className={inputClass}
            placeholder="Ví dụ: 105.848554"
          />
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm font-bold text-[#aa2d41]">
          {error}
        </p>
      ) : null}

      {/* Spacious Live Map Preview Frame */}
      {mapEmbedUrl ? (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between text-xs sm:text-sm font-bold text-[#17201b]">
            <span className="flex items-center gap-1.5">
              <span>🗺️</span> Xem trước trực tiếp trên bản đồ
            </span>
            <span className="font-mono text-xs font-semibold text-[#8c6d29] bg-[#f4ebd9] px-2.5 py-0.5 rounded-md border border-[#e5ddcd]">
              {latNum.toFixed(6)}, {lngNum.toFixed(6)}
            </span>
          </div>
          <div className="relative overflow-hidden rounded-xl border border-[#e5ddcd] shadow-xs bg-[#f9f6f0] h-64 w-full">
            <iframe
              title="Xem trước bản đồ Google Maps"
              src={mapEmbedUrl}
              className="h-full w-full border-0"
              loading="lazy"
              allowFullScreen
            />
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[#dcd3c1] bg-[#f9f6f0] p-6 text-center text-sm font-medium text-[#65726a]">
          Nhập tọa độ Vĩ độ & Kinh độ hoặc dán link Google Maps để xem trước bản đồ trực tiếp tại đây.
        </div>
      )}
    </div>
  );
}
