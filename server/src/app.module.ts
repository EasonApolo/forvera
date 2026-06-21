import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MongooseModule } from '@nestjs/mongoose';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ServeStaticModule } from '@nestjs/serve-static';
import { staticPath } from './shared/staticPath';
import { UsersModule } from './modules/user.module';
import { RatingModule } from './modules/rating.module';
import { TwitModule } from './modules/twit.module';
import { PostModule } from './modules/post.module';
import { CategoryModule } from './modules/category.module';
import { FileModule } from './modules/file.module';
import { AuthModule } from './modules/auth.module';
import { HoldemModule } from './modules/holdem.module';
import { GomokuModule } from './modules/gomoku.module';
import { TaxonomyModule } from './modules/taxonomy.module';
import { ExpiryModule } from './modules/expiry.module';
import { BackupModule } from './modules/backup.module';
import { PetModule } from './modules/pet.module';
import { RequirementsModule } from './modules/requirements.module';
import { DietModule } from './modules/diet.module';

@Module({
  imports: [
    MongooseModule.forRoot('mongodb://127.0.0.1:27017/forvera'),
    PostModule,
    AuthModule,
    UsersModule,
    CategoryModule,
    FileModule,
    TwitModule,
    RatingModule,
    HoldemModule,
    GomokuModule,
    TaxonomyModule,
    ExpiryModule,
    BackupModule,
    PetModule,
    RequirementsModule,
    DietModule,
    ServeStaticModule.forRoot({
      rootPath: staticPath,
    }),
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
