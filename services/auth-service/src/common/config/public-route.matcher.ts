type Pattern = string;

export class PublicRouteMatcher {
  constructor(
    private readonly patterns: Pattern[],
    private readonly regexes: RegExp[] = [],
  ) {}

  isPublic(path: string): boolean {
    const normalizedPath = this.normalizePath(path);

    for (const pattern of this.patterns) {
      if (this.matchPattern(pattern, normalizedPath)) {
        return true;
      }
    }

    for (const regex of this.regexes) {
      if (regex.test(normalizedPath)) {
        return true;
      }
    }

    return false;
  }

  private matchPattern(pattern: string, path: string): boolean {
    const normalizedPattern = this.normalizePath(pattern);

    if (!normalizedPattern.includes("*")) {
      return normalizedPattern === path;
    }

    if (normalizedPattern.endsWith("/**")) {
      const base = normalizedPattern.slice(0, -3);
      return path === base || path.startsWith(base + "/");
    }

    if (normalizedPattern.endsWith("/*")) {
      const base = normalizedPattern.slice(0, -2);
      if (!path.startsWith(base + "/")) {
        return false;
      }

      const rest = path.slice(base.length + 1);
      return !rest.includes("/");
    }

    return false;
  }

  private normalizePath(path: string): string {
    const trimmed = path.trim();
    if (trimmed.length === 0 || trimmed === "/") {
      return "/";
    }

    return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
  }
}
