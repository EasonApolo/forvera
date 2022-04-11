import * as mongoose from 'mongoose'
import { Schema } from 'mongoose'

export const BalanceSchema = new mongoose.Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User'},
  value: Number,
  category: Number,
  type: Number, // 0 - income, 1 - expense
  created_time: Date,
  description: String,
})