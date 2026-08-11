import { BadRequestException } from "@nestjs/common";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { updateHotelBodySchema } from "../../property/domain/schemas/hotel.schema";

describe("hotel marketplace location", () => {
  it("requires a coordinate pair", () => {
    expect(() => parseWithZod(updateHotelBodySchema, { latitude: 10 })).toThrow(
      BadRequestException,
    );
    expect(
      parseWithZod(updateHotelBodySchema, {
        latitude: 10,
        longitude: 106,
        locationSource: "DEVICE_GEOLOCATION",
      }),
    ).toEqual({ latitude: 10, longitude: 106, locationSource: "DEVICE_GEOLOCATION" });
  });
});
