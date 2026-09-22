import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

test("owner operational reset contract: backend and frontend integration", () => {
  // 1. Check frontend AdminService method
  const adminServicePath = path.join(
    rootDir,
    "frontends/front-end-vietsage/src/features/admin/service/admin-service.ts",
  );
  const adminServiceContent = fs.readFileSync(adminServicePath, "utf-8");
  assert.match(adminServiceContent, /resetHotelOperationalData/);
  assert.match(adminServiceContent, /\/hotels\/\$\{encodeURIComponent\(hotelId\)\}\/operational-reset/);

  // 2. Check BFF Route
  const bffRoutePath = path.join(
    rootDir,
    "frontends/front-end-vietsage/src/app/api/owner/hotels/[hotelId]/operational-reset/route.ts",
  );
  assert.ok(fs.existsSync(bffRoutePath), "BFF route must exist");
  const bffRouteContent = fs.readFileSync(bffRoutePath, "utf-8");
  assert.match(bffRouteContent, /export async function POST/);
  assert.match(bffRouteContent, /resetHotelOperationalData/);

  // 3. Check Owner Hotel Detail Client UI
  const clientPath = path.join(
    rootDir,
    "frontends/front-end-vietsage/src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/owner-hotel-detail-client.tsx",
  );
  const clientContent = fs.readFileSync(clientPath, "utf-8");
  assert.match(clientContent, /handleOperationalReset/);
  assert.match(clientContent, /operationalResetCount/);
  assert.match(clientContent, /MAX_RESETS = 2/);
  assert.match(clientContent, /remainingResets > 0/);
  assert.match(clientContent, /Khởi động lại dữ liệu vận hành/);
  assert.match(clientContent, /reverseButtons: false/);

  // 4. Check Backend HotelsController and HotelsService
  const controllerPath = path.join(
    rootDir,
    "services/auth-service/src/modules/property/api/hotels.controller.ts",
  );
  const controllerContent = fs.readFileSync(controllerPath, "utf-8");
  assert.match(controllerContent, /@Post\(":hotelId\/operational-reset"\)/);
  assert.match(controllerContent, /resetOperationalData/);

  const servicePath = path.join(
    rootDir,
    "services/auth-service/src/modules/property/application/hotels.service.ts",
  );
  const serviceContent = fs.readFileSync(servicePath, "utf-8");
  assert.match(serviceContent, /resetOperationalData/);
  assert.match(serviceContent, /MAX_RESETS = 2/);
  assert.match(serviceContent, /!actor\.isSuperAdmin && currentCount >= MAX_RESETS/);

  const repositoryPath = path.join(
    rootDir,
    "services/auth-service/src/modules/property/infrastructure/repositories/hotel-core.repository.ts",
  );
  const repositoryContent = fs.readFileSync(repositoryPath, "utf-8");
  assert.match(repositoryContent, /resetHotelOperationalData/);
  assert.match(repositoryContent, /RoomStatus\.AVAILABLE/);
  assert.match(repositoryContent, /marketplaceRevenueEntry\.deleteMany/);
  assert.match(repositoryContent, /serviceVoucher\.deleteMany/);
  assert.match(repositoryContent, /marketplaceSettlement\.deleteMany/);
  assert.match(repositoryContent, /emergencyNotification\.deleteMany/);
  assert.match(repositoryContent, /emergencyCallEvent\.deleteMany/);
  assert.match(repositoryContent, /emergencyIncident\.deleteMany/);
  assert.match(repositoryContent, /biometricWorkstationPairing\.deleteMany/);
  assert.doesNotMatch(repositoryContent, /hotelRoomStaffAssignment\.deleteMany/);
  assert.doesNotMatch(repositoryContent, /hotelStaffAssignment\.deleteMany/);
  assert.doesNotMatch(repositoryContent, /user\.deleteMany/);
  assert.match(repositoryContent, /domainEvent\.deleteMany/);

  // 5. Check Owner Rooms Client UI has operational reset action
  const roomsClientPath = path.join(
    rootDir,
    "frontends/front-end-vietsage/src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/rooms/owner-rooms-client.tsx",
  );
  const roomsClientContent = fs.readFileSync(roomsClientPath, "utf-8");
  assert.match(roomsClientContent, /handleOperationalReset/);
  assert.match(roomsClientContent, /Khởi động lại vận hành/);
  assert.match(roomsClientContent, /SwalVietSage/);
  assert.match(roomsClientContent, /reverseButtons: false/);
});
