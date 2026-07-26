import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";

export type TemporaryPasswordResult = {
  userId: string;
  temporaryPassword: string;
  resetAt: string;
};

export const adminRepository = {
  async resetTenantOwnerPassword(tenantOwnerId: string): Promise<TemporaryPasswordResult> {
    const payload = await requestInternalApiEnvelope<TemporaryPasswordResult>(
      `/api/admin/tenant-owners/${encodeURIComponent(tenantOwnerId)}/reset-password`,
      { method: "POST", body: {} },
    );
    return payload.data;
  },
};
