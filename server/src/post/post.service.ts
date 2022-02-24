import { Injectable, NotFoundException } from '@nestjs/common';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Post } from './interfaces/post.interface';
import { EditPostDTO } from './dto/edit.dto';

@Injectable()
export class PostService {

  constructor(@InjectModel('Post') private readonly postModel: Model<Post>) { }

  async getPostsMeta(): Promise<Post[]> {
    const posts = await this.postModel.find({ status: 1 }).sort({ created_time: -1 })
    .select('title updated_time category description').exec();
    return posts;
  }

  async getPost(postId): Promise<Post> {
    const post = await this.postModel
      .findById(postId)
      .exec();
    return post;
  }

  async getPostsMetaByUserId(userID): Promise<Post[]> {
    const posts = await this.postModel
      .find({ author: userID }).sort({ created_time: -1 }).select('title updated_time status category').exec()
    return posts
  }

  async addPost(authorId: string): Promise<Post> {
    let post: any = { author: authorId }
    post.created_time = post.updated_time = new Date();
    const newPost = await new this.postModel(post as Post).save();
    return newPost;
  }

  async editPost(postId, editPostDTO: EditPostDTO): Promise<Post> {
    let post: any = editPostDTO;
    post.updated_time = new Date();
    const editedPost = await this.postModel
      .findByIdAndUpdate(postId, post as Post, { new: true });
    return editedPost;
  }

  async validateAuthor(userId, postId) {
    let post = await this.postModel.findById(postId)
    if (!post) throw new NotFoundException(`Post ${postId} not exists.`)
    return post.author == userId
  }

  async deletePost(postId): Promise<any> {
    const deletedPost = await this.postModel
      .findByIdAndRemove(postId);
    return deletedPost;
  }
}