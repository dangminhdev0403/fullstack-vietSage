import { unwrapApiEnvelope } from "@/core/http/api-envelope";
import { HttpClient, type HttpQuery } from "@/core/http/http-client";
import type { BillingPage, FolioItem, FolioListItem, FolioSummary, Invoice, InvoiceDetail, Payment } from "@/features/billing/types/billing-contract";

type AuthRequestOptions = {
  accessToken?: string;
  accessTokenExpiresAt?: number | null;
};

export type BillingServiceOptions = {
  baseUrl: string;
  timeoutMs?: number;
};

function hotelPath(hotelId: string, suffix: string): string {
  return `/hotels/${encodeURIComponent(hotelId)}${suffix}`;
}

export function createBillingService(options: BillingServiceOptions): BillingService {
  return new BillingService(options);
}

export class BillingService {
  private readonly httpClient: HttpClient;

  constructor(options: BillingServiceOptions) {
    this.httpClient = new HttpClient({ baseUrl: options.baseUrl, timeoutMs: options.timeoutMs });
  }

  async listFolios(hotelId: string, options: { query?: HttpQuery } & AuthRequestOptions = {}): Promise<BillingPage<FolioListItem>> {
    const payload = await this.httpClient.request<unknown>({
      method: "GET",
      path: hotelPath(hotelId, "/folios"),
      query: options.query,
      accessToken: options.accessToken,
      accessTokenExpiresAt: options.accessTokenExpiresAt,
    });

    const page = unwrapApiEnvelope<BillingPage<FolioListItem>>(payload).data;
    return {
      ...page,
      items: page.items.map((folio) => ({
        ...folio,
        subtotal: folio.subtotal ?? folio.subtotalAmount,
        tax: folio.tax ?? folio.taxAmount,
        discount: folio.discount ?? folio.discountAmount,
        total: folio.total ?? folio.totalAmount,
      })),
    };
  }

  async getFolioSummary(hotelId: string, folioId: string, options: AuthRequestOptions = {}): Promise<FolioSummary> {
    const payload = await this.httpClient.request<unknown>({
      method: "GET",
      path: hotelPath(hotelId, `/folios/${encodeURIComponent(folioId)}/summary`),
      accessToken: options.accessToken,
      accessTokenExpiresAt: options.accessTokenExpiresAt,
    });

    return unwrapApiEnvelope<FolioSummary>(payload).data;
  }

  async listFolioItems(hotelId: string, folioId: string, options: { query?: HttpQuery } & AuthRequestOptions = {}): Promise<BillingPage<FolioItem>> {
    const payload = await this.httpClient.request<unknown>({
      method: "GET",
      path: hotelPath(hotelId, `/folios/${encodeURIComponent(folioId)}/items`),
      query: options.query,
      accessToken: options.accessToken,
      accessTokenExpiresAt: options.accessTokenExpiresAt,
    });

    return unwrapApiEnvelope<BillingPage<FolioItem>>(payload).data;
  }

  async issueInvoice(hotelId: string, folioId: string, options: AuthRequestOptions = {}): Promise<Invoice> {
    const payload = await this.httpClient.request<unknown>({
      method: "POST",
      path: hotelPath(hotelId, `/folios/${encodeURIComponent(folioId)}/checkout/issue-invoice`),
      accessToken: options.accessToken,
      accessTokenExpiresAt: options.accessTokenExpiresAt,
    });

    return unwrapApiEnvelope<Invoice>(payload).data;
  }

  async getInvoice(hotelId: string, invoiceId: string, options: AuthRequestOptions = {}): Promise<Invoice> {
    const payload = await this.httpClient.request<unknown>({
      method: "GET",
      path: hotelPath(hotelId, `/invoices/${encodeURIComponent(invoiceId)}`),
      accessToken: options.accessToken,
      accessTokenExpiresAt: options.accessTokenExpiresAt,
    });

    return unwrapApiEnvelope<Invoice>(payload).data;
  }

  async getInvoiceDetail(hotelId: string, invoiceId: string, options: AuthRequestOptions = {}): Promise<InvoiceDetail> {
    const payload = await this.httpClient.request<unknown>({
      method: "GET",
      path: hotelPath(hotelId, `/invoices/${encodeURIComponent(invoiceId)}`),
      accessToken: options.accessToken,
      accessTokenExpiresAt: options.accessTokenExpiresAt,
    });

    return unwrapApiEnvelope<InvoiceDetail>(payload).data;
  }

  async createPaymentSession(hotelId: string, invoiceId: string, options: AuthRequestOptions = {}): Promise<{ reused: boolean; payment: Payment }> {
    const payload = await this.httpClient.request<unknown, { provider: "MANUAL" }>({
      method: "POST",
      path: hotelPath(hotelId, `/invoices/${encodeURIComponent(invoiceId)}/payments/session`),
      body: { provider: "MANUAL" },
      accessToken: options.accessToken,
      accessTokenExpiresAt: options.accessTokenExpiresAt,
    });

    return unwrapApiEnvelope<{ reused: boolean; payment: Payment }>(payload).data;
  }

  async getPaymentStatus(hotelId: string, paymentId: string, options: AuthRequestOptions = {}): Promise<Payment> {
    const payload = await this.httpClient.request<unknown>({
      method: "GET",
      path: hotelPath(hotelId, `/payments/${encodeURIComponent(paymentId)}/status`),
      accessToken: options.accessToken,
      accessTokenExpiresAt: options.accessTokenExpiresAt,
    });

    return unwrapApiEnvelope<Payment>(payload).data;
  }
}
