import { GuestStayStatus } from "@prisma/client";
import { HotelRoomsService } from "../application/hotel-rooms.service";

describe("Overdue check-out API projection", () => {
  describe("HotelRoomsService stay projection", () => {
    it("projects isOverdueCheckOut=true and overdueHours > 0 for active stays past planned checkout", () => {
      const service = new HotelRoomsService({} as any, {} as any, {} as any, {} as any);
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      const stay = (service as any).toStayData({
        id: "stay-overdue",
        hotelId: "hotel-1",
        roomId: "room-101",
        reservationCode: "RES-101",
        guestDisplayName: "Nguyen Van A",
        status: GuestStayStatus.ACTIVE,
        plannedCheckInAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        plannedCheckOutAt: twoHoursAgo,
        checkedInAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        activatedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        checkedOutAt: null,
        accessCodeExpiresAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(stay.isOverdueCheckOut).toBe(true);
      expect(stay.overdueHours).toBe(2);
    });

    it("projects isOverdueCheckOut=false and overdueHours=0 for stays not past planned checkout or already checked out", () => {
      const service = new HotelRoomsService({} as any, {} as any, {} as any, {} as any);
      const now = new Date();
      const futureCheckout = new Date(now.getTime() + 5 * 60 * 60 * 1000);

      const activeStay = (service as any).toStayData({
        id: "stay-active",
        hotelId: "hotel-1",
        roomId: "room-102",
        reservationCode: "RES-102",
        guestDisplayName: "Tran Van B",
        status: GuestStayStatus.ACTIVE,
        plannedCheckInAt: new Date(),
        plannedCheckOutAt: futureCheckout,
        checkedInAt: new Date(),
        activatedAt: new Date(),
        checkedOutAt: null,
        accessCodeExpiresAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(activeStay.isOverdueCheckOut).toBe(false);
      expect(activeStay.overdueHours).toBe(0);

      const checkedOutStay = (service as any).toStayData({
        id: "stay-checked-out",
        hotelId: "hotel-1",
        roomId: "room-103",
        reservationCode: "RES-103",
        guestDisplayName: "Le Van C",
        status: GuestStayStatus.CHECKED_OUT,
        plannedCheckInAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        plannedCheckOutAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        checkedInAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        activatedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        checkedOutAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        accessCodeExpiresAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(checkedOutStay.isOverdueCheckOut).toBe(false);
      expect(checkedOutStay.overdueHours).toBe(0);
    });
  });
});
