import {
  Module,
  Controller,
  Post,
  Body,
  Put,
  Delete,
  Get,
  Query,
  BadRequestException,
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { MongooseModule, Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { OptionalParseIntPipe } from '../shared/parse-int.pipe';
import { Public, Roles } from '../guards/jwt-auth.guard';
import { APP_GUARD } from '@nestjs/core';

// Document Schema
@Schema({ timestamps: true })
export class Comment extends MongooseDocument {
  @Prop() content?: string;
  @Prop() rate: number | null;
  @Prop() userId: string;
  @Prop() createdAt?: Date;
  @Prop() updatedAt?: Date;

  constructor() {
    super();
  }
}

export const CommentSchema = SchemaFactory.createForClass(Comment);

@Schema({ timestamps: true, collection: 'ratings' })
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
  date?: Date;
  type: string;
  episode?: string;
  img?: string;
  url?: string;
  sub_title?: string;
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

export class DeleteCommentDto {
  documentId: string;
  commentId: string;
}

// Service
@Injectable()
export class DocumentService {
  private lastSearchTime: number | null = null;
  private readonly cooldownPeriod = 3000;

  constructor(
    @InjectModel(Document.name) private documentModel: Model<Document>,
    @InjectModel(Comment.name) private commentModel: Model<Comment>,
  ) {}

  async addDocument(createDocumentDto: CreateDocumentDto): Promise<Document> {
    const now = new Date();
    const createdDocument = new this.documentModel({
      ...createDocumentDto,
      comments: [
        {
          content: '',
          rate: null,
          userId: '',
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    return createdDocument.save();
  }

  async deleteDocument(documentId: string): Promise<Document> {
    return this.documentModel.findByIdAndDelete(documentId).exec();
  }

  async createComment(createCommentDto: CreateCommentDto): Promise<Document> {
    const { documentId, ...commentData } = createCommentDto;
    const document: Document = await this.documentModel
      .findById(documentId)
      .exec();
    const now = new Date();
    const comment = new this.commentModel({
      ...commentData,
      createdAt: now,
      updatedAt: now,
    });
    document.comments.push(comment);
    return document.save();
  }

  async editComment(editCommentDto: EditCommentDto): Promise<Document> {
    const { documentId, commentId } = editCommentDto;

    return this.documentModel
      .findOneAndUpdate(
        { _id: documentId, 'comments._id': commentId },
        {
          $set: {
            'comments.$.content': editCommentDto.content,
            'comments.$.rate': editCommentDto.rate,
            'comments.$.updatedAt': new Date(),
          },
        },
        { new: true },
      )
      .exec();
  }

  async deleteComment({
    documentId,
    commentId,
  }: DeleteCommentDto): Promise<Document> {
    const document = await this.documentModel.findById(documentId).exec();
    if (!document) {
      return null;
    }
    if ((document.comments || []).length <= 1) {
      throw new BadRequestException('不能删除最后一条评论');
    }

    return this.documentModel
      .findOneAndUpdate(
        { _id: documentId },
        { $pull: { comments: { _id: commentId } } },
        { new: true },
      )
      .exec();
  }

  async getDocuments(
    type: string,
    rate?: number,
  ): Promise<Document[]> {
    const query = { type, ...(rate && { rate }) };

    return this.documentModel
      .find(query)
      .sort({ createdAt: -1 })
      .exec();
  }

  async getTypes(): Promise<any[]> {
    return [
      { key: 'movie', title: '电影', children: [] },
      // Add more types as needed
    ];
  }

  async searchMovies(query: string): Promise<any> {
    const keyword = query?.trim();
    if (!keyword) {
      throw new BadRequestException('请输入电影名称');
    }
    const link = keyword.match(/https?:\/\/[^\s<>]+/i)?.[0];
    let subjectId: string | undefined;
    if (link) {
      let parsed: URL;
      try {
        parsed = new URL(link);
      } catch {
        throw new BadRequestException('无效的豆瓣电影链接');
      }
      const location = `${parsed.pathname} ${[...parsed.searchParams.values()].join(' ')}`;
      subjectId = parsed.searchParams.get('subject_id')?.match(/^\d{7,}$/)?.[0]
        || location.match(/subject\/(\d{7,})(?!\d)/i)?.[1]
        || location.match(/(?:^|[^\d])(\d{7,})(?!\d)/)?.[1];
      if (!subjectId) throw new BadRequestException('链接中没有有效的电影 subject ID');
    }
    const currentTime = Date.now();

    if (this.lastSearchTime !== null && currentTime - this.lastSearchTime < this.cooldownPeriod) {
      throw new HttpException(
        `查询太频繁，请在 ${Math.ceil((this.cooldownPeriod - (currentTime - this.lastSearchTime)) / 1000)} 秒后重试`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.lastSearchTime = currentTime;
    const url = subjectId
      ? `https://movie.douban.com/j/subject_abstract?subject_id=${subjectId}`
      : `https://movie.douban.com/j/subject_suggest?q=${encodeURIComponent(keyword)}`;
    const proxyUrl = process.env.DOUBAN_PROXY_URL;
    const proxy = proxyUrl ? new URL(proxyUrl) : null;
    const requestOptions = {
      timeout: 8000,
      proxy: proxy
        ? {
          protocol: proxy.protocol.slice(0, -1),
          host: proxy.hostname,
          port: Number(proxy.port || (proxy.protocol === 'https:' ? 443 : 80)),
        }
        : false as const,
    };
    try {
      let response;
      try {
        response = await axios.get(url, requestOptions);
      } catch (error) {
        if (!axios.isAxiosError(error) || error.response || error.code !== 'ECONNRESET') {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
        response = await axios.get(url, requestOptions);
      }
      if (subjectId) {
        const movie = response.data?.subject;
        if (response.data?.r !== 0 || movie?.id !== subjectId ||
          movie?.subtype !== 'Movie' || typeof movie.title !== 'string' || !movie.title.trim()) {
          throw new BadGatewayException('豆瓣电影摘要接口未返回可用的电影资料');
        }
        return [{
          id: subjectId,
          title: movie.title,
          url: `https://movie.douban.com/subject/${subjectId}/`,
          img: '',
          year: typeof movie.release_year === 'string' ? movie.release_year : '',
          type: 'movie',
          episode: '',
          sub_title: '',
        }];
      }
      if (!Array.isArray(response.data)) {
        throw new BadGatewayException('豆瓣接口返回了非预期数据，未能完成搜索');
      }
      return response.data;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (axios.isAxiosError(error)) {
        if (error.response) {
          throw new BadGatewayException(`豆瓣接口返回 HTTP ${error.response.status}，搜索失败`);
        }
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
          throw new GatewayTimeoutException('连接豆瓣接口超时，请稍后重试');
        }
        throw new BadGatewayException(`无法${proxy ? '通过代理' : '直接'}连接豆瓣接口（${error.code || '网络错误'}），请稍后重试`);
      }
      throw error;
    }
  }
}

// Controller
@Controller('api/documents')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Roles(3)
  @Post('add')
  async addDocument(@Body() createDocumentDto: CreateDocumentDto) {
    console.log(createDocumentDto);
    return this.documentService.addDocument(createDocumentDto);
  }

  @Roles(3)
  @Delete('')
  async deleteDocument(@Body() { documentId }: { documentId: string }) {
    return this.documentService.deleteDocument(documentId);
  }

  @Roles(3)
  @Post('comment')
  async createComment(@Body() createCommentDto: CreateCommentDto) {
    return this.documentService.createComment({ ...createCommentDto });
  }

  @Roles(3)
  @Put('comment')
  async editComment(@Body() editCommentDto: EditCommentDto) {
    return this.documentService.editComment(editCommentDto);
  }

  @Roles(3)
  @Delete('comment')
  async deleteComment(@Body() deleteCommentDto: DeleteCommentDto) {
    return this.documentService.deleteComment(deleteCommentDto);
  }

  @Public()
  @Get()
  async getDocuments(
    @Query('type') type: string,
    @Query('rate', OptionalParseIntPipe) rate?: number,
  ) {
    return this.documentService.getDocuments(type, rate);
  }

  @Public()
  @Get('types')
  async getTypes() {
    return this.documentService.getTypes();
  }

  @Roles(3)
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
