"use client";

import { useState } from "react";

interface ChannelLogoProps {
  code: string;
  title: string;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

interface ChannelBrandConfig {
  officialDomain?: string;
  nativeSvg?: "booking" | "airbnb" | "agoda" | "expedia" | "trip" | "traveloka" | "google" | "vrbo";
  brandColors?: { bg: string; text: string; ring: string };
}

/**
 * Normalizes a code or title into a compact lowercase alphanumeric token.
 * Example: "Booking.com" -> "bookingcom", "Cakrahub Booking Engine" -> "cakrahubbookingengine"
 */
function cleanKey(val: string): string {
  return (val || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * EXACT dictionary of verified global OTAs and channels.
 * IMPORTANT: Strictly match exact keys only — NEVER use loose substring matching (.includes)
 * so non-standard engines like "Cakrahub Booking Engine" or "JoodBooking" do not inherit
 * Booking.com's brand logo falsely.
 */
const EXACT_KNOWN_CHANNELS: Record<string, ChannelBrandConfig> = {
  // Booking.com (Strict: only BookingCom, bdc, booking)
  bookingcom: { officialDomain: "booking.com", nativeSvg: "booking" },
  booking: { officialDomain: "booking.com", nativeSvg: "booking" },
  bdc: { officialDomain: "booking.com", nativeSvg: "booking" },

  // Airbnb (Strict: airbnb, abb)
  airbnb: { officialDomain: "airbnb.com", nativeSvg: "airbnb" },
  abb: { officialDomain: "airbnb.com", nativeSvg: "airbnb" },

  // Agoda (Strict: agoda, agodahomes)
  agoda: { officialDomain: "agoda.com", nativeSvg: "agoda" },
  agodahomes: { officialDomain: "agoda.com", nativeSvg: "agoda" },

  // Expedia (Strict: expedia, exp)
  expedia: { officialDomain: "expedia.com", nativeSvg: "expedia" },
  exp: { officialDomain: "expedia.com", nativeSvg: "expedia" },

  // Trip.com & Ctrip
  tripcom: { officialDomain: "trip.com", nativeSvg: "trip" },
  trip: { officialDomain: "trip.com", nativeSvg: "trip" },
  ctrip: { officialDomain: "ctrip.com", nativeSvg: "trip" },

  // Traveloka
  traveloka: { officialDomain: "traveloka.com", nativeSvg: "traveloka" },

  // Google
  google: { officialDomain: "google.com", nativeSvg: "google" },
  googlehotelads: { officialDomain: "google.com", nativeSvg: "google" },
  googlehotels: { officialDomain: "google.com", nativeSvg: "google" },

  // Vrbo
  vrbo: { officialDomain: "vrbo.com", nativeSvg: "vrbo" },

  // Hostelworld
  hostelworld: {
    officialDomain: "hostelworld.com",
    brandColors: { bg: "from-[#ff6600] to-[#cc5200]", text: "text-white", ring: "ring-[#ff6600]/30" },
  },

  // Tiket.com
  tiketcom: {
    officialDomain: "tiket.com",
    brandColors: { bg: "from-[#0064d2] to-[#004bb5]", text: "text-[#fedd00]", ring: "ring-blue-500/30" },
  },
  tiket: {
    officialDomain: "tiket.com",
    brandColors: { bg: "from-[#0064d2] to-[#004bb5]", text: "text-[#fedd00]", ring: "ring-blue-500/30" },
  },

  // Klook
  klook: {
    officialDomain: "klook.com",
    brandColors: { bg: "from-[#ff5722] to-[#e64a19]", text: "text-white", ring: "ring-orange-500/30" },
  },

  // Hotelbeds
  hotelbeds: {
    officialDomain: "hotelbeds.com",
    brandColors: { bg: "from-[#e4002b] to-[#b80022]", text: "text-white", ring: "ring-red-500/30" },
  },

  // Despegar
  despegar: {
    officialDomain: "despegar.com",
    brandColors: { bg: "from-[#7b1fa2] to-[#51136d]", text: "text-white", ring: "ring-purple-500/30" },
  },

  // Ostrovok / Emerging Travel
  ostrovok: {
    officialDomain: "ostrovok.ru",
    brandColors: { bg: "from-[#00a896] to-[#028072]", text: "text-white", ring: "ring-teal-500/30" },
  },

  // Feratel
  feratel: {
    officialDomain: "feratel.com",
    brandColors: { bg: "from-[#005096] to-[#003666]", text: "text-white", ring: "ring-blue-600/30" },
  },

  // HyperGuest
  hyperguest: {
    officialDomain: "hyperguest.com",
    brandColors: { bg: "from-[#1a1a2e] to-[#16213e]", text: "text-white", ring: "ring-indigo-500/30" },
  },

  // SiteMinder
  siteminder: {
    officialDomain: "siteminder.com",
    brandColors: { bg: "from-[#00a3e0] to-[#0077c8]", text: "text-white", ring: "ring-sky-500/30" },
  },

  // D-EDGE
  dedge: {
    officialDomain: "d-edge.com",
    brandColors: { bg: "from-[#111827] to-[#1f2937]", text: "text-emerald-400", ring: "ring-emerald-500/30" },
  },

  // Channex
  channex: {
    officialDomain: "channex.io",
    brandColors: { bg: "from-emerald-600 to-teal-800", text: "text-white", ring: "ring-emerald-500/30" },
  },

  // TripAdvisor
  tripadvisor: {
    officialDomain: "tripadvisor.com",
    brandColors: { bg: "from-[#00af87] to-[#008768]", text: "text-white", ring: "ring-emerald-500/30" },
  },

  // Trivago
  trivago: {
    officialDomain: "trivago.com",
    brandColors: { bg: "from-[#007fad] to-[#005575]", text: "text-white", ring: "ring-sky-500/30" },
  },

  // Kayak
  kayak: {
    officialDomain: "kayak.com",
    brandColors: { bg: "from-[#ff690f] to-[#d45000]", text: "text-white", ring: "ring-orange-500/30" },
  },

  // Priceline
  priceline: {
    officialDomain: "priceline.com",
    brandColors: { bg: "from-[#0050aa] to-[#002f6c]", text: "text-white", ring: "ring-blue-600/30" },
  },

  // Rakuten Travel
  rakuten: {
    officialDomain: "rakuten.co.jp",
    brandColors: { bg: "from-[#bf0000] to-[#8c0000]", text: "text-white", ring: "ring-red-600/30" },
  },
  rakutentravel: {
    officialDomain: "rakuten.co.jp",
    brandColors: { bg: "from-[#bf0000] to-[#8c0000]", text: "text-white", ring: "ring-red-600/30" },
  },
};

/**
 * Deterministic color palettes for unverified channels to ensure each channel
 * gets a distinct, pleasant, and permanent brand badge rather than all looking identical.
 */
const DETERMINISTIC_PALETTES = [
  { bg: "from-indigo-600 to-blue-800", text: "text-white", ring: "ring-indigo-400/30" },
  { bg: "from-emerald-600 to-teal-800", text: "text-white", ring: "ring-emerald-400/30" },
  { bg: "from-purple-600 to-violet-900", text: "text-white", ring: "ring-purple-400/30" },
  { bg: "from-amber-600 to-orange-800", text: "text-white", ring: "ring-amber-400/30" },
  { bg: "from-rose-600 to-pink-800", text: "text-white", ring: "ring-rose-400/30" },
  { bg: "from-cyan-600 to-blue-700", text: "text-white", ring: "ring-cyan-400/30" },
  { bg: "from-teal-600 to-emerald-900", text: "text-white", ring: "ring-teal-400/30" },
  { bg: "from-fuchsia-600 to-pink-900", text: "text-white", ring: "ring-fuchsia-400/30" },
  { bg: "from-slate-700 to-slate-900", text: "text-slate-100", ring: "ring-slate-400/30" },
  { bg: "from-blue-700 to-indigo-950", text: "text-white", ring: "ring-blue-400/30" },
  { bg: "from-emerald-700 to-green-950", text: "text-white", ring: "ring-emerald-400/30" },
  { bg: "from-sky-600 to-indigo-800", text: "text-white", ring: "ring-sky-400/30" },
];

function getDeterministicTheme(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % DETERMINISTIC_PALETTES.length;
  return DETERMINISTIC_PALETTES[index];
}

/**
 * Extracts 2 clean uppercase initials from a title or code.
 * Example: "Cakrahub Booking Engine" -> "CB", "JoodBooking" -> "JB", "Julian Alps Booking" -> "JA"
 */
function getInitials(title: string, code: string): string {
  const cleanTitle = (title || "").replace(/\.com|\.vn|\.io|\.net/gi, "").trim();
  const words = cleanTitle.split(/[\s_\-]+/).filter(Boolean);

  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  // Single word with PascalCase or CamelCase (e.g. JoodBooking -> JB)
  const source = words[0] || code || "CH";
  const uppercaseMatches = source.match(/[A-Z]/g);
  if (uppercaseMatches && uppercaseMatches.length >= 2) {
    return (uppercaseMatches[0] + uppercaseMatches[1]).toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}

/**
 * Native vector SVGs for major OTAs for zero latency and razor-sharp rendering.
 */
function renderNativeSvg(svgType?: ChannelBrandConfig["nativeSvg"]) {
  if (!svgType) return null;

  switch (svgType) {
    case "booking":
      return (
        <svg viewBox="0 0 40 40" className="w-full h-full" fill="none">
          <rect width="40" height="40" rx="10" fill="#003580" />
          <path
            d="M13 10h8c3.314 0 6 2.015 6 4.5S24.5 19 22 19.5c3.038.5 5 2.5 5 5.5 0 3-2.686 5-6 5h-8V10zm4.5 4v4h3.5c1.38 0 2.5-.9 2.5-2s-1.12-2-2.5-2h-3.5zm0 7v5h4c1.38 0 2.5-1.12 2.5-2.5s-1.12-2.5-2.5-2.5h-4z"
            fill="#ffffff"
          />
          <circle cx="28.5" cy="27" r="2.2" fill="#00baff" />
        </svg>
      );

    case "airbnb":
      return (
        <svg viewBox="0 0 40 40" className="w-full h-full" fill="none">
          <rect width="40" height="40" rx="10" fill="#ffffff" />
          <path
            d="M20 7.5c-3.1 0-5.7 2.3-6.6 6.3-.9 4 .3 8.3 2.9 12.4 1.2 1.9 2.5 3.7 3.7 5.3 1.2-1.6 2.5-3.4 3.7-5.3 2.6-4.1 3.8-8.4 2.9-12.4-.9-4-3.5-6.3-6.6-6.3zm0 4.2c1.4 0 2.5 1.1 2.5 2.5 0 1.4-1.1 2.5-2.5 2.5s-2.5-1.1-2.5-2.5c0-1.4 1.1-2.5 2.5-2.5zm0 15.6c-2.3-3.4-3.3-6.8-2.6-9.7.3-1.3 1-2.3 2.6-2.3s2.3 1 2.6 2.3c.7 2.9-.3 6.3-2.6 9.7z"
            fill="#FF385C"
          />
        </svg>
      );

    case "agoda":
      return (
        <svg viewBox="0 0 40 40" className="w-full h-full" fill="none">
          <rect width="40" height="40" rx="10" fill="#20274d" />
          <circle cx="12" cy="17" r="3.2" fill="#e53935" />
          <circle cx="17.5" cy="12" r="3.2" fill="#fdd835" />
          <circle cx="23.5" cy="12" r="3.2" fill="#43a047" />
          <circle cx="28.5" cy="17" r="3.2" fill="#1e88e5" />
          <circle cx="20" cy="21.5" r="3.2" fill="#8e24aa" />
          <path
            d="M12 28h16"
            stroke="#ffffff"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      );

    case "expedia":
      return (
        <svg viewBox="0 0 40 40" className="w-full h-full" fill="none">
          <rect width="40" height="40" rx="10" fill="#00355f" />
          <path
            d="M28 14.5l-4.5 1.5-6-7.5-2 1 3.5 8-4.5 1.5-2.5-2.5-1.5.5 1.5 4 4 1.5.5-1.5-2.5-2.5 4.5-1.5 8 3.5 1-2-7.5-6 4.5-1.5c1.5-.5 2.5-1.5 2-2.5-.5-1-1.5-.5-2 0z"
            fill="#ffd200"
          />
          <text
            x="20"
            y="31"
            textAnchor="middle"
            fontSize="7.5"
            fontWeight="900"
            fill="#ffffff"
            fontFamily="system-ui, sans-serif"
            letterSpacing="0.5"
          >
            EXPEDIA
          </text>
        </svg>
      );

    case "trip":
      return (
        <svg viewBox="0 0 40 40" className="w-full h-full" fill="none">
          <rect width="40" height="40" rx="10" fill="#2681ff" />
          <path
            d="M20 11l2.5 6 6.5.5-5 4.5 1.5 6.5-5.5-3.5-5.5 3.5 1.5-6.5-5-4.5 6.5-.5z"
            fill="#ffffff"
          />
          <text
            x="20"
            y="32"
            textAnchor="middle"
            fontSize="7"
            fontWeight="bold"
            fill="#ffffff"
            fontFamily="system-ui, sans-serif"
          >
            Trip.com
          </text>
        </svg>
      );

    case "traveloka":
      return (
        <svg viewBox="0 0 40 40" className="w-full h-full" fill="none">
          <rect width="40" height="40" rx="10" fill="#0194f3" />
          <path
            d="M28 13c-2.5 0-5 1.2-6.5 3.2L14 26l6 2 7-9c1-1.2 2.5-2 4-2l-3-4z"
            fill="#ffffff"
          />
          <circle cx="26" cy="18" r="1.5" fill="#0194f3" />
        </svg>
      );

    case "google":
      return (
        <svg viewBox="0 0 40 40" className="w-full h-full" fill="none">
          <rect width="40" height="40" rx="10" fill="#ffffff" stroke="#e2e8f0" />
          <path
            d="M28.5 20.3c0-.7-.06-1.3-.18-1.9H20v3.6h4.8c-.2 1.1-.8 2.1-1.8 2.8v2.3h2.9c1.7-1.6 2.7-3.9 2.7-6.8z"
            fill="#4285F4"
          />
          <path
            d="M20 29c2.4 0 4.5-.8 6-2.2l-2.9-2.3c-.8.5-1.9.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H12v2.4C13.5 26.9 16.5 29 20 29z"
            fill="#34A853"
          />
          <path
            d="M14.9 21.6c-.2-.5-.3-1.1-.3-1.6 0-.6.1-1.1.3-1.6V16H12c-.6 1.2-1 2.5-1 4s.4 2.8 1 4l2.9-2.4z"
            fill="#FBBC05"
          />
          <path
            d="M20 14.4c1.3 0 2.5.5 3.4 1.3l2.6-2.6C24.4 11.7 22.3 11 20 11c-3.5 0-6.5 2.1-8 5.1l2.9 2.4c.7-2.2 2.7-4.1 5.1-4.1z"
            fill="#EA4335"
          />
        </svg>
      );

    case "vrbo":
      return (
        <svg viewBox="0 0 40 40" className="w-full h-full" fill="none">
          <rect width="40" height="40" rx="10" fill="#173456" />
          <text
            x="20"
            y="25"
            textAnchor="middle"
            fontSize="13"
            fontWeight="900"
            fill="#2de0b5"
            fontFamily="system-ui, sans-serif"
            letterSpacing="-0.5"
          >
            vrbo
          </text>
        </svg>
      );

    default:
      return null;
  }
}

export function ChannelLogo({
  code,
  title,
  className = "",
  size = "md",
}: ChannelLogoProps) {
  const [imgFailed, setImgFailed] = useState(false);

  // Exact matching only
  const codeKey = cleanKey(code);
  const titleKey = cleanKey(title);
  const brandConfig = EXACT_KNOWN_CHANNELS[codeKey] || EXACT_KNOWN_CHANNELS[titleKey];

  const nativeSvg = renderNativeSvg(brandConfig?.nativeSvg);
  const initials = getInitials(title, code);

  const theme = brandConfig?.brandColors ?? getDeterministicTheme(codeKey || titleKey || "vietsage");

  const sizeClasses = {
    sm: "h-8 w-8 text-xs rounded-xl",
    md: "h-12 w-12 text-sm rounded-2xl",
    lg: "h-14 w-14 text-base rounded-2xl",
    xl: "h-16 w-16 text-lg rounded-2xl",
  }[size];

  // 1. If we have an exact official inline SVG (Booking.com, Airbnb, Agoda, Expedia, etc.)
  if (nativeSvg) {
    return (
      <div
        className={`relative shrink-0 overflow-hidden shadow-2xs border border-slate-200/80 bg-white p-1 flex items-center justify-center transition-transform hover:scale-105 ${sizeClasses} ${className}`}
        title={title}
      >
        {nativeSvg}
      </div>
    );
  }

  // 2. If we have a verified official domain (and not failed), try high-res favicon
  if (brandConfig?.officialDomain && !imgFailed) {
    return (
      <div
        className={`relative shrink-0 overflow-hidden shadow-2xs border border-slate-200/80 bg-white p-1.5 flex items-center justify-center transition-transform hover:scale-105 ${sizeClasses} ${className}`}
        title={title}
      >
        <img
          src={`https://www.google.com/s2/favicons?domain=${brandConfig.officialDomain}&sz=128`}
          alt={title}
          loading="lazy"
          onError={() => setImgFailed(true)}
          className="h-full w-full object-contain rounded-md"
        />
      </div>
    );
  }

  // 3. For all other channels or unverified engines: render clean, high-contrast typography badge
  // NEVER blindly guess random .com domains or falsely display other company logos!
  return (
    <div
      className={`relative shrink-0 overflow-hidden shadow-2xs bg-gradient-to-br ${theme.bg} ${theme.text} flex items-center justify-center font-black tracking-wider uppercase ring-1 ${theme.ring} select-none transition-transform hover:scale-105 ${sizeClasses} ${className}`}
      title={title}
    >
      <span className="font-mono">{initials}</span>
    </div>
  );
}
