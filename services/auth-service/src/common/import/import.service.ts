import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ImportRegistry } from "./import.registry";
import {
  ImportAdapter,
  ImportContext,
  ImportDiffEntry,
  ImportEntitySummary,
  ImportMode,
  ImportPreviewResult,
  ImportSummary,
  ParsedImportWorkbook,
} from "./import.types";

@Injectable()
export class ImportService {
  constructor(
    private readonly registry: ImportRegistry,
    private readonly prisma: PrismaService,
  ) {}

  async preview<TPayload = unknown, TState = unknown>(input: {
    type: string;
    mode: ImportMode;
    context: ImportContext;
    workbook: ParsedImportWorkbook;
  }): Promise<ImportPreviewResult<TPayload, TState>> {
    const adapter = this.getAdapter<TPayload, TState>(input.type);
    this.assertMode(adapter, input.mode);
    await adapter.authorize(input.context);

    const payload = await adapter.parse(input.workbook, input.context);
    const validation = await adapter.validate(payload, input.context);
    const currentState = await adapter.loadCurrentState(input.context);
    const diff = await adapter.diff(payload, currentState, input.context, input.mode);

    return {
      importType: adapter.type,
      mode: input.mode,
      context: input.context,
      payload,
      currentState,
      validation,
      diff,
      summary: this.summarize(diff, validation),
    };
  }

  async commit<TPayload = unknown, TState = unknown>(
    preview: ImportPreviewResult<TPayload, TState>,
  ) {
    const adapter = this.getAdapter<TPayload, TState>(preview.importType);
    this.assertMode(adapter, preview.mode);
    await adapter.authorize(preview.context);

    const blockingErrors = preview.validation.filter((issue) => issue.severity === "error");
    if (blockingErrors.length) {
      throw new Error("Cannot commit import with validation errors");
    }

    return this.prisma.$transaction(async (tx) =>
      adapter.commit({
        tx,
        mode: preview.mode,
        context: preview.context,
        payload: preview.payload,
        currentState: preview.currentState,
        diff: preview.diff,
      }),
    );
  }

  summarize(
    diff: ImportDiffEntry[],
    validation: Array<{ severity: "error" | "warning" }>,
  ): ImportSummary {
    const byEntityType: Record<string, ImportEntitySummary> = {};
    const total = { create: 0, update: 0, disable: 0, unchanged: 0 } satisfies ImportEntitySummary;

    for (const entry of diff) {
      byEntityType[entry.entityType] ??= { create: 0, update: 0, disable: 0, unchanged: 0 };
      byEntityType[entry.entityType][entry.action] += 1;
      total[entry.action] += 1;
    }

    return {
      ...total,
      errors: validation.filter((issue) => issue.severity === "error").length,
      warnings: validation.filter((issue) => issue.severity === "warning").length,
      totalEntities: diff.length,
      byEntityType,
    };
  }

  private getAdapter<TPayload, TState>(type: string): ImportAdapter<TPayload, TState> {
    return this.registry.get(type) as ImportAdapter<TPayload, TState>;
  }

  private assertMode(adapter: ImportAdapter, mode: ImportMode): void {
    if (!adapter.supportedModes.includes(mode)) {
      throw new Error(`Import mode ${mode} is not supported for ${adapter.type}`);
    }
  }
}
