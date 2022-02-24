const { readFile, writeFile } = require('fs/promises')
const http = require('http'); // or 'https' for https:// URLs
const fs = require('fs');

const download = (url, filename) => {
  return new Promise(resolve => {
    const file = fs.createWriteStream(filename)
    file.on('close', resolve)
    const request = http.get(url, function(response) {
      response.pipe(file)
    })
  })
}

const handler = async (attachments) => {
  const fNames = attachments.map(fname => {
    const res = fname.match(/\/[\u4e00-\u9fa5a-zA-Z0-9._\-]+\.[a-zA-Z0-9]+$/)
    if (!res) throw(fname)
    return res[0]
  })
  for (let i in attachments) {
    console.log(`${i}/${attachments.length} ${attachments[i]}`)
    await download(attachments[i], `attachments${fNames[i]}`)
  }
}

const main = async () => {
  const data = await readFile('attachments.json', 'utf8')
  handler(JSON.parse(data))
}

main()

export var a