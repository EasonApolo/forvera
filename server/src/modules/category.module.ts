import {
  Module,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Req,
  Injectable,
} from '@nestjs/common';
import { MongooseModule, InjectModel } from '@nestjs/mongoose';
import { Schema, Model, Document } from 'mongoose';
import { Public } from 'src/guards/jwt-auth.guard';
import { ValidateObjectId } from 'src/shared/validate-object-id.pipes';

// DTO
export class CategoryDTO {
  title: string;
  description: string;
}

// Interface
export interface Category extends Document {
  readonly title: string;
  readonly description: string;
}

// Schema
export const CategorySchema = new Schema({
  title: String,
  description: String,
});

// Service
@Injectable()
export class CategoryService {
  constructor(
    @InjectModel('Category') private readonly categoryModel: Model<Category>,
  ) {}

  async getCategories(): Promise<Category[]> {
    return await this.categoryModel.find().exec();
  }

  async addCategory(newCat: CategoryDTO): Promise<Category[]> {
    await new this.categoryModel(newCat).save();
    return await this.getCategories();
  }

  async edit(id: string, newCat: CategoryDTO): Promise<Category[]> {
    await this.categoryModel.findByIdAndUpdate(id, newCat);
    return await this.getCategories();
  }

  async delete(id: string): Promise<Category[]> {
    await this.categoryModel.findByIdAndDelete(id);
    return await this.getCategories();
  }
}

// Controller
@Controller('cat')
export class CategoryController {
  constructor(private catService: CategoryService) {}

  @Public()
  @Get()
  async getCategories() {
    return await this.catService.getCategories();
  }

  @Post()
  async addCat(@Req() req, @Body() catDTO: CategoryDTO) {
    return await this.catService.addCategory(catDTO);
  }

  @Put('/:id')
  async edit(
    @Param('id', new ValidateObjectId()) catId: string,
    @Body() catDTO: CategoryDTO,
  ) {
    return await this.catService.edit(catId, catDTO);
  }

  @Delete('/:id')
  async delete(@Param('id', new ValidateObjectId()) catId: string) {
    return await this.catService.delete(catId);
  }
}

// Module
@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'Category', schema: CategorySchema }]),
  ],
  controllers: [CategoryController],
  providers: [CategoryService],
})
export class CategoryModule {}
