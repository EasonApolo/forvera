import {
  Module,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  Injectable,
} from '@nestjs/common';
import { MongooseModule, InjectModel } from '@nestjs/mongoose';
import { Schema, Model, Document } from 'mongoose';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { promises as fs } from 'fs';
import { join, extname } from 'path';
import * as ThumbNail from 'image-thumbnail';
import { Public } from 'src/shared/public.decorator';
import { staticPath } from 'src/shared/staticPath';

// Interface
export interface File extends Document {
  user: string;
  post: string;
  name: string;
  encoding: string;
  mimetype: string;
  url: string;
  thumb: string;
  size: number;
  created_time: string;
}

// Schema
export const FileSchema = new Schema({
  user: String,
  post: String,
  name: String,
  encoding: String,
  mimetype: String,
  url: String,
  thumb: String,
  size: Number,
  created_time: Date,
});

// Service
@Injectable()
export class FileService {
  constructor(@InjectModel('File') private readonly fileModel: Model<File>) {}

  async saveFiles(userId: string, postId: string, files): Promise<File[]> {
    let savedFiles: File[] = await Promise.all(
      files.map(async (file): Promise<File> => {
        return await this.saveFile(userId, postId, file);
      }),
    );
    return savedFiles;
  }

  async saveFile(userId: string, postId: string, file): Promise<File> {
    // construct file description
    file.user = userId;
    file.post = postId;
    file.name = file.originalname;
    file.created_time = new Date();
    const buffer = file.buffer;
    delete file.buffer;
    const newFile = await new this.fileModel(file as File).save();

    // mkdir, update document, write file/thumb
    const assetsDir = join(staticPath, postId);
    await fs.mkdir(assetsDir, { recursive: true });
    const fName = `${newFile._id.toString()}${extname(file.originalname)}`;
    const tName = `${newFile._id.toString()}_thumb${extname(
      file.originalname,
    )}`;
    const savedFile = await this.fileModel.findByIdAndUpdate(
      newFile._id,
      { url: `${postId}/${fName}`, thumb: `${postId}/${tName}` },
      { new: true },
    );
    await fs.writeFile(join(assetsDir, fName), buffer);
    const options = { width: 200, height: 200, fit: 'cover' };
    const thumb_buffer = await ThumbNail(buffer, options);
    await fs.writeFile(join(assetsDir, tName), thumb_buffer);

    return savedFile;
  }

  async getByPostId(postId: string): Promise<File[]> {
    let files = await this.fileModel
      .find({ post: postId })
      .sort({ _id: -1 })
      .exec();
    return files;
  }
}

// Controller
@Controller('file')
export class FileController {
  constructor(private fileService: FileService) {}

  @Post('upload/:postId')
  @UseInterceptors(FilesInterceptor('files'))
  async uploadFiles(
    @Param('postId') postId,
    @Req() req,
    @UploadedFiles() files,
  ): Promise<File[]> {
    let userId = req.user.userId;
    let savedFiles = await this.fileService.saveFiles(userId, postId, files);
    return savedFiles;
  }

  @Post('uploadSingle/:postId')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Param('postId') postId,
    @Req() req,
    @UploadedFile() file,
  ): Promise<File> {
    let userId = req.user.userId;
    let savedFile = await this.fileService.saveFile(userId, postId, file);
    return savedFile;
  }

  @Post('post/:postId')
  async listPagedUserImages(
    @Param('postId') postId,
    @Req() req,
    @Param('index') index: number,
  ) {
    let userId = req.user.userId;
    return await this.fileService.getByPostId(postId);
  }
}

// Module
@Module({
  imports: [MongooseModule.forFeature([{ name: 'File', schema: FileSchema }])],
  controllers: [FileController],
  providers: [FileService],
  exports: [FileService],
})
export class FileModule {}
