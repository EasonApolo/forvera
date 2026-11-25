import { permanentRedirect } from 'next/navigation'

/** 旧地址 /postList 永久跳到首页，查询参数原样带上。 */
export default async function LegacyPostList({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') query.append(key, value)
    else if (Array.isArray(value)) value.forEach(item => query.append(key, item))
  }
  const qs = query.toString()
  permanentRedirect(qs ? `/?${qs}` : '/')
}
