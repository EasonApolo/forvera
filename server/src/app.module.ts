import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './auth/auth.module';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { ServeStaticModule } from '@nestjs/serve-static';
import { staticPath } from './shared/staticPath';
import { UsersModule } from './modules/user.module';
import { RatingModule } from './modules/rating.module';
import { TwitModule } from './modules/twit.module';
import { PostModule } from './modules/post.module';
import { CategoryModule } from './modules/category.module';
import { FileModule } from './modules/file.module';

@Module({
  imports: [
    MongooseModule.forRoot('mongodb://127.0.0.1:27017/forvera', {
      useNewUrlParser: true,
    }),
    PostModule,
    AuthModule,
    UsersModule,
    CategoryModule,
    FileModule,
    ServeStaticModule.forRoot({
      rootPath: staticPath,
    }),
    TwitModule,
    RatingModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
