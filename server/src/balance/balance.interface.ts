import { Document } from 'mongoose';

export interface Balance extends Document {
  userId: string;
  value: number;
  category: number;
  type: number; // 0 - income, 1 - expense
  createdTime: Date;
  updatedTime: Date;
  dateStamp: number;
  year: number;
  month: number;
  date: number;
  description: string;
}

export interface BalanceDTO extends Document {
  value: number;
  category: number;
  type: number; // 0 - income, 1 - expense
  dateStamp: number;
  description: string;
}
