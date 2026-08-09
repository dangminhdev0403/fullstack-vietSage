import { z } from "zod";

export const localPartnerStatusSchema = z.enum(["ACTIVE", "DISABLED"]);

export const localPartnerOfferDiscountTypeSchema = z.enum([
  "PERCENTAGE",
  "FIXED_AMOUNT",
  "FREE_GIFT",
  "SPECIAL_PRICE",
]);

export const localPartnerOfferStatusSchema = z.enum(["ACTIVE", "EXPIRED", "DISABLED"]);

export const localPartnerBookingStatusSchema = z.enum([
  "PENDING",
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
]);

export const localPartnerInteractionTypeSchema = z.enum([
  "VIEW_DETAIL",
  "CLICK_MAP",
  "CLICK_CALL",
  "CLICK_ZALO",
  "CLAIM_OFFER",
  "BOOKING_REQUEST",
]);

const localPartnerBodySchema = z.object({
  categoryId: z.string().min(1, "Danh mục đối tác không được để trống"),
  name: z.string().trim().min(2, "Tên đối tác tối thiểu 2 ký tự").max(160, "Tên đối tác tối đa 160 ký tự"),
  description: z.string().trim().max(1000).optional(),
  address: z.string().trim().min(3, "Địa chỉ tối thiểu 3 ký tự").max(255),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  distanceMeters: z.number().int().nonnegative().optional(),
  phone: z.string().trim().regex(/^[+\d][\d\s().-]{2,39}$/, "Số điện thoại không hợp lệ").optional(),
  zaloUrl: z.string().url().refine((value) => /^https?:/.test(value), "URL phải dùng HTTP/HTTPS").max(255).optional(),
  websiteUrl: z.string().url().refine((value) => /^https?:/.test(value), "URL phải dùng HTTP/HTTPS").max(255).optional(),
  googleMapUrl: z.string().url().refine((value) => /^https?:/.test(value), "URL phải dùng HTTP/HTTPS").max(500).optional(),
  coverImageUrl: z.string().url().refine((value) => /^https?:/.test(value), "URL phải dùng HTTP/HTTPS").max(500).optional(),
  images: z.array(z.string().url().refine((value) => /^https?:/.test(value))).max(10).optional(),
  operatingHours: z.string().trim().max(160).optional(),
  status: localPartnerStatusSchema.optional(),
  isFeatured: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

function requireCoordinatePair(value: { latitude?: number; longitude?: number }, context: z.RefinementCtx) {
  if ((value.latitude === undefined) !== (value.longitude === undefined)) {
    context.addIssue({ code: "custom", message: "Vĩ độ và kinh độ phải được nhập cùng nhau" });
  }
}

export const createLocalPartnerBodySchema = localPartnerBodySchema.superRefine(requireCoordinatePair);
export const updateLocalPartnerBodySchema = localPartnerBodySchema.partial().superRefine(requireCoordinatePair);

export const createLocalPartnerOfferBodySchema = z.object({
  title: z.string().trim().min(2, "Tiêu đề ưu đãi tối thiểu 2 ký tự").max(160),
  description: z.string().trim().max(500).optional(),
  discountCode: z.string().trim().max(80).optional(),
  discountType: localPartnerOfferDiscountTypeSchema.optional(),
  discountValue: z.number().optional(),
  termsCondition: z.string().trim().max(500).optional(),
  validFrom: z.string().datetime().optional().nullable(),
  validTo: z.string().datetime().optional().nullable(),
  status: localPartnerOfferStatusSchema.optional(),
});

export const updateLocalPartnerOfferBodySchema = createLocalPartnerOfferBodySchema.partial();

export const createBookingRequestBodySchema = z.object({
  partnerId: z.string().min(1, "Đối tác không được để trống"),
  offerId: z.string().optional(),
  guestName: z.string().trim().min(2, "Tên khách tối thiểu 2 ký tự").max(120),
  roomNumber: z.string().trim().min(1, "Số phòng không được để trống").max(40),
  guestPhone: z.string().trim().min(3, "Số điện thoại tối thiểu 3 ký tự").max(40),
  serviceType: z.string().trim().min(1, "Loại dịch vụ không được để trống").max(120),
  bookingTime: z.string().datetime().optional(),
  numberOfGuests: z.number().int().positive().optional(),
  notes: z.string().trim().max(500).optional(),
});

export const updateBookingRequestStatusBodySchema = z.object({
  status: localPartnerBookingStatusSchema,
});

export const recordInteractionBodySchema = z.object({
  partnerId: z.string().min(1, "Đối tác không được để trống"),
  actionType: localPartnerInteractionTypeSchema,
});

export const listGuestPartnersQuerySchema = z.object({
  categoryId: z.string().optional(),
  maxDistanceMeters: z.coerce.number().optional(),
  q: z.string().trim().optional(),
  isFeatured: z.enum(["true", "false"]).optional(),
});

export const hotelIdParamSchema = z.string().min(1, "hotelId không được để trống");
export const partnerIdParamSchema = z.string().min(1, "partnerId không được để trống");
export const offerIdParamSchema = z.string().min(1, "offerId không được để trống");
export const bookingRequestIdParamSchema = z.string().min(1, "bookingRequestId không được để trống");
