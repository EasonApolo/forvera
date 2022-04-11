import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { Balance } from './balance.interface';

@Injectable()
export class BalanceService {
  constructor (
    @InjectModel('Balance') private readonly balanceModel: Model<Balance>
  ) {}

  async getCategories(): Promise<Balance[]> {
    return await this.balanceModel.find().exec();
  }
  
  async addBalance (newCat: Balance) {
    await new this.balanceModel(newCat).save()
    return await this.getCategories()
  }

  async edit (id: string, newCat: Balance) {
    await this.balanceModel.findByIdAndUpdate(id, newCat)
    return await this.getCategories()
  }

  async delete (id: string) {
    await this.balanceModel.findByIdAndDelete(id)
    return await this.getCategories()
  }
}
