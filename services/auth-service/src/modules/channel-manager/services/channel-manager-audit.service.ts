import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";

export interface RecordAuditParams {
  actorId?: string | null;
  tenantId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface RecordHotelAuditParams {
  actorId?: string | null;
  hotelId: string;
  action: string;
  entityType?: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

const SENSITIVE_KEY_PATTERN = /(api[_-]?key|token|secret|password|credential|iframe.*url|raw.*error|authorization)/i;

@Injectable()
export class ChannelManagerAuditService {
  private readonly logger = new Logger(ChannelManagerAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ghi log kiểm toán cho thao tác nhạy cảm của Channel Manager
   */
  async record(params: RecordAuditParams) {
    const sanitizedMetadata = this.sanitizeMetadata(params.metadata);

    try {
      return await this.prisma.auditLog.create({
        data: {
          actorId: params.actorId ?? null,
          tenantId: params.tenantId,
          action: params.action,
          entityType: params.entityType,
          entityId: params.entityId ?? null,
          metadata: sanitizedMetadata as any,
        },
      });
    } catch (err) {
      this.logger.error(
        `[Audit Failure] Failed to record audit log for action "${params.action}" on ${params.entityType}:${params.entityId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }

  /**
   * Helper ghi log kiểm toán theo hotelId (tự động tra cứu tenantId)
   */
  async recordHotelAction(params: RecordHotelAuditParams) {
    const hotel = await this.prisma.hotel.findUnique({
      where: { id: params.hotelId },
      select: { id: true, tenantId: true },
    });

    if (!hotel) {
      this.logger.error(`[Audit Failure] Hotel not found: ${params.hotelId}`);
      throw new NotFoundException(`Không tìm thấy khách sạn ${params.hotelId} khi ghi log kiểm toán`);
    }

    return this.record({
      actorId: params.actorId,
      tenantId: hotel.tenantId,
      action: params.action,
      entityType: params.entityType ?? "Hotel",
      entityId: params.entityId ?? params.hotelId,
      metadata: params.metadata,
    });
  }

  /**
   * Làm sạch và che giấu toàn bộ thông tin nhạy cảm trước khi lưu vào AuditLog
   */
  public sanitizeMetadata(metadata?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!metadata || typeof metadata !== "object") return undefined;
    return this.deepSanitize(metadata) as Record<string, unknown>;
  }

  private deepSanitize(val: unknown): unknown {
    if (val === null || val === undefined) return val;
    if (Array.isArray(val)) {
      return val.map((item) => this.deepSanitize(item));
    }
    if (typeof val === "object") {
      if (val instanceof Error) {
        return {
          name: val.name,
          message: val.message,
        };
      }

      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(val as Record<string, unknown>)) {
        if (SENSITIVE_KEY_PATTERN.test(key)) {
          out[key] = "[REDACTED]";
        } else {
          out[key] = this.deepSanitize(value);
        }
      }
      return out;
    }
    return val;
  }
}
