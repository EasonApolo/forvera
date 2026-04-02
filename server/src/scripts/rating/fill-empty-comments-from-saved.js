const fs = require('fs')
const path = require('path')
const mongoose = require('mongoose')

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/forvera'
const sourcePath = path.resolve(__dirname, 'saved-douban-data.json')

const parseTopLevelDate = value => {
  if (!value) return new Date()
  const raw = String(value).trim()
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) {
    const d = new Date(raw)
    return Number.isNaN(d.getTime()) ? new Date() : d
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0)
}

async function main() {
  const raw = fs.readFileSync(sourcePath, 'utf8')
  const list = JSON.parse(raw)
  if (!Array.isArray(list)) throw new Error('saved-douban-data.json must be an array')

  const targets = list.filter(item => !Array.isArray(item.comments) || item.comments.length === 0)

  await mongoose.connect(MONGO_URI)
  try {
    const db = mongoose.connection.db
    const ratings = db.collection('ratings')

    let matched = 0
    let modified = 0

    for (const item of targets) {
      const id = item?.id ? String(item.id).trim() : ''
      if (!id) continue

      const commentDate = parseTopLevelDate(item.date)
      const res = await ratings.updateOne(
        { id },
        {
          $set: {
            comments: [
              {
                content: '',
                rate: typeof item.rate === 'number' ? item.rate : null,
                userId: '',
                createdAt: commentDate,
                updatedAt: commentDate,
              },
            ],
          },
        }
      )

      if (res.matchedCount > 0) matched += 1
      if (res.modifiedCount > 0) modified += 1
    }

    console.log(`[ratings-default-comment] sourceEmpty=${targets.length}, matched=${matched}, modified=${modified}`)
  } finally {
    await mongoose.disconnect()
  }
}

main().catch(async err => {
  console.error(err)
  try { await mongoose.disconnect() } catch {}
  process.exit(1)
})
