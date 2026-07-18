import { ForbiddenException } from "@nestjs/common";
import { PaymentProvider } from "@prisma/client";
import { PaymentController } from "../api/payment.controller";
import type { BillingService } from "../application/billing.service";

describe("PaymentController webhook authentication", () => {
  const originalSecret = process.env.PAYMENT_WEBHOOK_SECRET;

  function createController() {
    const processPaymentWebhook = jest.fn().mockResolvedValue({ received: true });
    const service = { processPaymentWebhook } as unknown as BillingService;
    return { controller: new PaymentController(service), processPaymentWebhook };
  }

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.PAYMENT_WEBHOOK_SECRET;
    else process.env.PAYMENT_WEBHOOK_SECRET = originalSecret;
  });

  it("rejects missing payment webhook secret before calling the service", async () => {
    process.env.PAYMENT_WEBHOOK_SECRET = "expected-secret";
    const { controller, processPaymentWebhook } = createController();

    await expect(
      controller.processWebhook("MOMO", undefined, {
        providerEventId: "event-1",
        eventType: "payment.succeeded",
        signatureVerified: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(processPaymentWebhook).not.toHaveBeenCalled();
  });

  it("ignores body signatureVerified and marks payload verified only after the header matches", async () => {
    process.env.PAYMENT_WEBHOOK_SECRET = "expected-secret";
    const { controller, processPaymentWebhook } = createController();

    await controller.processWebhook("MOMO", "expected-secret", {
      providerEventId: "event-1",
      eventType: "payment.succeeded",
      signatureVerified: false,
    });

    expect(processPaymentWebhook).toHaveBeenCalledWith(
      PaymentProvider.MOMO,
      expect.objectContaining({
        providerEventId: "event-1",
        eventType: "payment.succeeded",
        signatureVerified: true,
      }),
    );
  });
});
