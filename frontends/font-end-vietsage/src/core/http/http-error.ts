export class HttpError extends Error {
  readonly status: number;
  readonly requestUrl: string;
  readonly data: unknown;

  constructor(params: { message: string; status: number; requestUrl: string; data: unknown }) {
    super(params.message);
    this.name = "HttpError";
    this.status = params.status;
    this.requestUrl = params.requestUrl;
    this.data = params.data;
  }
}
