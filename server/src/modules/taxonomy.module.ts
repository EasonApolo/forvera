import {
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  Param,
  Post,
  Put,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Request,
} from '@nestjs/common';
import { InjectModel, MongooseModule } from '@nestjs/mongoose';
import { Document, Model, Schema, Types } from 'mongoose';
import { Public } from 'src/guards/jwt-auth.guard';
import { ValidateObjectId } from 'src/shared/validate-object-id.pipes';
import { promises as fs } from 'fs';
import { join } from 'path';
import { staticPath } from 'src/shared/staticPath';
import { File as SavedFile, FileSchema } from './file.module';

export interface TaxonomyNode extends Document {
  title: string;
  description: string;
  images: string[];
  parent: string | null;
  order: number;
  created_time: Date;
  updated_time: Date;
}

export class CreateTaxonomyDto {
  title: string;
  description?: string;
  images?: string[];
  parent?: string | null;
}

export class UpdateTaxonomyDto {
  title?: string;
  description?: string;
  images?: string[];
}

export class MoveTaxonomyDto {
  parent?: string | null;
  order?: number;
}

export const TaxonomySchema = new Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  images: { type: [String], default: [] },
  parent: { type: Schema.Types.ObjectId, ref: 'Taxonomy', default: null },
  order: { type: Number, default: 0 },
  created_time: Date,
  updated_time: Date,
});

@Injectable()
export class TaxonomyService {
  constructor(
    @InjectModel('Taxonomy') private readonly taxonomyModel: Model<TaxonomyNode>,
    @InjectModel('File') private readonly fileModel: Model<SavedFile>,
  ) {}

  async getAll(): Promise<TaxonomyNode[]> {
    return await this.taxonomyModel
      .find()
      .sort({ order: 1, created_time: 1 })
      .exec();
  }

  private async normalizeChildren(parentId: string | null) {
    const parentValue = parentId ? parentId : null;
    const siblings = await this.taxonomyModel
      .find({ parent: parentValue })
      .sort({ order: 1, created_time: 1, _id: 1 })
      .exec();

    await Promise.all(
      siblings.map((node, index) => {
        if (node.order === index) {
          return Promise.resolve();
        }
        return this.taxonomyModel.findByIdAndUpdate(node._id, { order: index });
      }),
    );
  }

  private validateParentId(parent?: string | null) {
    if (parent && !Types.ObjectId.isValid(parent)) {
      throw new BadRequestException('Invalid parent id');
    }
  }

  private async ensureNotSelfOrDescendant(nodeId: string, newParent: string | null) {
    if (!newParent) return;
    if (newParent === nodeId) {
      throw new BadRequestException('Cannot move node under itself');
    }

    let current: string | null = newParent;
    while (current) {
      if (current === nodeId) {
        throw new BadRequestException('Cannot move node under its descendant');
      }
      const parentNode = await this.taxonomyModel.findById(current).select('parent').exec();
      current = parentNode?.parent ? `${parentNode.parent}` : null;
    }
  }

  async create(dto: CreateTaxonomyDto): Promise<TaxonomyNode> {
    if (!dto.title?.trim()) {
      throw new BadRequestException('Title is required');
    }
    this.validateParentId(dto.parent);

    if (dto.parent) {
      const parentNode = await this.taxonomyModel.findById(dto.parent).exec();
      if (!parentNode) throw new NotFoundException('Parent node not found');
    }

    const parentValue = dto.parent ? dto.parent : null;
    const siblingCount = await this.taxonomyModel.countDocuments({ parent: parentValue });
    const now = new Date();
    return await new this.taxonomyModel({
      title: dto.title.trim(),
      description: dto.description || '',
      images: dto.images || [],
      parent: parentValue,
      order: siblingCount,
      created_time: now,
      updated_time: now,
    }).save();
  }

  async update(nodeId: string, dto: UpdateTaxonomyDto): Promise<TaxonomyNode> {
    const payload: Partial<TaxonomyNode> = {
      updated_time: new Date(),
    };

    if (typeof dto.title === 'string') {
      if (!dto.title.trim()) {
        throw new BadRequestException('Title is required');
      }
      payload.title = dto.title.trim();
    }
    if (typeof dto.description === 'string') {
      payload.description = dto.description;
    }
    if (Array.isArray(dto.images)) {
      payload.images = dto.images;
    }

    const updated = await this.taxonomyModel
      .findByIdAndUpdate(nodeId, payload, { new: true })
      .exec();

    if (!updated) throw new NotFoundException('Taxonomy node not found');
    return updated;
  }

  async move(nodeId: string, dto: MoveTaxonomyDto) {
    const node = await this.taxonomyModel.findById(nodeId).exec();
    if (!node) throw new NotFoundException('Taxonomy node not found');

    const newParent = dto.parent ? dto.parent : null;
    this.validateParentId(newParent);

    if (newParent) {
      const parentNode = await this.taxonomyModel.findById(newParent).exec();
      if (!parentNode) throw new NotFoundException('Parent node not found');
    }

    await this.ensureNotSelfOrDescendant(`${node._id}`, newParent);

    const oldParent = node.parent ? `${node.parent}` : null;
    const siblings = await this.taxonomyModel
      .find({ parent: newParent, _id: { $ne: node._id } })
      .sort({ order: 1, created_time: 1, _id: 1 })
      .exec();

    const clampedOrder = Math.max(
      0,
      Math.min(Number.isFinite(dto.order) ? Number(dto.order) : siblings.length, siblings.length),
    );

    await this.taxonomyModel.findByIdAndUpdate(nodeId, {
      parent: newParent,
      order: clampedOrder,
      updated_time: new Date(),
    });

    await this.normalizeChildren(oldParent);
    await this.normalizeChildren(newParent);
  }

  async remove(nodeId: string) {
    const root = await this.taxonomyModel.findById(nodeId).exec();
    if (!root) throw new NotFoundException('Taxonomy node not found');

    const idsToDelete = [nodeId];
    const nodesToDelete: TaxonomyNode[] = [root];
    for (let cursor = 0; cursor < idsToDelete.length; cursor++) {
      const currentId = idsToDelete[cursor];
      const children = await this.taxonomyModel
        .find({ parent: currentId })
        .exec();
      children.forEach(child => {
        idsToDelete.push(`${child._id}`);
        nodesToDelete.push(child);
      });
    }

    await this.taxonomyModel.deleteMany({ _id: { $in: idsToDelete } }).exec();

    const postIds = idsToDelete.map(id => `taxonomy-${id}`);
    await this.fileModel.deleteMany({ post: { $in: postIds } }).exec();

    await Promise.all(
      postIds.map(postId =>
        fs.rm(join(staticPath, postId), { recursive: true, force: true }),
      ),
    );

    const imagePaths = nodesToDelete.flatMap(node => node.images || []);
    const toThumb = (url: string) => {
      const dotIndex = url.lastIndexOf('.');
      if (dotIndex === -1) {
        return `${url}_thumb`;
      }
      return `${url.slice(0, dotIndex)}_thumb${url.slice(dotIndex)}`;
    };
    await Promise.all(
      imagePaths.flatMap(url => {
        const relativeUrl = url.startsWith('/') ? url.slice(1) : url;
        return [
          fs.rm(join(staticPath, relativeUrl), { force: true }),
          fs.rm(join(staticPath, toThumb(relativeUrl)), { force: true }),
        ];
      }),
    );

    const parentId = root.parent ? `${root.parent}` : null;
    await this.normalizeChildren(parentId);

    return { deletedIds: idsToDelete };
  }
}

@Controller('taxonomy')
export class TaxonomyController {
  constructor(private readonly taxonomyService: TaxonomyService) {}

  private assertAdmin(req: any) {
    if (!req?.user || req.user.role !== 3) {
      throw new ForbiddenException('Only admin can modify taxonomy');
    }
  }

  @Public()
  @Get()
  async getAll() {
    return await this.taxonomyService.getAll();
  }

  @Post()
  async create(@Request() req, @Body() dto: CreateTaxonomyDto) {
    this.assertAdmin(req);
    return await this.taxonomyService.create(dto);
  }

  @Put('/:id')
  async update(
    @Request() req,
    @Param('id', new ValidateObjectId()) nodeId: string,
    @Body() dto: UpdateTaxonomyDto,
  ) {
    this.assertAdmin(req);
    return await this.taxonomyService.update(nodeId, dto);
  }

  @Put('/:id/move')
  async move(
    @Request() req,
    @Param('id', new ValidateObjectId()) nodeId: string,
    @Body() dto: MoveTaxonomyDto,
  ) {
    this.assertAdmin(req);
    await this.taxonomyService.move(nodeId, dto);
    return { ok: true };
  }

  @Delete('/:id')
  async remove(
    @Request() req,
    @Param('id', new ValidateObjectId()) nodeId: string,
  ) {
    this.assertAdmin(req);
    return await this.taxonomyService.remove(nodeId);
  }
}

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Taxonomy', schema: TaxonomySchema },
      { name: 'File', schema: FileSchema },
    ]),
  ],
  controllers: [TaxonomyController],
  providers: [TaxonomyService],
})
export class TaxonomyModule {}
