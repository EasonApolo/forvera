import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UserService } from 'src/modules/user.module';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
  constructor(private usersService: UserService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const result = (await super.canActivate(context)) as boolean;
    const request = context.switchToHttp().getRequest();
    await super.logIn(request);

    // Fetch the user's role from the database
    const user = await this.usersService.findOne(request.user.username);
    if (!user) {
      throw new UnauthorizedException();
    }

    // Attach the user's role to the request object
    request.user.role = user.role;

    return result;
  }

  handleRequest(err, user, info, context) {
    if (err || !user) {
      throw err || new UnauthorizedException();
    }
    return user;
  }
}
