import { z } from "zod";
import { executeHotelOpsBackendRequest } from "@/app/api/hotel-ops/_utils";
import { HttpError } from "@/core/http/http-error";
import { localMateAdminClient } from "@/features/localmate-admin/client";
import {
  httpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "../_utils";

const createGuideSchema = z.object({
  action: z.literal("createGuide"),
  input: z.object({
    guideCode: z.string().trim().min(2).max(40).optional(),
    fullName: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(8).max(40),
    email: z.string().trim().email().optional().or(z.literal("")),
    avatarUrl: z.string().trim().url(),
    status: z.enum(["PENDING", "QUALIFIED", "SUSPENDED"]).optional(),
    languages: z.array(z.string().trim()).min(1),
    operatingRegions: z.array(z.string().trim()).min(1),
    specialties: z.array(z.string().trim()).default([]),
    bio: z.string().trim().max(1000).optional(),
    dailyRateVnd: z.coerce.number().int().min(0).default(1000000),
    position: z.string().trim().max(80).optional(),
    userId: z.string().trim().optional(),
    tenantId: z.string().trim().optional(),
  }),
});

const updateGuideSchema = z.object({
  action: z.literal("updateGuide"),
  guideId: z.string().min(1),
  input: z.object({
    fullName: z.string().trim().min(2).max(120).optional(),
    phone: z.string().trim().min(8).max(40).optional(),
    email: z.string().trim().email().optional().or(z.literal("")),
    avatarUrl: z.string().trim().url().optional(),
    status: z.enum(["PENDING", "QUALIFIED", "SUSPENDED"]).optional(),
    languages: z.array(z.string().trim()).min(1).optional(),
    operatingRegions: z.array(z.string().trim()).min(1).optional(),
    specialties: z.array(z.string().trim()).optional(),
    bio: z.string().trim().max(1000).optional(),
    dailyRateVnd: z.coerce.number().int().min(0).optional(),
    position: z.string().trim().max(80).optional(),
    userId: z.string().trim().optional(),
    tenantId: z.string().trim().optional(),
  }),
});

const updateQualificationSchema = z.object({
  action: z.literal("updateQualification"),
  guideId: z.string().min(1),
  status: z.enum(["PENDING", "QUALIFIED", "SUSPENDED"]),
});

function requireCoordinatePair(
  value: { latitude?: number | null; longitude?: number | null },
  context: z.RefinementCtx,
) {
  const hasLatitude = Object.prototype.hasOwnProperty.call(value, "latitude");
  const hasLongitude = Object.prototype.hasOwnProperty.call(value, "longitude");
  if (
    hasLatitude !== hasLongitude ||
    (hasLatitude && hasLongitude && (value.latitude == null) !== (value.longitude == null))
  ) {
    context.addIssue({
      code: "custom",
      path: [hasLatitude ? "longitude" : "latitude"],
      message: "Vĩ độ và kinh độ phải được cung cấp cùng nhau",
    });
  }
}

const createTourSchema = z.object({
  action: z.literal("createTour"),
  input: z
    .object({
      tourCode: z.string().trim().min(2).max(80).optional(),
      title: z.string().trim().min(2).max(255),
      provinceCode: z.string().trim().optional(),
      province: z.string().trim().optional(),
      tourScope: z.enum(["LOCAL", "REGIONAL_DAYTRIP", "INTERPROVINCIAL"]).optional(),
      duration: z.string().trim().min(1).max(80),
      highlights: z.array(z.string().trim()).default([]),
      content: z.string().trim().min(5),
      latitude: z.number().min(-90).max(90).nullish(),
      longitude: z.number().min(-180).max(180).nullish(),
    })
    .superRefine(requireCoordinatePair),
});

const updateTourSchema = z.object({
  action: z.literal("updateTour"),
  tourId: z.string().min(1),
  input: z
    .object({
      tourCode: z.string().trim().min(2).max(80).optional(),
      title: z.string().trim().min(2).max(255).optional(),
      provinceCode: z.string().trim().optional(),
      province: z.string().trim().optional(),
      tourScope: z.enum(["LOCAL", "REGIONAL_DAYTRIP", "INTERPROVINCIAL"]).optional(),
      duration: z.string().trim().min(1).max(80).optional(),
      highlights: z.array(z.string().trim()).optional(),
      content: z.string().trim().min(5).optional(),
      latitude: z.number().min(-90).max(90).nullish(),
      longitude: z.number().min(-180).max(180).nullish(),
    })
    .superRefine(requireCoordinatePair),
});

const deleteTourSchema = z.object({
  action: z.literal("deleteTour"),
  tourId: z.string().min(1),
});

const matchAiSchema = z.object({
  action: z.literal("matchAi"),
  input: z.object({
    destination: z.string().trim().optional(),
    language: z.string().trim().optional(),
    preferences: z.array(z.string()).optional(),
    durationDays: z.coerce.number().optional(),
    limit: z.coerce.number().int().min(1).max(10).default(3),
  }),
});

const pairTelegramSchema = z.object({
  action: z.literal("pairTelegram"),
  guideId: z.string().min(1),
});

const disconnectTelegramSchema = z.object({
  action: z.literal("disconnectTelegram"),
  guideId: z.string().min(1),
});

const actionSchema = z.discriminatedUnion("action", [
  createGuideSchema,
  updateGuideSchema,
  updateQualificationSchema,
  pairTelegramSchema,
  disconnectTelegramSchema,
  createTourSchema,
  updateTourSchema,
  deleteTourSchema,
  matchAiSchema,
]);

export async function GET() {
  try {
    const data = await executeHotelOpsBackendRequest(
      "localmate admin data",
      async (token) => {
        const [guidesRes, tours] = await Promise.all([
          localMateAdminClient.listGuides(token),
          localMateAdminClient.listTours(token),
        ]);
        return {
          guides: guidesRes.items ?? [],
          totalGuides: guidesRes.total ?? 0,
          tours: tours ?? [],
        };
      },
    );
    return data instanceof Response ? data : successResponse(data);
  } catch (error) {
    return error instanceof HttpError
      ? httpErrorResponse(error)
      : unknownServerErrorResponse();
  }
}

export async function POST(request: Request) {
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return validationErrorResponse("LocalMate payload is invalid");
  }

  const action = parsed.data;
  try {
    const data = await executeHotelOpsBackendRequest(
      "localmate admin mutation",
      async (token) => {
        switch (action.action) {
          case "createGuide":
            return localMateAdminClient.createGuide(token, action.input);
          case "updateGuide":
            return localMateAdminClient.updateGuide(token, action.guideId, action.input);
          case "updateQualification":
            return localMateAdminClient.updateQualification(
              token,
              action.guideId,
              action.status,
            );
          case "pairTelegram":
            return localMateAdminClient.pairTelegram(token, action.guideId);
          case "disconnectTelegram":
            return localMateAdminClient.disconnectTelegram(token, action.guideId);
          case "createTour":
            return localMateAdminClient.createTour(token, action.input);
          case "updateTour":
            return localMateAdminClient.updateTour(token, action.tourId, action.input);
          case "deleteTour":
            return localMateAdminClient.deleteTour(token, action.tourId);
          case "matchAi":
            return localMateAdminClient.matchAi(token, action.input);
        }
      },
    );
    return data instanceof Response ? data : successResponse(data, 200);
  } catch (error) {
    return error instanceof HttpError
      ? httpErrorResponse(error)
      : unknownServerErrorResponse();
  }
}
