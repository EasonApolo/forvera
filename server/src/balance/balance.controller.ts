import { Controller, Get } from "@nestjs/common"
import { Public } from "src/shared/public.decorator"
import { BalanceService } from "./balance.service"

@Controller('cat')
export class BalanceController {
  constructor(private catServer: BalanceService) {}

  @Public()
  @Get()
  async getCategories() {
    const posts = await this.catServer.getCategories()
    return posts
  }
}