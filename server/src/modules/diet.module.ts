import { BadRequestException, Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Post, Query, Request } from '@nestjs/common';
import { InjectModel, MongooseModule } from '@nestjs/mongoose';
import { Document, Model, Schema, Types } from 'mongoose';
import { ValidateObjectId } from 'src/shared/validate-object-id.pipes';

type DietUnit = 'g' | 'ml' | 'u';

export interface DietConfigItem extends Document {
  creator: string;
  standard_calories: number;
  diet_start_date?: string | null;
  created_time: Date;
  updated_time: Date;
}

export interface DietFoodItem extends Document {
  creator: string;
  name: string;
  unit: DietUnit;
  calories_per_unit: number;
  calories_multiplier?: number;
  last_used_time: Date;
  created_time: Date;
  updated_time: Date;
}

export interface DietRecordItem extends Document {
  creator: string;
  food_id: Types.ObjectId | null;
  food_name: string;
  unit: DietUnit;
  calories_per_unit: number;
  calories_multiplier?: number;
  amount: number;
  quantity: number;
  total_calories: number;
  recorded_time: Date;
  created_time: Date;
  updated_time: Date;
}

export interface DietDailyStatItem extends Document {
  creator: string;
  day_key: string;
  total_calories: number;
  record_count: number;
  created_time: Date;
  updated_time: Date;
}

export class UpdateDietConfigDto {
  standardCalories!: number;
  dietStartDate?: string | null;
}

export class CreateDietRecordDto {
  name!: string;
  unit!: DietUnit;
  amount!: number;
  quantity?: number;
  caloriesPerUnit!: number;
  caloriesMultiplier?: number;
  recordedTime?: string;
}

export const DietConfigSchema = new Schema({
  creator: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true, unique: true },
  standard_calories: { type: Number, default: 2000 },
  diet_start_date: { type: String, default: null },
  created_time: Date,
  updated_time: Date,
});

export const DietFoodSchema = new Schema({
  creator: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true },
  unit: { type: String, enum: ['g', 'ml', 'u'], required: true },
  calories_per_unit: { type: Number, required: true },
  calories_multiplier: { type: Number, default: 100 },
  last_used_time: Date,
  created_time: Date,
  updated_time: Date,
});

DietFoodSchema.index({ creator: 1, name: 1 }, { unique: true });

export const DietRecordSchema = new Schema({
  creator: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  food_id: { type: Schema.Types.ObjectId, ref: 'DietFood', default: null },
  food_name: { type: String, required: true },
  unit: { type: String, enum: ['g', 'ml', 'u'], required: true },
  calories_per_unit: { type: Number, required: true },
  calories_multiplier: { type: Number, default: 100 },
  amount: { type: Number, required: true },
  quantity: { type: Number, required: true, default: 1 },
  total_calories: { type: Number, required: true },
  recorded_time: Date,
  created_time: Date,
  updated_time: Date,
});

export const DietDailyStatSchema = new Schema({
  creator: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  day_key: { type: String, required: true },
  total_calories: { type: Number, default: 0 },
  record_count: { type: Number, default: 0 },
  created_time: Date,
  updated_time: Date,
});

DietDailyStatSchema.index({ creator: 1, day_key: 1 }, { unique: true });

type DietSummaryDay = {
  dayKey: string;
  label: string;
  totalCalories: number;
  recordCount: number;
};

@Injectable()
export class DietService {
  constructor(
    @InjectModel('DietConfig') private readonly configModel: Model<DietConfigItem>,
    @InjectModel('DietFood') private readonly foodModel: Model<DietFoodItem>,
    @InjectModel('DietRecord') private readonly recordModel: Model<DietRecordItem>,
    @InjectModel('DietDailyStat') private readonly dailyStatModel: Model<DietDailyStatItem>,
  ) {}

  private toDateStart(date: Date) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  private parseMonth(month?: string) {
    const fallback = new Date();
    const monthKey = month && /^\d{4}-\d{2}$/.test(month)
      ? month
      : `${fallback.getFullYear()}-${String(fallback.getMonth() + 1).padStart(2, '0')}`;
    const start = new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)) - 1, 1);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    return { month: monthKey, start, end };
  }

  private parseRecentRange(days = 30) {
    const end = this.toDateStart(new Date());
    end.setDate(end.getDate() + 1);
    const start = new Date(end);
    start.setDate(start.getDate() - days);
    return { month: '', start, end };
  }

  private toDayKey(date: Date) {
    const localDate = this.toDateStart(date);
    return `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;
  }

  private buildDays(start: Date, end: Date, stats: Map<string, DietDailyStatItem>) {
    const days: DietSummaryDay[] = [];
    for (let current = new Date(start); current < end; current.setDate(current.getDate() + 1)) {
      const dayKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
      const stat = stats.get(dayKey);
      days.push({
        dayKey,
        label: `${current.getMonth() + 1}/${current.getDate()}`,
        totalCalories: stat?.total_calories || 0,
        recordCount: stat?.record_count || 0,
      });
    }
    return days;
  }

  private buildMonthDays(month: string, stats: Map<string, DietDailyStatItem>) {
    const start = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    return this.buildDays(start, end, stats);
  }

  private buildRecentDays(days = 30, stats: Map<string, DietDailyStatItem>) {
    const { start, end } = this.parseRecentRange(days);
    return this.buildDays(start, end, stats);
  }

  private normalizeUnit(unit?: string): DietUnit {
    if (unit === 'ml') return 'ml';
    if (unit === 'u' || unit === 'g/ml') return 'u';
    return 'g';
  }

  private normalizeName(name?: string) {
    return `${name || ''}`.trim();
  }

  private normalizeDayKey(dayKey?: string | null) {
    const value = `${dayKey || ''}`.trim();
    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException('Invalid dietStartDate');
    }
    return value;
  }

  private async ensureConfig(creatorId: string) {
    const now = new Date();
    return await this.configModel
      .findOneAndUpdate(
        { creator: creatorId },
        {
          $setOnInsert: {
            creator: creatorId,
            standard_calories: 2000,
            diet_start_date: null,
            created_time: now,
          },
          $set: {
            updated_time: now,
          },
        },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true,
        },
      )
      .exec();
  }

  async getSummary(creatorId: string, month?: string) {
    try {
      const config = await this.ensureConfig(creatorId);
      const isMonthMode = !!month && /^\d{4}-\d{2}$/.test(month);
      const { month: monthKey, start, end } = isMonthMode ? this.parseMonth(month) : this.parseRecentRange(30);
      const dayKeyStart = this.toDayKey(start);
      const dayKeyEnd = this.toDayKey(end);
      const [foods, recentFoods, records, dailyStats] = await Promise.all([
        this.foodModel.find({ creator: creatorId }).sort({ last_used_time: -1, updated_time: -1 }).exec(),
        this.foodModel.find({ creator: creatorId }).sort({ last_used_time: -1, updated_time: -1 }).limit(5).exec(),
        this.recordModel
          .find({ creator: creatorId, recorded_time: { $gte: start, $lt: end } })
          .sort({ recorded_time: -1, created_time: -1 })
          .exec(),
        this.dailyStatModel
          .find({ creator: creatorId, day_key: { $gte: dayKeyStart, $lt: dayKeyEnd } })
          .sort({ day_key: 1 })
          .exec(),
      ]);

      const statsMap = new Map(dailyStats.map((item) => [item.day_key, item]));
      return {
        config,
        foods,
        recentFoods,
        records,
        dailyStats,
        days: isMonthMode ? this.buildMonthDays(monthKey, statsMap) : this.buildRecentDays(30, statsMap),
        month: monthKey,
      };
    } catch (error) {
      const isMonthMode = !!month && /^\d{4}-\d{2}$/.test(month);
      const { month: monthKey } = isMonthMode ? this.parseMonth(month) : this.parseRecentRange(30);
      const fallbackConfig = {
        standard_calories: 2000,
        diet_start_date: null,
      } as DietConfigItem;
      return {
        config: fallbackConfig,
        foods: [],
        recentFoods: [],
        records: [],
        dailyStats: [],
        days: isMonthMode ? this.buildMonthDays(monthKey, new Map()) : this.buildRecentDays(30, new Map()),
        month: monthKey,
      };
    }
  }

  async updateConfig(creatorId: string, dto: UpdateDietConfigDto) {
    const standardCalories = Number(dto.standardCalories);
    if (!Number.isFinite(standardCalories) || standardCalories <= 0) {
      throw new BadRequestException('Invalid standardCalories');
    }
    const dietStartDate = this.normalizeDayKey(dto.dietStartDate);
    const config = await this.ensureConfig(creatorId);
    config.standard_calories = standardCalories;
    config.diet_start_date = dietStartDate;
    config.updated_time = new Date();
    await config.save();
    return config;
  }

  async createRecord(creatorId: string, dto: CreateDietRecordDto) {
    const name = this.normalizeName(dto.name);
    if (!name) {
      throw new BadRequestException('Name is required');
    }

    const unit = this.normalizeUnit(dto.unit);
    const amount = Number(dto.amount);
    const quantity = Number(dto.quantity ?? 1);
    const caloriesPerUnit = Number(dto.caloriesPerUnit);
    const caloriesMultiplier = Number(dto.caloriesMultiplier ?? 100);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Invalid amount');
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new BadRequestException('Invalid quantity');
    }
    if (!Number.isFinite(caloriesPerUnit) || caloriesPerUnit < 0) {
      throw new BadRequestException('Invalid caloriesPerUnit');
    }
    if (!Number.isFinite(caloriesMultiplier) || caloriesMultiplier <= 0) {
      throw new BadRequestException('Invalid caloriesMultiplier');
    }

    const now = new Date();
    const recordedTime = dto.recordedTime ? new Date(dto.recordedTime) : now;
    const normalizedRecordedTime = Number.isNaN(recordedTime.getTime()) ? now : recordedTime;
    const totalCalories = Math.round((amount * quantity * caloriesPerUnit / caloriesMultiplier) * 100) / 100;

    let food = await this.foodModel.findOne({ creator: creatorId, name }).exec();
    if (!food) {
      food = new this.foodModel({
        creator: creatorId,
        name,
        unit,
        calories_per_unit: caloriesPerUnit,
        calories_multiplier: caloriesMultiplier,
        last_used_time: now,
        created_time: now,
        updated_time: now,
      });
    } else {
      food.unit = unit;
      food.calories_per_unit = caloriesPerUnit;
      food.calories_multiplier = caloriesMultiplier;
      food.last_used_time = now;
      food.updated_time = now;
    }
    await food.save();

    const record = await new this.recordModel({
      creator: creatorId,
      food_id: food._id,
      food_name: name,
      unit,
      calories_per_unit: caloriesPerUnit,
      calories_multiplier: caloriesMultiplier,
      amount,
      quantity,
      total_calories: totalCalories,
      recorded_time: normalizedRecordedTime,
      created_time: now,
      updated_time: now,
    }).save();

    const dayKey = this.toDayKey(normalizedRecordedTime);
    const existingStat = await this.dailyStatModel.findOne({ creator: creatorId, day_key: dayKey }).exec();
    if (!existingStat) {
      await new this.dailyStatModel({
        creator: creatorId,
        day_key: dayKey,
        total_calories: totalCalories,
        record_count: 1,
        created_time: now,
        updated_time: now,
      }).save();
    } else {
      existingStat.total_calories = Math.round((existingStat.total_calories + totalCalories) * 100) / 100;
      existingStat.record_count += 1;
      existingStat.updated_time = now;
      await existingStat.save();
    }

    return record;
  }

  async deleteRecord(creatorId: string, recordId: string) {
    const record = await this.recordModel.findOne({ _id: recordId, creator: creatorId }).exec();
    if (!record) {
      throw new NotFoundException('Record not found');
    }

    const dayKey = this.toDayKey(record.recorded_time || new Date());
    const totalCalories = Number(record.total_calories) || 0;
    const existingStat = await this.dailyStatModel.findOne({ creator: creatorId, day_key: dayKey }).exec();

    await this.recordModel.findByIdAndDelete(recordId).exec();

    if (existingStat) {
      existingStat.total_calories = Math.max(0, Math.round((existingStat.total_calories - totalCalories) * 100) / 100);
      existingStat.record_count = Math.max(0, existingStat.record_count - 1);
      existingStat.updated_time = new Date();

      if (existingStat.record_count <= 0) {
        await this.dailyStatModel.findByIdAndDelete(existingStat._id).exec();
      } else {
        await existingStat.save();
      }
    }

    return { ok: true };
  }
}

@Controller('api/diet')
export class DietController {
  constructor(private readonly dietService: DietService) {}

  private getUserId(req: any) {
    const userId = req?.user?.userId;
    if (!userId) {
      throw new BadRequestException('User is required');
    }
    return `${userId}`;
  }

  @Get('summary')
  async summary(@Request() req: any, @Query('month') month?: string) {
    return await this.dietService.getSummary(this.getUserId(req), month);
  }

  @Post('config')
  async updateConfig(@Request() req: any, @Body() dto: UpdateDietConfigDto) {
    return await this.dietService.updateConfig(this.getUserId(req), dto);
  }

  @Post('record')
  async createRecord(@Request() req: any, @Body() dto: CreateDietRecordDto) {
    return await this.dietService.createRecord(this.getUserId(req), dto);
  }

  @Delete('record/:id')
  async deleteRecord(@Request() req: any, @Param('id', new ValidateObjectId()) id: string) {
    return await this.dietService.deleteRecord(this.getUserId(req), id);
  }
}

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'DietConfig', schema: DietConfigSchema },
      { name: 'DietFood', schema: DietFoodSchema },
      { name: 'DietRecord', schema: DietRecordSchema },
      { name: 'DietDailyStat', schema: DietDailyStatSchema },
    ]),
  ],
  controllers: [DietController],
  providers: [DietService],
})
export class DietModule {}