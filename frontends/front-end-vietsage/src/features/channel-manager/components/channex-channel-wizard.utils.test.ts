import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import * as wizardUtils from "./channex-channel-wizard.utils.ts";

const { buildRateMappingSettings, flattenRemoteRates, resolveRateOccupancy } =
  wizardUtils;

test("returns no rates before mapping details load", () => {
  assert.deepEqual(flattenRemoteRates(undefined), []);
  assert.deepEqual(flattenRemoteRates(null), []);
});

test("flattens common room-rate mapping details", () => {
  assert.deepEqual(
    flattenRemoteRates({
      rooms: [
        {
          id: 100,
          title: "Double",
          rates: [
            {
              id: 200,
              title: "Standard",
              pricing: "OBP",
              occupancies: [1, 2],
              max_persons: 2,
            },
          ],
        },
      ],
    }),
    [
      {
        key: "100:200",
        roomCode: 100,
        roomTitle: "Double",
        rateCode: 200,
        rateTitle: "Standard",
        pricing: "OBP",
        occupancies: [1, 2],
        maxPersons: 2,
      },
    ],
  );
});

test("uses OTA occupancy when local occupancy is unsupported", () => {
  assert.equal(
    resolveRateOccupancy(
      {
        key: "single:standard",
        roomCode: "single",
        roomTitle: "Single Room",
        rateCode: "standard",
        rateTitle: "Standard rate",
        pricing: "OBP",
        occupancies: [1],
        maxPersons: 1,
      },
      2,
    ),
    1,
  );
});

test("builds only fields declared by adapter rate_params", () => {
  assert.deepEqual(
    buildRateMappingSettings(
      [
        { key: "room_type_code", type: "string", position: 0 },
        { key: "rate_plan_code", type: "string", position: 1 },
        { key: "occupancy", type: "integer", position: 2 },
        { key: "pricing_type", type: "string", position: 3 },
        { key: "primary_occ", type: "boolean", position: 4 },
      ],
      {
        key: "100:200",
        roomCode: 100,
        roomTitle: "Double",
        rateCode: 200,
        rateTitle: "Standard",
        pricing: "OBP",
        occupancies: [1, 2],
        maxPersons: 2,
      },
      2,
    ),
    {
      room_type_code: 100,
      rate_plan_code: 200,
      occupancy: 2,
      pricing_type: "OBP",
      primary_occ: true,
    },
  );
});
