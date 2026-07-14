"use client";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { GuestStagger, GuestStaggerItem } from "../motion/guest-stagger";

export type GuestHomeHighlight = { icon: string; title: string; description: string };

export function GuestHomeHighlights({ items }: { items: GuestHomeHighlight[] }) {
  return (
    <section className="vs-container relative z-10 px-4 py-12 md:py-16">
      <GuestStagger className="grid gap-4 md:grid-cols-3">
        {items.map((item) => (
          <GuestStaggerItem key={item.title} className="h-full">
            <article className="vs-comfort-card h-full rounded-lg p-5 transition-shadow duration-200 motion-safe:md:hover:shadow-[0_18px_44px_rgba(31,61,53,0.12)]">
              <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-[#f4d36f] text-[#25483f]"><VsIcon name={item.icon} className="text-2xl" /></div>
              <h2 className="text-lg font-bold text-[#18211d]">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-[#5e6a62]">{item.description}</p>
            </article>
          </GuestStaggerItem>
        ))}
      </GuestStagger>
    </section>
  );
}

