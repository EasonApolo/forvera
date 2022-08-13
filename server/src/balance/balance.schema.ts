import * as mongoose from 'mongoose'
import { Schema } from 'mongoose'

export const BalanceSchema = new mongoose.Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User'},
  value: Number,
  category: Number,
  type: Number, // 0 - income, 1 - expense
  createdTime: Date,
  updatedTime: Date,
  dateStamp: Number,
  year: Number,
  month: Number,
  date: Number,
  description: String,
})