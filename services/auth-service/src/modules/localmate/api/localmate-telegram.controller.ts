import { Controller, Get, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ApiDescript } from "../../../shared/decorators/api-descript.decorator";
import { SuccessMessage } from "../../../shared/decorators/success-message.decorator";
import { LocalMateTelegramPairingService } from "../application/localmate-telegram-pairing.service";

type RequestWithUser = {
  user: {
    userId: string;
  };
};

@ApiTags("localmate-telegram")
@Controller("localmate/telegram")
export class LocalMateTelegramController {
  constructor(private readonly pairingService: LocalMateTelegramPairingService) {}

  @Post("pair")
  @SuccessMessage("Tạo liên kết kết nối Telegram thành công")
  @ApiDescript("Tạo liên kết một lần để kết nối tài khoản Telegram với hồ sơ LocalMate")
  async createPairingLink(@Req() req: RequestWithUser) {
    return this.pairingService.createPairingLink(req.user.userId);
  }

  @Post("disconnect")
  @SuccessMessage("Hủy kết nối Telegram thành công")
  @ApiDescript("Hủy kết nối tài khoản Telegram hiện tại của hồ sơ LocalMate")
  async disconnect(@Req() req: RequestWithUser) {
    return this.pairingService.disconnect(req.user.userId);
  }

  @Get("status")
  @SuccessMessage("Lấy trạng thái kết nối Telegram thành công")
  @ApiDescript("Kiểm tra trạng thái kết nối Telegram của hồ sơ LocalMate")
  async getStatus(@Req() req: RequestWithUser) {
    return this.pairingService.getBindingStatus(req.user.userId);
  }
}
