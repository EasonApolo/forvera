import * as mongoose from 'mongoose';
import { Schema } from 'mongoose';

export const TwitSchema = new mongoose.Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  content: String,
  created_time: Date,
  level: Number,
  state: Number,

  reactions: [Number],
  files: [{ type: Schema.Types.ObjectId, ref: 'File' }],

  children: [{ type: Schema.Types.ObjectId, ref: 'Twit' }],
  parent: { type: Schema.Types.ObjectId, ref: 'Twit' },
  ancestor: { type: Schema.Types.ObjectId, ref: 'Twit' },
  descendants: [{ type: Schema.Types.ObjectId, ref: 'Twit' }],
});
