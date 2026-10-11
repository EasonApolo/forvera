// 全量导入雅思词表到待学词列表（dictionarylearning 集合，无表则随导入自动创建）。
// 词表来源：https://github.com/hefengxian/ielts-vocabulary（提取去重后约 1656 词）
// 全量重建：先清空待学词再导入，ielts-words.txt 是唯一事实源；
// 已查过的词（dictionary 主表中）视为已学，自动跳过。
const { createRequire } = require('module');
const { join } = require('path');
const { readFileSync } = require('fs');
const mongoose = createRequire(join(__dirname, '../../server/package.json'))('mongoose');

// 与 server 的 DictionaryLearningSchema 保持一致（word 唯一索引随 model 自动创建）
const LearningSchema = new mongoose.Schema(
  { word: { type: String, required: true, unique: true } },
  { collection: 'dictionarylearning', timestamps: true },
);

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
  const Learning = mongoose.model('DictionaryLearningImport', LearningSchema);

  // 已查过的词（dictionary 主表）视为已学，不进待学列表
  const queried = new Set(
    (await db.collection('dictionary').find({}, { projection: { word: 1 } }).toArray())
      .map((row) => row.word.toLowerCase()),
  );
  const toImport = words.filter((word) => !queried.has(word));

  const dropped = await Learning.deleteMany({});
  console.log('[ielts-import] cleared existing:', dropped.deletedCount || 0);

  const inserted = await Learning.insertMany(toImport.map((word) => ({ word })));
  console.log('[ielts-import] parsed:', words.length);
  console.log('[ielts-import] skipped (already queried):', words.length - toImport.length);
  console.log('[ielts-import] inserted:', inserted.length);
  console.log('[ielts-import] learning total:', await Learning.countDocuments({}));

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
