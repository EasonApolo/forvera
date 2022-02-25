import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Query } from 'mongoose';
import { twitPerPage } from 'src/config';
import { FileService } from 'src/file/file.service';
import { UserService } from 'src/user/user.service';
import { AddTwitDTO } from './add.dto';
import { Twit } from './twit.interface';

@Injectable()
export class TwitService {
  @Inject() private readonly fileService: FileService;
  @Inject() private readonly userService: UserService
  private readonly PER_PAGE: number = twitPerPage;
  constructor(@InjectModel('Twit') private readonly twitModel: Model<Twit>) {}

  async addTwit(userId: string, addTwitDTO: AddTwitDTO, uploadedFiles): Promise<Twit> {
    if (!userId) userId = this.userService.anonymous._id
    let reactions: Array<number> = new Array(12).fill(0);
    let created_time: Date = new Date();
    let files = new Array();
    let level = 0
    if (addTwitDTO.ancestor) { 
      level += 1;
      if (addTwitDTO.parent == addTwitDTO.ancestor) level += 1
    }
    const twit2Save: any = {
      user: userId, created_time, level,
      reactions, files, ...addTwitDTO
    }
    let twit: Twit = await new this.twitModel(twit2Save).save()
    if (twit.ancestor) {
      let _ = await this.twitModel.findByIdAndUpdate(twit.ancestor,
        { $push: { "descendants": twit._id } },
      )
    }
    if (twit.parent) {
      let _ = await this.twitModel.findByIdAndUpdate(twit.parent,
        { $push: { "children": twit._id } }, { new : true },
      )
    }
    if (uploadedFiles) {
      let savedFiles = await this.fileService.saveFiles(userId, twit._id.toString(), uploadedFiles)
      let fileIds: string[] = savedFiles.map(f => f._id.toString())
      twit = await this.twitModel.findByIdAndUpdate(
        twit._id, { files: fileIds }, { new: true }
      )
    }
    if (twit.ancestor) {
      return await this.getTwitById(twit.ancestor)
    } else {
      return await this.getTwitById(twit._id)
    }
  }

  getTwitById(id: string): Promise<Twit> {
    const query = this.twitModel.findById(id)
    return this.populateTwit(query).exec()
  }

  getTwitByPage(page: number): Promise<Twit[]> {
    const query = this.twitModel.find({ ancestor: { $exists: false } }).sort({ created_time: -1 })
      .skip(this.PER_PAGE * page).limit(this.PER_PAGE)
    return this.populateTwit(query).exec()
  }

  populateTwit(query) {
    return query
      .populate('user', 'username')
      .populate('files', 'url thumb')
      .populate({ path: 'descendants', populate: { path: 'user', select: 'username' } })
  }

  async getReplies(twitId: string) {
    const replies = await this.twitModel.findById(twitId)
      .populate({ path: 'descendants', populate: { path: 'user', select: 'username' } })
      .select('children')
    return replies.descendants
  }
}
