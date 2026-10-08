import { Body, Controller, Get, Headers, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { AuthRateLimit } from "../../../common/security/auth-rate-limit.decorator";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { SkipAuthorization } from "../../../shared/decorators/skip-authorization.decorator";
import { PublicLocalMateService } from "../application/public-localmate.service";
import {
  listMarketplaceConversationMessagesQuerySchema,
  sendMarketplaceConversationMessageSchema,
} from "../domain/marketplace-conversation.schema";
import {
  createPublicLocalMateOrderSchema,
  marketplaceOrderIdSchema,
  publicCandidateKeySchema,
  publicProposalKeySchema,
} from "../domain/marketplace-order.schema";

const createPublicSessionSchema = z.object({
  location: z.string().trim().min(2).max(120),
  guestDisplayName: z.string().trim().min(2).max(120).nullish(),
  guestPhone: z
    .string()
    .trim()
    .nullish()
    .refine((val) => !val || /^\+?[0-9][0-9 .()-]{5,39}$/.test(val), {
      message: "Số điện thoại không hợp lệ",
    }),
});

const mintProposalsSchema = z.object({
  query: z.string().trim().max(300).optional(),
  location: z.string().trim().max(120).optional(),
  tourCodes: z.array(z.string().trim().min(1).max(80)).max(5).optional(),
});

const selectProposalBodySchema = z
  .object({
    location: z.string().trim().max(120).optional(),
  })
  .optional();

@SkipAuthorization()
@Controller("public/localmate")
export class PublicLocalMateController {
  constructor(private readonly service: PublicLocalMateService) {}

  @AuthRateLimit("login")
  @Post("sessions")
  createSession(
    @Headers("x-public-localmate-token") previousToken: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.createSession(parseWithZod(createPublicSessionSchema, body), previousToken);
  }

  @Get("session/active")
  getActiveSession(@Headers("x-public-localmate-token") token: string | undefined) {
    return this.service.getActiveSession(token);
  }

  @AuthRateLimit("login")
  @Post("proposals")
  listProposals(
    @Headers("x-public-localmate-token") token: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.listProposals(token, parseWithZod(mintProposalsSchema, body));
  }

  @AuthRateLimit("login")
  @Post("proposals/:proposalKey/select")
  selectProposal(
    @Headers("x-public-localmate-token") token: string | undefined,
    @Param("proposalKey") proposalKey: string,
    @Body() body: unknown,
  ) {
    const payload = body ? parseWithZod(selectProposalBodySchema, body) : undefined;
    return this.service.selectProposal(
      token,
      parseWithZod(publicProposalKeySchema, proposalKey),
      payload?.location,
    );
  }

  @AuthRateLimit("login")
  @Post("orders")
  createOrder(
    @Headers("x-public-localmate-token") token: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.createOrder(token, parseWithZod(createPublicLocalMateOrderSchema, body));
  }

  @Get("candidates/:candidateKey")
  getCandidate(
    @Headers("x-public-localmate-token") token: string | undefined,
    @Param("candidateKey") candidateKey: string,
    @Query("proposalKey") proposalKey: string,
  ) {
    return this.service.getCandidate(
      token,
      parseWithZod(publicProposalKeySchema, proposalKey),
      parseWithZod(publicCandidateKeySchema, candidateKey),
    );
  }

  @Get("orders/:orderId")
  getOrder(
    @Headers("x-public-localmate-token") token: string | undefined,
    @Param("orderId") orderId: string,
  ) {
    return this.service.getOrder(token, parseWithZod(marketplaceOrderIdSchema, orderId));
  }

  @AuthRateLimit("login")
  @Post("orders/:orderId/payment-session")
  createPaymentSession(
    @Headers("x-public-localmate-token") token: string | undefined,
    @Param("orderId") orderId: string,
  ) {
    return this.service.createPaymentSession(
      token,
      parseWithZod(marketplaceOrderIdSchema, orderId),
    );
  }

  @Get("orders/:orderId/conversation")
  getConversation(
    @Headers("x-public-localmate-token") token: string | undefined,
    @Param("orderId") orderId: string,
    @Query() query: unknown,
  ) {
    return this.service.getConversation(
      token,
      parseWithZod(marketplaceOrderIdSchema, orderId),
      parseWithZod(listMarketplaceConversationMessagesQuerySchema, query ?? {}),
    );
  }

  @AuthRateLimit("knowledge")
  @Post("orders/:orderId/conversation/messages")
  sendMessage(
    @Headers("x-public-localmate-token") token: string | undefined,
    @Param("orderId") orderId: string,
    @Body() body: unknown,
  ) {
    return this.service.sendMessage(
      token,
      parseWithZod(marketplaceOrderIdSchema, orderId),
      parseWithZod(sendMarketplaceConversationMessageSchema, body),
    );
  }
}
