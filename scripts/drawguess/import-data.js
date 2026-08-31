const { existsSync, readFileSync } = require('fs');
const { join } = require('path');
const mongoose = require('mongoose');

const DRAWGUESS_WORD_MODEL = 'DrawGuessWord';
const DrawGuessWordSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, index: true },
    category: { type: String, required: true, index: true },
    dislikes: { type: Number, default: 0, min: 0 },
  },
  {
    collection: 'drawguess',
    timestamps: true,
  },
);


function parseWordFile(filePath) {
  const raw = readFileSync(filePath, 'utf-8');
  console.log(raw.length)
  const deduped = new Map();

  raw.split(/\r?\n/).forEach((line) => {
    const tokens = line.trim().split(/\s+/).filter(Boolean);
    if (tokens.length < 2) return;
    const category = tokens[0];
    for (let i = 1; i < tokens.length; i += 1) {
      const name = tokens[i];
      if (!deduped.has(name)) {
        deduped.set(name, { name, category });
      }
    }
  });

  return Array.from(deduped.values());
}

async function main() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/forvera';
  const words = parseWordFile('./drawguess.words.txt');

  if (!words.length) {
    throw new Error(`no drawguess words parsed from ./drawguess.words.txt`);
  }

  await mongoose.connect(mongoUri);
  const DrawGuessWordModel = mongoose.model(
    DRAWGUESS_WORD_MODEL,
    DrawGuessWordSchema
  );

  const result = await DrawGuessWordModel.bulkWrite(
    words.map((item) => ({
      updateOne: {
        filter: { name: item.name },
        update: {
          $set: { category: item.category },
          $setOnInsert: { dislikes: 0 },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );

  console.log('[drawguess-import] parsed:', words.length);
  console.log('[drawguess-import] upserted:', result.upsertedCount || 0);
  console.log('[drawguess-import] modified:', result.modifiedCount || 0);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('[drawguess-import] failed', error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect errors on failure path
  }
  process.exit(1);
});
