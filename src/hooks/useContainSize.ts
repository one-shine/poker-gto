import { useLayoutEffect, useRef, useState } from 'react'

// 親要素にフィットする「アスペクト比固定ボックス」のピクセルサイズを返す (レターボックス)。
// width = min(親幅, 親高×ratio, maxW)、height = width/ratio。
// 幅と高さの**両方**で制約するため、幅広・縦短いずれの窓でも歪まずに縮む (R30)。
// CSS の aspect-ratio + max-* だけでは「幅100%固定 vs 高さ制約」が両立せず歪む/見切れるため JS 計測で解決。
export function useContainSize(ratio: number, maxW = Infinity) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const { width, height } = el.getBoundingClientRect()
      if (width <= 0 || height <= 0) return
      const w = Math.min(width, height * ratio, maxW)
      setSize({ w: Math.round(w), h: Math.round(w / ratio) })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ratio, maxW])

  return { ref, size }
}
