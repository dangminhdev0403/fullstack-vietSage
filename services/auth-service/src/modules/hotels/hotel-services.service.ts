import { Injectable } from "@nestjs/common";
import { HotelsService } from "./hotels.service";
import type {
  CreateServiceCategoryBodyInput,
  CreateServiceItemBodyInput,
  ListServiceCategoriesQueryInput,
  ListServiceItemsQueryInput,
  UpdateServiceCategoryBodyInput,
  UpdateServiceItemBodyInput,
} from "./schemas/hotels.schema";

@Injectable()
export class HotelServicesService {
  constructor(private readonly hotelsService: HotelsService) {}

  listServiceCategories(
    actorUserId: string,
    hotelId: string,
    query: ListServiceCategoriesQueryInput,
  ) {
    return this.hotelsService.listServiceCategories(actorUserId, hotelId, query);
  }

  createServiceCategory(actorUserId: string, hotelId: string, dto: CreateServiceCategoryBodyInput) {
    return this.hotelsService.createServiceCategory(actorUserId, hotelId, dto);
  }

  updateServiceCategory(
    actorUserId: string,
    hotelId: string,
    categoryId: string,
    dto: UpdateServiceCategoryBodyInput,
  ) {
    return this.hotelsService.updateServiceCategory(actorUserId, hotelId, categoryId, dto);
  }

  listServiceItems(actorUserId: string, hotelId: string, query: ListServiceItemsQueryInput) {
    return this.hotelsService.listServiceItems(actorUserId, hotelId, query);
  }

  createServiceItem(actorUserId: string, hotelId: string, dto: CreateServiceItemBodyInput) {
    return this.hotelsService.createServiceItem(actorUserId, hotelId, dto);
  }

  updateServiceItem(
    actorUserId: string,
    hotelId: string,
    itemId: string,
    dto: UpdateServiceItemBodyInput,
  ) {
    return this.hotelsService.updateServiceItem(actorUserId, hotelId, itemId, dto);
  }
}
