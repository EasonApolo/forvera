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
} from '@nestjs/common';
import { InjectModel, MongooseModule, Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument, Model, Schema as MongooseSchema, Types } from 'mongoose';
import { ValidateObjectId } from 'src/shared/validate-object-id.pipes';

export interface RequirementTask extends MongooseDocument {
  id: number;
  creator: string;
  title: string;
  checked: boolean;
  parent: string | null;
  created_time: Date;
  updated_time: Date;
}

export class CreateRequirementTaskDto {
  title?: string;
  parent?: string | null;
}

export class UpdateRequirementTaskDto {
  title?: string;
  checked?: boolean;
}

export class MoveRequirementTaskDto {
  direction!: 'up' | 'down';
}

@Schema({ collection: 'requirements' })
export class RequirementTaskEntity extends MongooseDocument {
  @Prop({ required: true, unique: true }) id: number;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true }) creator: string;
  @Prop({ default: '' }) title: string;
  @Prop({ default: false }) checked: boolean;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'RequirementTask', default: null }) parent: string | null;
  @Prop({ required: true, default: Date.now }) created_time: Date;
  @Prop({ required: true, default: Date.now }) updated_time: Date;
}

export const RequirementTaskSchema = SchemaFactory.createForClass(RequirementTaskEntity);

@Injectable()
export class RequirementsService {
  constructor(
    @InjectModel(RequirementTaskEntity.name)
    private readonly requirementTaskModel: Model<RequirementTask>,
  ) {}

  private async getNextId() {
    const latest = await this.requirementTaskModel.findOne().sort({ id: -1 }).select('id').lean().exec();
    return Number(latest?.id || 0) + 1;
  }

  private validateParentId(parent?: string | null) {
    if (parent && !Types.ObjectId.isValid(parent)) {
      throw new BadRequestException('Invalid parent id');
    }
  }

  private isAdmin(userRole: unknown) {
    return Number(userRole) === 3;
  }

  private async getAccessibleTaskOrThrow(creatorId: string, taskId: string, allowAll = false) {
    const filter: Record<string, any> = { _id: taskId };
    if (!allowAll) {
      filter.creator = creatorId;
    }
    const task = await this.requirementTaskModel.findOne(filter).exec();
    if (!task) {
      throw new NotFoundException('Requirement task not found');
    }
    return task;
  }

  async getAll(creatorId: string, showAll = false, allowAll = false) {
    const filter: Record<string, any> = {};
    if (!allowAll) {
      filter.creator = creatorId;
    }
    if (!showAll) {
      filter.$or = [{ parent: { $ne: null } }, { checked: false }];
    }
    return await this.requirementTaskModel
      .find(filter)
      .sort({ id: -1, created_time: 1, _id: 1 })
      .exec();
  }

  async create(creatorId: string, dto: CreateRequirementTaskDto, allowAll = false) {
    const title = `${dto.title || ''}`.trim();
    const parent = dto.parent ? `${dto.parent}` : null;
    this.validateParentId(parent);

    if (parent) {
      const parentTask = await this.requirementTaskModel
        .findOne({ _id: parent, ...(allowAll ? {} : { creator: creatorId }) })
        .exec();
      if (!parentTask) {
        throw new NotFoundException('Parent task not found');
      }
    }

    const now = new Date();
    const nextId = await this.getNextId();
    return await new this.requirementTaskModel({
      id: nextId,
      creator: creatorId,
      title,
      checked: false,
      parent,
      created_time: now,
      updated_time: now,
    }).save();
  }

  async update(creatorId: string, taskId: string, dto: UpdateRequirementTaskDto, allowAll = false) {
    const task = await this.getAccessibleTaskOrThrow(creatorId, taskId, allowAll);

    if (typeof dto.title === 'string') {
      task.title = dto.title.trim();
    }
    if (typeof dto.checked === 'boolean') {
      task.checked = dto.checked;
    }
    task.updated_time = new Date();

    return await task.save();
  }

  async moveTop(creatorId: string, taskId: string, allowAll = false) {
    const task = await this.getAccessibleTaskOrThrow(creatorId, taskId, allowAll);

    const nextId = await this.getNextId();
    task.id = nextId;
    task.updated_time = new Date();
    return await task.save();
  }

  async moveSibling(creatorId: string, taskId: string, direction: 'up' | 'down', allowAll = false) {
    if (direction !== 'up' && direction !== 'down') {
      throw new BadRequestException('Invalid direction');
    }

    const task = await this.getAccessibleTaskOrThrow(creatorId, taskId, allowAll);

    const siblings = await this.requirementTaskModel
      .find({ parent: task.parent || null, ...(allowAll ? {} : { creator: creatorId }) })
      .sort({ id: 1, created_time: 1, _id: 1 })
      .exec();

    const idx = siblings.findIndex(item => `${item._id}` === `${task._id}`);
    if (idx < 0) {
      throw new NotFoundException('Requirement task not found in siblings');
    }

    if (siblings.length <= 1) {
      return task;
    }

    let targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0) {
      targetIdx = siblings.length - 1;
    } else if (targetIdx >= siblings.length) {
      targetIdx = 0;
    }

    const target = siblings[targetIdx];
    const taskIdValue = task.id;
    const targetIdValue = target.id;
    const tempId = await this.getNextId();
    const now = new Date();

    task.id = tempId;
    task.updated_time = now;
    await task.save();

    target.id = taskIdValue;
    target.updated_time = now;
    await target.save();

    task.id = targetIdValue;
    task.updated_time = now;
    return await task.save();
  }

  async remove(creatorId: string, taskId: string, allowAll = false) {
    const rootTask = await this.requirementTaskModel
      .findOne({ _id: taskId, ...(allowAll ? {} : { creator: creatorId }) })
      .select('_id')
      .lean()
      .exec();
    if (!rootTask) {
      throw new NotFoundException('Requirement task not found');
    }

    const idsToDelete = new Set<string>([`${rootTask._id}`]);
    let pendingIds = [`${rootTask._id}`];

    while (pendingIds.length) {
      const children = await this.requirementTaskModel
        .find({ parent: { $in: pendingIds }, ...(allowAll ? {} : { creator: creatorId }) })
        .select('_id')
        .lean()
        .exec();

      const nextPending: string[] = [];
      children.forEach(child => {
        const id = `${child._id}`;
        if (!idsToDelete.has(id)) {
          idsToDelete.add(id);
          nextPending.push(id);
        }
      });
      pendingIds = nextPending;
    }

    await this.requirementTaskModel.deleteMany({ _id: { $in: [...idsToDelete] } }).exec();
    return { deletedCount: idsToDelete.size };
  }
}

@Controller('api/requirements')
export class RequirementsController {
  constructor(private readonly requirementsService: RequirementsService) {}

  @Get()
  async getAll(@Request() req, @Query('showAll') showAll = '0') {
    const flag = `${showAll}` === '1' || `${showAll}`.toLowerCase() === 'true';
    return await this.requirementsService.getAll(req.user.userId, flag, false);
  }

  @Post()
  async create(@Request() req, @Body() dto: CreateRequirementTaskDto) {
    return await this.requirementsService.create(req.user.userId, dto, false);
  }

  @Put('/:taskId')
  async update(
    @Request() req,
    @Param('taskId', new ValidateObjectId()) taskId: string,
    @Body() dto: UpdateRequirementTaskDto,
  ) {
    return await this.requirementsService.update(req.user.userId, taskId, dto, false);
  }

  @Put('/:taskId/top')
  async moveTop(@Request() req, @Param('taskId', new ValidateObjectId()) taskId: string) {
    return await this.requirementsService.moveTop(req.user.userId, taskId, false);
  }

  @Put('/:taskId/move')
  async moveSibling(
    @Request() req,
    @Param('taskId', new ValidateObjectId()) taskId: string,
    @Body() dto: MoveRequirementTaskDto,
  ) {
    return await this.requirementsService.moveSibling(req.user.userId, taskId, dto.direction, false);
  }

  @Delete('/:taskId')
  async remove(@Request() req, @Param('taskId', new ValidateObjectId()) taskId: string) {
    return await this.requirementsService.remove(req.user.userId, taskId, false);
  }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: RequirementTaskEntity.name, schema: RequirementTaskSchema }])],
  controllers: [RequirementsController],
  providers: [RequirementsService],
})
export class RequirementsModule {}