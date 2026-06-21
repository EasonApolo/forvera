import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel, MongooseModule } from '@nestjs/mongoose';
import { Document, Model, Schema } from 'mongoose';
import { ValidateObjectId } from 'src/shared/validate-object-id.pipes';

export interface ExpiryItem extends Document {
  name: string;
  creator: string;
  mode: 'shelf' | 'date';
  shelf_value?: number;
  shelf_unit?: 'day' | 'week' | 'month' | 'year';
  completed: boolean;
  created_time: Date;
  expires_time: Date;
  updated_time: Date;
}

export interface ExpirySoonItem extends ExpiryItem {
  freshnessPercent: number;
  freshnessRatio: number;
}

export class CreateExpiryDto {
  name: string;
  expires_time: string;
  mode?: 'shelf' | 'date';
  shelf_value?: number;
  shelf_unit?: 'day' | 'week' | 'month' | 'year';
  completed?: boolean;
}

export class UpdateExpiryDto {
  name?: string;
  expires_time?: string;
  mode?: 'shelf' | 'date';
  shelf_value?: number;
  shelf_unit?: 'day' | 'week' | 'month' | 'year';
  completed?: boolean;
}

export const ExpirySchema = new Schema({
  name: { type: String, required: true },
  creator: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  mode: { type: String, enum: ['shelf', 'date'], default: 'date' },
  shelf_value: Number,
  shelf_unit: { type: String, enum: ['day', 'week', 'month', 'year'] },
  completed: { type: Boolean, default: false },
  created_time: Date,
  expires_time: Date,
  updated_time: Date,
});

@Injectable()
export class ExpiryService {
  constructor(@InjectModel('Expiry') private readonly expiryModel: Model<ExpiryItem>) {}

  private toDateStart(date: Date) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  private parseDateOrThrow(input?: string) {
    const date = input ? new Date(input) : null;
    if (!date || Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid expires_time');
    }
    return date;
  }

  private getFreshness(item: ExpiryItem) {
    const today = this.toDateStart(new Date()).getTime();
    const created = this.toDateStart(new Date(item.created_time)).getTime();
    const expires = this.toDateStart(new Date(item.expires_time)).getTime();

    if (today > expires) {
      return { expired: true, freshnessRatio: 0, freshnessPercent: 0 };
    }

    const total = Math.max(1, expires - created);
    const remain = Math.max(0, expires - today);
    const freshnessRatio = Math.max(0, Math.min(1, remain / total));
    return {
      expired: false,
      freshnessRatio,
      freshnessPercent: freshnessRatio * 100,
    };
  }

  async getByCreator(creatorId: string, includeCompleted: boolean) {
    const filter: any = { creator: creatorId };
    if (!includeCompleted) {
      filter.completed = false;
    }
    return await this.expiryModel
      .find(filter)
      .sort({ expires_time: 1, created_time: -1 })
      .exec();
  }

  async getSoonByCreator(creatorId: string, percent = 20) {
    const threshold = Number(percent);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
      throw new BadRequestException('Invalid percent');
    }

    const items = await this.expiryModel
      .find({
        creator: creatorId,
        completed: false,
      })
      .sort({ expires_time: 1, created_time: -1 })
      .exec();

    const soonItems = items
      .map((item) => {
        const freshness = this.getFreshness(item);
        return {
          item,
          freshness,
        };
      })
      .filter(({ freshness }) => !freshness.expired && freshness.freshnessPercent <= threshold)
      .sort((a, b) => a.freshness.freshnessPercent - b.freshness.freshnessPercent)
      .map(({ item, freshness }) => ({
        ...item.toObject(),
        freshnessPercent: freshness.freshnessPercent,
        freshnessRatio: freshness.freshnessRatio,
      })) as ExpirySoonItem[];

    return {
      count: soonItems.length,
      items: soonItems,
      percent: threshold,
    };
  }

  private normalizeMode(mode?: string): 'shelf' | 'date' {
    return mode === 'shelf' ? 'shelf' : 'date';
  }

  private normalizeShelf(dto: { shelf_value?: number; shelf_unit?: string }) {
    if (dto.shelf_value === undefined || dto.shelf_value === null) {
      return { shelf_value: undefined, shelf_unit: undefined };
    }
    const shelfValue = Number(dto.shelf_value);
    if (!Number.isFinite(shelfValue) || shelfValue <= 0) {
      throw new BadRequestException('Invalid shelf_value');
    }
    const shelfUnit = dto.shelf_unit;
    if (!['day', 'week', 'month', 'year'].includes(`${shelfUnit || ''}`)) {
      throw new BadRequestException('Invalid shelf_unit');
    }
    return { shelf_value: shelfValue, shelf_unit: shelfUnit as 'day' | 'week' | 'month' | 'year' };
  }

  async suggest(creatorId: string, keyword: string) {
    const trimmed = keyword.trim();
    if (!trimmed) return [];
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return await this.expiryModel
      .find({
        creator: creatorId,
        name: { $regex: escaped, $options: 'i' },
      })
      .sort({ updated_time: -1 })
      .limit(8)
      .exec();
  }

  async create(creatorId: string, dto: CreateExpiryDto) {
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Name is required');

    const now = new Date();
    const expires_time = this.parseDateOrThrow(dto.expires_time);
    const mode = this.normalizeMode(dto.mode);
    const shelf = this.normalizeShelf(dto);

    return await new this.expiryModel({
      name,
      creator: creatorId,
      mode,
      ...shelf,
      completed: dto.completed === true,
      created_time: now,
      updated_time: now,
      expires_time,
    }).save();
  }

  async update(userId: string, id: string, dto: UpdateExpiryDto) {
    const item = await this.expiryModel.findById(id).exec();
    if (!item) throw new NotFoundException('Expiry item not found');
    if (`${item.creator}` !== userId) {
      throw new UnauthorizedException('You can only update your own item');
    }

    if (typeof dto.name === 'string') {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Name is required');
      item.name = name;
    }

    if (typeof dto.expires_time === 'string') {
      item.expires_time = this.parseDateOrThrow(dto.expires_time);
    }

    if (typeof dto.mode === 'string') {
      item.mode = this.normalizeMode(dto.mode);
    }

    if (dto.shelf_value !== undefined || dto.shelf_unit !== undefined) {
      const shelf = this.normalizeShelf(dto);
      item.shelf_value = shelf.shelf_value;
      item.shelf_unit = shelf.shelf_unit;
    }

    if (typeof dto.completed === 'boolean') {
      item.completed = dto.completed;
    }

    item.updated_time = new Date();
    await item.save();
    return item;
  }

  async remove(userId: string, id: string) {
    const item = await this.expiryModel.findById(id).exec();
    if (!item) throw new NotFoundException('Expiry item not found');
    if (`${item.creator}` !== userId) {
      throw new UnauthorizedException('You can only delete your own item');
    }
    await this.expiryModel.findByIdAndDelete(id).exec();
    return { ok: true };
  }
}

@Controller('api/expiry')
export class ExpiryController {
  constructor(private readonly expiryService: ExpiryService) {}

  @Get()
  async getMine(@Request() req, @Query('include_completed') includeCompleted = '0') {
    const flag = `${includeCompleted}` === '1' || `${includeCompleted}`.toLowerCase() === 'true';
    return await this.expiryService.getByCreator(req.user.userId, flag);
  }

  @Get('/soon')
  async getSoon(@Request() req, @Query('percent') percent = '20') {
    return await this.expiryService.getSoonByCreator(req.user.userId, Number(percent));
  }

  @Get('/suggest')
  async suggest(@Request() req, @Query('keyword') keyword = '') {
    return await this.expiryService.suggest(req.user.userId, keyword);
  }

  @Post()
  async create(@Request() req, @Body() dto: CreateExpiryDto) {
    return await this.expiryService.create(req.user.userId, dto);
  }

  @Put('/:id')
  async update(
    @Request() req,
    @Param('id', new ValidateObjectId()) id: string,
    @Body() dto: UpdateExpiryDto,
  ) {
    return await this.expiryService.update(req.user.userId, id, dto);
  }

  @Delete('/:id')
  async remove(@Request() req, @Param('id', new ValidateObjectId()) id: string) {
    return await this.expiryService.remove(req.user.userId, id);
  }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: 'Expiry', schema: ExpirySchema }])],
  controllers: [ExpiryController],
  providers: [ExpiryService],
})
export class ExpiryModule {}
