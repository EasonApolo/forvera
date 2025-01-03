import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtConstants.secret,
    });
  }

  async validate(payload: any) {
    console.log('validate!!!!!!!!', payload);
    // The payload contains the data you signed in the token
    return {
      userId: payload.sub,
      username: payload.username,
      role: payload.role,
    };
  }
}

export const jwtConstants = {
  secret: 'aiwaaiwa',
};

export const jwtExpiresDate = '30d';
