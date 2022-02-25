// 导入post: node import.wordpress.ts posts 需要创建用户，并修改作者id为该id。
// 导入messages: node import.wordpress.ts messages 可以先启动服务，服务会自动创建匿名用户，再修改用户id为匿名用户id。
const { readFile, writeFile } = require('fs/promises')
const mongoose = require('mongoose')
const mongoDB = 'mongodb://localhost:27017/forvera'
mongoose.connect(mongoDB)

const insertManyCallback = (err, docs) => {
  if (err) console.log(err)
  else {
    console.log(`import ${docs.length} docs success`)
  }
}

async function importPosts() {
  const PostSchema = new mongoose.Schema({
    title: String,
    content: String,
    description: String,
    author: String,
    category: [String],
    created_time: Date,
    updated_time: Date,
    status: { type: Number, default: 0 },
  })
  const PostModelSchema = new mongoose.Schema(PostSchema)
  const PostModel = mongoose.model('Post', PostModelSchema)

  let data = await readFile('./data/posts.json', 'utf8')
  data = JSON.parse(data)
  data.map(p => {
    p.author = '60ebdc900939f6b4beea7faf'
    p.updated_time = new Date(p.date)
    p.created_time = new Date(p.date)
    p.category = []
    p.status = 1
  })

  PostModel.insertMany(data, insertManyCallback)
}

async function importMessage() {
  const MessageSchema = new mongoose.Schema({
    user: String,
    content: String,
    created_time: Date,
    level: Number,

    reactions: [Number],
    files: String,

    children: String,
    parent: String,
    ancestor: String,
    descendants: [String],
  })
  const MessageModelSchema = new mongoose.Schema(MessageSchema)
  const MessageModel = mongoose.model('Twit', MessageModelSchema)
  let data = await readFile('./data/messages.json', 'utf8')
  data = JSON.parse(data)
  data.map(p => {
    p.user = '60ebc6c88cff11ac5bb287fc'
    p.created_time = new Date(p.date)
    p.level = 0
  })

  MessageModel.insertMany(data, insertManyCallback)
}

const args = process.argv.slice(2)
if (args.includes('messages')) { importMessage() }
if (args.includes('posts')) { importPosts() }