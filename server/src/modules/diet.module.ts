import { BadRequestException, Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { InjectModel, MongooseModule } from '@nestjs/mongoose';
import { Document, Model, Schema, Types } from 'mongoose';
import { ValidateObjectId } from 'src/shared/validate-object-id.pipes';
import { Public } from '../guards/jwt-auth.guard';
import { UserSchema } from 'src/modules/user.module';

type DietUnit = 'g' | 'ml' | 'u';

export interface DietRecordItem extends Document {
  creator: string;
  food_name: string;
  unit: DietUnit;
  calories_per_unit: number;
  /** 记录时热量数值使用的单位（% / kCal / kJ），再次添加时按此单位原样回填 */
  calories_unit: 'kCal' | '%' | 'kJ';
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
  total_negative_calories: number;
  record_count: number;
  created_time: Date;
  updated_time: Date;
}

export class CreateDietRecordDto {
  name!: string;
  unit!: DietUnit;
  amount!: number;
  quantity?: number;
  caloriesPerUnit!: number;
  caloriesUnit?: 'kCal' | '%' | 'kJ';
  caloriesMultiplier?: number;
  recordedTime?: string;
}

export const DietRecordSchema = new Schema({
  // creator 为历史字段：新记录不再写入，旧数据保留不过滤
  creator: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  food_name: { type: String, required: true },
  unit: { type: String, enum: ['g', 'ml', 'u'], required: true },
  calories_per_unit: { type: Number, required: true },
  calories_unit: { type: String, enum: ['kCal', '%', 'kJ'], default: 'kCal' },
  calories_multiplier: { type: Number, default: 100 },
  amount: { type: Number, required: true },
  quantity: { type: Number, required: true, default: 1 },
  total_calories: { type: Number, required: true },
  recorded_time: Date,
  created_time: Date,
  updated_time: Date,
});

export const DietDailyStatSchema = new Schema({
  creator: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  day_key: { type: String, required: true },
  total_calories: { type: Number, default: 0 },
  total_negative_calories: { type: Number, default: 0 },
  record_count: { type: Number, default: 0 },
  created_time: Date,
  updated_time: Date,
});

DietDailyStatSchema.index({ creator: 1, day_key: 1 }, { unique: true });

type DietSummaryDay = {
  dayKey: string;
  label: string;
  totalCalories: number;
  totalNegativeCalories: number;
  recordCount: number;
};

export interface DietWeightDocument extends Document {
  day_key: string;
  weight: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const DietWeightSchema = new Schema<DietWeightDocument>(
  {
    day_key: { type: String, required: true, unique: true },
    weight: { type: Number, required: true },
  },
  {
    collection: 'dietweights',
    timestamps: true,
  },
);

const DIET_WEIGHT_MODEL_NAME = 'DietWeight';

@Injectable()
export class DietService {
  constructor(
    @InjectModel('User') private readonly userModel: Model<any>,
    @InjectModel('DietRecord') private readonly recordModel: Model<DietRecordItem>,
    @InjectModel('DietDailyStat') private readonly dailyStatModel: Model<DietDailyStatItem>,
    @InjectModel(DIET_WEIGHT_MODEL_NAME) private readonly weightModel: Model<DietWeightDocument>,
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
        totalNegativeCalories: stat?.total_negative_calories || 0,
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

  private normalizeCaloriesUnit(unit?: string): 'kCal' | '%' | 'kJ' {
    if (unit === '%' || unit === 'kJ') return unit;
    return 'kCal';
  }

  private normalizeName(name?: string) {
    return `${name || ''}`.trim();
  }

  private async calcWeightChangeLabel(config: { standard_calories: number; diet_start_date: string | null }) {
    const startDayKey = config.diet_start_date?.trim();
    if (!startDayKey) return '';

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const endDayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

    if (startDayKey > endDayKey) return '0天0kg';

    const endDate = new Date(yesterday);
    endDate.setDate(endDate.getDate() + 1); // end is exclusive

    const stats = await this.dailyStatModel
      .find({ day_key: { $gte: startDayKey, $lte: endDayKey } })
      .sort({ day_key: 1 })
      .lean()
      .exec();

    const startDate = this.toDayKeyToDate(startDayKey);
    const dayCount = Math.max(0, Math.floor((new Date(yesterday).getTime() - startDate.getTime()) / 86400000) + 1);

    const actualCalories = stats.reduce((sum, s) => sum + (s.total_calories - (s.total_negative_calories || 0)), 0);
    const expectedCalories = dayCount * config.standard_calories;
    const weightKg = (actualCalories - expectedCalories) / 7 / 1000;
    return `${dayCount}天${weightKg >= 0 ? '+' : ''}${weightKg.toFixed(1)}kg`;
  }

  private toDayKeyToDate(dayKey: string) {
    const [year, month, day] = dayKey.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  async getSummary(month?: string) {
    try {
      // 不再按用户过滤；饮食配置取自任一配置过 diet 的用户（单用户应用）
      const user = await this.userModel.findOne({ 'settings.diet': { $exists: true } }).select('settings').lean().exec();
      const dietSettings = (user as any)?.settings?.diet || {};
      const config = {
        standard_calories: dietSettings.standardCalories || 2000,
        diet_start_date: dietSettings.dietStartDate || null,
      };
      const isMonthMode = !!month && /^\d{4}-\d{2}$/.test(month);
      const { month: monthKey, start, end } = isMonthMode ? this.parseMonth(month) : this.parseRecentRange(30);
      const dayKeyStart = this.toDayKey(start);
      const dayKeyEnd = this.toDayKey(end);
      const [records, dailyStats, latestRecords, weightsInWindow, weightBefore, weightAfter] = await Promise.all([
        this.recordModel
          .find({ recorded_time: { $gte: start, $lt: end } })
          .sort({ recorded_time: -1, created_time: -1 })
          .exec(),
        this.dailyStatModel
          .find({ day_key: { $gte: dayKeyStart, $lt: dayKeyEnd } })
          .sort({ day_key: 1 })
          .exec(),
        // 全量记录按 food_name 去重取最近一条（不受当前查看的月份窗口限制），搜索与最近添加都从这里出
        this.recordModel.aggregate([
          { $match: {} },
          { $sort: { recorded_time: -1, created_time: -1 } },
          { $group: { _id: '$food_name', record: { $first: '$$ROOT' } } },
          { $sort: { 'record.recorded_time': -1, 'record.created_time': -1 } },
        ]),
        this.weightModel
          .find({ day_key: { $gte: dayKeyStart, $lt: dayKeyEnd } })
          .sort({ day_key: 1 })
          .lean()
          .exec(),
        // 窗口外紧邻的前/后各一条体重，前端用来把折线延伸出图表边界
        this.weightModel.findOne({ day_key: { $lt: dayKeyStart } }).sort({ day_key: -1 }).lean().exec(),
        this.weightModel.findOne({ day_key: { $gte: dayKeyEnd } }).sort({ day_key: 1 }).lean().exec(),
      ]);
      const weights = [
        ...(weightBefore ? [weightBefore] : []),
        ...weightsInWindow,
        ...(weightAfter ? [weightAfter] : []),
      ];

      const foods = latestRecords.map(({ record: r }) => ({
        _id: r._id,
        name: r.food_name,
        unit: r.unit,
        calories_per_unit: r.calories_per_unit,
        calories_unit: r.calories_unit || 'kCal',
        calories_multiplier: r.calories_multiplier,
        amount: r.amount,
        quantity: r.quantity ?? 1,
        last_used_time: r.recorded_time,
        updated_time: r.updated_time,
      }));
      const recentFoods = foods.slice(0, 5);

      const statsMap = new Map(dailyStats.map((item) => [item.day_key, item]));
      return {
        config,
        foods,
        weights,
        recentFoods,
        records,
        dailyStats,
        days: isMonthMode ? this.buildMonthDays(monthKey, statsMap) : this.buildRecentDays(30, statsMap),
        month: monthKey,
        weightChangeLabel: await this.calcWeightChangeLabel(config),
      };
    } catch (error) {
      const isMonthMode = !!month && /^\d{4}-\d{2}$/.test(month);
      const { month: monthKey } = isMonthMode ? this.parseMonth(month) : this.parseRecentRange(30);
      const fallbackConfig = {
        standard_calories: 2000,
        diet_start_date: null,
      };
      return {
        config: fallbackConfig,
        foods: [],
        recentFoods: [],
        records: [],
        weights: [],
        dailyStats: [],
        days: isMonthMode ? this.buildMonthDays(monthKey, new Map()) : this.buildRecentDays(30, new Map()),
        month: monthKey,
        weightChangeLabel: '',
      };
    }
  }

  async createRecord(dto: CreateDietRecordDto) {
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
    if (!Number.isFinite(caloriesPerUnit)) {
      throw new BadRequestException('Invalid caloriesPerUnit');
    }
    if (!Number.isFinite(caloriesMultiplier) || caloriesMultiplier <= 0) {
      throw new BadRequestException('Invalid caloriesMultiplier');
    }

    const now = new Date();
    const recordedTime = dto.recordedTime ? new Date(dto.recordedTime) : now;
    const normalizedRecordedTime = Number.isNaN(recordedTime.getTime()) ? now : recordedTime;
    const totalCalories = Math.round((amount * quantity * caloriesPerUnit / caloriesMultiplier) * 100) / 100;

    const record = await new this.recordModel({
      food_name: name,
      unit,
      calories_per_unit: caloriesPerUnit,
      calories_unit: this.normalizeCaloriesUnit(dto.caloriesUnit),
      calories_multiplier: caloriesMultiplier,
      amount,
      quantity,
      total_calories: totalCalories,
      recorded_time: normalizedRecordedTime,
      created_time: now,
      updated_time: now,
    }).save();

    const dayKey = this.toDayKey(normalizedRecordedTime);
    const grossPositive = totalCalories > 0 ? totalCalories : 0;
    const grossNegative = totalCalories < 0 ? Math.abs(totalCalories) : 0;
    const existingStat = await this.dailyStatModel.findOne({ day_key: dayKey }).exec();
    if (!existingStat) {
      await new this.dailyStatModel({
        day_key: dayKey,
        total_calories: grossPositive,
        total_negative_calories: grossNegative,
        record_count: 1,
        created_time: now,
        updated_time: now,
      }).save();
    } else {
      const prevPositive = existingStat.total_negative_calories != null
        ? existingStat.total_calories
        : Math.max(0, existingStat.total_calories);
      const prevNegative = existingStat.total_negative_calories != null
        ? existingStat.total_negative_calories
        : 0;
      existingStat.total_calories = Math.round((prevPositive + grossPositive) * 100) / 100;
      existingStat.total_negative_calories = Math.round((prevNegative + grossNegative) * 100) / 100;
      existingStat.record_count += 1;
      existingStat.updated_time = now;
      await existingStat.save();
    }

    return record;
  }

  /** 记录/覆盖某日体重（kg） */
  async saveWeight(dto: { dayKey?: string; weight?: number }) {
    const dayKey = `${dto?.dayKey || ''}`.trim();
    const weight = Number(dto?.weight);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
      throw new BadRequestException('Invalid dayKey');
    }
    if (!Number.isFinite(weight) || weight <= 0 || weight > 500) {
      throw new BadRequestException('Invalid weight');
    }

    const saved = await this.weightModel.findOneAndUpdate(
      { day_key: dayKey },
      { $set: { weight } },
      { upsert: true, new: true },
    );
    return saved;
  }

  async deleteWeight(dayKey: string) {
    const key = `${dayKey || ''}`.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
      throw new BadRequestException('Invalid dayKey');
    }
    const deleted = await this.weightModel.deleteMany({ day_key: key });
    return { success: true, deletedCount: deleted.deletedCount || 0 };
  }

  async deleteRecord(recordId: string) {    const record = await this.recordModel.findOne({ _id: recordId }).exec();
    if (!record) {
      throw new NotFoundException('Record not found');
    }

    const dayKey = this.toDayKey(record.recorded_time || new Date());
    const totalCalories = Number(record.total_calories) || 0;
    const existingStat = await this.dailyStatModel.findOne({ day_key: dayKey }).exec();

    await this.recordModel.findByIdAndDelete(recordId).exec();

    if (existingStat) {
      const grossPositive = totalCalories > 0 ? totalCalories : 0;
      const grossNegative = totalCalories < 0 ? Math.abs(totalCalories) : 0;
      const prevPositive = existingStat.total_negative_calories != null
        ? existingStat.total_calories
        : Math.max(0, existingStat.total_calories);
      const prevNegative = existingStat.total_negative_calories != null
        ? existingStat.total_negative_calories
        : 0;
      existingStat.total_calories = Math.max(0, Math.round((prevPositive - grossPositive) * 100) / 100);
      existingStat.total_negative_calories = Math.max(0, Math.round((prevNegative - grossNegative) * 100) / 100);
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

  @Public()
  @Get('summary')
  async summary(@Query('month') month?: string) {
    return await this.dietService.getSummary(month);
  }

  @Public()
  @Post('record')
  async createRecord(@Body() dto: CreateDietRecordDto) {
    return await this.dietService.createRecord(dto);
  }

  @Public()
  @Post('weight')
  async saveWeight(@Body() dto: { dayKey?: string; weight?: number }) {
    return await this.dietService.saveWeight(dto);
  }

  @Public()
  @Delete('weight/:dayKey')
  async deleteWeight(@Param('dayKey') dayKey: string) {
    return await this.dietService.deleteWeight(dayKey);
  }

  @Public()
  @Delete('record/:id')
  async deleteRecord(@Param('id', new ValidateObjectId()) id: string) {
    return await this.dietService.deleteRecord(id);
  }
}

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'User', schema: UserSchema },
      { name: 'DietRecord', schema: DietRecordSchema },
      { name: 'DietDailyStat', schema: DietDailyStatSchema },
      { name: DIET_WEIGHT_MODEL_NAME, schema: DietWeightSchema },
    ]),
  ],
  controllers: [DietController],
  providers: [DietService],
})
export class DietModule {}