import {
  ExecutionContext,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { LocalmateKnowledgeKeyGuard } from "../infrastructure/guards/localmate-knowledge-key.guard";

describe("LocalmateKnowledgeKeyGuard", () => {
  const originalEnv = process.env.LOCALMATE_KNOWLEDGE_API_KEY;
  const mockServerKey = "test-knowledge-key-at-least-32-characters-long";

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.LOCALMATE_KNOWLEDGE_API_KEY = originalEnv;
    } else {
      delete process.env.LOCALMATE_KNOWLEDGE_API_KEY;
    }
  });

  function createMockContext(
    headers: Record<string, string | string[] | undefined>,
  ): ExecutionContext {
    const request = {
      headers,
      get: (headerName: string) => headers[headerName.toLowerCase()],
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  describe("when server key is unconfigured", () => {
    it("throws ServiceUnavailableException if no key in configService or process.env", () => {
      delete process.env.LOCALMATE_KNOWLEDGE_API_KEY;
      const guard = new LocalmateKnowledgeKeyGuard({
        get: jest.fn().mockReturnValue(undefined),
      });

      const context = createMockContext({
        "x-vietsage-knowledge-key": "any-key",
      });

      expect(() => guard.canActivate(context)).toThrow(
        new ServiceUnavailableException("Knowledge service key unconfigured"),
      );
    });
  });

  describe("when server key is configured", () => {
    it("throws UnauthorizedException when header is missing", () => {
      const guard = new LocalmateKnowledgeKeyGuard({
        get: jest.fn((key: string) =>
          key === "localMate.knowledgeApiKey" ? mockServerKey : undefined,
        ),
      } as any);

      const context = createMockContext({});

      expect(() => guard.canActivate(context)).toThrow(
        new UnauthorizedException("Invalid or missing knowledge API key"),
      );
    });

    it("throws UnauthorizedException when header length differs", () => {
      const guard = new LocalmateKnowledgeKeyGuard({
        get: jest.fn((key: string) =>
          key === "localMate.knowledgeApiKey" ? mockServerKey : undefined,
        ),
      } as any);

      const context = createMockContext({
        "x-vietsage-knowledge-key": "too-short",
      });

      expect(() => guard.canActivate(context)).toThrow(
        new UnauthorizedException("Invalid or missing knowledge API key"),
      );
    });

    it("throws UnauthorizedException when header has same length but invalid characters", () => {
      const guard = new LocalmateKnowledgeKeyGuard({
        get: jest.fn((key: string) =>
          key === "localMate.knowledgeApiKey" ? mockServerKey : undefined,
        ),
      } as any);

      const wrongKey = mockServerKey.slice(0, -1) + "X";
      const context = createMockContext({
        "x-vietsage-knowledge-key": wrongKey,
      });

      expect(() => guard.canActivate(context)).toThrow(
        new UnauthorizedException("Invalid or missing knowledge API key"),
      );
    });

    it("returns true when header matches server key exactly", () => {
      const guard = new LocalmateKnowledgeKeyGuard({
        get: jest.fn((key: string) =>
          key === "localMate.knowledgeApiKey" ? mockServerKey : undefined,
        ),
      } as any);

      const context = createMockContext({
        "x-vietsage-knowledge-key": mockServerKey,
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it("supports Pascal-case / capitalized X-VietSage-Knowledge-Key header", () => {
      const guard = new LocalmateKnowledgeKeyGuard({
        get: jest.fn((key: string) =>
          key === "localMate.knowledgeApiKey" ? mockServerKey : undefined,
        ),
      } as any);

      const context = createMockContext({
        "X-VietSage-Knowledge-Key": mockServerKey,
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it("supports extracting server key from process.env when configService is absent", () => {
      process.env.LOCALMATE_KNOWLEDGE_API_KEY = mockServerKey;
      const guard = new LocalmateKnowledgeKeyGuard();

      const context = createMockContext({
        "x-vietsage-knowledge-key": mockServerKey,
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it("supports array of header values taking the first one", () => {
      const guard = new LocalmateKnowledgeKeyGuard({
        get: jest.fn((key: string) =>
          key === "LOCALMATE_KNOWLEDGE_API_KEY" ? mockServerKey : undefined,
        ),
      } as any);

      const context = createMockContext({
        "x-vietsage-knowledge-key": [mockServerKey, "another-key"],
      });

      expect(guard.canActivate(context)).toBe(true);
    });
  });
});
