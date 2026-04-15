export const backend = 'local' as 'remote' | 'local' // location.href.includes('easons') ? 'online' :  'local'

const host =
  location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? 'localhost'
    : location.hostname

const protocol =
  location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? 'http'
    : 'https'

const backend_url = `${protocol}://${host}:3000/`

export const ip = backend_url
