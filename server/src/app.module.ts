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
import { DrawGuessModule } from './modules/drawguess.module';
import { GameModule } from './modules/game.module';
import { TaxonomyModule } from './modules/taxonomy.module';
import { BackupModule } from './modules/backup.module';
import { PetModule } from './modules/pet.module';
import { RequirementsModule } from './modules/requirements.module';
import { DietModule } from './modules/diet.module';
import { MarketModule } from './modules/market.module';
import { DictionaryModule } from './modules/dictionary.module';

@Module({
  imports: [
    MongooseModule.forRoot(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/forvera'),
    PostModule,
    AuthModule,
    UsersModule,
    CategoryModule,
    FileModule,
    TwitModule,
    RatingModule,
    HoldemModule,
    GomokuModule,
    DrawGuessModule,
    GameModule,
    TaxonomyModule,
    BackupModule,
    PetModule,
    RequirementsModule,
    DietModule,
    MarketModule,
    DictionaryModule,
    ServeStaticModule.forRoot({
      rootPath: staticPath,
      serveStaticOptions: {
        index: false,
        fallthrough: true,
      },
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
