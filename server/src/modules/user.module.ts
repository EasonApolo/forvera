import {
  Controller,
  Get,
  Post,
  Request,
  Injectable,
  OnModuleInit,
  Module,
} from '@nestjs/common';
import { InjectModel, MongooseModule } from '@nestjs/mongoose';
import { Model, Document } from 'mongoose';
import { anonymousNameList } from 'src/config';
import { Public } from 'src/guards/jwt-auth.guard';

// DTO
export class CreateUserDTO {
  readonly username: string;
  readonly password: string;
}

// Interface
export interface User extends Document {
  readonly username: string;
  readonly password: string;
  readonly role?: number;
}

// Schema
import { Schema } from 'mongoose';
import { JwtStrategy } from 'src/guards/jwt.strategy';

export const UserSchema = new Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: Number, default: 1 },
});

// Service
@Injectable()
export class UserService implements OnModuleInit {
  anonymous: User;
  constructor(@InjectModel('User') private readonly userModel: Model<User>) {}

  async onModuleInit() {
    this.anonymous = await this.addUser(
      { username: 'anonymous', password: 'anonymous' },
      true,
    );
  }

  async getUserInfo(user): Promise<User> {
    const userInfo = await this.userModel
      .findById(user.userId)
      .select('-password')
      .exec();
    return userInfo;
  }

  async getUserByName(username: string): Promise<User> {
    const user = await this.userModel.findOne({ username: username }).exec();
    console.log('getUserByName', user);
    return user;
  }

  async addUser(
    createUserDTO: CreateUserDTO,
    addIfNotExist?: boolean,
  ): Promise<User> {
    let res = await this.getUserByName(createUserDTO.username);
    if (res) {
      return addIfNotExist ? res : null;
    }
    const newUser = new this.userModel(createUserDTO);
    return newUser.save();
  }

  async getAnonymousNameList(): Promise<string[]> {
    return anonymousNameList;
  }
}

// Controller
@Controller('user')
export class UserController {
  constructor(private userService: UserService) {}

  @Post('info')
  async getUserInfo(@Request() req) {
    return await this.userService.getUserInfo(req.user);
  }

  @Public()
  @Get('anonymous')
  async getAnonymousNameList() {
    return await this.userService.getAnonymousNameList();
  }
}

// Module
@Module({
  imports: [MongooseModule.forFeature([{ name: 'User', schema: UserSchema }])],
  providers: [UserService],
  exports: [UserService],
  controllers: [UserController],
})
export class UsersModule {}
