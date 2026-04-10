import { ip } from '../config'

const backendBase = ip.replace(/\/+$/, '')

export const toPathOnly = (url: string) => {
  if (!url) return ''
  if (url.includes('://')) {
    try {
      return new URL(url).pathname || ''
    } catch {
      return url
    }
  }
  return url
}

export const toNormalizedPath = (url: string) => {
  const pathOnly = toPathOnly(url).replace(/\/+/g, '/')
  return pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`
}

export const toResourcePath = (url: string) => {
  const normalizedPath = toNormalizedPath(url)
  return normalizedPath.startsWith('/resource')
    ? normalizedPath
    : `/resource${normalizedPath}`
}

export const toBackendResourceUrl = (url: string) => {
  return `${backendBase}${toResourcePath(url)}`
}

export const toViewerOriginalUrl = (url: string) => {
  return toBackendResourceUrl(url).replace('_thumb', '')
}

export const toViewerThumbUrl = (url: string) => {
  const resourceUrl = toBackendResourceUrl(url)
  if (resourceUrl.includes('_thumb')) {
    return resourceUrl
  }
  const dotIndex = resourceUrl.lastIndexOf('.')
  return dotIndex === -1
    ? `${resourceUrl}_thumb`
    : `${resourceUrl.slice(0, dotIndex)}_thumb${resourceUrl.slice(dotIndex)}`
}

export const toViewerUrls = (url: string) => {
  return {
    original: toViewerOriginalUrl(url),
    thumb: toViewerThumbUrl(url),
  }
}

export const parseImageSizeFromUrl = (url: string) => {
  const path = toPathOnly(url)
  const match = path.match(/_(\d+)_(\d+)(?:_thumb)?\.[^./?]+(?:\?.*)?$/)
  if (!match) {
    return null
  }
  const width = Number(match[1])
  const height = Number(match[2])
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null
  }
  return { width, height }
}

export const rewriteContentImagesForViewer = (html: string) => {
  const regex = /<img src="(https?:\/\/[^\/]+)?(\/[^"]+)"/g
  return html.replace(regex, (_, _origin, path) => {
    const { thumb, original } = toViewerUrls(path || '')
    return `<img src="${thumb}" data-original="${original}"`
  })
}

export const bindContentImagesForViewer = (
  container: HTMLElement,
  onPreview: (url: string) => void
) => {
  const images = Array.from(container.querySelectorAll('img')) as HTMLImageElement[]
  images.forEach(image => {
    image.style.cursor = 'zoom-in'
    image.onclick = (event) => {
      event.stopPropagation()
      const original = image.getAttribute('data-original') || image.src
      onPreview(toViewerOriginalUrl(original))
    }
  })
}
