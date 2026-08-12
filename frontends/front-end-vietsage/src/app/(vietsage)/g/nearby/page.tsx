"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function GuestNearbyPartnersPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/g/services?tab=external");
  }, [router]);

  return <div className="min-h-screen bg-[#fffdfa]" />;
}
