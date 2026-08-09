export type LocalPartnerStatus = "ACTIVE" | "DISABLED";

export type LocalPartnerCategory = {
  id: string;
  code: string;
  nameVi: string;
  nameEn: string;
  icon: string;
  sortOrder: number;
  isActive: boolean;
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
  operatingHours?: string | null;
  status: LocalPartnerStatus;
  isFeatured: boolean;
  sortOrder: number;
  category?: LocalPartnerCategory;
};

export type LocalPartnerInput = {
  categoryId: string;
  name: string;
  address: string;
  description?: string;
  distanceMeters?: number;
  phone?: string;
  zaloUrl?: string;
  websiteUrl?: string;
  googleMapUrl?: string;
  coverImageUrl?: string;
  operatingHours?: string;
  isFeatured?: boolean;
};
