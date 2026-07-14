import type { paths } from "@/generated/openapi/v1";

type JsonRequestBody<TOperation> = TOperation extends {
  requestBody: { content: { "application/json": infer TBody } };
}
  ? TBody
  : never;

type JsonResponseBody<TResponses, TStatus extends PropertyKey> = TStatus extends keyof TResponses
  ? TResponses[TStatus] extends { content: { "application/json": infer TBody } }
    ? TBody
    : never
  : never;

type ResponseByStatus<TOperation, TStatus extends number> = TOperation extends { responses: infer TResponses }
  ? JsonResponseBody<TResponses, TStatus | `${TStatus}`>
  : never;

type LoginOperation = paths["/auth/login"]["post"];
type RefreshOperation = paths["/auth/refresh"]["post"];
type LogoutOperation = paths["/auth/logout"]["post"];
type MeOperation = paths["/auth/me"]["get"];

export type AuthLoginRequest = JsonRequestBody<LoginOperation>;
export type AuthRefreshRequest = JsonRequestBody<RefreshOperation>;

export type AuthLoginResponseEnvelope = ResponseByStatus<LoginOperation, 200>;
export type AuthRefreshResponseEnvelope = ResponseByStatus<RefreshOperation, 201>;
export type AuthLogoutResponseEnvelope = ResponseByStatus<LogoutOperation, 200>;
export type AuthMeResponseEnvelope = ResponseByStatus<MeOperation, 200>;

export type AuthTokensData = AuthLoginResponseEnvelope["data"];
export type AuthProfileData = AuthMeResponseEnvelope["data"];
export type AuthTenant = AuthProfileData["tenants"][number];
