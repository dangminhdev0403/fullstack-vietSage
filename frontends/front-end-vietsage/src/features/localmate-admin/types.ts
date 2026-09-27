export type LocalMateStatus = "PENDING" | "QUALIFIED" | "SUSPENDED";

export type LocalMatePosition = "GUIDE" | "COORDINATOR" | "LEADER";

export type LocalMateGuide = {
  id: string;
  userId?: string | null;
  tenantId?: string | null;
  guideCode: string;
  fullName: string;
  phone: string;
  email: string | null;
  avatarUrl: string;
  status: LocalMateStatus;
  position?: string;
  languages: string[];
  operatingRegions: string[];
  specialties: string[];
  bio: string | null;
  serviceLatitude: number | null;
  serviceLongitude: number | null;
  dailyRateVnd: number;
  rating: number;
  totalReviews: number;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    email: string;
    fullName: string;
    status: string;
  } | null;
};

export type CreateLocalMateGuideInput = {
  guideCode?: string;
  fullName: string;
  phone: string;
  email?: string;
  avatarUrl: string;
  status?: LocalMateStatus;
  position?: string;
  userId?: string;
  tenantId?: string;
  languages: string[];
  operatingRegions: string[];
  specialties?: string[];
  bio?: string;
  serviceLatitude?: number | null;
  serviceLongitude?: number | null;
  dailyRateVnd?: number;
};

export type CreatedLocalMateGuide = LocalMateGuide & {
  temporaryPassword?: string;
};

export type UpdateLocalMateGuideInput = Partial<CreateLocalMateGuideInput>;

export type LocalMateTourScope = "LOCAL" | "REGIONAL_DAYTRIP" | "INTERPROVINCIAL";

export type LocalMateTourKnowledge = {
  id: string;
  tourCode: string;
  title: string;
  provinceCode?: string;
  province?: string;
  tourScope?: LocalMateTourScope;
  duration: string;
  highlights: string[];
  content: string;
  sourceFileName: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateLocalMateTourInput = {
  tourCode?: string;
  title: string;
  provinceCode?: string;
  province?: string;
  tourScope?: LocalMateTourScope;
  duration: string;
  highlights?: string[];
  content: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type UpdateLocalMateTourInput = Partial<CreateLocalMateTourInput>;

export type MatchLocalMateAiInput = {
  destination?: string;
  language?: string;
  preferences?: string[];
  durationDays?: number;
  limit?: number;
};

export type MatchedLocalMateItem = {
  guideCode: string;
  fullName: string;
  avatarUrl: string;
  languages: string[];
  operatingRegions: string[];
  specialties: string[];
  dailyRateVnd: number;
  rating: number;
  totalReviews: number;
  matchScore: number;
  matchReason: string;
};

export type MatchedAiTourItem = {
  tourCode: string;
  title: string;
  duration: string;
  highlights: string[];
};

export type MatchAiResponse = {
  matchedCount: number;
  topLocalMates: MatchedLocalMateItem[];
  suggestedTours: MatchedAiTourItem[];
};

export type LocalMateAdminData = {
  guides: LocalMateGuide[];
  tours: LocalMateTourKnowledge[];
  totalGuides: number;
};
