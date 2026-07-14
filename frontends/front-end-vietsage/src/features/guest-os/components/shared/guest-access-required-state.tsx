"use client";

import type { ReactNode } from "react";

import { useGuestI18n } from "../../i18n/use-guest-i18n";
import { GuestStateCard } from "./guest-state-card";

export function GuestAccessRequiredState({ icon }: { icon: ReactNode }) {
  const { t } = useGuestI18n();

  return <GuestStateCard title={t("common.scanQrTitle")} message={t("common.scanQrMessage")} icon={icon} />;
}

