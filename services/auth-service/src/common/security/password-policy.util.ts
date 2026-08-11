import { randomInt } from "node:crypto";

const UPPERCASE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWERCASE_CHARS = "abcdefghijklmnopqrstuvwxyz";
const NUMBER_CHARS = "0123456789";
const SPECIAL_CHARS = "!@#$%^&*()_+-=[]{}|;:,.<>?";
const ALL_CHARS = UPPERCASE_CHARS + LOWERCASE_CHARS + NUMBER_CHARS + SPECIAL_CHARS;

export function generateTemporaryPassword(length = 16): string {
  if (length < 8 || length > 128) {
    throw new Error("Password length must be between 8 and 128 characters");
  }

  // Ensure at least one character from each required category
  const chars: string[] = [
    UPPERCASE_CHARS[randomInt(0, UPPERCASE_CHARS.length)],
    LOWERCASE_CHARS[randomInt(0, LOWERCASE_CHARS.length)],
    NUMBER_CHARS[randomInt(0, NUMBER_CHARS.length)],
    SPECIAL_CHARS[randomInt(0, SPECIAL_CHARS.length)],
  ];

  // Fill remaining slots with random characters from ALL_CHARS
  while (chars.length < length) {
    chars.push(ALL_CHARS[randomInt(0, ALL_CHARS.length)]);
  }

  // Fisher-Yates shuffle using crypto randomInt
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    const temp = chars[i];
    chars[i] = chars[j];
    chars[j] = temp;
  }

  return chars.join("");
}

export function validatePasswordPolicy(password: string): { valid: boolean; message?: string } {
  if (password.length < 8) {
    return { valid: false, message: "Password must be at least 8 characters long" };
  }
  if (password.length > 128) {
    return { valid: false, message: "Password must not exceed 128 characters" };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: "Password must contain at least one uppercase letter" };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: "Password must contain at least one lowercase letter" };
  }
  if (!/\d/.test(password)) {
    return { valid: false, message: "Password must contain at least one digit" };
  }
  if (!/[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(password)) {
    return { valid: false, message: "Password must contain at least one special character" };
  }

  return { valid: true };
}
