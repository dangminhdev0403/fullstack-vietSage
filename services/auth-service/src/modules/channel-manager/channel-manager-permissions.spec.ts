process.env.DATABASE_URL = "postgresql://mock:mock@localhost:5432/mock";
process.env.NODE_ENV = "test";
process.env.PORT = "3000";
process.env.JWT_ACCESS_SECRET = "mock_jwt_access_secret_32_chars_long!!";
process.env.JWT_REFRESH_SECRET = "mock_jwt_refresh_secret_32_chars_long!";
process.env.JWT_ACCESS_TTL = "15m";
process.env.JWT_REFRESH_TTL = "7d";

import fs from "fs";
import path from "path";
import { REQUIRED_PERMISSION_KEY } from "../../shared/decorators/require-permission.decorator";
import {
  BUSINESS_PERMISSIONS,
  isBusinessPermissionKey,
} from "../../common/config/business-permissions.registry";
import { resolveBusinessPermissionMenuPath } from "../../common/config/business-permission-menu.util";
import { ChannelManagerController } from "./controllers/channel-manager.controller";

describe("Channel Manager RBAC Contract Specification", () => {
  describe("Business Permissions Registry", () => {
    it("registers hotel.channels.view and hotel.channels.manage under hotel-channels domain", () => {
      expect(isBusinessPermissionKey("hotel.channels.view")).toBe(true);
      expect(isBusinessPermissionKey("hotel.channels.manage")).toBe(true);

      const viewDef = BUSINESS_PERMISSIONS.find((p) => p.key === "hotel.channels.view");
      expect(viewDef).toBeDefined();
      expect(viewDef?.domain).toBe("hotel-channels");
      expect(viewDef?.risk).toBe("LOW");

      const manageDef = BUSINESS_PERMISSIONS.find((p) => p.key === "hotel.channels.manage");
      expect(manageDef).toBeDefined();
      expect(manageDef?.domain).toBe("hotel-channels");
      expect(manageDef?.risk).toBe("HIGH");
    });

    it("resolves both keys to /owner/hotels/[hotelId]/channel-manager in the menu map", () => {
      expect(resolveBusinessPermissionMenuPath("hotel.channels.view")).toBe(
        "/owner/hotels/[hotelId]/channel-manager",
      );
      expect(resolveBusinessPermissionMenuPath("hotel.channels.manage")).toBe(
        "/owner/hotels/[hotelId]/channel-manager",
      );
    });
  });

  describe("ChannelManagerController RBAC Metadata Contracts", () => {
    it("keeps local inventory grid and update endpoints under hotel.rooms.*", () => {
      expect(
        Reflect.getMetadata(REQUIRED_PERMISSION_KEY, ChannelManagerController.prototype.getInventory),
      ).toBe("hotel.rooms.view");

      expect(
        Reflect.getMetadata(
          REQUIRED_PERMISSION_KEY,
          ChannelManagerController.prototype.updateRestrictions,
        ),
      ).toBe("hotel.rooms.manage");

      expect(
        Reflect.getMetadata(
          REQUIRED_PERMISSION_KEY,
          ChannelManagerController.prototype.updateAvailability,
        ),
      ).toBe("hotel.rooms.manage");

      expect(
        Reflect.getMetadata(
          REQUIRED_PERMISSION_KEY,
          ChannelManagerController.prototype.bulkUpdate,
        ),
      ).toBe("hotel.rooms.manage");
    });

    it("puts OTA booking list under hotel.reservations.view or platform.hotels.view", () => {
      const perms = Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        ChannelManagerController.prototype.getSimulatedBookings,
      );
      expect(perms).toEqual(["hotel.reservations.view", "platform.hotels.view"]);
    });

    it("restricts synthetic booking create/cancel tools to platform.hotels.manage", () => {
      expect(
        Reflect.getMetadata(
          REQUIRED_PERMISSION_KEY,
          ChannelManagerController.prototype.simulateBooking,
        ),
      ).toEqual(["platform.hotels.manage"]);

      expect(
        Reflect.getMetadata(
          REQUIRED_PERMISSION_KEY,
          ChannelManagerController.prototype.cancelSimulatedBooking,
        ),
      ).toEqual(["platform.hotels.manage"]);
    });

    it("enforces channel configuration, catalog, and doctor under hotel.channels or platform.hotels", () => {
      const readEndpoints = [
        ChannelManagerController.prototype.getConnections,
        ChannelManagerController.prototype.getPendingChannexModifications,
        ChannelManagerController.prototype.runChannexDoctor,
        ChannelManagerController.prototype.getChannexMappings,
        ChannelManagerController.prototype.getChannexChannels,
        ChannelManagerController.prototype.getChannexChannel,
        ChannelManagerController.prototype.getChannexConfig,
      ];

      for (const endpoint of readEndpoints) {
        expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, endpoint)).toEqual([
          "hotel.channels.view",
          "platform.hotels.view",
        ]);
      }

      const manageEndpoints = [
        ChannelManagerController.prototype.createConnection,
        ChannelManagerController.prototype.deleteConnection,
        ChannelManagerController.prototype.syncNow,
        ChannelManagerController.prototype.syncChannexContent,
        ChannelManagerController.prototype.pushChannexAri,
        ChannelManagerController.prototype.pollChannexFeed,
        ChannelManagerController.prototype.recoverChannexBookings,
        ChannelManagerController.prototype.resolveChannexModification,
        ChannelManagerController.prototype.prepareChannexChannel,
        ChannelManagerController.prototype.createChannexChannel,
        ChannelManagerController.prototype.activateChannexChannel,
        ChannelManagerController.prototype.deactivateChannexChannel,
        ChannelManagerController.prototype.updateChannexChannel,
        ChannelManagerController.prototype.syncChannexChannel,
        ChannelManagerController.prototype.deleteChannexChannel,
        ChannelManagerController.prototype.createChannexChannelSession,
        ChannelManagerController.prototype.configureChannexProperty,
      ];

      for (const endpoint of manageEndpoints) {
        expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, endpoint)).toEqual([
          "hotel.channels.manage",
          "platform.hotels.manage",
        ]);
      }
    });

    it("guarantees hotel.rooms.manage alone cannot manage or mutate OTA channels", () => {
      const protectedMutations = [
        ChannelManagerController.prototype.createChannexChannel,
        ChannelManagerController.prototype.activateChannexChannel,
        ChannelManagerController.prototype.deactivateChannexChannel,
        ChannelManagerController.prototype.deleteChannexChannel,
        ChannelManagerController.prototype.syncChannexChannel,
        ChannelManagerController.prototype.recoverChannexBookings,
        ChannelManagerController.prototype.configureChannexProperty,
        ChannelManagerController.prototype.syncChannexContent,
      ];

      for (const mutation of protectedMutations) {
        const required = Reflect.getMetadata(REQUIRED_PERMISSION_KEY, mutation);
        const requiredList = Array.isArray(required) ? required : [required];
        expect(requiredList).not.toContain("hotel.rooms.manage");
        expect(requiredList).toContain("hotel.channels.manage");
      }
    });
  });

  describe("Prisma Migration Candidate Inspection", () => {
    const migrationPath = path.resolve(
      __dirname,
      "../../../prisma/migrations/20261003183000_channel_manager_permissions/migration.sql",
    );

    it("defines an idempotent unapplied migration candidate with strict role grants", () => {
      expect(fs.existsSync(migrationPath)).toBe(true);
      const sql = fs.readFileSync(migrationPath, "utf-8");

      // Inserts the two OPTIONS permissions under hotel-channels
      expect(sql).toContain("hotel.channels.view");
      expect(sql).toContain("hotel.channels.manage");
      expect(sql).toContain("hotel-channels");
      expect(sql).toContain("OPTIONS");

      // Grants to TENANT_OWNER
      expect(sql).toContain("TENANT_OWNER");

      // Does NOT grant channel permissions to HOTEL_FRONTDESK
      expect(sql).not.toContain("HOTEL_FRONTDESK");

      // Idempotent and non-destructive
      expect(sql).toContain("ON CONFLICT");
      expect(sql).not.toContain("DELETE FROM");
      expect(sql).not.toContain("DROP TABLE");
    });
  });
});
