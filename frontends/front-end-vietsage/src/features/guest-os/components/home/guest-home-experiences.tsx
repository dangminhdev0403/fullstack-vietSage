"use client";

import Image from "next/image";
import Link from "next/link";

import { GuestReveal } from "../motion/guest-reveal";

const diningImage = "https://lh3.googleusercontent.com/aida-public/AB6AXuDXM0kt_WMMmzSxfZEVpa0Z0DchZESlCNbyzVKGrHS_OccnhPY8_Y4Q2Lzh-5f2-ASXzuoKHOjFlFSbv2I8kQLMSkQY1UStUcZ-Njwzjk4xcQZnUKceheUjBig1oRC-_GYnTrtE9uc1Ab5gj4tsgYGUWitROyXQQuwwn9z2T13GbaABZxZj13uEVEymaPI_VizfMJa27urVVwtAqIoIU-jh-J735qx5lV2szkYk2Pqb1TPI7vjpJt8b2S4fcFrG-qvT39bUDbAXjhQ";
const spaImage = "https://lh3.googleusercontent.com/aida-public/AB6AXuA2jpiq4gCQ8iu2W6tjojXn8cE6RAPo9aj_U1tKEro3rZ7fNxTIm2FLg7kfYKz-2oFGuB0UhMTfoSel_aeOW5_7rphVTeiTleVdlN-xAgyR0j4m42fLlUuZVOdnK1Fzi4fQp7dgTSvqAlFjGrTGekNktfipI1g2cZ5gFzd4tTgSwykCi3gfrp7AO3DzfSFr-0SPXZZbtDe7mo57KjhHzGfYoCsYAtxaSiH_ru1WiKfUXvWe3zs5LNjsnthIwB1yeZ9ArxbY4eAW9TE";

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

