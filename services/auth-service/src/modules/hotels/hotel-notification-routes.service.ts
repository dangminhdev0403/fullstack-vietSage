import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { HotelAccessService } from "./hotel-access.service";

type RouteInput = {
  serviceCategoryId?: string | null;
  telegramChatId?: string;
  isActive?: boolean;
};

@Injectable()
export class HotelNotificationRoutesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hotelAccessService: HotelAccessService,
  ) {}

  async list(actorUserId: string, hotelId: string) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    return this.prisma.notificationRoute.findMany({
      where: { hotelId },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    });
  }

  async create(actorUserId: string, hotelId: string, input: Required<Pick<RouteInput, "telegramChatId">> & RouteInput) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    await this.assertCategoryInHotel(hotelId, input.serviceCategoryId);
    await this.assertNoDuplicateActiveRoute(hotelId, input);
    return this.prisma.notificationRoute.create({
      data: {
        hotelId,
        serviceCategoryId: input.serviceCategoryId ?? null,
        telegramChatId: input.telegramChatId.trim(),
        isActive: input.isActive ?? true,
      },
    });
  }

  async update(actorUserId: string, hotelId: string, routeId: string, input: RouteInput) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    const route = await this.prisma.notificationRoute.findFirst({ where: { id: routeId, hotelId } });
    if (!route) throw new NotFoundException("Không tìm thấy cấu hình Telegram");

    const next = {
      serviceCategoryId: input.serviceCategoryId === undefined ? route.serviceCategoryId : input.serviceCategoryId,
      telegramChatId: input.telegramChatId === undefined ? route.telegramChatId : input.telegramChatId.trim(),
      isActive: input.isActive === undefined ? route.isActive : input.isActive,
    };
    await this.assertCategoryInHotel(hotelId, next.serviceCategoryId);
    if (next.isActive) await this.assertNoDuplicateActiveRoute(hotelId, next, routeId);

    return this.prisma.notificationRoute.update({
      where: { id: routeId },
      data: {
        serviceCategoryId: next.serviceCategoryId ?? null,
        telegramChatId: next.telegramChatId,
        isActive: next.isActive,
      },
    });
  }

  private async assertCategoryInHotel(hotelId: string, serviceCategoryId?: string | null) {
    if (!serviceCategoryId) return;
    const category = await this.prisma.hotelServiceCategory.findFirst({ where: { id: serviceCategoryId, hotelId }, select: { id: true } });
    if (!category) throw new NotFoundException("Không tìm thấy nhóm dịch vụ");
  }

  private async assertNoDuplicateActiveRoute(hotelId: string, input: RouteInput, excludeId?: string) {
    if (input.isActive === false) return;
    const where: Prisma.NotificationRouteWhereInput = {
      hotelId,
      isActive: true,
      id: excludeId ? { not: excludeId } : undefined,
      serviceCategoryId: input.serviceCategoryId ?? null,
    };
    const duplicate = await this.prisma.notificationRoute.findFirst({ where, select: { id: true } });
    if (duplicate) throw new BadRequestException("Đã tồn tại cấu hình Telegram đang hoạt động cho tuyến này");
  }
}
