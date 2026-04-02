/**
 * 用途：
 * - 在 Rating 的电影评论中，查找包含“刷”字的评论并导出到 json 文件，便于手工拆分成多条评论。
 * - 你编辑完成 json 后，再通过 apply 命令把更新回写到原始文档中的对应评论。
 *
 * 命令：
 * 1) 导出匹配项（搜索包含“刷”的评论）
 *    node src/scripts/rating/split-brush-comments.js export
 *    node src/scripts/rating/split-brush-comments.js export --out=src/scripts/rating/brush-comments.json
 *
 * 2) 回写更新（读取你编辑后的 json）
 *    node src/scripts/rating/split-brush-comments.js apply
 *    node src/scripts/rating/split-brush-comments.js apply --in=src/scripts/rating/brush-comments.json
 *
 * json 格式（顶层是数组，每个元素代表一个待处理评论）：
 * [
 *   {
 *     "documentId": "...",
 *     "commentId": "...",
 *     "title": "电影标题",
 *     "originalComment": {
 *       "content": "原评论",
 *       "rate": 5,
 *       "userId": "...",
 *       "time": "2026-03-24 13:20"
 *     },
 *     "nextComments": [
 *       { "content": "一刷...", "rate": 5, "userId": "...", "time": "2026-03-24 13:20" },
 *       { "content": "二刷...", "rate": 4, "userId": "...", "time": "2026-03-25 20:10" }
 *     ]
 *   }
 * ]
 *
 * 注意：
 * - 回写时使用 documentId/commentId/nextComments。
 * - nextComments 可包含 1~N 条；脚本会把原 commentId 对应的单条评论替换为这个数组。
 * - nextComments 中的 rate/userId/time 可省略；省略时沿用 originalComment 的值。
 * - time 输入格式支持 "YYYY-MM-DD HH:mm"（例如 "2026-03-24 13:20"）。
 * - 默认连接 mongodb://127.0.0.1:27017/forvera，可通过环境变量 MONGO_URI 覆盖。
 */

const mongoose = require('mongoose')
const { readFile, writeFile } = require('fs/promises')

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/forvera'
const DEFAULT_FILE = 'src/scripts/rating/brush-comments.json'

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

const documentSchema = new mongoose.Schema(
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

const RatingDocument = mongoose.model('RatingDocumentScript', documentSchema)

const getArgValue = key => {
  const prefix = `--${key}=`
  const arg = process.argv.find(item => item.startsWith(prefix))
  return arg ? arg.slice(prefix.length) : ''
}

const pad2 = value => `${value}`.padStart(2, '0')

const formatLocalMinute = input => {
  const date = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(date.getTime())) return ''
  const y = date.getFullYear()
  const m = pad2(date.getMonth() + 1)
  const d = pad2(date.getDate())
  const h = pad2(date.getHours())
  const mm = pad2(date.getMinutes())
  return `${y}-${m}-${d} ${h}:${mm}`
}

const parseUserTime = value => {
  if (value === undefined || value === null) return null
  const raw = `${value}`.trim()
  if (!raw) return null

  const matched = raw.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/)
  if (!matched) return null

  const year = Number(matched[1])
  const month = Number(matched[2])
  const day = Number(matched[3])
  const hour = Number(matched[4])
  const minute = Number(matched[5])

  const date = new Date(year, month - 1, day, hour, minute, 0, 0)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null
  }
  return date
}

const exportMatches = async outFile => {
  const docs = await RatingDocument.find({
    type: 'movie',
    'comments.content': { $regex: '刷' },
  })
    .select('_id title comments')
    .lean()

  const entries = []
  for (const doc of docs) {
    const comments = Array.isArray(doc.comments) ? doc.comments : []
    for (const comment of comments) {
      const content = typeof comment.content === 'string' ? comment.content : ''
      if (!content.includes('刷')) continue

      entries.push({
        documentId: `${doc._id}`,
        commentId: `${comment._id}`,
        title: doc.title || '',
        originalComment: {
          content,
          rate: comment.rate,
          userId: comment.userId,
          time: formatLocalMinute(comment.createdAt),
        },
        nextComments: [
          {
            content,
            rate: comment.rate,
            userId: comment.userId,
            time: formatLocalMinute(comment.createdAt),
          },
        ],
      })
    }
  }

  await writeFile(outFile, `${JSON.stringify(entries, null, 2)}\n`, 'utf8')
  console.log(`[rating-brush] exported ${entries.length} entries to ${outFile}`)
}

const applyUpdates = async inFile => {
  const raw = await readFile(inFile, 'utf8')
  const normalizedRaw = raw
    .replace(/,\s*([\]}])/g, '$1')
    .replace(/}\s*\n\s*{/g, '},\n{')
  const list = JSON.parse(normalizedRaw)
  if (!Array.isArray(list)) {
    throw new Error('Input JSON must be an array')
  }

  let updated = 0
  let skipped = 0

  for (let index = 0; index < list.length; index++) {
    const item = list[index]
    const documentId = item.documentId ? `${item.documentId}`.trim() : ''
    const nextComments = Array.isArray(item.nextComments)
      ? item.nextComments
      : []

    if (!documentId) {
      skipped++
      continue
    }

    const doc = await RatingDocument.findById(documentId)
    if (!doc) {
      skipped++
      continue
    }

    const comments = Array.isArray(doc.comments) ? doc.comments : []
    const base = comments[0] || {}
    const originalComment = item.originalComment || {}
    const baseCreatedAt = base.createdAt instanceof Date ? base.createdAt : new Date(base.createdAt)
    const fallbackCreatedAt = Number.isNaN(baseCreatedAt.getTime()) ? new Date() : baseCreatedAt
    const fallbackUpdatedAt = base.updatedAt instanceof Date
      ? base.updatedAt
      : Number.isNaN(new Date(base.updatedAt).getTime())
        ? fallbackCreatedAt
        : new Date(base.updatedAt)
    const normalized = nextComments
      .map(v => ({
        content: v?.content === undefined || v?.content === null ? '' : `${v.content}`,
        rate:
          typeof v?.rate === 'number'
            ? v.rate
            : (typeof originalComment?.rate === 'number' ? originalComment.rate : base.rate),
        userId:
          v?.userId === undefined || v?.userId === null || `${v.userId}`.trim() === ''
            ? ((originalComment?.userId || '').trim() ? `${originalComment.userId}`.trim() : base.userId)
            : `${v.userId}`.trim(),
        createdAt: parseUserTime(v?.time) || fallbackCreatedAt,
        updatedAt: parseUserTime(v?.time) || fallbackUpdatedAt,
      }))

    doc.comments = normalized
    doc.markModified('comments')
    await doc.save()
    updated++
  }

  console.log(`[rating-brush] apply done. updated=${updated}, skipped=${skipped}`)
}

const main = async () => {
  const action = process.argv[2] || 'help'
  const outFile = getArgValue('out') || DEFAULT_FILE
  const inFile = getArgValue('in') || DEFAULT_FILE

  if (!['export', 'apply'].includes(action)) {
    console.log('Usage:')
    console.log('  node src/scripts/rating/split-brush-comments.js export [--out=src/scripts/rating/brush-comments.json]')
    console.log('  node src/scripts/rating/split-brush-comments.js apply  [--in=src/scripts/rating/brush-comments.json]')
    return
  }

  await mongoose.connect(MONGO_URI)
  try {
    if (action === 'export') {
      await exportMatches(outFile)
    } else if (action === 'apply') {
      await applyUpdates(inFile)
    }
  } finally {
    await mongoose.disconnect()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
