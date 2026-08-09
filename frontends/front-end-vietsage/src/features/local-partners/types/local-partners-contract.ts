export type LocalPartnerCategory = {
  id: string;
  code: string;
  nameVi: string;
  nameEn: string;
  icon: string;
  sortOrder: number;
  isActive: boolean;
};

export type LocalPartnerStatus = "ACTIVE" | "DISABLED";

export type LocalPartnerOfferDiscountType = "PERCENTAGE" | "FIXED_AMOUNT" | "FREE_GIFT" | "SPECIAL_PRICE";

export type LocalPartnerOfferStatus = "ACTIVE" | "EXPIRED" | "DISABLED";

export type LocalPartnerOffer = {
  id: string;
  partnerId: string;
  title: string;
  description?: string | null;
  discountCode?: string | null;
  discountType: LocalPartnerOfferDiscountType;
  discountValue?: number | null;
  termsCondition?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  status: LocalPartnerOfferStatus;
  createdAt: string;
};

export type LocalPartner = {
  id: string;
  hotelId: string;
  categoryId: string;
  name: string;
  description?: string | null;
  address: string;
  latitude?: number | null;
  longitude?: number | null;
  distanceMeters?: number | null;
  phone?: string | null;
  zaloUrl?: string | null;
  websiteUrl?: string | null;
  googleMapUrl?: string | null;
  coverImageUrl?: string | null;
  images: string[];
  operatingHours?: string | null;
  status: LocalPartnerStatus;
  isFeatured: boolean;
  sortOrder: number;
  createdAt: string;
  category?: LocalPartnerCategory;
  offers?: LocalPartnerOffer[];
};

export type LocalPartnerBookingStatus = "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED";

export type LocalPartnerBookingRequest = {
  id: string;
  hotelId: string;
  stayId?: string | null;
  partnerId: string;
  offerId?: string | null;
  guestName: string;
  roomNumber: string;
  guestPhone: string;
  serviceType: string;
  bookingTime?: string | null;
  numberOfGuests?: number | null;
  notes?: string | null;
  status: LocalPartnerBookingStatus;
  createdAt: string;
  partner?: LocalPartner;
  offer?: LocalPartnerOffer | null;
};

export type LocalPartnerAnalytics = {
  totalPartners: number;
  totalOffers: number;
  totalBookings: number;
  interactions: Record<string, number>;
};
