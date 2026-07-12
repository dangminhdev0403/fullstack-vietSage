import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBody, ApiCreatedResponse, ApiTags } from "@nestjs/swagger";
import { parseWithZod } from "../../common/validation/parse-with-zod";
import { SuccessMessage } from "../../shared/decorators/success-message.decorator";
import {
  GuestSessionGuard,
  type RequestWithGuestSession,
} from "../guest-operations/guest-operations-public";
import { EmergencyService } from "./emergency.service";
import { createEmergencyCallBodySchema } from "./schemas/emergency.schema";

@ApiTags("emergency")
@Controller("emergency")
export class EmergencyController {
  constructor(private readonly emergencyService: EmergencyService) {}

  @UseGuards(GuestSessionGuard)
  @SuccessMessage("Emergency call event accepted")
  @ApiBody({ schema: { type: "object" } })
  @ApiCreatedResponse({ description: "Emergency call event accepted and linked to an incident" })
  @Post("guest/calls")
  async createGuestEmergencyCall(@Req() request: RequestWithGuestSession, @Body() body: unknown) {
    const dto = parseWithZod(createEmergencyCallBodySchema, body);
    return this.emergencyService.createGuestEmergencyCall(request.guestSession.sessionId, dto);
  }
}
