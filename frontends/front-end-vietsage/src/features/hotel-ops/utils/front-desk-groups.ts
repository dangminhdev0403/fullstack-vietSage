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
    let itemAmount = 0;
    if (
      arrival.totalAmount !== null &&
      arrival.totalAmount !== undefined &&
      Number.isFinite(Number(arrival.totalAmount))
    ) {
      itemAmount = Number(arrival.totalAmount);
    } else if (arrival.chargeLines && arrival.chargeLines.length > 0) {
      const sum = arrival.chargeLines.reduce(
        (acc, cl) => acc + (Number(cl.totalSnapshot) || 0),
        0,
      );
      if (Number.isFinite(sum)) itemAmount = sum;
    } else if (
      arrival.roomSubtotal !== null &&
      arrival.roomSubtotal !== undefined &&
      Number.isFinite(Number(arrival.roomSubtotal))
    ) {
      itemAmount =
        Number(arrival.roomSubtotal) + (Number(arrival.serviceSubtotal) || 0);
    } else {
      const rateVal = Number(arrival.rate ?? arrival.nightlyRateSnapshot ?? 0);
      if (Number.isFinite(rateVal)) {
        let nights = 1;
        if (arrival.plannedCheckInAt && arrival.plannedCheckOutAt) {
          const d1 = new Date(arrival.plannedCheckInAt).getTime();
          const d2 = new Date(arrival.plannedCheckOutAt).getTime();
          if (d2 > d1) {
            nights = Math.max(
              1,
              Math.round((d2 - d1) / (1000 * 60 * 60 * 24)),
            );
          }
        }
        itemAmount = rateVal * nights;
      }
    }

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
        totalEstimatedAmount: itemAmount,
        assignedRoomNumbers: roomNum ? [roomNum] : [],
        unassignedRoomCount: roomNum ? 0 : 1,
        arrivals: [arrival],
      });
    } else {
      existing.totalRooms += 1;
      if (isCheckedIn) existing.checkedInRooms += 1;
      if (isArriving) existing.arrivingRooms += 1;
      existing.totalEstimatedAmount += itemAmount;

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
