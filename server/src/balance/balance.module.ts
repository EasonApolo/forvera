import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BalanceController } from './balance.controller';
import { BalanceSchema } from './balance.schema';
import { BalanceService } from './balance.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Balance', schema: BalanceSchema }
    ])
  ],
  controllers: [BalanceController],
  providers: [BalanceService]
})
export class BalanceModule {}
