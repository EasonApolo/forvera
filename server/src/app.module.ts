import { Module, SetMetadata } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MongooseModule } from '@nestjs/mongoose';
import { PostModule } from './post/post.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './user/user.module';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { CategoryModule } from './category/category.module';
import { FileModule } from './file/file.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { staticPath } from './shared/staticPath';
import { TwitModule } from './twit/twit.module';
import { BalanceModule } from './balance/balance.module';

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
    BalanceModule,
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
