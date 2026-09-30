import { BadGatewayException, BadRequestException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  ChannexApiClient,
  type ChannexChannelAdapter,
  type ChannexChannelAdapterResource,
  type ChannexChannelConnectionResource,
  type ChannexPropertyResource,
  type ChannexResponse,
} from "./channex-api-client.service";

function channelAdapterAttributes(provider: ChannexChannelAdapterResource): ChannexChannelAdapter {
  return "attributes" in provider ? provider.attributes : provider;
}

function channelConnectionAttributes(channel: ChannexChannelConnectionResource) {
  return channel.attributes ?? channel;
}

interface RemoteRoomRate {
  id: string | number;
  occupancies?: number[];
}

interface RemoteRoom {
  id: string | number;
  rates?: RemoteRoomRate[];
}

type ChannelSettingValue = string | number | boolean;
type ChannelSettings = Record<string, ChannelSettingValue>;
const NATIVE_RATE_PARAMETER_KEYS = new Set([
  "room_type_code",
  "rate_plan_code",
  "occupancy",
  "pricing_type",
  "primary_occ",
  "readonly",
  "occ_changed",
]);

function supportsNativeWizard(adapter: ChannexChannelAdapter): boolean {
  return (
    adapter.mapping_mode === "room_rate_multioccupancy" &&
    Object.keys(adapter.rate_params ?? {}).every((key) => NATIVE_RATE_PARAMETER_KEYS.has(key))
  );
}

function resolveGroupId(property: ChannexPropertyResource): string | null {
  const groups = property?.relationships?.groups;
  const items = Array.isArray(groups) ? groups : groups?.data;
  return items?.[0]?.id ?? null;
}

function buildAdapterSettings(
  fields: ChannexChannelAdapter["params"],
  submitted: ChannelSettings,
): ChannelSettings {
  const unknown = Object.keys(submitted).filter((key) => !fields[key]);
  if (unknown.length) {
    throw new BadRequestException(`Trường cấu hình không hợp lệ: ${unknown.join(", ")}`);
  }

  const result: ChannelSettings = {};
  for (const [key, field] of Object.entries(fields)) {
    if (field.default !== undefined) result[key] = field.default;
    if (submitted[key] !== undefined) result[key] = submitted[key];
    const value = result[key];
    if (value === undefined) continue;
    if ((field.type === "boolean" || field.type === "switch") && typeof value !== "boolean") {
      throw new BadRequestException(`${field.title ?? key} phải là boolean`);
    }
    if (field.type === "integer" && (typeof value !== "number" || !Number.isInteger(value))) {
      throw new BadRequestException(`${field.title ?? key} phải là số nguyên`);
    }
    if (field.type === "number" && typeof value !== "number") {
      throw new BadRequestException(`${field.title ?? key} phải là số`);
    }
    if (
      field.type === "select" &&
      field.options?.length &&
      !field.options.includes(String(value))
    ) {
      throw new BadRequestException(`${field.title ?? key} không hợp lệ`);
    }
  }
  return result;
}

@Injectable()
export class ChannexChannelSessionService {
  private readonly logger = new Logger(ChannexChannelSessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: ChannexApiClient,
  ) {}

  async getCatalog(hotelId: string) {
    const property = await this.prisma.channexMapping.findUnique({
      where: {
        hotelId_kind_localId: { hotelId, kind: "property", localId: hotelId },
      },
      select: { channexId: true },
    });

    const isConfigured = this.client.isConfigured();
    let adapterResponse: ChannexResponse<ChannexChannelAdapterResource[]> = { data: [] };
    let channelResponse: ChannexResponse<ChannexChannelConnectionResource[]> = { data: [] };

    if (!isConfigured) {
      this.logger.warn(`[Channex Hub] Channex API key chưa được cấu hình cho khách sạn ${hotelId}`);
    } else {
      try {
        [adapterResponse, channelResponse] = await Promise.all([
          this.client.getChannelAdapters(),
          property
            ? this.client.getChannels(property.channexId)
            : Promise.resolve<ChannexResponse<ChannexChannelConnectionResource[]>>({
                data: [],
              }),
        ]);
      } catch (err: any) {
        this.logger.warn(`[Channex Hub] Không thể tải danh mục kênh từ Channex: ${err.message}`);
      }
    }

    const providers = (adapterResponse.data ?? [])
      .map((provider) => this.toAdapterDescriptor(channelAdapterAttributes(provider)))
      .filter((provider) => provider.code && provider.title)
      .sort((left, right) => left.title.localeCompare(right.title, "en"));

    const connections = (channelResponse.data ?? []).map((channel) => {
      const attributes = channelConnectionAttributes(channel);
      return {
        id: channel.id ?? attributes.id,
        code: attributes.channel,
        title: attributes.title,
        currency: attributes.currency ?? null,
        isActive: Boolean(attributes.is_active),
      };
    });

    return {
      propertyId: property?.channexId ?? null,
      providers,
      connections,
      isConfigured,
    };
  }

  async prepareNativeChannel(
    hotelId: string,
    input: { channel: string; settings: ChannelSettings },
  ) {
    const property = await this.requireProperty(hotelId);
    const [adapterResponse, propertyResponse, ratePlansResponse] = await Promise.all([
      this.client.getChannelAdapter(input.channel),
      this.client.getProperty(property.channexId),
      this.client.getRatePlanOptions(property.channexId),
    ]);
    const adapter = channelAdapterAttributes(adapterResponse.data);
    const supported = supportsNativeWizard(adapter);
    if (!supported) {
      return {
        supported: false,
        reason: "Kênh này dùng flow đặc biệt; mở Channex để hoàn tất.",
        adapter: this.toAdapterDescriptor(adapter),
      };
    }

    const settings = buildAdapterSettings(adapter.params ?? {}, input.settings);
    const tested = await this.client.testChannelConnection(input.channel, settings);
    if (!tested.data?.success) {
      throw new BadRequestException(
        `Channex từ chối cấu hình: ${JSON.stringify(tested.data?.errors ?? "Không rõ lỗi")}`,
      );
    }

    const [connectionDetails, mappingDetails] = await Promise.all([
      ["BookingCom", "Expedia", "Agoda"].includes(input.channel)
        ? this.client.getChannelConnectionDetails(input.channel, settings)
        : Promise.resolve<ChannexResponse<any>>({ data: null }),
      this.client.getChannelMappingDetails(input.channel, settings),
    ]);
    const remoteProperty = propertyResponse.data;
    const groupId = resolveGroupId(remoteProperty);
    if (!groupId) {
      throw new BadRequestException("Property Channex chưa thuộc Group nào");
    }

    return {
      supported: true,
      propertyId: property.channexId,
      propertyTitle:
        remoteProperty?.attributes?.title ?? remoteProperty?.title ?? property.channexId,
      groupId,
      currency:
        connectionDetails.data?.attributes?.currency ??
        connectionDetails.data?.currency ??
        remoteProperty?.attributes?.currency ??
        remoteProperty?.currency,
      adapter: this.toAdapterDescriptor(adapter),
      localRatePlans: (ratePlansResponse.data ?? []).map((item) => ({
        id: item.id ?? item.attributes?.id,
        title: item.attributes?.title ?? item.title ?? item.id,
        roomTypeId:
          item.relationships?.room_type?.data?.id ??
          item.attributes?.room_type_id ??
          item.room_type_id ??
          null,
        occupancy: item.attributes?.occupancy ?? null,
      })),
      mappingDetails: mappingDetails.data ?? {},
    };
  }

  async createNativeChannel(
    hotelId: string,
    input: {
      channel: string;
      title: string;
      settings: ChannelSettings;
      ratePlans: Array<{ rate_plan_id: string; settings: ChannelSettings }>;
    },
  ) {
    this.logger.log(
      `[Channex Kênh] Bắt đầu thiết lập kênh OTA ${input.channel} ("${input.title}") cho khách sạn ${hotelId}`,
    );

    try {
      const property = await this.requireProperty(hotelId);
      const [adapterResponse, propertyResponse, ratePlansResponse] = await Promise.all([
        this.client.getChannelAdapter(input.channel),
        this.client.getProperty(property.channexId),
        this.client.getRatePlanOptions(property.channexId),
      ]);
      const adapter = channelAdapterAttributes(adapterResponse.data);
      if (!supportsNativeWizard(adapter)) {
        throw new BadRequestException("Kênh này cần flow Channex đặc biệt");
      }
      const groupId = resolveGroupId(propertyResponse.data);
      if (!groupId) throw new BadRequestException("Property Channex chưa thuộc Group nào");

      const allowedRatePlans = new Map(
        (ratePlansResponse.data ?? []).map((item) => [
          item.id ?? item.attributes?.id,
          Number(item.attributes?.occupancy ?? item.occupancy) || null,
        ]),
      );
      const settings = buildAdapterSettings(adapter.params ?? {}, input.settings);
      const tested = await this.client.testChannelConnection(input.channel, settings);
      if (!tested.data?.success) {
        throw new BadRequestException(
          `Channex từ chối cấu hình: ${JSON.stringify(tested.data?.errors ?? "Không rõ lỗi")}`,
        );
      }
      const [connectionDetails, mappingDetails] = await Promise.all([
        ["BookingCom", "Expedia", "Agoda"].includes(input.channel)
          ? this.client.getChannelConnectionDetails(input.channel, settings)
          : Promise.resolve<ChannexResponse<any>>({ data: null }),
        this.client.getChannelMappingDetails(input.channel, settings),
      ]);
      const currency =
        connectionDetails.data?.attributes?.currency ??
        connectionDetails.data?.currency ??
        propertyResponse.data?.attributes?.currency ??
        propertyResponse.data?.currency;
      if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) {
        throw new BadRequestException("Không xác định được tiền tệ của Channel");
      }

      const remoteRates = new Map<string, Set<number>>();
      for (const room of (mappingDetails.data?.rooms ?? []) as RemoteRoom[]) {
        for (const rate of (room.rates ?? []) as RemoteRoomRate[]) {
          const occupancies = new Set<number>();
          const rawList = Array.isArray(rate.occupancies)
            ? rate.occupancies
            : (rate as any).occupancy !== undefined
              ? [(rate as any).occupancy]
              : [];
          for (const occ of rawList) {
            const parsed = Number(occ);
            if (!Number.isNaN(parsed) && parsed > 0) {
              occupancies.add(parsed);
            }
          }
          if ((rate as any).max_persons !== undefined && (rate as any).max_persons !== null) {
            const maxP = Number((rate as any).max_persons);
            if (!Number.isNaN(maxP) && maxP > 0) {
              occupancies.add(maxP);
            }
          }
          remoteRates.set(`${String(room.id)}:${String(rate.id)}`, occupancies);
        }
      }

      const ratePlans = input.ratePlans.map((mapping) => {
        if (!allowedRatePlans.has(mapping.rate_plan_id)) {
          throw new BadRequestException("Rate plan không thuộc Property hiện tại");
        }
        const mappingSettings = buildAdapterSettings(adapter.rate_params ?? {}, mapping.settings);
        const target = remoteRates.get(
          `${String(mappingSettings.room_type_code)}:${String(mappingSettings.rate_plan_code)}`,
        );
        if (!target) throw new BadRequestException("Rate OTA không tồn tại");

        const submittedOcc =
          mappingSettings.occupancy !== undefined ? Number(mappingSettings.occupancy) : undefined;

        if (target.size > 0) {
          if (
            submittedOcc !== undefined &&
            !Number.isNaN(submittedOcc) &&
            target.has(submittedOcc)
          ) {
            mappingSettings.occupancy = submittedOcc;
          } else {
            const validOptions = Array.from(target).sort((a, b) => a - b);
            const fallback =
              submittedOcc !== undefined && !Number.isNaN(submittedOcc)
                ? (validOptions.find((opt) => opt >= submittedOcc) ??
                  validOptions[validOptions.length - 1])
                : validOptions[0];

            if (fallback !== undefined) {
              this.logger.warn(
                `[Channex Kênh] Tự động điều chỉnh occupancy của rate OTA ${mappingSettings.rate_plan_code} từ ${mappingSettings.occupancy ?? "chưa gán"} thành ${fallback} để khớp với quy định sàn OTA`,
              );
              mappingSettings.occupancy = fallback;
            } else {
              throw new BadRequestException(
                `Số khách (occupancy) OTA không hợp lệ (${mappingSettings.occupancy}). Kênh yêu cầu một trong các mức: ${validOptions.join(", ")}`,
              );
            }
          }
        } else if (submittedOcc !== undefined && !Number.isNaN(submittedOcc)) {
          mappingSettings.occupancy = submittedOcc;
        }

        const localOccupancy = allowedRatePlans.get(mapping.rate_plan_id);
        if (localOccupancy && Number(mappingSettings.occupancy) > localOccupancy) {
          throw new BadRequestException(
            `Occupancy OTA ${mappingSettings.occupancy} vượt quá sức chứa ${localOccupancy} của rate plan VietSage`,
          );
        }

        return {
          rate_plan_id: mapping.rate_plan_id,
          settings: mappingSettings,
        };
      });

      const duplicateTargets = ratePlans.map(
        (mapping) =>
          `${String(mapping.settings.room_type_code)}:${String(mapping.settings.rate_plan_code)}`,
      );
      if (new Set(duplicateTargets).size !== duplicateTargets.length) {
        throw new BadRequestException("Một rate OTA không thể map trùng nhiều lần");
      }

      const created = await this.client.createChannel({
        channel: input.channel,
        group_id: groupId,
        title: input.title,
        currency,
        properties: [property.channexId],
        is_active: false,
        settings,
        rate_plans: ratePlans,
      });
      const channelId = created.data?.id ?? created.data?.attributes?.id;
      if (!channelId) throw new BadGatewayException("Channex không trả về Channel ID");
      const readiness = await this.client.checkChannelReadiness(channelId);
      const issues = readiness.data ?? [];

      this.logger.log(
        `[Channex Kênh] Tạo kênh OTA ${input.channel} thành công (Channel ID: ${channelId}, Sẵn sàng: ${issues.length === 0 ? "CÓ" : "CHƯA"})`,
      );

      // Ghi log đồng bộ append-only (không ghi đè lịch sử)
      await this.recordSyncLog({
        hotelId,
        syncType: "CHANNEX_CHANNEL_CREATE",
        status: issues.length === 0 ? "SUCCESS" : "WARNING",
        eventsCount: ratePlans.length,
        details: JSON.stringify({
          channel: input.channel,
          channelId,
          title: input.title,
          currency,
          ratePlansCount: ratePlans.length,
          ready: issues.length === 0,
          issues,
          note: "Tạo kênh OTA ở trạng thái tắt và kiểm tra độ sẵn sàng thành công",
        }),
      });

      return { channelId, ready: issues.length === 0, issues };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[Channex Kênh] Thất bại khi tạo kênh OTA ${input.channel} cho khách sạn ${hotelId}: ${msg}`,
      );

      // Ghi nhận log lỗi vào database (append-only)
      await this.recordSyncLog({
        hotelId,
        syncType: "CHANNEX_CHANNEL_CREATE",
        status: "FAILED",
        eventsCount: 0,
        details: JSON.stringify({
          channel: input.channel,
          title: input.title,
          error: msg,
          note: "Lỗi cấu hình hoặc tạo kênh OTA trên Channex",
        }),
      });

      throw err;
    }
  }

  async activateNativeChannel(hotelId: string, channelId: string) {
    const property = await this.requireProperty(hotelId);
    const channels = await this.client.getChannels(property.channexId);
    const belongsToProperty = (channels.data ?? []).some((channel) => {
      const attributes = channelConnectionAttributes(channel);
      return (channel.id ?? attributes.id) === channelId;
    });
    if (!belongsToProperty) throw new BadRequestException("Channel không thuộc Property hiện tại");

    const readiness = await this.client.checkChannelReadiness(channelId);
    if ((readiness.data ?? []).length) {
      throw new BadRequestException("Channel chưa sẵn sàng để kích hoạt");
    }
    await this.client.activateChannel(channelId);

    this.logger.log(
      `[Channex Kênh] Kích hoạt thành công kênh OTA ${channelId} cho khách sạn ${hotelId}`,
    );

    // Ghi log kích hoạt append-only
    await this.recordSyncLog({
      hotelId,
      syncType: "CHANNEX_CHANNEL_ACTIVATE",
      status: "SUCCESS",
      eventsCount: 1,
      details: JSON.stringify({
        channelId,
        activatedAt: new Date().toISOString(),
        note: "Đã kích hoạt đồng bộ trực tiếp hai chiều với kênh OTA",
      }),
    });

    return { channelId, isActive: true };
  }

  private async recordSyncLog(data: any): Promise<void> {
    try {
      if (this.prisma.channelSyncLog?.create) {
        await this.prisma.channelSyncLog.create({ data });
      }
    } catch {
      // Bỏ qua lỗi ghi log phụ trợ để không làm gián đoạn luồng nghiệp vụ
    }
  }

  private async requireProperty(hotelId: string) {
    const property = await this.prisma.channexMapping.findUnique({
      where: {
        hotelId_kind_localId: { hotelId, kind: "property", localId: hotelId },
      },
      select: { channexId: true },
    });
    if (!property) {
      throw new BadRequestException("Hãy đồng bộ cơ sở sang Channex trước khi kết nối OTA");
    }
    return property;
  }

  private toAdapterDescriptor(adapter: ChannexChannelAdapter) {
    const mapFields = (fields: ChannexChannelAdapter["rate_params"] | undefined) =>
      Object.entries(fields ?? {})
        .map(([key, value]) => ({ key, ...value }))
        .sort((left, right) => left.position - right.position);
    return {
      code: adapter.code,
      title: adapter.title,
      kind: adapter.kind,
      mappingMode: adapter.mapping_mode,
      propertyMapping: adapter.property_mapping,
      messageSupport: adapter.message_support,
      nativeSupported: supportsNativeWizard(adapter),
      parameters: mapFields(adapter.params),
      rateParameters: mapFields(adapter.rate_params),
    };
  }

  async create(hotelId: string, username: string, channelId?: string) {
    const property = await this.prisma.channexMapping.findUnique({
      where: {
        hotelId_kind_localId: { hotelId, kind: "property", localId: hotelId },
      },
      select: { channexId: true },
    });
    if (!property) {
      throw new BadRequestException("Hãy đồng bộ cơ sở sang Channex trước khi kết nối OTA");
    }

    const remoteProperty = await this.client.getProperty(property.channexId);
    if (channelId) {
      const channels = await this.client.getChannels(property.channexId);
      const ownsChannel = (channels.data ?? []).some((channel) => {
        const attributes = channelConnectionAttributes(channel);
        return (channel.id ?? attributes.id) === channelId;
      });
      if (!ownsChannel) {
        throw new BadRequestException("Channel không thuộc Property hiện tại");
      }
    }
    const groupId = remoteProperty.data?.relationships?.groups?.[0]?.id as string | undefined;
    const response = await this.client.createChannelOneTimeToken({
      property_id: property.channexId,
      ...(groupId ? { group_id: groupId } : {}),
      username,
    });
    if (!response.data?.token) {
      throw new BadGatewayException("Channex không trả về one-time token");
    }

    const origin = new URL(this.client.getBaseUrl()).origin;
    const iframeUrl = new URL("/auth/exchange", origin);
    iframeUrl.searchParams.set("oauth_session_key", response.data.token);
    iframeUrl.searchParams.set("app_mode", "headless");
    iframeUrl.searchParams.set(
      "redirect_to",
      channelId ? `/channels/${channelId}/edit` : "/channels",
    );
    iframeUrl.searchParams.set("property_id", property.channexId);
    if (groupId) iframeUrl.searchParams.set("group_id", groupId);
    iframeUrl.searchParams.set("lng", "en");

    return {
      iframeUrl: iframeUrl.toString(),
      expiresInSeconds: 900,
    };
  }
}
