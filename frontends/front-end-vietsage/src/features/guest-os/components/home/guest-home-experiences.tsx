"use client";

import Image from "next/image";
import Link from "next/link";

import { GuestReveal } from "../motion/guest-reveal";

const diningImage = "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=80";
const spaImage = "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1200&q=80";

export type GuestHomeExperience = { eyebrow: string; title: string; description: string; alt: string };

function ExperienceCard({ item, image, sizes }: { item: GuestHomeExperience; image: string; sizes: string }) {
  return (
    <Link href="/g/services" className="group relative block min-h-[320px] overflow-hidden rounded-lg shadow-[0_22px_52px_rgba(31,61,53,0.16)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b18b26]">
      <Image src={image} alt={item.alt} fill sizes={sizes} className="object-cover transition-transform duration-300 motion-safe:md:group-hover:scale-[1.025]" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#18211d]/88 via-[#18211d]/18 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-6 text-white">
        <p className="text-sm font-semibold text-[#f4d36f]">{item.eyebrow}</p>
        <h2 className="mt-2 text-3xl font-semibold leading-tight">{item.title}</h2>
        <p className="mt-2 text-sm leading-6 text-white/78">{item.description}</p>
      </div>
    </Link>
  );
}

export function GuestHomeExperiences({ dining, care }: { dining: GuestHomeExperience; care: GuestHomeExperience }) {
  return (
    <section className="vs-container grid gap-4 px-4 pb-12 md:grid-cols-[1.2fr_0.8fr] md:pb-16">
      <GuestReveal><ExperienceCard item={dining} image={diningImage} sizes="(min-width: 768px) 60vw, 100vw" /></GuestReveal>
      <GuestReveal delay={0.06}><ExperienceCard item={care} image={spaImage} sizes="(min-width: 768px) 40vw, 100vw" /></GuestReveal>
    </section>
  );
}

