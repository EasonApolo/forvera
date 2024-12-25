import {
  Controller,
  Post,
  Request,
  ConflictException,
  Module,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Public } from 'src/guards/jwt-auth.guard';
import {
  UsersModule,
  CreateUserDTO,
  UserService,
} from 'src/modules/user.module';
import {
  jwtConstants,
  jwtExpiresDate,
  JwtStrategy,
} from 'src/guards/jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private jwtService: JwtService,
  ) {}

  async validateUser(username: string, pass: string): Promise<any> {
    const user = await this.userService.getUserByName(username);
    console.log('validateUser', user);
    if (user && user.password === pass) {
      const result = {
        username: user.username,
        userId: user._id,
        role: user.role,
      };
      return result;
    }
    return null;
  }

  async getToken(user: any) {
    const payload = {
      username: user.username,
      sub: user.userId,
      role: user.role,
    };
    console.log('signing token', payload);
    return {
      token: this.jwtService.sign(payload),
    };
  }

  async register(user: CreateUserDTO) {
    let res = await this.userService.addUser(user);
    if (!res) return null;
    return await this.getToken(user);
  }
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('login')
  async login(@Request() req) {
    const { username, password } = req.body;
    const user = await this.authService.validateUser(username, password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const tokenObj = await this.authService.getToken(user);
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

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.register({
      secret: jwtConstants.secret,
      signOptions: { expiresIn: jwtExpiresDate },
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
