import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { File } from './file.interface';
import { promises as fs } from 'fs';
import { staticPath } from 'src/shared/staticPath';
import { join, extname } from 'path';
import * as ThumbNail from 'image-thumbnail';

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
