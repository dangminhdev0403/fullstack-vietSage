export interface AuthenticatedUser {
  userId: string;
  email: string;
  roleId: string;
  fullName?: string;
  userType?: string;
  roleCodes?: string[];
  tenantIds?: string[];
}
