import {
  Module,
  Controller,
  Post,
  Get,
  Body,
  Param,
  Put,
  Req,
  UploadedFiles,
  UseInterceptors,
  Injectable,
  Inject,
  Request,
  Query,
  Delete,
} from '@nestjs/common';
import { MongooseModule, InjectModel } from '@nestjs/mongoose';
import { Schema, Model, Document } from 'mongoose';
import { FilesInterceptor } from '@nestjs/platform-express';
import { FileModule, FileService } from './file.module';
import { UsersModule, UserService } from 'src/modules/user.module';
import { twitPerPage } from 'src/config';
import { Public, Roles } from 'src/guards/jwt-auth.guard';

// DTO
export class AddTwitDTO {
  content: string;
  files: Array<string>;
  parent: string;
  ancestor: string;
}

export class UpdateTwitStatusDTO {
  status: 0 | 1;
}

// Interface
export interface Twit extends Document {
  user: string;
  content: string;
  created_time: Date;
  status: 0 | 1;
  level: number;
  reactions: Array<number>;
  files: Array<string>;
  children: Array<string>;
  parent: string;
  ancestor: string;
  descendants: Array<string>;
}

// Schema
export const TwitSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    content: String,
    created_time: Date,
    status: { type: Number, default: 1 },
    level: Number,
    state: Number,
    reactions: [Number],
    files: [{ type: Schema.Types.ObjectId, ref: 'File' }],
    children: [{ type: Schema.Types.ObjectId, ref: 'Twit' }],
    parent: { type: Schema.Types.ObjectId, ref: 'Twit' },
    ancestor: { type: Schema.Types.ObjectId, ref: 'Twit' },
    descendants: [{ type: Schema.Types.ObjectId, ref: 'Twit' }],
  },
  { timestamps: true },
);

// Service
@Injectable()
export class TwitService {
  @Inject() private readonly fileService: FileService;
  @Inject() private readonly userService: UserService;
  private readonly PER_PAGE: number = twitPerPage;
  readonly RECENT_TWIT_COUNT: number = 30;

  constructor(@InjectModel('Twit') private readonly twitModel: Model<Twit>) {}

  async addTwit(
    userId: string,
    addTwitDTO: AddTwitDTO,
    uploadedFiles,
  ): Promise<Twit> {
    if (!userId) userId = this.userService.anonymous._id;
    let reactions: Array<number> = new Array(12).fill(0);
    let created_time: Date = new Date();
    let files = new Array();
    let level = 0;
    if (addTwitDTO.ancestor) {
      level += 1;
      if (addTwitDTO.parent == addTwitDTO.ancestor) level += 1;
    }
    const twit2Save: any = {
      user: userId,
      created_time,
      status: 1,
      level,
      reactions,
      files,
      ...addTwitDTO,
    };
    let twit: Twit = await new this.twitModel(twit2Save).save();
    if (twit.ancestor) {
      let _ = await this.twitModel.findByIdAndUpdate(twit.ancestor, {
        $push: { descendants: twit._id },
      });
    }
    if (twit.parent) {
      let _ = await this.twitModel.findByIdAndUpdate(
        twit.parent,
        { $push: { children: twit._id } },
        { new: true },
      );
    }
    if (uploadedFiles) {
      let savedFiles = await this.fileService.saveFiles(
        userId,
        twit._id.toString(),
        uploadedFiles,
      );
      let fileIds: string[] = savedFiles.map((f) => f._id.toString());
      twit = await this.twitModel.findByIdAndUpdate(
        twit._id,
        { files: fileIds },
        { new: true },
      );
    }
    if (twit.ancestor) {
      return await this.getTwitById(twit.ancestor);
    } else {
      return await this.getTwitById(twit._id);
    }
  }

  getTwitById(id: string): Promise<Twit> {
    const query = this.twitModel.findById(id);
    return this.populateTwit(query).exec();
  }

  getTwitByPage(page: number, includeHidden = false): Promise<Twit[]> {
    const filter: any = { ancestor: { $exists: false } };
    if (!includeHidden) {
      filter.status = { $ne: 0 };
    }
    const query = this.twitModel
      .find(filter)
      .sort({ created_time: -1 })
      .skip(this.PER_PAGE * page)
      .limit(this.PER_PAGE);
    return this.populateTwit(query).exec();
  }

  getTwitByPageByCount(
    count?: number,
    year?: number,
    q?: string,
    includeHidden = false,
  ): Promise<Twit[]> {
    const filter: any = { ancestor: { $exists: false } }
    if (!includeHidden) {
      filter.status = { $ne: 0 }
    }
    if (q) {
      filter.content = { $regex: q, $options: 'i' }
    } else if (year !== undefined && year !== null) {
      const start = new Date(year, 0, 1)
      const end = new Date(year + 1, 0, 1)
      filter.created_time = { $gte: start, $lt: end }
    }
    let query = this.twitModel.find(filter).sort({ created_time: -1 })
    if (count !== undefined) {
      query = query.limit(count)
    }
    return this.populateTwit(query).exec()
  }

  async updateTwitStatus(twitId: string, status: 0 | 1) {
    const twit = await this.twitModel.findById(twitId)
    if (!twit) return null
    if (twit.ancestor) {
      return await this.getTwitById(twit.ancestor)
    }
    return await this.twitModel
      .findByIdAndUpdate(twitId, { status }, { new: true })
      .populate('user', 'username')
      .populate('files', 'url thumb')
      .populate({
        path: 'descendants',
        populate: { path: 'user', select: 'username' },
      })
      .exec()
  }

  populateTwit(query) {
    return query
      .populate('user', 'username')
      .populate('files', 'url thumb')
      .populate({
        path: 'descendants',
        populate: { path: 'user', select: 'username' },
      });
  }

  async getReplies(twitId: string) {
    const replies = await this.twitModel
      .findById(twitId)
      .populate({
        path: 'descendants',
        populate: { path: 'user', select: 'username' },
      })
      .select('children');
    return replies.descendants;
  }

  async deleteTwit(twitId: string) {
    const twit = await this.twitModel.findById(twitId);
    if (!twit) return null;

    // Collect all twit ids in this thread to clean up their files.
    const allTwits = await this.twitModel
      .find({ $or: [{ _id: twitId }, { ancestor: twitId }, { parent: twitId }] })
      .select('_id')
      .lean()
      .exec();

    for (const t of allTwits) {
      await this.fileService.removeFilesByPost('', `${t._id}`);
    }

    await this.twitModel.deleteMany({ ancestor: twitId }).exec();
    await this.twitModel.deleteMany({ parent: twitId }).exec();
    await this.twitModel.deleteOne({ _id: twitId }).exec();
    if (twit.ancestor) {
      return this.getTwitById(twit.ancestor);
    }
    return null;
  }
}

// Controller
@Controller('api/twit')
export class TwitController {
  constructor(private readonly twitService: TwitService) {}

  @Post('')
  @UseInterceptors(FilesInterceptor('files'))
  async addTwit(
    @Req() req,
    @Body() addTwitDTO: AddTwitDTO,
    @UploadedFiles() files,
  ) {
    let userId = req.user.userId;
    const newRecord = await this.twitService.addTwit(userId, addTwitDTO, files);
    if (addTwitDTO.ancestor) {
      return await this.twitService.getTwitById(addTwitDTO.ancestor);
    } else {
      return newRecord;
    }
  }

  @Public()
  @Post('/anonymous')
  @UseInterceptors(FilesInterceptor('files'))
  async addTwitAnonymous(
    @Req() req,
    @Body() addTwitDTO: AddTwitDTO,
    @UploadedFiles() files,
  ) {
    return await this.twitService.addTwit(null, addTwitDTO, null);
  }

  @Public()
  @Get('/:page')
  async getTwit(@Param('page') page) {
    return this.twitService.getTwitByPage(parseInt(page));
  }

  @Post('/list')
  async getTwitLoggedUser(@Request() req, @Body() body) {
    const year = body?.year
    const q = body?.q
    if (req.user.role >= 3) {
      return await this.twitService.getTwitByPageByCount(
        undefined,
        year,
        q,
        true,
      )
    }
    return await this.twitService.getTwitByPageByCount(
      this.twitService.RECENT_TWIT_COUNT,
      undefined,
      undefined,
    )
  }

  @Public()
  @Get('/list/anonymous')
  async getTwitAnonymous(@Query() query) {
    return await this.twitService.getTwitByPageByCount(
      this.twitService.RECENT_TWIT_COUNT,
      undefined,
      undefined,
    )
  }

  @Public()
  @Get('replies/:twitId')
  async getReplies(@Param('twitId') twitId) {
    return this.twitService.getReplies(twitId);
  }

  @Roles(3)
  @Delete('/:twitId')
  async deleteTwit(@Param('twitId') twitId) {
    return await this.twitService.deleteTwit(twitId);
  }

  @Roles(3)
  @Put('/:twitId/status')
  async updateTwitStatus(
    @Param('twitId') twitId,
    @Body() body: UpdateTwitStatusDTO,
  ) {
    return await this.twitService.updateTwitStatus(twitId, body.status)
  }
}

// Module
@Module({
  imports: [
    FileModule,
    UsersModule,
    MongooseModule.forFeature([{ name: 'Twit', schema: TwitSchema }]),
  ],
  controllers: [TwitController],
  providers: [TwitService],
})
export class TwitModule {}
