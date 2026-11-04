import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";

export type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
};

export type ChangePasswordResult = {
  changed: true;
};

export type AuthSessionData = {
  user?: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  activeRoleCode?: string | null;
  authError?: string | null;
  [key: string]: unknown;
};

export const authRepository = {
  async getSession(): Promise<AuthSessionData | null> {
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      if (!response.ok) return null;
      return (await response.json()) as AuthSessionData;
    } catch {
      return null;
    }
  },

  async changePassword(input: ChangePasswordInput): Promise<ChangePasswordResult> {
    const payload = await requestInternalApiEnvelope<ChangePasswordResult>("/api/auth/change-password", {
      method: "POST",
      body: input,
    });

    return payload.data;
  },
};
