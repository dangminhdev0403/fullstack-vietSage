import { Controller, Param, Post, Req } from "@nestjs/common";
import { ApiOkResponse, ApiParam, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { ApiDescript } from "../../../shared/decorators/api-descript.decorator";
import { RequirePermission } from "../../../shared/decorators/require-permission.decorator";
import type { AuthenticatedUser } from "../../../shared/security";
import { hotelIdParamSchema } from "../../property/property-public";
import { RequestRealtimeTicketService } from "../application/request-realtime-ticket.service";

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@ApiTags("request-realtime")
@Controller("hotels")
export class RequestRealtimeController {
  constructor(private readonly tickets: RequestRealtimeTicketService) {}

  @RequirePermission("hotel.requests.view")
  @ApiDescript("Phát hành ticket realtime yêu cầu dịch vụ theo khách sạn")
  @ApiParam({ name: "hotelId", type: String })
  @ApiOkResponse({
    schema: {
      type: "object",
      required: ["status", "error", "message", "data"],
      properties: {
        status: { type: "integer", example: 200 },
        error: { nullable: true, example: null },
        message: { type: "string", example: "OK" },
        data: {
          type: "object",
          required: ["ticket", "expiresAt"],
          properties: {
            ticket: { type: "string" },
            expiresAt: { type: "string", format: "date-time" },
          },
        },
      },
    },
  })
  @Post(":hotelId/request-realtime-ticket")
  issue(@Req() request: RequestWithUser, @Param("hotelId") hotelIdParam: string) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    return this.tickets.issueOwnerTicket(request.user.userId, request.user.roleId, hotelId);
  }
}
