const { readFileSync } = require('fs');
const { join } = require('path');
const { createRequire } = require('module');
const mongoose = createRequire(join(__dirname, '../../server/package.json'))('mongoose');

const DRAWGUESS_WORD_MODEL = 'DrawGuessWord';
const DrawGuessWordSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, index: true },
    category: { type: String, required: true, index: true },
    changeCount: { type: Number, default: 0, min: 0 },
  },
  {
    collection: 'drawguess',
  },
);


function parseWordFile(filePath) {
  const raw = readFileSync(filePath, 'utf-8');
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
  const words = parseWordFile(join(__dirname, 'drawguess.words.txt'));

  if (!words.length) {
    throw new Error('no drawguess words parsed from drawguess.words.txt');
  }

  await mongoose.connect(mongoUri);
  const DrawGuessWordModel = mongoose.model(
    DRAWGUESS_WORD_MODEL,
    DrawGuessWordSchema
  );

  // 全量重建：词表文件是唯一事实源，先清空再导入（changeCount 等历史数据一并重置）
  const dropped = await DrawGuessWordModel.deleteMany({});
  console.log('[drawguess-import] cleared existing:', dropped.deletedCount || 0);

  const result = await DrawGuessWordModel.insertMany(
    words.map((item) => ({
      name: item.name,
      category: item.category,
      changeCount: 0,
    })),
  );

  console.log('[drawguess-import] parsed:', words.length);
  console.log('[drawguess-import] inserted:', result.length);

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
