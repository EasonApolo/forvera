export const backend: 'remote' | 'local' = 'remote' // location.href.includes('easons') ? 'online' :  'local'

const protocol = location.protocol

let backend_url
if (backend === 'remote') {
  if (protocol === 'https:') {
    backend_url = 'https://api.eason-s.life:8443/'
  } else {
    backend_url = 'http://106.54.172.20:3000/'
  }
} else {
  backend_url = 'http://localhost:3000/'
}

export const ip = backend_url
