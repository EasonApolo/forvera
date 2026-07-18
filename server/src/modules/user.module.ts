import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Request,
  Injectable,
  OnModuleInit,
  Module,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel, MongooseModule } from '@nestjs/mongoose';
import { Model, Document, Types } from 'mongoose';
import { anonymousNameList } from 'src/config';
import { Public, Roles } from 'src/guards/jwt-auth.guard';

// DTO
export class CreateUserDTO {
  readonly _id?: string;
  readonly username!: string;
  readonly password!: string;
}

export class UpdateUserSettingsDTO {
  readonly settings?: {
    playgroundSort?: string[];
    diet?: {
      standardCalories?: number;
      dietStartDate?: string | null;
    };
  };
}

export class UpdateUserRoleDTO {
  readonly role?: number;
}

// Interface
export interface User extends Document {
  readonly _id?: string;
  readonly username: string;
  readonly password: string;
  readonly role?: number;
  readonly settings?: {
    playgroundSort?: string[];
    diet?: {
      standardCalories?: number;
      dietStartDate?: string | null;
    };
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
  anonymous!: User;
  constructor(@InjectModel('User') private readonly userModel: Model<User>) {}

  async onModuleInit() {
    const anonymous = await this.addUser(
      {
        _id: '62177473f69dac7cad7fe8e2',
        username: 'anonymous',
        password: 'anonymous',
      },
      true,
    );
    if (anonymous) {
      this.anonymous = anonymous;
    } else {
      const existingAnonymous = await this.getUserByName('anonymous');
      if (existingAnonymous) {
        this.anonymous = existingAnonymous;
      }
    }
  }

  async getUserInfo(user: any): Promise<User> {
    const userInfo = await this.userModel
      .findById(user.userId)
      .select('-password')
      .exec();
    if (!userInfo) {
      throw new UnauthorizedException('User not found');
    }
    return userInfo;
  }

  async getUserByName(username: string): Promise<User | null> {
    const user = await this.userModel.findOne({ username: username }).exec();
    console.log('getUserByName', user);
    return user;
  }

  async addUser(
    createUserDTO: CreateUserDTO,
    addIfNotExist?: boolean,
  ): Promise<User | null> {
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

    // 第一个注册的用户（用户表当前为空）自动成为管理员。
    const userCount = await this.userModel.estimatedDocumentCount().exec();
    if (userCount === 0) {
      userData.role = 3;
    }

    const newUser = new this.userModel(userData);
    return newUser.save();
  }

  async getAnonymousNameList(): Promise<string[]> {
    return anonymousNameList;
  }

  async updateUserSettings(user: any, payload: UpdateUserSettingsDTO): Promise<User | null> {
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

    if (incoming.diet) {
      nextSettings.diet = {
        ...(currentSettings.diet || {}),
        ...incoming.diet,
      };
    }

    (target as any).settings = nextSettings;
    await target.save();

    return await this.userModel.findById(userId).select('-password').exec();
  }

  async listUsers(): Promise<User[]> {
    return await this.userModel
      .find({})
      .select('_id username role settings')
      .sort({ _id: 1 })
      .lean()
      .exec();
  }

  async updateUserRole(operator: any, userId: string, payload: UpdateUserRoleDTO): Promise<User | null> {
    const target = await this.userModel.findById(userId).exec();
    if (!target) {
      throw new UnauthorizedException('User not found');
    }

    if (`${target._id}` === `${operator?.userId}`) {
      throw new ForbiddenException('Cannot change role of current user');
    }

    const role = Number(payload?.role);
    if (![1, 3].includes(role)) {
      throw new ForbiddenException('Role must be 1 or 3');
    }

    (target as any).role = role;
    await target.save();

    return await this.userModel
      .findById(userId)
      .select('_id username role settings')
      .lean()
      .exec();
  }

  async deleteUser(operator: any, userId: string): Promise<void> {
    if (`${operator?.userId}` === `${userId}`) {
      throw new ForbiddenException('Cannot delete current user');
    }

    const target = await this.userModel.findById(userId).exec();
    if (!target) {
      throw new UnauthorizedException('User not found');
    }

    await this.userModel.deleteOne({ _id: userId }).exec();
  }
}

// Controller
@Controller('api/user')
export class UserController {
  constructor(private userService: UserService) {}

  @Post('info')
  async getUserInfo(@Request() req: any) {
    return await this.userService.getUserInfo(req.user);
  }

  @Public()
  @Get('anonymous')
  async getAnonymousNameList() {
    return await this.userService.getAnonymousNameList();
  }

  @Post('settings')
  async updateUserSettings(@Request() req: any, @Body() body: UpdateUserSettingsDTO) {
    return await this.userService.updateUserSettings(req.user, body);
  }

  @Roles(3)
  @Post('list')
  async listUsers() {
    return await this.userService.listUsers();
  }

  @Roles(3)
  @Put('role/:userId')
  async updateUserRole(
    @Request() req: any,
    @Param('userId') userId: string,
    @Body() body: UpdateUserRoleDTO,
  ) {
    return await this.userService.updateUserRole(req.user, userId, body);
  }

  @Roles(3)
  @Delete(':userId')
  async deleteUser(@Request() req: any, @Param('userId') userId: string) {
    await this.userService.deleteUser(req.user, userId);
    return { ok: true };
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
