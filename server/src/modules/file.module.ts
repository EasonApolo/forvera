import {
  Module,
  Controller,
  Body,
  Delete,
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
import { randomBytes } from 'crypto';
import { imageSize } from 'image-size';
import sharp = require('sharp');
import { staticPath } from 'src/shared/staticPath';

const parseKeepOriginalRatio = (value: unknown) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  }
  return false;
};

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

  private async normalizeImageBuffer(buffer: Buffer) {
    // Rotate by EXIF orientation and output without preserving orientation metadata.
    return await sharp(buffer).rotate().toBuffer();
  }

  private async makeThumbBuffer(normalizedBuffer: Buffer, keepOriginalRatio: boolean) {
    if (keepOriginalRatio) {
      return await sharp(normalizedBuffer)
        .resize({ width: 300, withoutEnlargement: true })
        .toBuffer();
    }
    return await sharp(normalizedBuffer)
      .resize(200, 200, { fit: 'cover' })
      .toBuffer();
  }

  async saveFiles(
    userId: string,
    postId: string,
    files,
    keepOriginalRatio: boolean = false,
  ): Promise<File[]> {
    let savedFiles: File[] = await Promise.all(
      files.map(async (file): Promise<File> => {
        return await this.saveFile(userId, postId, file, keepOriginalRatio);
      }),
    );
    return savedFiles;
  }

  async saveFile(
    userId: string,
    postId: string,
    file,
    keepOriginalRatio: boolean = false,
  ): Promise<File> {
    // construct file description
    file.user = userId;
    file.post = postId;
    file.name = file.originalname;
    file.created_time = new Date();
    const rawBuffer = file.buffer;
    const normalizedBuffer = await this.normalizeImageBuffer(rawBuffer);
    delete file.buffer;
    const newFile = await new this.fileModel(file as File).save();

    // mkdir, update document, write file/thumb
    const assetsDir = join(staticPath, postId);
    await fs.mkdir(assetsDir, { recursive: true });
    const ext = extname(file.originalname);
    const randomId = randomBytes(8).toString('hex');
    const dimensions = imageSize(normalizedBuffer);
    const width = dimensions?.width;
    const height = dimensions?.height;
    const sizeSuffix = width && height ? `_${width}_${height}` : '';
    const fName = `${randomId}${sizeSuffix}${ext}`;
    const tName = `${randomId}${sizeSuffix}_thumb${ext}`;
    const savedFile = await this.fileModel.findByIdAndUpdate(
      newFile._id,
      { url: `${postId}/${fName}`, thumb: `${postId}/${tName}` },
      { new: true },
    );
    await fs.writeFile(join(assetsDir, fName), normalizedBuffer);
    const thumb_buffer = await this.makeThumbBuffer(normalizedBuffer, keepOriginalRatio);
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

  async removeFile(userId: string, fileId: string) {
    const filter: Record<string, any> = { _id: fileId };
    if (userId) filter.user = userId;
    const target = await this.fileModel.findOne(filter).exec();
    if (!target) return null;
    await this.removeFilesByTargets(filter);
    return { _id: fileId };
  }

  async removeFilesByPost(userId: string, postId: string) {
    const filter: Record<string, any> = { post: postId };
    if (userId) filter.user = userId;
    return await this.removeFilesByTargets(filter);
  }

  async removeFilesByUrls(userId: string, postId: string, urls: string[]) {
    const uniqueUrls = [...new Set(urls.filter(Boolean))];
    if (!uniqueUrls.length) return { deletedCount: 0 };

    const filter: Record<string, any> = { post: postId, url: { $in: uniqueUrls } };
    if (userId) filter.user = userId;
    return await this.removeFilesByTargets(filter);
  }

  private async removeFilesByTargets(filter: Record<string, any>) {
    const targets = await this.fileModel.find(filter).exec();
    for (const target of targets) {
      const filePath = join(staticPath, `${target.url || ''}`.replace(/\\/g, '/'));
      const thumbPath = join(staticPath, `${target.thumb || ''}`.replace(/\\/g, '/'));
      await fs.unlink(filePath).catch(() => null);
      await fs.unlink(thumbPath).catch(() => null);
    }
    await this.fileModel.deleteMany(filter).exec();
    return { deletedCount: targets.length };
  }
}

// Controller
@Controller('api/file')
export class FileController {
  constructor(private fileService: FileService) {}

  @Post('upload/:postId')
  @UseInterceptors(FilesInterceptor('files'))
  async uploadFiles(
    @Param('postId') postId,
    @Req() req,
    @Body('keepOriginalRatio') keepOriginalRatio,
    @UploadedFiles() files,
  ): Promise<File[]> {
    let userId = req.user.userId;
    const keep = parseKeepOriginalRatio(keepOriginalRatio);
    let savedFiles = await this.fileService.saveFiles(userId, postId, files, keep);
    return savedFiles;
  }

  @Post('uploadSingle/:postId')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Param('postId') postId,
    @Req() req,
    @Body('keepOriginalRatio') keepOriginalRatio,
    @UploadedFile() file,
  ): Promise<File> {
    let userId = req.user.userId;
    const keep = parseKeepOriginalRatio(keepOriginalRatio);
    let savedFile = await this.fileService.saveFile(userId, postId, file, keep);
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

  @Delete('/:fileId')
  async removeById(@Param('fileId') fileId: string, @Req() req) {
    const userId = req.user.userId;
    return await this.fileService.removeFile(userId, fileId);
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
