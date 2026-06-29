import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { healthDataSchema, successEnvelopeSchema } from "../../common/openapi/contract-schemas";
import { ApiDescript } from "../../shared/decorators/api-descript.decorator";
import { SuccessMessage } from "../../shared/decorators/success-message.decorator";
import { HealthService } from "./health.service";
import type { HealthResponse } from "./health.service";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @SuccessMessage("Kiểm tra hệ thống thành công")
  @ApiDescript("Xem trạng thái hệ thống")
  @ApiOkResponse({
    description: "Bao phản hồi kiểm tra hệ thống",
    schema: successEnvelopeSchema(healthDataSchema, 200, "Kiểm tra hệ thống thành công"),
  })
  @Get()
  getHealth(): HealthResponse {
    return this.healthService.getHealth();
  }
}
