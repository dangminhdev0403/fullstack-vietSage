import Image from "next/image";
import Link from "next/link";

type VsSidebarProps = {
  active: "dashboard" | "requests" | "rooms" | "staff" | "settings";
};

const items = [
  { key: "dashboard", label: "Dashboard", href: "/admin/dashboard" },
  { key: "requests", label: "Service Requests", href: "/admin/dashboard" },
  { key: "rooms", label: "Room Management", href: "/admin/dashboard" },
  { key: "staff", label: "Staff Directory", href: "/admin/dashboard" },
  { key: "settings", label: "Settings", href: "/admin/dashboard" },
] as const;

export function VsSidebar({ active }: VsSidebarProps) {
  return (
    <aside className="hidden rounded-2xl bg-[var(--surface-container-low)] p-5 lg:block">
      <div className="mb-8 rounded-xl bg-[var(--primary)] p-4 text-[var(--on-primary)]">
        <div className="mb-3 flex items-center gap-3">
          <Image
            src="/brand/vietsage-icon.png"
            alt="VietSage icon"
            width={44}
            height={44}
            className="h-11 w-11 object-contain"
          />
          <div>
            <p className="vs-display text-lg font-semibold tracking-[0.14em]">VIETSAGE</p>
            <p className="text-xs opacity-90">VietSage Luxury</p>
          </div>
        </div>
        <p className="text-sm font-semibold">Admin Portal</p>
      </div>
      <ul className="space-y-2">
        {items.map((item) => {
          const isActive = item.key === active;

          return (
            <li key={item.key}>
              <Link
                href={item.href}
                className={`block rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[var(--secondary-container)] text-[var(--on-secondary-container)]"
                    : "text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-high)]"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

