const fs = require('fs')

const sourcePath = '/Users/eason/Downloads/brush-comments.json'
const targetPath = '/Users/eason/code/forvera/server/src/scripts/rating/brush-comments.json'

const parseLooseJsonArray = (raw, label) => {
  const normalized = raw
    .replace(/,\s*([\]}])/g, '$1')
    .replace(/}\s*\n\s*{/g, '},\n{')

  try {
    return JSON.parse(normalized)
  } catch (err) {
    throw new Error(`[merge-brush] invalid ${label} JSON: ${err.message}`)
  }
}

const sourceRaw = fs.readFileSync(sourcePath, 'utf8')
const targetRaw = fs.readFileSync(targetPath, 'utf8')
const source = parseLooseJsonArray(sourceRaw, 'source')
const target = parseLooseJsonArray(targetRaw, 'target')

if (!Array.isArray(source) || !Array.isArray(target)) {
  throw new Error('source/target must both be JSON arrays')
}

const sourceByTitle = new Map()
const duplicateTitles = new Set()
for (const item of source) {
  const title = (item?.title || '').trim()
  if (!title) continue
  if (sourceByTitle.has(title)) duplicateTitles.add(title)
  sourceByTitle.set(title, item)
}

let updated = 0
for (const item of target) {
  const title = (item?.title || '').trim()
  if (!title) continue
  const src = sourceByTitle.get(title)
  if (!src) continue
  if (Array.isArray(src.nextComments)) {
    item.nextComments = src.nextComments
    updated++
  }
}

fs.writeFileSync(targetPath, JSON.stringify(target, null, 2) + '\n', 'utf8')

console.log(`[merge-brush] updated=${updated}, targetTotal=${target.length}, sourceTotal=${source.length}`)
if (duplicateTitles.size) {
  console.log(`[merge-brush] duplicate titles in source: ${duplicateTitles.size}`)
}
