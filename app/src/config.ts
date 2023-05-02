export const env = location.href.includes('easons') ? 'online' : 'local'

export const ip = env === 'online' ? `http://106.54.172.20:3000/` : `http://${location.hostname}:3000/`