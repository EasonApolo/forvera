const mongoose = require('mongoose')
const { readFile } = require('fs/promises')
const { resolve } = require('path')

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/forvera'
const SOURCE = resolve(__dirname, 'saved-douban-data.json')

const commentSchema = new mongoose.Schema(
  {
    content: String,
    rate: Number,
    userId: String,
    createdAt: Date,
    updatedAt: Date,
  },
  { _id: true }
)

const ratingSchema = new mongoose.Schema(
  {
    id: String,
    title: String,
    type: String,
    rate: Number,
    episode: String,
    img: String,
    url: String,
    date: String,
    sub_title: String,
    comments: [commentSchema],
  },
  {
    collection: 'ratings',
    timestamps: true,
  }
)

const Rating = mongoose.model('RatingImportScript', ratingSchema)

const parseDateTime = value => {
  if (!value) return undefined
  const raw = `${value}`.trim()
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/)
  if (!m) return undefined
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    0,
    0
  )
  return Number.isNaN(d.getTime()) ? undefined : d
}

const normalize = item => {
  const comments = Array.isArray(item.comments) ? item.comments : []
  return {
    id: item.id ? `${item.id}` : '',
    title: item.title || '',
    type: item.type || 'movie',
    rate: typeof item.rate === 'number' ? item.rate : null,
    episode: item.episode || '',
    img: item.img || '',
    url: item.url || '',
    date: item.date || '',
    sub_title: item.sub_title || '',
    comments: comments
      .map(c => ({
        content: c.content || '',
        rate: typeof c.rate === 'number' ? c.rate : null,
        userId: c.userId || '',
        createdAt: parseDateTime(c.createdAt),
        updatedAt: parseDateTime(c.updatedAt),
      }))
      .filter(c => c.content),
  }
}

const main = async () => {
  await mongoose.connect(MONGO_URI)
  try {
    const db = mongoose.connection.db

    const collections = await db.listCollections({}, { nameOnly: true }).toArray()
    const hasDocuments = collections.some(c => c.name === 'documents')
    if (hasDocuments) {
      await db.collection('documents').drop()
      console.log('[rating-import] dropped old collection: documents')
    } else {
      console.log('[rating-import] old collection documents not found, skip drop')
    }

    const raw = await readFile(SOURCE, 'utf8')
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      throw new Error('saved-douban-data.json must be an array')
    }

    await Rating.deleteMany({})
    const normalized = parsed.map(normalize).filter(item => item.id)
    const inserted = await Rating.insertMany(normalized)

    console.log(`[rating-import] imported ${inserted.length} records into ratings`)
  } finally {
    await mongoose.disconnect()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
