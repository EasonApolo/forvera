import { Document } from 'mongoose';

export interface Balance extends Document {
  user: string
  value: Number,
  category: Number,
  type: Number, // 0 - income, 1 - expense
  created_time: Date,
  description: String,
}