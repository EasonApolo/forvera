import {
  Module,
  Controller,
  Get,
  BadRequestException,
  NotFoundException,
  Param,
  Body,
  Post,
  Request,
  Put,
  Delete,
  UnauthorizedException,
  Injectable,
} from '@nestjs/common';
import { MongooseModule, InjectModel } from '@nestjs/mongoose';
import { Schema, Model, Document } from 'mongoose';
import { Public } from 'src/guards/jwt-auth.guard';
import { ValidateObjectId } from '../shared/validate-object-id.pipes';
import { extname } from 'path';
import sharp = require('sharp');
import { FileModule, FileService } from './file.module';

// DTO
export class EditPostDTO {
  title: string;
  description: string;
  content: string;
  category: Array<string>;
  time: string;
  status: number;
}

export class ImportYuqueDTO {
  text: string;
}

// Interface
export interface Post extends Document {
  title: string;
  description: string;
  content: string;
  author: string;
  category: Array<string>;
  created_time: string;
  updated_time: string;
  status: number;
}

// Schema
export const PostSchema = new Schema({
  title: String,
  content: String,
  description: String,
  author: { type: Schema.Types.ObjectId, ref: 'User' },
  category: [String],
  created_time: Date,
  updated_time: Date,
  status: { type: Number, default: 0 },
});

// Service
@Injectable()
export class PostService {
  constructor(
    @InjectModel('Post') private readonly postModel: Model<Post>,
    private readonly fileService: FileService,
  ) {}

  private parseImgAttributes(tag: string) {
    const attrs: Record<string, string> = {};
    const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(tag))) {
      const key = `${match[1] || ''}`.toLowerCase();
      const value = `${match[2] ?? match[3] ?? match[4] ?? ''}`;
      attrs[key] = value;
    }
    return attrs;
  }

  private parseCrop(cropRaw: string | undefined) {
    const fallback: [number, number, number, number] = [0, 0, 1, 1];
    if (!cropRaw) return fallback;
    const nums = cropRaw
      .split(',')
      .map(item => Number(item.trim()))
      .filter(item => Number.isFinite(item));
    if (nums.length !== 4) return fallback;
    const [x, y, w, h] = nums;
    if (w <= 0 || h <= 0) return fallback;
    return [Math.max(0, x), Math.max(0, y), Math.min(1, w), Math.min(1, h)] as [number, number, number, number];
  }

  private async maybeCrop(buffer: Buffer, cropRaw?: string) {
    const [x, y, w, h] = this.parseCrop(cropRaw);
    const isIdentity = x === 0 && y === 0 && w === 1 && h === 1;
    if (isIdentity) return buffer;

    const meta = await sharp(buffer).metadata();
    const srcWidth = meta.width || 0;
    const srcHeight = meta.height || 0;
    if (!srcWidth || !srcHeight) return buffer;

    const left = Math.max(0, Math.min(srcWidth - 1, Math.round(x * srcWidth)));
    const top = Math.max(0, Math.min(srcHeight - 1, Math.round(y * srcHeight)));
    const width = Math.max(1, Math.min(srcWidth - left, Math.round(w * srcWidth)));
    const height = Math.max(1, Math.min(srcHeight - top, Math.round(h * srcHeight)));

    return await sharp(buffer).extract({ left, top, width, height }).toBuffer();
  }

  private normalizeLineBreaks(raw: string) {
    return raw
      .replace(/\r\n/g, '\n')
      .replace(/\n{2,}/g, '\n')
      .replace(/^(\s*)\+/gm, '$1-');
  }

  private getExtFromUrl(url: string, mimeType: string) {
    const urlExt = extname(new URL(url).pathname || '').toLowerCase();
    if (urlExt) return urlExt;
    if (mimeType.includes('png')) return '.png';
    if (mimeType.includes('webp')) return '.webp';
    if (mimeType.includes('gif')) return '.gif';
    return '.jpg';
  }

  async importArticleFromYuque(postId: string, userId: string, origin: string, rawText: string) {
    const input = `${rawText || ''}`.trim();
    if (!input) {
      throw new BadRequestException('text is required');
    }

    // Clear old article content and images before import processing.
    await this.postModel.findByIdAndUpdate(postId, {
      content: '',
      updated_time: new Date(),
    });
    await this.fileService.removeFilesByPost(userId, postId);

    const normalized = this.normalizeLineBreaks(input);
    const imgRe = /<img\b[^>]*>/gi;
    const matches: Array<{ start: number; end: number; tag: string }> = [];
    let matched: RegExpExecArray | null;
    while ((matched = imgRe.exec(normalized))) {
      matches.push({ start: matched.index, end: imgRe.lastIndex, tag: matched[0] });
    }

    let output = '';
    let cursor = 0;
    for (const item of matches) {
      output += normalized.slice(cursor, item.start);
      cursor = item.end;

      const attrs = this.parseImgAttributes(item.tag);
      const src = `${attrs.src || ''}`.trim();
      if (!src) {
        output += item.tag;
        continue;
      }

      try {
        const response = await fetch(src);
        if (!response.ok) {
          output += item.tag;
          continue;
        }
        const raw = Buffer.from(await response.arrayBuffer());
        const cropped = await this.maybeCrop(raw, attrs.crop);
        const mimeType = `${response.headers.get('content-type') || ''}`.toLowerCase() || 'image/jpeg';
        const ext = this.getExtFromUrl(src, mimeType);

        const savedFile = await this.fileService.saveFile(
          userId,
          postId,
          {
            originalname: `yuque_import${ext}`,
            encoding: '7bit',
            mimetype: mimeType,
            size: cropped.byteLength,
            buffer: cropped,
          },
          true,
        );

        const uploadedUrl = `${origin}${savedFile.url}`;
        const width = `${attrs.width || 'auto'}`;
        const description = `${attrs.title || ''}`.replace(/"/g, '&quot;');
        output += `<img src="${uploadedUrl}" width="${width}" description="${description}">`;
      } catch {
        output += item.tag;
      }
    }

    output += normalized.slice(cursor);

    await this.postModel.findByIdAndUpdate(postId, {
      content: output,
      updated_time: new Date(),
    });

    return await this.getPost(postId);
  }

  async getPostsMeta(): Promise<Post[]> {
    const posts = await this.postModel
      .find({ status: 1 })
      .sort({ created_time: -1 })
      .select('title updated_time category description')
      .exec();
    return posts;
  }

  async getPost(postId): Promise<Post> {
    const post = await this.postModel
      .findById(postId)
      .populate('author', 'username')
      .exec();
    return post;
  }

  async getPostsMetaByUserId(userID): Promise<Post[]> {
    const posts = await this.postModel
      .find({ author: userID })
      .sort({ created_time: -1 })
      .select('title created_time updated_time status category')
      .exec();
    return posts;
  }

  async getPostsMetaForAdmin(): Promise<Post[]> {
    const posts = await this.postModel
      .find({})
      .sort({ created_time: -1 })
      .select('title created_time updated_time status category author')
      .populate('author', 'username')
      .exec();
    return posts;
  }

  async addPost(authorId: string): Promise<Post> {
    let post: any = { author: authorId };
    post.created_time = post.updated_time = new Date();
    const newPost = await new this.postModel(post as Post).save();
    return newPost;
  }

  async editPost(postId, editPostDTO: EditPostDTO): Promise<Post> {
    let post: any = editPostDTO;
    post.updated_time = new Date();
    const editedPost = await this.postModel.findByIdAndUpdate(
      postId,
      post as Post,
      { new: true },
    );
    return editedPost;
  }

  async validateAuthor(userId, postId) {
    let post = await this.postModel.findById(postId);
    if (!post) throw new NotFoundException(`Post ${postId} not exists.`);
    return post.author == userId;
  }

  async deletePost(userId: string, postId: string): Promise<any> {
    await this.fileService.removeFilesByPost(userId, postId);
    const deletedPost = await this.postModel.findByIdAndRemove(postId);
    return deletedPost;
  }
}

// Controller
@Controller('api/post')
export class PostController {
  constructor(private postService: PostService) {}

  @Public()
  @Get()
  async getPosts() {
    const posts = await this.postService.getPostsMeta();
    return posts;
  }

  @Public()
  @Get('/:postId')
  async getPostById(@Param('postId', new ValidateObjectId()) postId: string) {
    return await this.postService.getPost(postId);
  }

  @Post('user')
  async getPostMetasByUserId(@Request() req) {
    const userId = req.user.userId;
    const isAdmin = Number(req.user.role) === 3;
    const posts = isAdmin
      ? await this.postService.getPostsMetaForAdmin()
      : await this.postService.getPostsMetaByUserId(userId);
    return posts;
  }

  @Post()
  async addPost(@Request() req) {
    const author_id = req.user.userId;
    const newPost = await this.postService.addPost(author_id);
    return newPost;
  }

  @Put('/:postId')
  async editPost(
    @Request() req,
    @Param('postId', new ValidateObjectId()) postId: string,
    @Body() editPostDTO: EditPostDTO,
  ) {
    const isAdmin = Number(req.user.role) === 3;
    let isAuthor = await this.postService.validateAuthor(
      req.user.userId,
      postId,
    );
    if (!isAuthor && !isAdmin) {
      throw new UnauthorizedException(
        `${req.user.username} is not the author of ${postId}.`,
      );
    }
    const newPost = await this.postService.editPost(postId, editPostDTO);
    if (!newPost) throw new NotFoundException('Post does not exist!');
    return { data: newPost };
  }

  @Post('/:postId/import-yuque')
  async importFromYuque(
    @Request() req,
    @Param('postId', new ValidateObjectId()) postId: string,
    @Body() dto: ImportYuqueDTO,
  ) {
    const isAdmin = Number(req.user.role) === 3;
    const isAuthor = await this.postService.validateAuthor(req.user.userId, postId);
    if (!isAuthor && !isAdmin) {
      throw new UnauthorizedException(`${req.user.username} is not the author of ${postId}.`);
    }
    const origin = `${req.protocol}://${req.get('host')}/`;
    const data = await this.postService.importArticleFromYuque(postId, req.user.userId, origin, dto.text);
    return { data };
  }

  @Delete('/:postId')
  async deletePost(
    @Request() req,
    @Param('postId', new ValidateObjectId()) postId,
  ) {
    const isAdmin = Number(req.user.role) === 3;
    let isAuthor = await this.postService.validateAuthor(
      req.user.userId,
      postId,
    );
    if (!isAuthor && !isAdmin) {
      throw new UnauthorizedException(
        `${req.user.username} is not the author of ${postId}.`,
      );
    }
    const newPost = await this.postService.deletePost(req.user.userId, postId);
    if (!newPost) throw new NotFoundException('Post does not exist!');
    return;
  }
}

// Module
@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'Post', schema: PostSchema }]),
    FileModule,
  ],
  controllers: [PostController],
  providers: [PostService],
})
export class PostModule {}
