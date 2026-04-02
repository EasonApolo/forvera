const mongoose = require('mongoose')

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/forvera'

const expirySchema = new mongoose.Schema(
  {
    name: String,
    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    mode: { type: String, enum: ['shelf', 'date'], default: 'date' },
    shelf_value: Number,
    shelf_unit: { type: String, enum: ['day', 'week', 'month', 'year'] },
    completed: { type: Boolean, default: false },
    created_time: Date,
    expires_time: Date,
    updated_time: Date,
  },
  { collection: 'expiries' }
)

const userSchema = new mongoose.Schema({}, { collection: 'users', strict: false })

const Expiry = mongoose.model('ExpiryScript', expirySchema)
const User = mongoose.model('UserScript', userSchema)

const getArgValue = key => {
  const prefix = `--${key}=`
  const arg = process.argv.find(item => item.startsWith(prefix))
  return arg ? arg.slice(prefix.length) : ''
}

const addDays = (date, days) => {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}

const resolveUserId = async () => {
  const input = getArgValue('user') || getArgValue('userId')
  if (input && mongoose.Types.ObjectId.isValid(input)) return input

  const firstUser = await User.findOne().select('_id').lean()
  if (!firstUser?._id) {
    throw new Error('No user found. Please pass --user=<userId>.')
  }
  return `${firstUser._id}`
}

const clearAll = async () => {
  const res = await Expiry.deleteMany({})
  console.log(`[expiry] cleared all items: ${res.deletedCount}`)
}

const seedForUser = async userId => {
  const now = new Date()

  const docs = [
    {
      name: '测试-新鲜(95%)',
      creator: userId,
      mode: 'shelf',
      shelf_value: 10,
      shelf_unit: 'day',
      completed: false,
      created_time: addDays(now, -0.5),
      expires_time: addDays(now, 9.5),
      updated_time: now,
    },
    {
      name: '测试-80%',
      creator: userId,
      mode: 'shelf',
      shelf_value: 10,
      shelf_unit: 'day',
      completed: false,
      created_time: addDays(now, -2),
      expires_time: addDays(now, 8),
      updated_time: now,
    },
    {
      name: '测试-50%',
      creator: userId,
      mode: 'shelf',
      shelf_value: 10,
      shelf_unit: 'day',
      completed: false,
      created_time: addDays(now, -5),
      expires_time: addDays(now, 5),
      updated_time: now,
    },
    {
      name: '测试-20%',
      creator: userId,
      mode: 'shelf',
      shelf_value: 10,
      shelf_unit: 'day',
      completed: false,
      created_time: addDays(now, -8),
      expires_time: addDays(now, 2),
      updated_time: now,
    },
    {
      name: '测试-0%(今天到期)',
      creator: userId,
      mode: 'date',
      completed: false,
      created_time: addDays(now, -5),
      expires_time: now,
      updated_time: now,
    },
    {
      name: '测试-已过期',
      creator: userId,
      mode: 'date',
      completed: false,
      created_time: addDays(now, -10),
      expires_time: addDays(now, -2),
      updated_time: now,
    },
  ]

  const inserted = await Expiry.insertMany(docs)
  console.log(`[expiry] seeded ${inserted.length} items for user ${userId}`)
}

const main = async () => {
  const action = process.argv[2] || 'help'
  await mongoose.connect(MONGO_URI)

  try {
    if (action === 'clear-all') {
      await clearAll()
      return
    }

    if (action === 'seed') {
      const userId = await resolveUserId()
      await seedForUser(userId)
      return
    }

    if (action === 'reset') {
      const userId = await resolveUserId()
      await clearAll()
      await seedForUser(userId)
      return
    }

    console.log('Usage:')
    console.log('  node src/scripts/expiry.seed.js clear-all')
    console.log('  node src/scripts/expiry.seed.js seed --user=<userId>')
    console.log('  node src/scripts/expiry.seed.js reset --user=<userId>')
    console.log('Tip: if --user omitted, script tries to use the first user in users collection.')
  } finally {
    await mongoose.disconnect()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
