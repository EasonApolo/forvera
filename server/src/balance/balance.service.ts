import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { Balance, BalanceDTO } from './balance.interface';

@Injectable()
export class BalanceService {
  constructor(@InjectModel('Balance') private model: Model<Balance>) {}

  async getAll(userId): Promise<Balance[]> {
    return await this.model.find({ userId }).exec();
  }

  async getById(userId: string, id: string): Promise<Balance> {
    const record = await this.model.findById(id).exec();
    if (record.userId !== userId) {
      throw new UnauthorizedException(`${userId} is not the author of ${id}.`);
    } else {
      return record;
    }
  }

  async getByDate(userId, date: number) {
    const selectUserAndDate = { userId, ...getDate(date) };
    return await this.model.find(selectUserAndDate).exec();
  }

  async add(userId: string, DTO: BalanceDTO) {
    const currentTime = new Date();
    const [createdTime, updatedTime] = [currentTime, currentTime];
    const dateInfo = getDate(DTO.dateStamp);
    const newRecord = await new this.model({
      userId,
      ...DTO,
      ...dateInfo,
      createdTime,
      updatedTime,
    }).save();
    return newRecord;
  }

  async edit(id: string, userId, DTO: BalanceDTO) {
    const updatedTime = new Date();
    const dateInfo = getDate(DTO.dateStamp);
    const newRecord = await this.model.findByIdAndUpdate(id, {
      updatedTime,
      ...DTO,
      ...dateInfo,
    });
    return newRecord;
  }

  async delete(id: string) {
    return await this.model.findByIdAndDelete(id);
  }
}

function getDate(date: string | number) {
  if (typeof date === 'string') {
    date = parseInt(date);
  }
  const targetDate = new Date(date);
  return {
    year: targetDate.getFullYear(),
    month: targetDate.getMonth() + 1,
    date: targetDate.getDate(),
  };
}
