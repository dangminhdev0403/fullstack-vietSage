import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../../prisma/prisma.service";
import { HotelCoreRepository } from "./hotel-core.repository";
import { HotelRequestsRepository } from "./hotel-requests.repository";
import { HotelRoomsRepository } from "./hotel-rooms.repository";
import { HotelServiceCatalogRepository } from "./hotel-service-catalog.repository";

export * from "./hotel-repository.types";

/**
 * Backwards-compatible facade for legacy callers/tests.
 * New hotel module code should depend on the narrower repository matching its domain.
 */
@Injectable()
export class HotelsRepository {
  private readonly coreRepository: HotelCoreRepository;
  private readonly roomsRepository: HotelRoomsRepository;
  private readonly serviceCatalogRepository: HotelServiceCatalogRepository;
  private readonly requestsRepository: HotelRequestsRepository;

  constructor(prisma: PrismaService) {
    this.coreRepository = new HotelCoreRepository(prisma);
    this.roomsRepository = new HotelRoomsRepository(prisma);
    this.serviceCatalogRepository = new HotelServiceCatalogRepository(prisma);
    this.requestsRepository = new HotelRequestsRepository(prisma);
  }

  findActorById(...args: Parameters<HotelCoreRepository["findActorById"]>) {
    return this.coreRepository.findActorById(...args);
  }

  findTenantById(...args: Parameters<HotelCoreRepository["findTenantById"]>) {
    return this.coreRepository.findTenantById(...args);
  }

  createHotel(...args: Parameters<HotelCoreRepository["createHotel"]>) {
    return this.coreRepository.createHotel(...args);
  }

  listHotels(...args: Parameters<HotelCoreRepository["listHotels"]>) {
    return this.coreRepository.listHotels(...args);
  }

  findHotelById(...args: Parameters<HotelCoreRepository["findHotelById"]>) {
    return this.coreRepository.findHotelById(...args);
  }

  findHotelByIdAndTenantIds(...args: Parameters<HotelCoreRepository["findHotelByIdAndTenantIds"]>) {
    return this.coreRepository.findHotelByIdAndTenantIds(...args);
  }

  updateHotel(...args: Parameters<HotelCoreRepository["updateHotel"]>) {
    return this.coreRepository.updateHotel(...args);
  }

  updateHotelScoped(...args: Parameters<HotelCoreRepository["updateHotelScoped"]>) {
    return this.coreRepository.updateHotelScoped(...args);
  }

  createRoomWithQr(...args: Parameters<HotelRoomsRepository["createRoomWithQr"]>) {
    return this.roomsRepository.createRoomWithQr(...args);
  }

  listRooms(...args: Parameters<HotelRoomsRepository["listRooms"]>) {
    return this.roomsRepository.listRooms(...args);
  }

  updateRoomInHotel(...args: Parameters<HotelRoomsRepository["updateRoomInHotel"]>) {
    return this.roomsRepository.updateRoomInHotel(...args);
  }

  findRoomInHotel(...args: Parameters<HotelRoomsRepository["findRoomInHotel"]>) {
    return this.roomsRepository.findRoomInHotel(...args);
  }

  createStay(...args: Parameters<HotelRoomsRepository["createStay"]>) {
    return this.roomsRepository.createStay(...args);
  }

  findStayInHotel(...args: Parameters<HotelRoomsRepository["findStayInHotel"]>) {
    return this.roomsRepository.findStayInHotel(...args);
  }

  findBlockingBillingFolio(...args: Parameters<HotelRoomsRepository["findBlockingBillingFolio"]>) {
    return this.roomsRepository.findBlockingBillingFolio(...args);
  }

  checkInStay(...args: Parameters<HotelRoomsRepository["checkInStay"]>) {
    return this.roomsRepository.checkInStay(...args);
  }

  createAndCheckInStay(...args: Parameters<HotelRoomsRepository["createAndCheckInStay"]>) {
    return this.roomsRepository.createAndCheckInStay(...args);
  }

  checkOutStay(...args: Parameters<HotelRoomsRepository["checkOutStay"]>) {
    return this.roomsRepository.checkOutStay(...args);
  }

  rotateQr(...args: Parameters<HotelRoomsRepository["rotateQr"]>) {
    return this.roomsRepository.rotateQr(...args);
  }

  activateQr(...args: Parameters<HotelRoomsRepository["activateQr"]>) {
    return this.roomsRepository.activateQr(...args);
  }

  deactivateQr(...args: Parameters<HotelRoomsRepository["deactivateQr"]>) {
    return this.roomsRepository.deactivateQr(...args);
  }

  listServiceCategories(
    ...args: Parameters<HotelServiceCatalogRepository["listServiceCategories"]>
  ) {
    return this.serviceCatalogRepository.listServiceCategories(...args);
  }

  getServiceCategoryTelegramGroup(
    ...args: Parameters<HotelServiceCatalogRepository["getServiceCategoryTelegramGroup"]>
  ) {
    return this.serviceCatalogRepository.getServiceCategoryTelegramGroup(...args);
  }

  syncServiceCategoryTelegramGroup(
    ...args: Parameters<HotelServiceCatalogRepository["syncServiceCategoryTelegramGroup"]>
  ) {
    return this.serviceCatalogRepository.syncServiceCategoryTelegramGroup(...args);
  }

  createServiceCategory(
    ...args: Parameters<HotelServiceCatalogRepository["createServiceCategory"]>
  ) {
    return this.serviceCatalogRepository.createServiceCategory(...args);
  }

  findServiceCategoryInHotel(
    ...args: Parameters<HotelServiceCatalogRepository["findServiceCategoryInHotel"]>
  ) {
    return this.serviceCatalogRepository.findServiceCategoryInHotel(...args);
  }

  updateServiceCategory(
    ...args: Parameters<HotelServiceCatalogRepository["updateServiceCategory"]>
  ) {
    return this.serviceCatalogRepository.updateServiceCategory(...args);
  }

  listServiceItems(...args: Parameters<HotelServiceCatalogRepository["listServiceItems"]>) {
    return this.serviceCatalogRepository.listServiceItems(...args);
  }

  createServiceItem(...args: Parameters<HotelServiceCatalogRepository["createServiceItem"]>) {
    return this.serviceCatalogRepository.createServiceItem(...args);
  }

  findServiceItemInHotel(
    ...args: Parameters<HotelServiceCatalogRepository["findServiceItemInHotel"]>
  ) {
    return this.serviceCatalogRepository.findServiceItemInHotel(...args);
  }

  updateServiceItem(...args: Parameters<HotelServiceCatalogRepository["updateServiceItem"]>) {
    return this.serviceCatalogRepository.updateServiceItem(...args);
  }

  listRequests(...args: Parameters<HotelRequestsRepository["listRequests"]>) {
    return this.requestsRepository.listRequests(...args);
  }

  summarizeRequests(...args: Parameters<HotelRequestsRepository["summarizeRequests"]>) {
    return this.requestsRepository.summarizeRequests(...args);
  }

  summarizeOperationalRequests(
    ...args: Parameters<HotelRequestsRepository["summarizeOperationalRequests"]>
  ) {
    return this.requestsRepository.summarizeOperationalRequests(...args);
  }

  findRequestInHotel(...args: Parameters<HotelRequestsRepository["findRequestInHotel"]>) {
    return this.requestsRepository.findRequestInHotel(...args);
  }

  findRequestDetailInHotel(
    ...args: Parameters<HotelRequestsRepository["findRequestDetailInHotel"]>
  ) {
    return this.requestsRepository.findRequestDetailInHotel(...args);
  }

  findAssignableStaffInTenant(
    ...args: Parameters<HotelRequestsRepository["findAssignableStaffInTenant"]>
  ) {
    return this.requestsRepository.findAssignableStaffInTenant(...args);
  }

  updateRequestStatus(...args: Parameters<HotelRequestsRepository["updateRequestStatus"]>) {
    return this.requestsRepository.updateRequestStatus(...args);
  }

  updateRequestAssignment(...args: Parameters<HotelRequestsRepository["updateRequestAssignment"]>) {
    return this.requestsRepository.updateRequestAssignment(...args);
  }

  createRequestEvent(...args: Parameters<HotelRequestsRepository["createRequestEvent"]>) {
    return this.requestsRepository.createRequestEvent(...args);
  }
}
