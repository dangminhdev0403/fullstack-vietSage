import type { ChannexChannelParameter } from "../types/channel-manager.types";

export interface RemoteRateOption {
  key: string;
  roomCode: string | number;
  roomTitle: string;
  rateCode: string | number;
  rateTitle: string;
  pricing: string;
  occupancies: number[];
  maxPersons: number | null;
}

export function flattenRemoteRates(
  mappingDetails: unknown,
): RemoteRateOption[] {
  if (!mappingDetails || typeof mappingDetails !== "object") return [];

  const details = mappingDetails as {
    rooms?: Array<{
      id: string | number;
      title?: string;
      rates?: Array<{
        id: string | number;
        title?: string;
        pricing?: string;
        occupancies?: number[];
        max_persons?: number | null;
      }>;
    }>;
  };

  return (details.rooms ?? []).flatMap((room) =>
    (room.rates ?? []).map((rate) => ({
      key: `${String(room.id)}:${String(rate.id)}`,
      roomCode: room.id,
      roomTitle: room.title ?? String(room.id),
      rateCode: rate.id,
      rateTitle: rate.title ?? String(rate.id),
      pricing: rate.pricing ?? "Standard",
      occupancies: rate.occupancies ?? [],
      maxPersons: rate.max_persons ?? null,
    })),
  );
}

export function buildRateMappingSettings(
  fields: ChannexChannelParameter[],
  remote: RemoteRateOption,
  occupancy: number,
): Record<string, string | number | boolean> {
  const available: Record<string, string | number | boolean> = {
    room_type_code: remote.roomCode,
    rate_plan_code: remote.rateCode,
    occupancy,
    pricing_type: remote.pricing,
    primary_occ: true,
    readonly: false,
    occ_changed: false,
  };

  return Object.fromEntries(
    fields
      .filter((field) => available[field.key] !== undefined)
      .map((field) => [field.key, available[field.key]]),
  );
}
