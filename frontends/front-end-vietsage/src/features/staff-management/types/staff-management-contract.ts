export type ManagedHotelRole = {
  id: string;
  code: string;
  name: string;
};

export type HotelStaffUser = {
  id: string;
  email: string;
  fullName: string;
  userStatus: string;
  tenantStatus: string;
  tenantId: string;
  joinedAt: string | null;
  assignedHotel: { id: string; code: string; name: string } | null;
  roles: Array<ManagedHotelRole & { assignedAt: string; assignedById: string | null }>;
};

export type HotelStaffUsersPage = {
  page: number;
  limit: number;
  total: number;
  items: HotelStaffUser[];
};

export type StaffRoomAssignment = {
  id: string;
  roomId: string;
  roomNumber: string;
  assignedAt: string;
};

export type HotelStaffAssignment = {
  id: string;
  userId: string;
  hotelId: string;
  status: "ACTIVE" | "REVOKED";
  assignedAt: string;
  assignedById: string | null;
  revokedAt: string | null;
  revokedById: string | null;
  user: {
    id: string;
    email: string;
    fullName: string;
    roles: ManagedHotelRole[];
  };
  roomAssignment?: StaffRoomAssignment | null;
};

export type HotelStaffAssignmentsPage = {
  page: number;
  limit: number;
  total: number;
  items: HotelStaffAssignment[];
};

export type StaffHotelSummary = {
  id: string;
  code?: string | null;
  name: string;
  staffScopeMode?: "HOTEL_WIDE" | "ROOM_EXCLUSIVE" | null;
};

export type StaffHotelRoomOption = {
  id: string;
  roomNumber: string;
  code?: string | null;
  floor?: string | null;
  type?: string | null;
};

export type StaffDirectorySnapshot = {
  users: HotelStaffUsersPage;
  roles: ManagedHotelRole[];
  assignments: HotelStaffAssignmentsPage | null;
  hotels: StaffHotelSummary[];
  rooms?: StaffHotelRoomOption[];
};

export type CreateHotelStaffUserInput = {
  email: string;
  fullName: string;
  password: string;
  roleIds: string[];
};

export type CreateAssignedHotelStaffUserInput = CreateHotelStaffUserInput & {
  hotelId: string;
  roomId?: string | null;
};

export type AssignStaffRoomInput = {
  userId: string;
  roomId: string;
};

export type UnassignStaffRoomInput = {
  userId: string;
};
