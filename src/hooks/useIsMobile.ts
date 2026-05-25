import { useEffect, useState } from 'react'

const hasMM = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'

// 画面幅で mobile/desktop を判定する共有フック (matchMedia 購読)。
// 非対応環境 (jsdom 等) は false (desktop) を返す。
export function useIsMobile(query = '(max-width: 639px)'): boolean {
  const [match, setMatch] = useState(() => (hasMM() ? window.matchMedia(query).matches : false))
  useEffect(() => {
    if (!hasMM()) return
    const mq = window.matchMedia(query)
    const onChange = () => setMatch(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return match
}
