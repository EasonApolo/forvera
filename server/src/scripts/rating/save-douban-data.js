(() => {
  const $all = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const $one = (sel, root = document) => root.querySelector(sel);
  const txt = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();

  const parseSubjectId = (url) => {
    const m = (url || '').match(/\/subject\/(\d+)\//);
    return m ? m[1] : '';
  };

  const parseRating = (root) => {
    const span = $one('span[class*="rating"][class$="-t"]', root);
    if (!span) return null;
    const cls = span.className || '';
    const m = cls.match(/rating(\d)-t/);
    return m ? Number(m[1]) : null;
  };

  const items = $all('.grid-view .comment-item').map((item) => {
    const link = $one('.pic a.nbg, .title a[href*="/subject/"]', item);
    const href = link?.getAttribute('href') || '';
    const id = parseSubjectId(href);

    const em = $one('.title em', item);
    const fullTitleLine = txt($one('.title a', item));
    const title = txt(em) || fullTitleLine;
    const subTitle = fullTitleLine.replace(title, '').replace(/^\/\s*/, '').trim();

    const img = $one('.pic img', item)?.getAttribute('src') || '';
    const rate = parseRating(item);
    const watchedDate = txt($one('.date', item)); // 你的记录日期
    const commentText = txt($one('.comment', item));

    const doc = {
      id,                     // subject 数字
      title,                  // 主标题
      type: 'movie',
      rate,                   // 1-5 或 null
      episode: '',
      img,                    // 海报
      url: href,              // 豆瓣链接
      date: watchedDate,      // 记录日期（可按需改成年份）
      sub_title: subTitle,    // 副标题/别名
      comments: []
    };

    if (commentText) {
      doc.comments.push({
        content: commentText,
        rate,
        userId: '',          // 按需填
        createdAt: watchedDate ? `${watchedDate} 00:00` : '',
        updatedAt: watchedDate ? `${watchedDate} 00:00` : ''
      });
    }

    return doc;
  }).filter(v => v.id);

  console.log('Collected:', items.length, items);

  // 复制到剪贴板（在 Chrome 控制台可用）
  if (typeof copy === 'function') {
    copy(JSON.stringify(items, null, 2));
    console.log('已复制 JSON 到剪贴板');
  } else if (navigator?.clipboard?.writeText) {
    navigator.clipboard.writeText(JSON.stringify(items, null, 2))
      .then(() => console.log('已复制 JSON 到剪贴板'))
      .catch(() => console.log('复制失败，请手动复制 console 输出'));
  } else {
    console.log('当前环境不支持自动复制，请手动复制下方数据：');
    console.log(JSON.stringify(items, null, 2));
  }
})();