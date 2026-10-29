import type { HotelArrival } from "@/features/hotel-ops/types/hotel-ops-contract";

export type FrontDeskGroupSummary = {
  groupCode: string;
  leadGuestName: string;
  leadGuestPhone: string | null;
  totalRooms: number;
  checkedInRooms: number;
  arrivingRooms: number;
  earliestCheckInAt: string | null;
  latestCheckOutAt: string | null;
  totalEstimatedAmount: number;
  assignedRoomNumbers: string[];
  unassignedRoomCount: number;
  arrivals: HotelArrival[];
};

export function buildFrontDeskGroupSummaries(arrivals: HotelArrival[]): FrontDeskGroupSummary[] {
  const map = new Map<string, FrontDeskGroupSummary>();

  for (const arrival of arrivals) {
    const rawCode = arrival.groupCode?.trim();
    if (!rawCode) continue;

    const groupKey = rawCode.toUpperCase();
    const existing = map.get(groupKey);

    const isCheckedIn = arrival.status === "CHECKED_IN";
    const isArriving = arrival.status === "CONFIRMED" || arrival.status === "ARRIVAL_READY";
    const roomNum = arrival.room?.roomNumber;
    const rate = Number(arrival.rate ?? arrival.nightlyRateSnapshot ?? 0);

    if (!existing) {
      map.set(groupKey, {
        groupCode: rawCode,
        leadGuestName: arrival.guestDisplayName || "Khách đặt đoàn",
        leadGuestPhone: arrival.guestPhone || null,
        totalRooms: 1,
        checkedInRooms: isCheckedIn ? 1 : 0,
        arrivingRooms: isArriving ? 1 : 0,
        earliestCheckInAt: arrival.plannedCheckInAt || null,
        latestCheckOutAt: arrival.plannedCheckOutAt || null,
        totalEstimatedAmount: Number.isFinite(rate) ? rate : 0,
        assignedRoomNumbers: roomNum ? [roomNum] : [],
        unassignedRoomCount: roomNum ? 0 : 1,
        arrivals: [arrival],
      });
    } else {
      existing.totalRooms += 1;
      if (isCheckedIn) existing.checkedInRooms += 1;
      if (isArriving) existing.arrivingRooms += 1;
      if (Number.isFinite(rate)) existing.totalEstimatedAmount += rate;

      if (roomNum && !existing.assignedRoomNumbers.includes(roomNum)) {
        existing.assignedRoomNumbers.push(roomNum);
      } else if (!roomNum) {
        existing.unassignedRoomCount += 1;
      }

      if (arrival.plannedCheckInAt) {
        if (!existing.earliestCheckInAt || new Date(arrival.plannedCheckInAt) < new Date(existing.earliestCheckInAt)) {
          existing.earliestCheckInAt = arrival.plannedCheckInAt;
        }
      }

      if (arrival.plannedCheckOutAt) {
        if (!existing.latestCheckOutAt || new Date(arrival.plannedCheckOutAt) > new Date(existing.latestCheckOutAt)) {
          existing.latestCheckOutAt = arrival.plannedCheckOutAt;
        }
      }

      existing.arrivals.push(arrival);
    }
  }

  return Array.from(map.values());
}
