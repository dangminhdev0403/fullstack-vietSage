import { parseWithZod } from "../../../../common/validation/parse-with-zod";
import { loginCredentialsSchema, refreshTokenBodySchema } from "../../domain/schemas/auth.schema";

describe("auth.schema", () => {
  it("parses login credentials with trimmed email", () => {
    const result = parseWithZod(loginCredentialsSchema, {
      email: "  admin@vietsage.local  ",
      password: "Password123!",
    });

    expect(result).toEqual({
      email: "admin@vietsage.local",
      password: "Password123!",
    });
  });

  it("throws bad request for missing refreshToken", () => {
    expect(() => parseWithZod(refreshTokenBodySchema, {})).toThrow("refreshToken là bắt buộc");
  });
});
