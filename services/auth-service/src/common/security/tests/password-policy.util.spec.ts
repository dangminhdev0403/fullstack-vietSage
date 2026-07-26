import { generateTemporaryPassword, validatePasswordPolicy } from "../password-policy.util";

describe("password-policy.util", () => {
  describe("generateTemporaryPassword", () => {
    it("should generate password of specified default length (16)", () => {
      const password = generateTemporaryPassword();
      expect(password.length).toBe(16);
    });

    it("should generate password meeting all policy criteria", () => {
      for (let i = 0; i < 20; i++) {
        const password = generateTemporaryPassword(16);
        expect(password.length).toBe(16);
        expect(/[A-Z]/.test(password)).toBe(true);
        expect(/[a-z]/.test(password)).toBe(true);
        expect(/[0-9]/.test(password)).toBe(true);
        expect(/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)).toBe(true);
        const result = validatePasswordPolicy(password);
        expect(result.valid).toBe(true);
      }
    });

    it("should not generate static results on repeated calls", () => {
      const p1 = generateTemporaryPassword();
      const p2 = generateTemporaryPassword();
      expect(p1).not.toEqual(p2);
    });

    it("should throw error if length is out of range (< 8 or > 128)", () => {
      expect(() => generateTemporaryPassword(7)).toThrow();
      expect(() => generateTemporaryPassword(129)).toThrow();
    });
  });

  describe("validatePasswordPolicy", () => {
    it("should pass valid password", () => {
      const result = validatePasswordPolicy("ValidP@ssw0rd");
      expect(result.valid).toBe(true);
    });

    it("should reject password shorter than 8 chars", () => {
      const result = validatePasswordPolicy("Short1!");
      expect(result.valid).toBe(false);
    });

    it("should reject password without uppercase", () => {
      const result = validatePasswordPolicy("lowercase1!");
      expect(result.valid).toBe(false);
    });

    it("should reject password without lowercase", () => {
      const result = validatePasswordPolicy("UPPERCASE1!");
      expect(result.valid).toBe(false);
    });

    it("should reject password without digit", () => {
      const result = validatePasswordPolicy("NoDigitsHere!");
      expect(result.valid).toBe(false);
    });

    it("should reject password without special character", () => {
      const result = validatePasswordPolicy("NoSpecial123");
      expect(result.valid).toBe(false);
    });
  });
});
