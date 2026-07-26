import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";

export type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
};

export type ChangePasswordResult = {
  changed: true;
};

export const authRepository = {
  async changePassword(input: ChangePasswordInput): Promise<ChangePasswordResult> {
    const payload = await requestInternalApiEnvelope<ChangePasswordResult>("/api/auth/change-password", {
      method: "POST",
      body: input,
    });

    return payload.data;
  },
};
