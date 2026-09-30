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
        occupancies?: Array<number | string>;
        occupancy?: number | string;
        max_persons?: number | string | null;
      }>;
    }>;
  };

  return (details.rooms ?? []).flatMap((room) =>
    (room.rates ?? []).map((rate) => {
      const rawOccs = Array.isArray(rate.occupancies)
        ? rate.occupancies
        : rate.occupancy !== undefined
          ? [rate.occupancy]
          : [];
      const occupancies = Array.from(
        new Set(
          rawOccs
            .map((o) => Number(o))
            .filter((n) => !Number.isNaN(n) && n > 0),
        ),
      ).sort((a, b) => a - b);
      const parsedMaxPersons =
        rate.max_persons !== null && rate.max_persons !== undefined
          ? Number(rate.max_persons)
          : null;
      const maxPersons =
        parsedMaxPersons !== null && !Number.isNaN(parsedMaxPersons) && parsedMaxPersons > 0
          ? parsedMaxPersons
          : null;

      const effectiveOccupancies =
        occupancies.length > 0
          ? occupancies
          : maxPersons !== null
            ? [maxPersons]
            : [1];

      return {
        key: `${String(room.id)}:${String(rate.id)}`,
        roomCode: room.id,
        roomTitle: room.title ?? String(room.id),
        rateCode: rate.id,
        rateTitle: rate.title ?? String(rate.id),
        pricing: rate.pricing ?? "Standard",
        occupancies: effectiveOccupancies,
        maxPersons,
      };
    }),
  );
}

export function resolveRateOccupancy(
  remote: RemoteRateOption,
  preferred?: number | null,
): number {
  const preferredNum =
    preferred !== undefined && preferred !== null ? Number(preferred) : null;

  if (remote.occupancies.length) {
    if (
      preferredNum !== null &&
      !Number.isNaN(preferredNum) &&
      remote.occupancies.includes(preferredNum)
    ) {
      return preferredNum;
    }
    if (
      remote.maxPersons !== null &&
      remote.occupancies.includes(remote.maxPersons)
    ) {
      return remote.maxPersons;
    }
    return remote.occupancies.at(-1) ?? 1;
  }

  return (preferredNum && !Number.isNaN(preferredNum) ? preferredNum : null) ?? remote.maxPersons ?? 1;
}

export function buildRateMappingSettings(
  fields: ChannexChannelParameter[],
  remote: RemoteRateOption,
  occupancy: number,
): Record<string, string | number | boolean> {
  const available: Record<string, string | number | boolean> = {
    room_type_code: remote.roomCode,
    rate_plan_code: remote.rateCode,
    occupancy: Number(occupancy) || 1,
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
