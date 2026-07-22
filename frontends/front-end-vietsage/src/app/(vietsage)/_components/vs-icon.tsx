import type { CSSProperties, ReactNode } from "react";

type VsIconProps = {
  name: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
};

function iconGlyph(name: string): ReactNode {
  switch (name) {
    case "menu":
    case "reorder":
      return (
        <>
          <path d="M3 6h18" />
          <path d="M3 12h18" />
          <path d="M3 18h18" />
        </>
      );

    case "arrow_back":
      return (
        <>
          <path d="M19 12H5" />
          <path d="m12 19-7-7 7-7" />
        </>
      );

    case "arrow_forward":
      return (
        <>
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </>
      );

    case "home":
      return (
        <>
          <path d="m3 10 9-7 9 7" />
          <path d="M5 10v10h14V10" />
          <path d="M9 20v-6h6v6" />
        </>
      );

    case "search":
      return (
        <>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 5 5" />
        </>
      );

    case "add_circle":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v8" />
          <path d="M8 12h8" />
        </>
      );

    case "filter_list":
      return (
        <>
          <path d="M4 7h16" />
          <path d="M7 12h10" />
          <path d="M10 17h4" />
        </>
      );

    case "visibility":
      return (
        <>
          <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      );

    case "visibility_off":
      return (
        <>
          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
          <path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
          <path d="M2 2l20 20" />
        </>
      );

    case "history":
      return (
        <>
          <path d="M4 7v5h5" />
          <path d="M4.8 12a7.2 7.2 0 1 0 2.1-5.1L4 9.8" />
          <path d="M12 8v4l3 2" />
        </>
      );

    case "notifications":
      return (
        <>
          <path d="M6 8a6 6 0 1 1 12 0c0 4.5 1.4 6 2.7 7.3a1 1 0 0 1-.7 1.7H4a1 1 0 0 1-.7-1.7C4.6 14 6 12.5 6 8Z" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </>
      );

    case "calendar":
    case "calendar_today":
      return (
        <>
          <path d="M7 3v4" />
          <path d="M17 3v4" />
          <rect x="4" y="5" width="16" height="16" rx="2" />
          <path d="M4 10h16" />
        </>
      );

    case "chevron_left":
      return <path d="m15 18-6-6 6-6" />;

    case "chevron_right":
      return <path d="m9 18 6-6-6-6" />;

    case "log_out":
    case "logout":
      return (
        <>
          <path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" />
          <path d="M14 16l4-4-4-4" />
          <path d="M18 12H9" />
        </>
      );

    case "person":
    case "account_circle":
      return (
        <>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </>
      );

    case "dashboard":
      return (
        <>
          <rect x="3" y="3" width="8" height="8" rx="1.5" />
          <rect x="13" y="3" width="8" height="5" rx="1.5" />
          <rect x="13" y="10" width="8" height="11" rx="1.5" />
          <rect x="3" y="13" width="8" height="8" rx="1.5" />
        </>
      );

    case "qr_code":
      return (
        <>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <path d="M15 15h2v2h-2z" />
          <path d="M19 15h2v2h-2z" />
          <path d="M15 19h6" />
        </>
      );

    case "qr_code_scanner":
      return (
        <>
          <path d="M5 4H3v5" />
          <path d="M19 4h2v5" />
          <path d="M5 20H3v-5" />
          <path d="M19 20h2v-5" />
          <rect x="7" y="6" width="4" height="4" rx="0.8" />
          <rect x="14" y="6" width="3" height="3" rx="0.7" />
          <rect x="7" y="13" width="3" height="3" rx="0.7" />
          <path d="M14 13h2v2h-2z" />
          <path d="M17 16h-3" />
        </>
      );

    case "info":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" />
          <path d="M12 8h.01" />
        </>
      );

    case "group":
      return (
        <>
          <circle cx="9" cy="9" r="2.5" />
          <circle cx="16" cy="8" r="2" />
          <path d="M4 19a5 5 0 0 1 10 0" />
          <path d="M13 19a4 4 0 0 1 7 0" />
        </>
      );

    case "settings":
      return (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1Z" />
        </>
      );

    case "concierge":
      return (
        <>
          <path d="M4 13h16" />
          <path d="M7 13a5 5 0 1 1 10 0" />
          <path d="M12 8V6" />
          <path d="M3 17h18" />
          <path d="M6 21h12" />
        </>
      );

    case "trending_up":
      return (
        <>
          <path d="M3 17 9 11l4 4 8-8" />
          <path d="M15 7h6v6" />
        </>
      );

    case "person_pin":
      return (
        <>
          <path d="M12 22s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12Z" />
          <circle cx="12" cy="10" r="2.7" />
        </>
      );

    case "door_front":
      return (
        <>
          <path d="M6 3h10a1 1 0 0 1 1 1v17H5V4a1 1 0 0 1 1-1Z" />
          <path d="M10.5 12h.01" />
        </>
      );

    case "hotel":
      return (
        <>
          <path d="M4 12h16" />
          <path d="M6 12V8a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v4" />
          <path d="M14 12V9a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v3" />
          <path d="M5 12v8" />
          <path d="M19 12v8" />
        </>
      );

    case "more_vert":
      return (
        <>
          <circle cx="12" cy="6" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="18" r="1.6" />
        </>
      );

    case "bed":
      return (
        <>
          <path d="M3 12h18" />
          <path d="M5 12V9a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3" />
          <path d="M14 12V10a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v2" />
          <path d="M4 12v6" />
          <path d="M20 12v6" />
        </>
      );

    case "verified":
    case "task_alt":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="m8.5 12.5 2.4 2.4 4.6-4.8" />
        </>
      );

    case "check":
      return <path d="m5 12 4 4 10-10" />;

    case "cleaning_services":
      return (
        <>
          <path d="m4 20 7-7" />
          <path d="M10 7 6 3l4-1 5 5" />
          <path d="m11 13 3 3" />
          <path d="m13 11 7-7" />
        </>
      );

    case "inventory_2":
      return (
        <>
          <path d="M3 8l9-5 9 5-9 5-9-5Z" />
          <path d="M3 8v8l9 5 9-5V8" />
          <path d="M12 13v8" />
        </>
      );

    case "water_drop":
      return <path d="M12 3c3.6 4 6 7.1 6 10a6 6 0 1 1-12 0c0-2.9 2.4-6 6-10Z" />;

    case "phone_in_talk":
      return (
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.8 19.8 0 0 1 3.09 5.18 2 2 0 0 1 5.08 3h3a2 2 0 0 1 2 1.72c.13.8.32 1.58.57 2.3a2 2 0 0 1-.45 2.11L9.1 10.2a16 16 0 0 0 4.7 4.7l1.07-1.1a2 2 0 0 1 2.11-.45c.72.25 1.5.44 2.3.57a2 2 0 0 1 1.72 2Z" />
      );

    case "build":
      return (
        <>
          <path d="M15 4a4 4 0 0 0 4.8 4.8L10.5 18 6 13.5l9.2-9.3A4 4 0 0 0 15 4Z" />
          <path d="m5 19 1.5-1.5" />
        </>
      );

    case "more_horiz":
      return (
        <>
          <circle cx="6" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="18" cy="12" r="1.6" />
        </>
      );

    case "restaurant":
      return (
        <>
          <path d="M6 3v8" />
          <path d="M9 3v8" />
          <path d="M6 7h3" />
          <path d="M7.5 11v10" />
          <path d="M16 3c2 1.5 2 5.5 0 7v11" />
        </>
      );

    case "local_laundry_service":
      return (
        <path d="M20.4 3.5 16 2a4 4 0 0 1-8 0L3.6 3.5a2 2 0 0 0-1.3 2.2l.6 3.5a1 1 0 0 0 1 .8H6v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10h2.1a1 1 0 0 0 1-.8l.6-3.5a2 2 0 0 0-1.3-2.2Z" />
      );

    case "question_answer":
      return (
        <>
          <path d="M4 5h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
          <path d="M18 9h2a2 2 0 0 1 2 2v7l-3-2h-1" />
        </>
      );

    case "support_agent":
      return (
        <>
          <path d="M4 13a8 8 0 1 1 16 0" />
          <path d="M4 13v4a2 2 0 0 0 2 2h1v-6H6a2 2 0 0 0-2 2Z" />
          <path d="M20 13v4a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2Z" />
          <path d="M10 20h4" />
        </>
      );

    case "meeting_room":
      return (
        <>
          <path d="M5 3h10a1 1 0 0 1 1 1v16H5z" />
          <path d="M9 12h.01" />
          <path d="M16 7h3v10h-3" />
        </>
      );

    case "edit_note":
      return (
        <>
          <path d="M4 4h12a2 2 0 0 1 2 2v4" />
          <path d="M4 8h8" />
          <path d="M4 12h6" />
          <path d="M4 20h8" />
          <path d="m13 18 5-5 2 2-5 5-3 1z" />
        </>
      );

    case "edit":
      return (
        <>
          <path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16z" />
          <path d="m13.5 6.5 4 4" />
        </>
      );

    case "delete":
      return (
        <>
          <path d="M4 7h16" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
          <path d="M6 7l1 14h10l1-14" />
          <path d="M9 7V4h6v3" />
        </>
      );

    case "block":
      return (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="m7.5 7.5 9 9" />
        </>
      );

    case "close":
      return (
        <>
          <path d="m6 6 12 12" />
          <path d="M18 6 6 18" />
        </>
      );

    case "key":
      return (
        <>
          <circle cx="8" cy="15" r="4" />
          <path d="m11 12 8-8" />
          <path d="m16 7 2 2" />
          <path d="m14 9 2 2" />
        </>
      );

    case "schedule":
      return (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v5l3 2" />
        </>
      );

    case "verified_user":
      return (
        <>
          <path d="M12 3 5 6v5c0 5 3.5 8.5 7 10 3.5-1.5 7-5 7-10V6z" />
          <path d="m9.5 12 1.8 1.8 3.5-3.8" />
        </>
      );

    case "eco":
      return (
        <>
          <path d="M5 13c0-5 4-8 11-8 0 6.5-3 11-8 11-1.7 0-3-1.3-3-3Z" />
          <path d="M6 18c2-2.5 5-4.5 9-6" />
        </>
      );

    case "send":
      return (
        <>
          <path d="M21 3 3 11l7 3 3 7 8-18Z" />
          <path d="M10 14 21 3" />
        </>
      );

    case "download":
      return (
        <>
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 20h14" />
        </>
      );

    default:
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 16h.01" />
          <path d="M12 8v5" />
        </>
      );
  }
}

export function VsIcon({ name, className, style, title }: VsIconProps) {
  return (
    <span className={className} style={style} aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      <svg
        viewBox="0 0 24 24"
        width="1em"
        height="1em"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="inline-block align-middle"
      >
        {title ? <title>{title}</title> : null}
        {iconGlyph(name)}
      </svg>
    </span>
  );
}

