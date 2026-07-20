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
  roles: Array<ManagedHotelRole & { assignedAt: string; assignedById: string | null }>;
};

export type HotelStaffUsersPage = {
  page: number;
  limit: number;
  total: number;
  items: HotelStaffUser[];
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
};

export type HotelStaffAssignmentsPage = {
  page: number;
  limit: number;
  total: number;
  items: HotelStaffAssignment[];
};

export type StaffDirectorySnapshot = {
  users: HotelStaffUsersPage;
  roles: ManagedHotelRole[];
  assignments: HotelStaffAssignmentsPage | null;
};

export type CreateHotelStaffUserInput = {
  email: string;
  fullName: string;
  password: string;
  roleIds: string[];
  tenantId?: string;
};
