import { GuestRequestPriority, GuestRequestStatus, GuestStayStatus } from "@prisma/client";
import { HotelRequestsService } from "../application/hotel-requests.service";

describe("Urgent Request Handling & SLA Escalation TDD", () => {
  it("flags urgent unacknowledged requests as overdue after deadline", () => {
    const service = new HotelRequestsService({} as any, {} as any);
    const now = new Date();
    const sixMinutesAgo = new Date(now.getTime() - 6 * 60 * 1000);

    const item = (service as any).toStaffRequestListItem({
      id: "req-1",
      hotelId: "hotel-1",
      title: "Cần khăn khẩn cấp",
      status: GuestRequestStatus.CREATED,
      priority: GuestRequestPriority.URGENT,
      quantity: 2,
      description: "Khẩn cấp",
      createdAt: sixMinutesAgo,
      updatedAt: sixMinutesAgo,
      room: { roomNumber: "101" },
      stay: { guestDisplayName: "Nguyen Van A", status: GuestStayStatus.CHECKED_IN, checkedOutAt: null },
      serviceItem: { name: "Khăn tắm", category: { name: "Housekeeping" } },
      assignedTo: null,
      events: [],
    });

    expect(item.priority).toBe("URGENT");
    expect(item.isOverdue).toBe(true);
  });

  it("suppresses overdue escalation for checked out stay", () => {
    const service = new HotelRequestsService({} as any, {} as any);
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

    const item = (service as any).toStaffRequestListItem({
      id: "req-2",
      hotelId: "hotel-1",
      title: "Khăn tắm",
      status: GuestRequestStatus.CREATED,
      priority: GuestRequestPriority.URGENT,
      quantity: 1,
      description: "Cần gấp",
      createdAt: tenMinutesAgo,
      updatedAt: tenMinutesAgo,
      room: { roomNumber: "102" },
      stay: { guestDisplayName: "Tran Van B", status: GuestStayStatus.CHECKED_OUT, checkedOutAt: tenMinutesAgo },
      serviceItem: { name: "Khăn tắm", category: { name: "Housekeeping" } },
      assignedTo: null,
      events: [],
    });

    expect(item.isOverdue).toBe(false);
  });
});
