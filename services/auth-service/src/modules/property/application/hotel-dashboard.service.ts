import { Injectable } from "@nestjs/common";
import {
  FolioStatus,
  GuestRequestPriority,
  GuestRequestStatus,
  GuestStayStatus,
  PaymentStatus,
  Prisma,
  RoomStatus,
} from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { HotelAccessService } from "./hotel-access.service";

const REQUEST_INCOMPLETE_STATUSES = [
  GuestRequestStatus.CREATED,
  GuestRequestStatus.ACKNOWLEDGED,
  GuestRequestStatus.IN_PROGRESS,
  GuestRequestStatus.FAILED,
];
const ACTIVE_STAY_STATUSES = [GuestStayStatus.CHECKED_IN, GuestStayStatus.ACTIVE];
const ACTIVE_REQUEST_STAY_FILTER = {
  stay: { is: { status: { in: ACTIVE_STAY_STATUSES }, checkedOutAt: null } },
} satisfies Prisma.GuestRequestWhereInput;
const SLA_THRESHOLD_MINUTES = 30;

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value == null) return 0;
  return typeof value === "number" ? value : value.toNumber();
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function mapRoomStatus(
  status: RoomStatus,
): "available" | "occupied" | "processing" | "maintenance" {
  if (status === RoomStatus.OCCUPIED || status === RoomStatus.RESERVED) return "occupied";
  if (status === RoomStatus.PROCESSING) return "processing";
  if (status === RoomStatus.MAINTENANCE || status === RoomStatus.OUT_OF_SERVICE)
    return "maintenance";
  return "available";
}

function mapRequestStatus(
  status: GuestRequestStatus,
): "sent" | "processing" | "completed" | "cancelled" {
  if (status === GuestRequestStatus.COMPLETED) return "completed";
  if (status === GuestRequestStatus.CANCELLED) return "cancelled";
  if (status === GuestRequestStatus.ACKNOWLEDGED || status === GuestRequestStatus.IN_PROGRESS)
    return "processing";
  return "sent";
}

@Injectable()
export class HotelDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hotelAccessService: HotelAccessService,
  ) {}

  async getDashboard(actorUserId: string, hotelId: string) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);

    const now = new Date();
    const todayStart = startOfDay(now);
    const tomorrowStart = addDays(todayStart, 1);
    const yesterdayStart = addDays(todayStart, -1);
    const sevenDaysStart = addDays(todayStart, -6);
    const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);

    const [
      totalRooms,
      roomStatusRows,
      occupiedRooms,
      activeStays,
      todayCheckIns,
      todayCheckOuts,
      pendingCheckOuts,
      requestStatusRows,
      unprocessedRequests,
      urgentUnprocessedRequests,
      topServices,
      todayRequests,
      yesterdayRequests,
      todayUrgentRequests,
      yesterdayUrgentRequests,
      revenueToday,
      revenueSevenDays,
      revenueMonth,
      failedPayments,
      billingIssues,
      attentionRequests,
      attentionRooms,
      attentionCheckOuts,
      activities,
      acknowledgedEvents,
      completedRequests,
    ] = await Promise.all([
      this.prisma.room.count({ where: { hotelId } }),
      this.prisma.room.groupBy({ by: ["status"], where: { hotelId }, _count: { _all: true } }),
      this.prisma.room.count({ where: { hotelId, status: RoomStatus.OCCUPIED } }),
      this.prisma.guestStay.count({ where: { hotelId, status: { in: ACTIVE_STAY_STATUSES } } }),
      this.prisma.guestStay.count({
        where: { hotelId, checkedInAt: { gte: todayStart, lt: tomorrowStart } },
      }),
      this.prisma.guestStay.count({
        where: { hotelId, checkedOutAt: { gte: todayStart, lt: tomorrowStart } },
      }),
      this.prisma.guestStay.count({ where: { hotelId, status: GuestStayStatus.CHECKOUT_PENDING } }),
      this.prisma.guestRequest.groupBy({
        by: ["status"],
        where: { hotelId, ...ACTIVE_REQUEST_STAY_FILTER },
        _count: { _all: true },
      }),
      this.prisma.guestRequest.count({
        where: {
          hotelId,
          ...ACTIVE_REQUEST_STAY_FILTER,
          status: { in: REQUEST_INCOMPLETE_STATUSES },
        },
      }),
      this.prisma.guestRequest.count({
        where: {
          hotelId,
          ...ACTIVE_REQUEST_STAY_FILTER,
          priority: GuestRequestPriority.URGENT,
          status: { in: REQUEST_INCOMPLETE_STATUSES },
        },
      }),
      this.prisma.guestRequest.groupBy({
        by: ["serviceItemId"],
        where: { hotelId, ...ACTIVE_REQUEST_STAY_FILTER, serviceItemId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { serviceItemId: "desc" } },
        take: 5,
      }),
      this.prisma.guestRequest.count({
        where: {
          hotelId,
          ...ACTIVE_REQUEST_STAY_FILTER,
          createdAt: { gte: todayStart, lt: tomorrowStart },
        },
      }),
      this.prisma.guestRequest.count({
        where: {
          hotelId,
          ...ACTIVE_REQUEST_STAY_FILTER,
          createdAt: { gte: yesterdayStart, lt: todayStart },
        },
      }),
      this.prisma.guestRequest.count({
        where: {
          hotelId,
          ...ACTIVE_REQUEST_STAY_FILTER,
          priority: GuestRequestPriority.URGENT,
          createdAt: { gte: todayStart, lt: tomorrowStart },
        },
      }),
      this.prisma.guestRequest.count({
        where: {
          hotelId,
          ...ACTIVE_REQUEST_STAY_FILTER,
          priority: GuestRequestPriority.URGENT,
          createdAt: { gte: yesterdayStart, lt: todayStart },
        },
      }),
      this.prisma.payment.aggregate({
        where: {
          hotelId,
          status: PaymentStatus.SUCCEEDED,
          confirmedAt: { gte: todayStart, lt: tomorrowStart },
        },
        _sum: { paidAmount: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          hotelId,
          status: PaymentStatus.SUCCEEDED,
          confirmedAt: { gte: sevenDaysStart, lt: tomorrowStart },
        },
        _sum: { paidAmount: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          hotelId,
          status: PaymentStatus.SUCCEEDED,
          confirmedAt: { gte: monthStart, lt: tomorrowStart },
        },
        _sum: { paidAmount: true },
      }),
      this.prisma.payment.count({
        where: { hotelId, status: { in: [PaymentStatus.FAILED, PaymentStatus.EXPIRED] } },
      }),
      this.prisma.folio.count({ where: { hotelId, status: FolioStatus.CHECKOUT_PENDING } }),
      this.prisma.guestRequest.findMany({
        where: {
          hotelId,
          ...ACTIVE_REQUEST_STAY_FILTER,
          status: { in: REQUEST_INCOMPLETE_STATUSES },
        },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        take: 8,
        select: {
          id: true,
          priority: true,
          title: true,
          description: true,
          createdAt: true,
          room: { select: { roomNumber: true } },
        },
      }),
      this.prisma.room.findMany({
        where: {
          hotelId,
          status: {
            in: [RoomStatus.PROCESSING, RoomStatus.MAINTENANCE, RoomStatus.OUT_OF_SERVICE],
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 4,
        select: { id: true, roomNumber: true, status: true, updatedAt: true },
      }),
      this.prisma.guestStay.findMany({
        where: { hotelId, status: GuestStayStatus.CHECKOUT_PENDING },
        orderBy: { updatedAt: "desc" },
        take: 4,
        select: {
          id: true,
          guestDisplayName: true,
          plannedCheckOutAt: true,
          updatedAt: true,
          room: { select: { roomNumber: true } },
        },
      }),
      this.prisma.guestRequestEvent.findMany({
        where: {
          hotelId,
          request: { stay: { is: { status: { in: ACTIVE_STAY_STATUSES }, checkedOutAt: null } } },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          eventType: true,
          note: true,
          createdAt: true,
          request: { select: { id: true, title: true, room: { select: { roomNumber: true } } } },
        },
      }),
      this.prisma.guestRequestEvent.groupBy({
        by: ["requestId"],
        where: {
          hotelId,
          request: { stay: { is: { status: { in: ACTIVE_STAY_STATUSES }, checkedOutAt: null } } },
          toStatus: { in: [GuestRequestStatus.ACKNOWLEDGED, GuestRequestStatus.IN_PROGRESS] },
        },
        _min: { createdAt: true },
      }),
      this.prisma.guestRequest.findMany({
        where: {
          hotelId,
          ...ACTIVE_REQUEST_STAY_FILTER,
          status: GuestRequestStatus.COMPLETED,
          completedAt: { not: null },
        },
        select: { id: true, createdAt: true, completedAt: true },
        take: 500,
      }),
    ]);

    const roomsByStatus = { available: 0, occupied: 0, processing: 0, maintenance: 0 };
    const statusMapping: Record<string, string> = {};
    roomStatusRows.forEach((row) => {
      const mapped = mapRoomStatus(row.status);
      roomsByStatus[mapped] += row._count._all;
      statusMapping[row.status] = mapped;
    });

    const requestsByStatus = { sent: 0, processing: 0, completed: 0, cancelled: 0 };
    requestStatusRows.forEach((row) => {
      requestsByStatus[mapRequestStatus(row.status)] += row._count._all;
    });

    const serviceNames = topServices.length
      ? await this.prisma.hotelServiceItem.findMany({
          where: {
            id: { in: topServices.map((item) => item.serviceItemId).filter(Boolean) as string[] },
          },
          select: { id: true, name: true },
        })
      : [];
    const serviceNameMap = new Map(serviceNames.map((item) => [item.id, item.name]));

    const revenue = {
      available: true,
      currency: "VND",
      today: toNumber(revenueToday._sum.paidAmount),
      last7Days: toNumber(revenueSevenDays._sum.paidAmount),
      currentMonth: toNumber(revenueMonth._sum.paidAmount),
      issues:
        billingIssues || failedPayments
          ? [{ type: "billing_attention", count: billingIssues + failedPayments }]
          : [],
    };

    const score = Math.max(
      0,
      Math.min(
        100,
        100 -
          urgentUnprocessedRequests * 15 -
          unprocessedRequests * 3 -
          roomsByStatus.processing * 2 -
          roomsByStatus.maintenance * 4 -
          pendingCheckOuts * 5 -
          failedPayments * 10,
      ),
    );
    const healthStatus =
      score >= 90 ? "excellent" : score >= 75 ? "good" : score >= 50 ? "warning" : "critical";

    const attention = [
      ...attentionRequests.map((item) => ({
        id: item.id,
        type:
          item.priority === GuestRequestPriority.URGENT ? "urgent_request" : "unprocessed_request",
        priority: item.priority === GuestRequestPriority.URGENT ? "urgent" : "high",
        title:
          item.priority === GuestRequestPriority.URGENT
            ? `Yêu cầu khẩn cấp từ phòng ${item.room.roomNumber}`
            : `Yêu cầu chưa xử lý từ phòng ${item.room.roomNumber}`,
        description: item.title ?? item.description ?? "Cần kiểm tra yêu cầu của khách.",
        createdAt: item.createdAt.toISOString(),
        source: { type: "GuestRequest", id: item.id },
        action: {
          label: item.priority === GuestRequestPriority.URGENT ? "Xử lý ngay" : "Xem chi tiết",
          route: `/owner/hotels/${hotelId}/requests/${item.id}`,
        },
      })),
      ...attentionRooms.map((item) => ({
        id: item.id,
        type: "room_processing_issue",
        priority: item.status === RoomStatus.PROCESSING ? "high" : "normal",
        title: `Phòng ${item.roomNumber} đang ${item.status === RoomStatus.PROCESSING ? "chờ xử lý" : "bảo trì"}`,
        description: "Kiểm tra trạng thái phòng để sẵn sàng phục vụ khách.",
        createdAt: item.updatedAt.toISOString(),
        source: { type: "Room", id: item.id },
        action: { label: "Xem phòng", route: `/owner/hotels/${hotelId}/rooms` },
      })),
      ...attentionCheckOuts.map((item) => ({
        id: item.id,
        type: "pending_checkout",
        priority: "high",
        title: `Chờ check-out phòng ${item.room.roomNumber}`,
        description: `${item.guestDisplayName} đang chờ hoàn tất trả phòng.`,
        createdAt: item.updatedAt.toISOString(),
        source: { type: "GuestStay", id: item.id },
        action: { label: "Xem lưu trú", route: `/owner/hotels/${hotelId}/stay` },
      })),
    ].slice(0, 10);

    const insights: Array<{
      id: string;
      type: string;
      severity: "info" | "warning" | "critical";
      title: string;
      description: string;
      metric?: { current: number; previous?: number; changePercent?: number };
    }> = [];
    if (yesterdayRequests > 0) {
      const changePercent = Math.round(
        ((todayRequests - yesterdayRequests) / yesterdayRequests) * 100,
      );
      if (Math.abs(changePercent) >= 20) {
        insights.push({
          id: "request-volume-change",
          type: "request_volume_change",
          severity: changePercent > 0 ? "warning" : "info",
          title: changePercent > 0 ? "Yêu cầu hôm nay tăng" : "Yêu cầu hôm nay giảm",
          description: `Số yêu cầu hôm nay ${changePercent > 0 ? "cao hơn" : "thấp hơn"} hôm qua ${Math.abs(changePercent)}%.`,
          metric: { current: todayRequests, previous: yesterdayRequests, changePercent },
        });
      }
    }
    if (yesterdayUrgentRequests > 0 && todayUrgentRequests > yesterdayUrgentRequests) {
      insights.push({
        id: "urgent-request-increase",
        type: "urgent_request_change",
        severity: "critical",
        title: "Yêu cầu khẩn cấp tăng",
        description: "Số yêu cầu khẩn cấp hôm nay cao hơn hôm qua.",
        metric: { current: todayUrgentRequests, previous: yesterdayUrgentRequests },
      });
    }
    const firstService = topServices[0];
    if (firstService?.serviceItemId) {
      insights.push({
        id: "top-service",
        type: "top_requested_service",
        severity: "info",
        title: "Dịch vụ được yêu cầu nhiều nhất",
        description: `${serviceNameMap.get(firstService.serviceItemId) ?? "Dịch vụ"} đang có ${firstService._count._all} yêu cầu.`,
        metric: { current: firstService._count._all },
      });
    }

    const responseEvents = new Map(
      acknowledgedEvents.map((item) => [item.requestId, item._min.createdAt]),
    );
    const slaSamples = completedRequests.filter((item) => item.completedAt);
    const responseMinutes = slaSamples
      .map((item) =>
        responseEvents.get(item.id)?.getTime()
          ? (responseEvents.get(item.id)!.getTime() - item.createdAt.getTime()) / 60000
          : null,
      )
      .filter((value): value is number => value != null && value >= 0);
    const completionMinutes = slaSamples
      .map((item) => (item.completedAt!.getTime() - item.createdAt.getTime()) / 60000)
      .filter((value) => value >= 0);
    const slaAvailable = completionMinutes.length > 0;

    return {
      hotelId,
      generatedAt: now.toISOString(),
      rooms: {
        total: totalRooms,
        occupied: occupiedRooms,
        occupancyRate: totalRooms ? Math.round((occupiedRooms / totalRooms) * 10000) / 100 : 0,
        byStatus: roomsByStatus,
        statusMapping,
        insufficientData: false,
      },
      stays: {
        todayCheckIns,
        todayCheckOuts,
        pendingCheckOuts,
        activeStays,
        insufficientData: false,
      },
      requests: {
        unprocessed: unprocessedRequests,
        urgentUnprocessed: urgentUnprocessedRequests,
        byStatus: requestsByStatus,
        topServices: topServices.map((item) => ({
          serviceName: item.serviceItemId
            ? (serviceNameMap.get(item.serviceItemId) ?? "Dịch vụ")
            : "Dịch vụ",
          count: item._count._all,
        })),
        insufficientData: false,
      },
      revenue,
      health: {
        score,
        status: healthStatus,
        title:
          healthStatus === "excellent"
            ? "Xuất sắc"
            : healthStatus === "good"
              ? "Tốt"
              : healthStatus === "warning"
                ? "Cần chú ý"
                : "Nguy hiểm",
        factors: [
          {
            type: "urgent_requests",
            label: "Yêu cầu khẩn cấp",
            impact: urgentUnprocessedRequests ? "negative" : "positive",
            message: urgentUnprocessedRequests
              ? `Có ${urgentUnprocessedRequests} yêu cầu khẩn cấp chưa xử lý.`
              : "Không có yêu cầu khẩn cấp chưa xử lý.",
          },
          {
            type: "room_readiness",
            label: "Sẵn sàng phòng",
            impact: roomsByStatus.processing + roomsByStatus.maintenance ? "negative" : "positive",
            message: `${roomsByStatus.processing + roomsByStatus.maintenance} phòng đang xử lý hoặc bảo trì.`,
          },
          {
            type: "pending_checkouts",
            label: "Check-out chờ xử lý",
            impact: pendingCheckOuts ? "negative" : "positive",
            message: `${pendingCheckOuts} lượt lưu trú đang chờ trả phòng.`,
          },
        ],
      },
      attention,
      insights,
      sla: {
        available: slaAvailable,
        averageResponseMinutes: responseMinutes.length
          ? Math.round(
              responseMinutes.reduce((sum, value) => sum + value, 0) / responseMinutes.length,
            )
          : null,
        averageCompletionMinutes: completionMinutes.length
          ? Math.round(
              completionMinutes.reduce((sum, value) => sum + value, 0) / completionMinutes.length,
            )
          : null,
        completedWithinSlaPercent: completionMinutes.length
          ? Math.round(
              (completionMinutes.filter((value) => value <= SLA_THRESHOLD_MINUTES).length /
                completionMinutes.length) *
                100,
            )
          : null,
        thresholdMinutes: SLA_THRESHOLD_MINUTES,
      },
      activities: activities.map((item) => ({
        id: item.id,
        type: item.eventType,
        title: item.request.title ?? `Yêu cầu phòng ${item.request.room.roomNumber}`,
        description: item.note ?? `Cập nhật yêu cầu ${item.request.id}`,
        createdAt: item.createdAt.toISOString(),
      })),
      warnings: [],
    };
  }
}
