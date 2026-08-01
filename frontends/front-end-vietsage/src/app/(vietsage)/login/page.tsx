import { permanentRedirect } from "next/navigation";

import { LOGIN_PATH } from "@/features/auth/utils/login-route";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function LegacyLoginPage({ searchParams }: Props) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item);
  }
  permanentRedirect(`${LOGIN_PATH}${params.size ? `?${params}` : ""}`);
}
