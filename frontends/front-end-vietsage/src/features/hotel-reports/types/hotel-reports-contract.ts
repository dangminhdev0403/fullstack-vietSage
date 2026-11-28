export type HotelReportsSummary = {
  totalRooms: number;
  occupiedRoomsNow: number;
  totalStays: number;
  totalGuests: number;
  totalRoomNights: number;
  occupancyRate: number | null;
  currentOccupancyRate: number;
  totalRevenue: number;
  roomRevenue: number;
  serviceRevenue: number;
  otherRevenue: number;
  manualRevenue?: number;
  collectedRevenue?: number;
  uncollectedRevenue?: number;
  operatingExpense?: number;
  paidOperatingExpense?: number;
  unpaidOperatingExpense?: number;
  saasFeeExpense?: number;
  totalExpense?: number;
  netProfit?: number;
  profitMargin?: number;
  expenseRatio?: number;
  netCashFlow?: number;
  adr: number;
  revpar: number | null;
  onBooksRooms?: number;
  onBooksRoomNights?: number;
  onBooksRevenue?: number;
  onBooksRoomRevenue?: number;
  projectedRoomNights?: number;
  projectedRoomRevenue?: number;
  onBooksOccupancyRate?: number | null;
  onBooksAdr?: number;
  availableRoomNights?: number | null;
  totalAvailableRoomNights?: number | null;
};

export type DailyRevenueItem = {
  date: string;
  dayLabel: string;
  totalRevenue: number;
  roomRevenue: number;
  serviceRevenue: number;
  manualRevenue?: number;
  collectedRevenue?: number;
  expense?: number;
  paidExpense?: number;
  netProfit?: number;
  availableRoomNights?: number | null;
  roomsOccupied: number;
  adr: number;
  occupancyRate: number | null;
  actualRooms?: number;
  actualRevenue?: number;
  projectedRooms?: number;
  projectedRevenue?: number;
  onBooksRooms?: number;
  onBooksRevenue?: number;
  onBooksOccupancyRate?: number | null;
  isFuture?: boolean;
};

export type MonthlyRevenueItem = {
  month: string;
  monthLabel: string;
  totalRevenue: number;
  roomRevenue: number;
  serviceRevenue: number;
  manualRevenue?: number;
  collectedRevenue?: number;
  expense?: number;
  paidExpense?: number;
  netProfit?: number;
  bookingCount: number;
  roomsSold: number;
  averageOccupancy: number | null;
  availableRoomNights?: number | null;
  adr: number;
  previousMonthRevenue?: number | null;
  momChangePercent?: number | null;
  previousYearRevenue?: number | null;
  yoyChangePercent?: number | null;
  targetRevenue?: number | null;
  targetAchievementPercent?: number | null;
};

export type QuarterlyRevenueSummaryItem = {
  quarter: string;
  label: string;
  actualRevenue: number;
  targetRevenue: number | null;
  achievementPercent: number | null;
  netProfit: number;
  monthsIncluded: number;
};

export type ExpenseCategoryBreakdownItem = {
  category: string;
  categoryLabel: string;
  amount: number;
  paidAmount: number;
  unpaidAmount: number;
  count: number;
  sharePercent: number;
};

export type SourceRevenueItem = {
  sourceKey: string;
  sourceName: string;
  sourceType: "OTA" | "DIRECT" | "WALK_IN" | "TA" | "CORPORATE" | "OTHER";
  bookingCount: number;
  guestCount: number;
  totalRevenue: number;
  sharePercent: number;
  adr: number;
  roomNights?: number;
  actualRevenue?: number;
  projectedRevenue?: number;
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

export type MarketDimensionMetric = {
  key: string;
  label: string;
  actualRevenue: number;
  actualRoomRevenue: number;
  projectedRevenue: number;
  actualNights: number;
  projectedNights: number;
  bookingCount: number;
  guestCount: number;
};

export type MarketDimensions = {
  nationality: MarketDimensionMetric[];
  roomType: MarketDimensionMetric[];
  room: MarketDimensionMetric[];
  partner: MarketDimensionMetric[];
  owner: MarketDimensionMetric[];
};

export type BookingOwnerRevenueItem = {
  ownerUserId: string;
  ownerName: string;
  bookingCount: number;
  roomNights: number;
  revenue: number;
};

export type HotelReportsData = {
  hotelId: string;
  hotelName: string;
  currency: string;
  timeZone: string;
  range: string;
  startDate: string;
  endDate: string;
  canManageTargets?: boolean;
  summary: HotelReportsSummary;
  revenueByDay: DailyRevenueItem[];
  revenueByMonth: MonthlyRevenueItem[];
  quarterlySummary?: QuarterlyRevenueSummaryItem[];
  expenseByCategory?: ExpenseCategoryBreakdownItem[];
  revenueBySource: SourceRevenueItem[];
  revenueByStaff: StaffRevenueItem[];
  revenueByBookingOwner?: BookingOwnerRevenueItem[];
  marketDimensions?: MarketDimensions;
  receivablesSummary?: {
    totalOriginal: number;
    totalPaid: number;
    totalOutstanding: number;
    openCount: number;
    overdueCount: number;
    count: number;
  };
  bookingPaymentsSummary?: {
    totalRequested: number;
    totalReceived: number;
    depositCount: number;
  };
  guestAnalytics: GuestAnalytics;
  paymentMethods: PaymentMethodStat[];
};

export type GetHotelReportsQuery = {
  range?: "7d" | "14d" | "30d" | "90d" | "this_month" | "last_month" | "this_year";
  from?: string;
  to?: string;
};
