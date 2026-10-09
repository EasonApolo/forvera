// 查词改用「词义通用分类」后，存量词汇记录里没有 classification 字段，
// 不会出现在首页分类树里（会落到「未分类」）。本脚本对所有已存词依次触发
// 重新查询（走本地服务的 /api/dictionary/analyze，isRegenerate: true），
// 让大模型按新 schema 重新生成。每个词约 5~15 秒，注意 API 配额。
const { createRequire } = require('module');
const { join } = require('path');
const mongoose = createRequire(join(__dirname, '../../server/package.json'))('mongoose');

async function main() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/forvera';
  const baseUrl = process.env.API_BASE || 'http://127.0.0.1:3000';

  await mongoose.connect(mongoUri);
  const rows = await mongoose.connection
    .collection('dictionary')
    .find({}, { projection: { word: 1 } })
    .toArray();
  await mongoose.disconnect();

  const words = Array.from(new Set(rows.map((row) => row.word).filter(Boolean)));
  console.log('[dictionary-requery] total words:', words.length);

  let done = 0;
  let failed = 0;
  for (const word of words) {
    try {
      const res = await fetch(`${baseUrl}/api/dictionary/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word, isRegenerate: true }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      // 顺序读尽 SSE 流；以最终 status 判断成败
      const reader = res.body.getReader();
      let last = '';
      while (true) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        last += Buffer.from(value).toString();
      }
      if (last.includes('"status":"error"')) throw new Error(last.slice(0, 200));
      if (!last.includes('"status":"done"')) throw new Error('stream ended without done');

      done += 1;
      console.log(`[dictionary-requery] ok (${done}/${words.length}): ${word}`);
    } catch (error) {
      failed += 1;
      console.error(`[dictionary-requery] FAIL ${word}:`, error.message || error);
    }
  }
  console.log(`[dictionary-requery] finished: ${done} ok, ${failed} failed`);
}

main().catch((error) => {
  console.error('[dictionary-requery] failed', error);
  process.exit(1);
});
