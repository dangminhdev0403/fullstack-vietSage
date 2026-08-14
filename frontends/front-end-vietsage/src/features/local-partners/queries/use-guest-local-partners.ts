"use client";

import { useQuery } from "@tanstack/react-query";
import { guestLocalPartnersResource } from "../resources/guest-local-partners-resource";
import type { GuestLocaleCode } from "@/features/guest-os/types/guest-os-contract";

export function useGuestLocalPartners(sessionToken: string, categoryId?: string, locale?: GuestLocaleCode) {
  const resource = guestLocalPartnersResource.bind({ sessionToken, locale });
  const enabled = Boolean(sessionToken);
  const categories = useQuery({ ...resource.queries.categories.options(undefined as never), enabled });
  const partners = useQuery({ ...resource.queries.list.options({ categoryId }), enabled });
  return { categories, partners };
}
