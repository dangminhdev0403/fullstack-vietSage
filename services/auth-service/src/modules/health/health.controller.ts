import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from "@nestjs/swagger";
import {
  healthDataSchema,
  readinessDataSchema,
  successEnvelopeSchema,
} from "../../common/openapi/contract-schemas";
import { ApiDescript } from "../../shared/decorators/api-descript.decorator";
import { SuccessMessage } from "../../shared/decorators/success-message.decorator";
import { HealthService } from "./health.service";
import type { HealthResponse, ReadinessResponse } from "./health.service";

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

  @SuccessMessage("Hệ thống sẵn sàng")
  @ApiDescript("Kiểm tra phụ thuộc bắt buộc của hệ thống")
  @ApiOkResponse({
    description: "Ứng dụng và PostgreSQL sẵn sàng nhận request",
    schema: successEnvelopeSchema(readinessDataSchema, 200, "Hệ thống sẵn sàng"),
  })
  @ApiServiceUnavailableResponse({ description: "PostgreSQL không sẵn sàng" })
  @Get("ready")
  getReadiness(): Promise<ReadinessResponse> {
    return this.healthService.getReadiness();
  }
}
