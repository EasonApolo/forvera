export const env = 'online' // location.href.includes('easons') ? 'online' :  'local'

const protocol = location.protocol

export const ip =
  env === 'online'
    ? `${protocol}//api.eason-s.life:8443/`
    : `${protocol}//${location.hostname}:3000/`
