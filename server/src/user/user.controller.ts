import { Controller, Get, Post, Request } from '@nestjs/common';
import { Public } from 'src/shared/public.decorator';
import { UserService } from './user.service';

@Controller('user')
export class UserController {
  constructor(private userService: UserService) {}

  @Post('info')
  async checkStatus(@Request() req) {
    return await this.userService.getUserInfo(req.user)
  }

  @Public()
  @Get('anonymous')
  async getAnonymousNameList() {
    return await this.userService.getAnonymousNameList()
  }
}
