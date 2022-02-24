const parseString = require('xml2js').parseString
const { readFile, writeFile } = require('fs/promises')

readFile('data.xml').then(
  data => parseString(data, handler)
)

// data container based on types
const types = {}

const handler = async (err, result) => {
  // 'item' contains all posts/media/pages
  const items = result.rss.channel[0]['item']
  console.log(`item length: ${items.length}`)

  items.map(wpItem => {
    // 'wp:post_type' specifies type of the item ['post', 'attachment', 'page']
    const type = wpItem['wp:post_type'][0]

    let item = {}

    // retrieve some post info, every property requires [0]
    if (type === 'post') {
      item.title = wpItem.title[0]
      item.content = wpItem['content:encoded'][0]
      item.date = wpItem['wp:post_date'][0]
      item.post_id = wpItem['wp:post_id'][0]

      // if 'wp:comment', retrieve comments
      if ('wp:comment' in wpItem) {
        const comments = []
        wpItem['wp:comment'].map(wpCmt => {
          const comment = {}
          comment.comment_id = wpCmt['wp:comment_id'][0]
          comment.author = wpCmt['wp:comment_author'][0]
          comment.date = wpCmt['wp:comment_date'][0]
          comment.content = wpCmt['wp:comment_content'][0]
          comment.parent = wpCmt['wp:comment_parent'][0]
          comments.push(comment)
        })
        item.comments = comments
      }
    }

    // only retrieve full url
    if (type === 'attachment') {
      item = wpItem['wp:attachment_url'][0]
    }

    // skip pages
    if (type === 'page') return

    if (type in types) {
      types[type].push(item)
    } else {
      types[type] = [item]
    }
  })

  // print length of each type
  for (let type in types) {
    console.log(type, types[type].length)
  }

  // retrieve comments from specific post
  let exported_messages
  types['post'].map(post => {
    if (post.comments && post.comments.length > 100) {
      exported_messages = post.comments
      delete post.comments
    }
  })

  writeFile('posts.json', JSON.stringify(types['post']))
  writeFile('attachments.json', JSON.stringify(types['attachment']))
  writeFile('messages.json', JSON.stringify(exported_messages))
}
