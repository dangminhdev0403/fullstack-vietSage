export type HotelReportsSummary = {
  totalRooms: number;
  occupiedRoomsNow: number;
  totalStays: number;
  totalGuests: number;
  totalRoomNights: number;
  occupancyRate: number;
  currentOccupancyRate: number;
  totalRevenue: number;
  roomRevenue: number;
  serviceRevenue: number;
  otherRevenue: number;
  adr: number;
  revpar: number;
};

export type DailyRevenueItem = {
  date: string;
  dayLabel: string;
  totalRevenue: number;
  roomRevenue: number;
  serviceRevenue: number;
  roomsOccupied: number;
  adr: number;
  occupancyRate: number;
};

export type MonthlyRevenueItem = {
  month: string;
  monthLabel: string;
  totalRevenue: number;
  roomRevenue: number;
  serviceRevenue: number;
  bookingCount: number;
  roomsSold: number;
  averageOccupancy: number;
  adr: number;
};

export type SourceRevenueItem = {
  sourceKey: string;
  sourceName: string;
  sourceType: "OTA" | "DIRECT" | "WALK_IN";
  bookingCount: number;
  guestCount: number;
  totalRevenue: number;
  sharePercent: number;
  adr: number;
};

export type StaffRevenueItem = {
  staffId: string;
  staffName: string;
  role: string;
  collectedAmount: number;
  transactionCount: number;
  staysHandled: number;
  cashAmount: number;
  bankTransferAmount: number;
  cardAmount: number;
  otherAmount: number;
};

export type NationalityAnalyticsItem = {
  nationality: string;
  guestCount: number;
  percentage: number;
  totalRoomNights: number;
  averageStayNights: number;
};

export type GuestAnalytics = {
  nationalities: NationalityAnalyticsItem[];
  genderDistribution: {
    male: number;
    female: number;
    other: number;
    unspecified: number;
  };
  domesticVsInternational: {
    domestic: number;
    international: number;
    domesticPercentage: number;
    internationalPercentage: number;
  };
};

export type PaymentMethodStat = {
  method: string;
  methodName: string;
  amount: number;
  count: number;
  percentage: number;
};

export type HotelReportsData = {
  hotelId: string;
  hotelName: string;
  currency: string;
  timeZone: string;
  range: string;
  startDate: string;
  endDate: string;
  summary: HotelReportsSummary;
  revenueByDay: DailyRevenueItem[];
  revenueByMonth: MonthlyRevenueItem[];
  revenueBySource: SourceRevenueItem[];
  revenueByStaff: StaffRevenueItem[];
  guestAnalytics: GuestAnalytics;
  paymentMethods: PaymentMethodStat[];
};

export type GetHotelReportsQuery = {
  range?: "7d" | "14d" | "30d" | "90d" | "this_month" | "last_month" | "this_year";
  from?: string;
  to?: string;
};
