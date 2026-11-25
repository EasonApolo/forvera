import type { Metadata, Viewport } from 'next'
import './globals.css'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: "Eason's Life~",
  description: 'Eason 的文章',
  icons: {
    icon: [
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  userScalable: false,
  themeColor: '#f6f6f6',
}

const themeScript = `(function () {
  var lightColor = '#f6f6f6'
  var darkColor = '#181818'
  function mode() {
    var saved = localStorage.getItem('themeMode')
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
    var legacy = localStorage.getItem('theme')
    if (legacy === 'light' || legacy === 'dark') return legacy
    return 'system'
  }
  function dark(next) {
    if (next === 'dark') return true
    if (next === 'light') return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  function apply() {
    var isDark = dark(mode())
    document.documentElement.classList.toggle('dark', isDark)
    var metas = document.querySelectorAll('meta[name="theme-color"]')
    if (!metas.length) {
      var created = document.createElement('meta')
      created.setAttribute('name', 'theme-color')
      document.head.appendChild(created)
      metas = document.querySelectorAll('meta[name="theme-color"]')
    }
    var color = isDark ? darkColor : lightColor
    for (var i = 0; i < metas.length; i++) metas[i].setAttribute('content', color)
  }
  apply()
  var media = window.matchMedia('(prefers-color-scheme: dark)')
  var onChange = function () {
    if (mode() === 'system') apply()
  }
  if (media.addEventListener) media.addEventListener('change', onChange)
  else if (media.addListener) media.addListener(onChange)
})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <div className="shell">{children}</div>
      </body>
    </html>
  )
}
