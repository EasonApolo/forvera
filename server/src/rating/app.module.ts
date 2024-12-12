import {
  Module,
  Controller,
  Post,
  Body,
  Put,
  Delete,
  Param,
  Get,
  Req,
  Query,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { MongooseModule, Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { OptionalParseIntPipe } from 'src/shared/parse-int.pipe';

// Document Schema
@Schema({ timestamps: true })
export class Comment extends MongooseDocument {
  @Prop() date: Date;
  @Prop() content?: string;
  @Prop() rate: number | null;
  @Prop() userId: string;

  constructor() {
    super();
    this.date = new Date(); // Initialize date with current timestamp
  }
}

export const CommentSchema = SchemaFactory.createForClass(Comment);

@Schema({ timestamps: true })
export class Document extends MongooseDocument {
  @Prop() id: string; // movie id
  @Prop() title: string;
  @Prop() type: string;
  @Prop() rate: number;
  @Prop() episode?: string; // '26' for movie
  @Prop() img?: string; //  for movie
  @Prop() url?: string; //  for movie
  @Prop() date?: string; // '2011' for movie
  @Prop() sub_title: string; //  for movie
  @Prop([CommentSchema]) comments: Comment[];
}

export const DocumentSchema = SchemaFactory.createForClass(Document);

// DTOs
export class CreateDocumentDto {
  id: string;
  title: string;
  date: Date;
  type: string;
}

export class CreateCommentDto {
  documentId: string; // Add documentId to the DTO
  content?: string;
  rate?: number;
}

export class EditCommentDto {
  documentId: string; // Add documentId to the DTO
  commentId: string; // Add commentId to the DTO
  content: string;
  rate: number;
}

// Service
@Injectable()
export class DocumentService {
  private lastSearchTime: number | null = null;
  private readonly cooldownPeriod = 10000;

  constructor(
    @InjectModel(Document.name) private documentModel: Model<Document>,
    @InjectModel(Comment.name) private commentModel: Model<Comment>,
  ) {}

  async addDocument(createDocumentDto: CreateDocumentDto): Promise<Document> {
    const createdDocument = new this.documentModel(createDocumentDto);
    return createdDocument.save();
  }

  async createComment(createCommentDto: CreateCommentDto): Promise<Document> {
    const { documentId, ...commentData } = createCommentDto;
    const document: Document = await this.documentModel
      .findById(documentId)
      .exec();
    const comment = new this.commentModel(commentData);
    document.comments.push(comment);
    document.rate = createCommentDto.rate; // Update document rate
    return document.save();
  }

  async editComment(editCommentDto: EditCommentDto): Promise<Document> {
    const { documentId, commentId } = editCommentDto;

    return this.documentModel
      .findOneAndUpdate(
        { id: documentId, 'comments.id': commentId },
        {
          $set: {
            'comments.$.content': editCommentDto.content,
            'comments.$.rate': editCommentDto.rate,
          },
        },
        { new: true },
      )
      .exec();
  }

  async deleteComment(
    documentId: string,
    commentId: string,
    userId: string,
  ): Promise<Document> {
    const document = await this.documentModel
      .findOne({ id: documentId, 'comments.id': commentId })
      .exec();
    const comment = document.comments.find(
      (comment) => comment.id === commentId,
    );

    if (comment.userId !== userId) {
      throw new UnauthorizedException(
        'You are not authorized to delete this comment',
      );
    }

    return this.documentModel
      .findOneAndUpdate(
        { id: documentId },
        { $pull: { comments: { id: commentId } } },
        { new: true },
      )
      .exec();
  }

  async getDocuments(
    type: string,
    rate?: number,
    pageSize?: number,
    pageNumber?: number,
  ): Promise<Document[]> {
    const query = { type, ...(rate && { rate }) };
    const skip = pageSize && pageNumber ? (pageNumber - 1) * pageSize : 0;
    const limit = pageSize ? pageSize : 10;

    return this.documentModel
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
  }

  async getTypes(): Promise<any[]> {
    return [
      { key: 'movie', title: '电影', children: [] },
      // Add more types as needed
    ];
  }

  async searchMovies(query: string): Promise<any> {
    const currentTime = Date.now();

    if (
      this.lastSearchTime &&
      currentTime - this.lastSearchTime < this.cooldownPeriod
    ) {
      throw new BadRequestException(
        'Requests are too frequent. Please wait a moment.',
      );
    }

    this.lastSearchTime = currentTime;
    const url = `https://movie.douban.com/j/subject_suggest?q=${encodeURIComponent(
      query,
    )}`;
    const response = await axios.get(url);
    return response.data;
  }
}

// Controller
@Controller('documents')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Post('add')
  async addDocument(@Body() createDocumentDto: CreateDocumentDto) {
    console.log(createDocumentDto);
    return this.documentService.addDocument(createDocumentDto);
  }

  @Post('comment')
  async createComment(@Body() createCommentDto: CreateCommentDto) {
    return this.documentService.createComment({ ...createCommentDto });
  }

  @Put('comment')
  async editComment(@Body() editCommentDto: EditCommentDto) {
    return this.documentService.editComment(editCommentDto);
  }

  @Delete('comment')
  async deleteComment(
    @Body() deleteCommentDto: { documentId: string; commentId: string },
    @Req() req,
  ) {
    const { documentId, commentId } = deleteCommentDto;
    const userId = req.user.userId;
    return this.documentService.deleteComment(documentId, commentId, userId);
  }

  @Get()
  async getDocuments(
    @Query('type') type: string,
    @Query('rate', OptionalParseIntPipe) rate?: number,
    @Query('pageSize', OptionalParseIntPipe) pageSize?: number,
    @Query('pageNumber', OptionalParseIntPipe) pageNumber?: number,
  ) {
    return this.documentService.getDocuments(type, rate, pageSize, pageNumber);
  }

  @Get('types')
  async getTypes() {
    return this.documentService.getTypes();
  }

  @Get('search')
  async searchMovies(@Query('query') query: string) {
    return this.documentService.searchMovies(query);
  }
}

// Module
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Document.name, schema: DocumentSchema },
    ]),
    MongooseModule.forFeature([{ name: Comment.name, schema: CommentSchema }]),
  ],
  controllers: [DocumentController],
  providers: [DocumentService],
})
export class RatingModule {}
