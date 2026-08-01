export type PasswordSecurityFields = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export function validatePasswordChange(fields: PasswordSecurityFields): string | null {
  if (!fields.currentPassword) return "Nhập mật khẩu hiện tại.";
  if (fields.newPassword.length < 8) return "Mật khẩu mới cần tối thiểu 8 ký tự.";
  if (fields.newPassword.length > 128) return "Mật khẩu mới tối đa 128 ký tự.";
  if (!/[A-Z]/.test(fields.newPassword) || !/[a-z]/.test(fields.newPassword) || !/[0-9]/.test(fields.newPassword) || !/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(fields.newPassword)) {
    return "Mật khẩu mới cần chữ hoa, chữ thường, chữ số và ký tự đặc biệt.";
  }
  if (fields.newPassword === fields.currentPassword) return "Mật khẩu mới phải khác mật khẩu hiện tại.";
  if (fields.newPassword !== fields.confirmPassword) return "Xác nhận mật khẩu không khớp.";
  return null;
}

export function canResetFrontdeskPassword(roleCodes: string[]): boolean {
  return roleCodes.length === 1 && roleCodes[0] === "HOTEL_FRONTDESK";
}

export function resetResponseHeaders(): Record<string, string> {
  return { "Cache-Control": "no-store" };
}
