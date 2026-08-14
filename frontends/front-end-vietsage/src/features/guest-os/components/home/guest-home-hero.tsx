"use client";

import Image from "next/image";
import Link from "next/link";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { GuestStagger, GuestStaggerItem } from "../motion/guest-stagger";

const heroImage = "https://lh3.googleusercontent.com/aida-public/AB6AXuBLf-YgBzrAgVSZdKcO9N6jpI4lupnOTcOHfUkeGXB57Dlu87twUYSLuWmT9IOKxvna_fxW7cAmK9NUD2Nyjvi65lpkRMiABK9ITeGQnSpNE87Y4BOdW-oupeenR4uCeaq59Vwj6WeDl2ztZjekTZ81na-b6VBz7LkAtogRJ5RJgKf9N30jQC_INQ7nvHrk1KaMJbUgeHqxL-TqqEFTHsEvo3b6QXUfcm7piR-6miQr_6U1N-wX4KCupu6muvYa6qYMTmgdZmYX9DI";

type GuestHomeHeroProps = {
  greeting: string;
  title: string;
  description: string;
  primaryLabel: string;
  secondaryLabel: string;
  imageAlt: string;
};

export function GuestHomeHero(props: GuestHomeHeroProps) {
  return (
    <section className="relative min-h-[calc(100dvh-4rem)] overflow-hidden">
      <Image src={heroImage} alt={props.imageAlt} fill priority sizes="100vw" className="object-cover" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(24,33,29,0.88)_0%,rgba(24,33,29,0.64)_48%,rgba(24,33,29,0.22)_100%)]" />
      <div className="vs-container relative z-10 flex min-h-[calc(100dvh-4rem)] items-center px-4 py-12">
        <GuestStagger className="max-w-2xl text-white" interval={0.07}>
          <GuestStaggerItem><p className="text-sm font-semibold text-[#f4d36f]">{props.greeting}</p></GuestStaggerItem>
          <GuestStaggerItem><h1 className="mt-4 text-[42px] font-semibold leading-[1.04] md:text-[72px]">{props.title}</h1></GuestStaggerItem>
          <GuestStaggerItem><p className="mt-5 max-w-xl text-base leading-7 text-white/82 md:text-lg">{props.description}</p></GuestStaggerItem>
          <GuestStaggerItem>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/g/services" className="vs-touch-button inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-[#f4d36f] px-7 text-sm font-bold text-[#18211d] shadow-[0_18px_42px_rgba(0,0,0,0.24)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                {props.primaryLabel}<VsIcon name="arrow_forward" className="text-base" />
              </Link>
              <Link href="/g/requests" className="vs-touch-button inline-flex min-h-14 items-center justify-center gap-2 rounded-full border border-white/35 bg-white/12 px-7 text-sm font-bold text-white backdrop-blur transition-colors hover:bg-white/18 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f4d36f]">
                {props.secondaryLabel}<VsIcon name="chevron_right" className="text-lg" />
              </Link>
            </div>
          </GuestStaggerItem>
        </GuestStagger>
      </div>
    </section>
  );
}

