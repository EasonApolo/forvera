import {
  Module,
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  UploadedFiles,
  UseInterceptors,
  Injectable,
  Inject,
} from '@nestjs/common';
import { MongooseModule, InjectModel } from '@nestjs/mongoose';
import { Schema, Model, Document } from 'mongoose';
import { FilesInterceptor } from '@nestjs/platform-express';
import { FileModule, FileService } from './file.module';
import { UsersModule, UserService } from 'src/modules/user.module';
import { twitPerPage } from 'src/config';
import { Public } from 'src/guards/jwt-auth.guard';

// DTO
export class AddTwitDTO {
  content: string;
  files: Array<string>;
  parent: string;
  ancestor: string;
}

// Interface
export interface Twit extends Document {
  user: string;
  content: string;
  created_time: Date;
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

  getTwitByPage(page: number): Promise<Twit[]> {
    const query = this.twitModel
      .find({ ancestor: { $exists: false } })
      .sort({ created_time: -1 })
      .skip(this.PER_PAGE * page)
      .limit(this.PER_PAGE);
    return this.populateTwit(query).exec();
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
}

// Controller
@Controller('twit')
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

  @Public()
  @Get('replies/:twitId')
  async getReplies(@Param('twitId') twitId) {
    return this.twitService.getReplies(twitId);
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
