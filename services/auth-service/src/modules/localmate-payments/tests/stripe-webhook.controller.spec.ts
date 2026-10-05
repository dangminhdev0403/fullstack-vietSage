import { BadRequestException } from "@nestjs/common";
import { StripeWebhookController } from "../api/stripe-webhook.controller";
import { StripeWebhookService } from "../application/stripe-webhook.service";

describe("StripeWebhookController", () => {
  let controller: StripeWebhookController;
  let mockWebhookService: jest.Mocked<StripeWebhookService>;

  beforeEach(() => {
    mockWebhookService = {
      handleWebhook: jest.fn(),
    } as any;

    controller = new StripeWebhookController(mockWebhookService);
  });

  it("passes exact rawBody Buffer to webhookService when available", async () => {
    const rawBuffer = Buffer.from(
      JSON.stringify({ id: "evt_test", type: "checkout.session.completed" }),
      "utf8",
    );
    const mockReq = {
      rawBody: rawBuffer,
      body: { id: "evt_test" }, // parsed body must be ignored
    } as any;

    mockWebhookService.handleWebhook.mockResolvedValue({
      received: true,
      outcome: "PROCESSED",
    });

    const result = await controller.handleWebhook("sig_test_header", mockReq);

    expect(result).toEqual({ received: true, outcome: "PROCESSED" });
    expect(mockWebhookService.handleWebhook).toHaveBeenCalledWith(rawBuffer, "sig_test_header");
  });

  it("rejects with BadRequestException when req.rawBody is missing/undefined", async () => {
    const mockReq = {
      rawBody: undefined,
      body: { id: "evt_test", reconstructed: true },
    } as any;

    await expect(controller.handleWebhook("sig_test_header", mockReq)).rejects.toThrow(
      BadRequestException,
    );

    expect(mockWebhookService.handleWebhook).not.toHaveBeenCalled();
  });

  it("rejects with BadRequestException when req.rawBody is empty buffer", async () => {
    const mockReq = {
      rawBody: Buffer.alloc(0),
      body: {},
    } as any;

    await expect(controller.handleWebhook("sig_test_header", mockReq)).rejects.toThrow(
      BadRequestException,
    );

    expect(mockWebhookService.handleWebhook).not.toHaveBeenCalled();
  });

  it("rejects with BadRequestException when req.rawBody is not a Buffer (e.g. string or object)", async () => {
    const mockReq = {
      rawBody: "not-a-buffer-string",
      body: {},
    } as any;

    await expect(controller.handleWebhook("sig_test_header", mockReq)).rejects.toThrow(
      BadRequestException,
    );

    expect(mockWebhookService.handleWebhook).not.toHaveBeenCalled();
  });
});
