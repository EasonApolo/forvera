export const backend = 'local' as 'remote' | 'local' // location.href.includes('easons') ? 'online' :  'local'

const isLocal =
  location.hostname === 'localhost' || location.hostname === '127.0.0.1'

const host = isLocal ? 'localhost' : location.hostname

const protocol = isLocal ? 'http' : 'https'

// 本地开发直连后端 3000；生产环境走同源（443），由反向代理/Cloudflare 将 /api、/socket.io 转发到后端。
const backend_url = isLocal ? `${protocol}://${host}:3000/` : `${protocol}://${host}/`

export const ip = backend_url
