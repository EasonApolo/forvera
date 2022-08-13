import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ValidateObjectId } from 'src/shared/validate-object-id.pipes';
import { BalanceDTO } from './balance.interface';
import { BalanceService } from './balance.service';

@Controller('balance')
export class BalanceController {
  constructor(private service: BalanceService) {}

  @Get('/:dateStamp')
  async get(@Req() req, @Param('dateStamp') dateStamp: string) {
    const userId = <string>req.user.userId;
    const records = await this.service.getByDate(userId, parseInt(dateStamp));
    return records;
  }

  @Post()
  async add(@Req() req, @Body() DTO: BalanceDTO) {
    const userId = <string>req.user.userId;
    await this.service.add(userId, DTO);
    return this.service.getByDate(userId, DTO.dateStamp)
  }

  @Put('/:balanceId')
  async edit(
    @Req() req,
    @Param('balanceId', new ValidateObjectId()) id: string,
    @Body() DTO: BalanceDTO,
  ) {
    const userId = <string>req.user.userId;
    await this.service.getById(id, userId);
    await this.service.edit(id, userId, DTO);
    return this.service.getByDate(userId, DTO.dateStamp)
  }

  @Delete('/:balanceId')
  async deleteRecord(
    @Req() req,
    @Param('balanceId', new ValidateObjectId()) id: string,
  ) {
    const userId = <string>req.user.userId;
    await this.service.getById(id, userId);
    const records = await this.service.delete(id);
    return records;
  }
}
