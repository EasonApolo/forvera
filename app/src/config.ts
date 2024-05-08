export const env = 'online' // location.href.includes('easons') ? 'online' :  'local'

const protocol = location.protocol

export const ip =
  env === 'online'
    ? `${protocol}//api.eason-s.life/`
    : `${protocol}//${location.hostname}:3000/`
