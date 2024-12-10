export const backend = 'local' as 'remote' | 'local' // location.href.includes('easons') ? 'online' :  'local'

const protocol = location.protocol

let backend_url
if (backend === 'remote') {
  if (protocol === 'https:') {
    backend_url = 'https://api.eason-s.life:8443/'
  } else {
    backend_url = 'http://106.54.172.20:3000/'
  }
} else {
  // 以防忘记，https必线上
  if (protocol === 'https:') {
    backend_url = 'https://api.eason-s.life:8443/'
  } else {
    backend_url = 'http://localhost:3000/'
  }
}

export const ip = backend_url
