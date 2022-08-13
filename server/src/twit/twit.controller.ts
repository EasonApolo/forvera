import { Body, Controller, Get, Param, Post, Req, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Public } from 'src/shared/public.decorator';
import { AddTwitDTO } from './add.dto';
import { TwitService } from './twit.service';

@Controller('twit')
export class TwitController {
  constructor (private twitService: TwitService) {}

  @Post('')
  @UseInterceptors(FilesInterceptor('files'))
  async addTwit(@Req() req, @Body() addTwitDTO: AddTwitDTO, @UploadedFiles() files) {
    let userId = req.user.userId
    const newRecord = await this.twitService.addTwit(userId, addTwitDTO, files)
    if (addTwitDTO.ancestor) {
      return await this.twitService.getTwitById(addTwitDTO.ancestor)
    } else {
      return newRecord
    }
  }

  @Public()
  @Post('/anonymous')
  @UseInterceptors(FilesInterceptor('files'))
  async addTwitAnonymous(@Req() req, @Body() addTwitDTO: AddTwitDTO, @UploadedFiles() files) {
    return await this.twitService.addTwit(null, addTwitDTO, null)
  }

  @Public()
  @Get('/:page')
  async getTwit(@Param('page') page) {
    return this.twitService.getTwitByPage(parseInt(page))
  }

  @Public()
  @Get('replies/:twitId')
  async getReplies(@Param('twitId') twitId) {
    return this.twitService.getReplies(twitId)
  }
}
