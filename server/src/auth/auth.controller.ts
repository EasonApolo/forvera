import {
  Controller,
  Post,
  UseGuards,
  Request,
  Res,
  HttpCode,
  ConflictException,
} from '@nestjs/common';
import { Public } from 'src/shared/public.decorator';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './local-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Request() req) {
    const tokenObj = await this.authService.getToken(req.user);
    return { token: tokenObj.token };
  }

  @Public()
  @Post('register')
  async register(@Request() req) {
    const newUser = await this.authService.register(req.body);
    if (!newUser) throw new ConflictException();
    else return;
  }

  @Post('status')
  async checkStatus() {}
}
