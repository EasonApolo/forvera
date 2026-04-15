import {
  Controller,
  Get,
  Post,
  Body,
  Request,
  Injectable,
  OnModuleInit,
  Module,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel, MongooseModule } from '@nestjs/mongoose';
import { Model, Document, Types } from 'mongoose';
import { anonymousNameList } from 'src/config';
import { Public } from 'src/guards/jwt-auth.guard';

// DTO
export class CreateUserDTO {
  readonly _id?: string;
  readonly username: string;
  readonly password: string;
}

export class UpdateUserSettingsDTO {
  readonly settings?: {
    playgroundSort?: string[];
  };
}

// Interface
export interface User extends Document {
  readonly username: string;
  readonly password: string;
  readonly role?: number;
  readonly settings?: {
    playgroundSort?: string[];
  };
}

// Schema
import { Schema } from 'mongoose';
import { JwtStrategy } from 'src/guards/jwt.strategy';

export const UserSchema = new Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: Number, default: 1 },
  settings: { type: Schema.Types.Mixed, default: {} },
});

// Service
@Injectable()
export class UserService implements OnModuleInit {
  anonymous: User;
  constructor(@InjectModel('User') private readonly userModel: Model<User>) {}

  async onModuleInit() {
    this.anonymous = await this.addUser(
      {
        _id: '62177473f69dac7cad7fe8e2',
        username: 'anonymous',
        password: 'anonymous',
      },
      true,
    );
  }

  async getUserInfo(user): Promise<User> {
    const userInfo = await this.userModel
      .findById(user.userId)
      .select('-password')
      .exec();
    if (!userInfo) {
      throw new UnauthorizedException('User not found');
    }
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
    if (createUserDTO._id) {
      const byId = await this.userModel.findById(createUserDTO._id).exec();
      if (byId) {
        return byId;
      }
    }

    let res = await this.getUserByName(createUserDTO.username);
    if (res) {
      return addIfNotExist ? res : null;
    }

    const userData: any = {
      username: createUserDTO.username,
      password: createUserDTO.password,
    };
    if (createUserDTO._id && Types.ObjectId.isValid(createUserDTO._id)) {
      userData._id = new Types.ObjectId(createUserDTO._id);
    }

    const newUser = new this.userModel(userData);
    return newUser.save();
  }

  async getAnonymousNameList(): Promise<string[]> {
    return anonymousNameList;
  }

  async updateUserSettings(user: any, payload: UpdateUserSettingsDTO): Promise<User> {
    const userId = user?.userId;
    const target = await this.userModel.findById(userId).exec();
    if (!target) {
      throw new UnauthorizedException('User not found');
    }

    const currentSettings =
      target.settings && typeof target.settings === 'object' ? { ...target.settings } : {};

    const nextSettings: any = { ...currentSettings };
    const incoming = payload?.settings || {};

    if (Array.isArray(incoming.playgroundSort)) {
      nextSettings.playgroundSort = incoming.playgroundSort
        .filter((item) => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => !!item);
    }

    (target as any).settings = nextSettings;
    await target.save();

    return await this.userModel.findById(userId).select('-password').exec();
  }
}

// Controller
@Controller('api/user')
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

  @Post('settings')
  async updateUserSettings(@Request() req, @Body() body: UpdateUserSettingsDTO) {
    return await this.userService.updateUserSettings(req.user, body);
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
