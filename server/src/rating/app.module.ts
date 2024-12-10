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
} from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { MongooseModule, Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

// Document Schema
@Schema()
export class Comment extends MongooseDocument {
  @Prop() id: string;
  @Prop() date: Date;
  @Prop() content: string;
  @Prop() rate: number;
  @Prop() userId: string;
}

export const CommentSchema = SchemaFactory.createForClass(Comment);

@Schema()
export class Document extends MongooseDocument {
  @Prop() id: string;
  @Prop() title: string;
  @Prop() date: Date;
  @Prop() type: string;
  @Prop([CommentSchema]) comments: Comment[];
}

export const DocumentSchema = SchemaFactory.createForClass(Document);

// DTOs
export class CreateDocumentDto {
  id: string;
  title: string;
  date: Date;
  type: string;
  comments: CreateCommentDto[];
}

export class CreateCommentDto {
  id: string;
  date: Date;
  content: string;
  rate: number;
  userId: string;
}

export class EditCommentDto {
  content: string;
  rate: number;
}

// Service
@Injectable()
export class DocumentService {
  constructor(
    @InjectModel(Document.name) private documentModel: Model<Document>,
  ) {}

  async addDocument(createDocumentDto: CreateDocumentDto): Promise<Document> {
    const createdDocument = new this.documentModel(createDocumentDto);
    return createdDocument.save();
  }

  async editComment(
    documentId: string,
    commentId: string,
    editCommentDto: EditCommentDto,
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
        'You are not authorized to edit this comment',
      );
    }

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
    rate?: number,
    pageSize?: number,
    pageNumber?: number,
  ): Promise<Document[]> {
    const query = rate ? { 'comments.rate': rate } : {};
    const skip = pageSize && pageNumber ? (pageNumber - 1) * pageSize : 0;
    const limit = pageSize ? pageSize : 10;

    return this.documentModel.find(query).skip(skip).limit(limit).exec();
  }

  async getTypes(): Promise<any[]> {
    return [
      { key: 'movie', title: '电影', children: [] },
      // Add more types as needed
    ];
  }
}

// Controller
@Controller('documents')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Post('add')
  async addDocument(@Body() createDocumentDto: CreateDocumentDto) {
    return this.documentService.addDocument(createDocumentDto);
  }

  @Put(':documentId/comments/:commentId')
  async editComment(
    @Param('documentId') documentId: string,
    @Param('commentId') commentId: string,
    @Body() editCommentDto: EditCommentDto,
    @Req() req,
  ) {
    const userId = req.user.userId;
    return this.documentService.editComment(
      documentId,
      commentId,
      editCommentDto,
      userId,
    );
  }

  @Delete(':documentId/comments/:commentId')
  async deleteComment(
    @Param('documentId') documentId: string,
    @Param('commentId') commentId: string,
    @Req() req,
  ) {
    const userId = req.user.userId;
    return this.documentService.deleteComment(documentId, commentId, userId);
  }

  @Get()
  async getDocuments(
    @Query('rate') rate?: number,
    @Query('pageSize') pageSize?: number,
    @Query('pageNumber') pageNumber?: number,
  ) {
    return this.documentService.getDocuments(rate, pageSize, pageNumber);
  }

  @Get('types')
  async getTypes() {
    return this.documentService.getTypes();
  }
}

// Module
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Document.name, schema: DocumentSchema },
    ]),
  ],
  controllers: [DocumentController],
  providers: [DocumentService],
})
export class RatingModule {}
