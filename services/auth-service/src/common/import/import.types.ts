import { Prisma } from "@prisma/client";

export type ImportMode = "upsert" | "replace";
export type ImportAction = "create" | "update" | "disable" | "unchanged";
export type ImportIssueSeverity = "error" | "warning";
export type ImportColumnType = "string" | "number" | "boolean" | "enum" | "date";

export interface ImportColumnSchema {
  key: string;
  header?: string;
  aliases?: string[];
  required?: boolean;
  type: ImportColumnType;
  enumValues?: readonly string[];
  maxLength?: number;
  min?: number;
  max?: number;
  defaultValue?: unknown;
  example?: unknown;
  note?: string;
}

export interface ImportSheetSchema {
  name: string;
  required: boolean;
  headerRow?: number;
  maxRows?: number;
  columns: ImportColumnSchema[];
}

export interface ImportWorkbookSchema {
  sheets: ImportSheetSchema[];
}

export interface ParsedImportRow {
  rowNumber: number;
  values: Record<string, unknown>;
}

export interface ParsedImportSheet {
  name: string;
  rows: ParsedImportRow[];
}

export interface ParsedImportWorkbook {
  fileName: string;
  fileHash?: string;
  sheets: ParsedImportSheet[];
}

export interface ImportValidationIssue {
  severity: ImportIssueSeverity;
  sheet: string;
  row?: number;
  column?: string;
  code: string;
  message: string;
  value?: unknown;
}

export interface ImportFieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface ImportDiffEntry {
  entityType: string;
  key: string;
  action: ImportAction;
  label?: string;
  changes: ImportFieldChange[];
  warnings?: ImportValidationIssue[];
}

export interface ImportEntitySummary {
  create: number;
  update: number;
  disable: number;
  unchanged: number;
}

export interface ImportSummary extends ImportEntitySummary {
  errors: number;
  warnings: number;
  totalEntities: number;
  byEntityType: Record<string, ImportEntitySummary>;
}

export interface ImportContext {
  actorUserId: string;
  activeRoleId?: string;
  tenantId?: string;
  hotelId?: string;
  [key: string]: unknown;
}

export interface ImportPreviewResult<TPayload = unknown, TState = unknown> {
  importType: string;
  mode: ImportMode;
  context: ImportContext;
  payload: TPayload;
  currentState: TState;
  validation: ImportValidationIssue[];
  diff: ImportDiffEntry[];
  summary: ImportSummary;
}

export interface ImportCommitResult {
  summary: ImportSummary;
  auditPayload?: Record<string, unknown>;
  domainEvents?: Array<{ eventType: string; payload: Prisma.InputJsonValue }>;
}

export interface ImportCommitInput<TPayload, TState> {
  tx: Prisma.TransactionClient;
  mode: ImportMode;
  context: ImportContext;
  payload: TPayload;
  currentState: TState;
  diff: ImportDiffEntry[];
}

export interface ImportAdapter<TPayload = unknown, TState = unknown> {
  readonly type: string;
  readonly supportedModes: readonly ImportMode[];
  getSchema(): ImportWorkbookSchema;
  authorize(context: ImportContext): Promise<void> | void;
  parse(workbook: ParsedImportWorkbook, context: ImportContext): Promise<TPayload> | TPayload;
  validate(
    payload: TPayload,
    context: ImportContext,
  ): Promise<ImportValidationIssue[]> | ImportValidationIssue[];
  loadCurrentState(context: ImportContext): Promise<TState>;
  diff(
    payload: TPayload,
    state: TState,
    context: ImportContext,
    mode: ImportMode,
  ): Promise<ImportDiffEntry[]> | ImportDiffEntry[];
  commit(input: ImportCommitInput<TPayload, TState>): Promise<ImportCommitResult>;
}
