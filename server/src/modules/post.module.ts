import {
  Module,
  Controller,
  Get,
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

// DTO
export class EditPostDTO {
  title: string;
  description: string;
  content: string;
  category: Array<string>;
  time: string;
  status: number;
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
  constructor(@InjectModel('Post') private readonly postModel: Model<Post>) {}

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
      .select('title updated_time status category')
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

  async deletePost(postId): Promise<any> {
    const deletedPost = await this.postModel.findByIdAndRemove(postId);
    return deletedPost;
  }
}

// Controller
@Controller('post')
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
    const posts = await this.postService.getPostsMetaByUserId(userId);
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
    let isAuthor = await this.postService.validateAuthor(
      req.user.userId,
      postId,
    );
    if (!isAuthor) {
      throw new UnauthorizedException(
        `${req.user.username} is not the author of ${postId}.`,
      );
    }
    const newPost = await this.postService.editPost(postId, editPostDTO);
    if (!newPost) throw new NotFoundException('Post does not exist!');
    return { data: newPost };
  }

  @Delete('/:postId')
  async deletePost(
    @Request() req,
    @Param('postId', new ValidateObjectId()) postId,
  ) {
    let isAuthor = await this.postService.validateAuthor(
      req.user.userId,
      postId,
    );
    if (!isAuthor) {
      throw new UnauthorizedException(
        `${req.user.username} is not the author of ${postId}.`,
      );
    }
    const newPost = await this.postService.deletePost(postId);
    if (!newPost) throw new NotFoundException('Post does not exist!');
    return;
  }
}

// Module
@Module({
  imports: [MongooseModule.forFeature([{ name: 'Post', schema: PostSchema }])],
  controllers: [PostController],
  providers: [PostService],
})
export class PostModule {}
