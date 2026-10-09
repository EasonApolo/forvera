// 导入雅思词表到待学词列表（dictionarylearning 集合）。
// 词表来源：https://github.com/hefengxian/ielts-vocabulary（IELTS 核心词，~1650 词）
// 重复导入安全（upsert 跳过已有）；已查过的词（在 dictionary 主表中）视为已学，自动跳过。
const { createRequire } = require('module');
const { join } = require('path');
const { readFileSync } = require('fs');
const mongoose = createRequire(join(__dirname, '../../server/package.json'))('mongoose');

function parseWordFile(filePath) {
  return readFileSync(filePath, 'utf-8')
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter((line) => /^[a-z][a-z-]*[a-z]$/.test(line));
}

async function main() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/forvera';
  const words = Array.from(new Set(parseWordFile(join(__dirname, 'ielts-words.txt'))));
  if (!words.length) throw new Error('no words parsed from ielts-words.txt');

  await mongoose.connect(mongoUri);
  const db = mongoose.connection;

  const queried = new Set(
    (await db.collection('dictionary').find({}, { projection: { word: 1 } }).toArray())
      .map((row) => row.word.toLowerCase()),
  );
  const toAdd = words.filter((word) => !queried.has(word));

  const result = await db.collection('dictionarylearning').bulkWrite(
    toAdd.map((word) => ({
      updateOne: {
        filter: { word },
        update: { $setOnInsert: { word } },
        upsert: true,
      },
    })),
    { ordered: false },
  );

  const total = await db.collection('dictionarylearning').countDocuments();
  console.log('[ielts-import] parsed:', words.length);
  console.log('[ielts-import] skipped (already queried):', words.length - toAdd.length);
  console.log('[ielts-import] inserted:', result.upsertedCount || 0);
  console.log('[ielts-import] learning list total:', total);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('[ielts-import] failed', error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect errors on failure path
  }
  process.exit(1);
});
