// Web Audio で短い効果音を合成する (外部音声アセットを持たない=バンドル/ライセンスを汚さない)。
// AudioContext はユーザー操作後に遅延生成し autoplay ポリシーを順守する。無効時は no-op。

let ctx: AudioContext | null = null
let enabled = false

type ACtor = typeof AudioContext
function getACtor(): ACtor | null {
  if (typeof window === 'undefined') return null
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: ACtor }).webkitAudioContext ??
    null
  )
}

// iOS は電話/バックグラウンドで AudioContext が非標準の 'interrupted' になり、suspended とは別状態。
// running 以外はすべて resume 対象にし、closed 等の reject は握り潰す。
function tryResume(): void {
  if (ctx && ctx.state !== 'running') void ctx.resume().catch(() => {})
}

let resumeHandlersBound = false
// 復帰契機(再表示/タップ)でも resume を試みる。多重登録しないよう ctx 初回生成時に一度だけ束ねる。
function bindResumeHandlers(): void {
  if (resumeHandlersBound || typeof window === 'undefined') return
  resumeHandlersBound = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tryResume()
  })
  window.addEventListener('pointerdown', tryResume, { passive: true })
}

// ユーザー操作後に呼ばれる前提。autoplay ポリシー/中断状態なら resume する。
function ensureCtx(): AudioContext | null {
  if (!enabled) return null
  if (!ctx) {
    const ACtor = getACtor()
    if (!ACtor) return null
    try {
      ctx = new ACtor()
    } catch {
      return null
    }
    bindResumeHandlers()
  }
  tryResume()
  return ctx
}

export function setSoundEnabled(on: boolean): void {
  enabled = on
}

export function isSoundEnabled(): boolean {
  return enabled
}

// 1音: 周波数を start→end へ可変、減衰エンベロープ付き。耳に痛くない音量に抑える。
function tone(
  c: AudioContext,
  opt: {
    freq: number
    endFreq?: number
    type?: OscillatorType
    dur: number
    gain?: number
    delay?: number
  },
): void {
  const t0 = c.currentTime + (opt.delay ?? 0)
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = opt.type ?? 'sine'
  osc.frequency.setValueAtTime(opt.freq, t0)
  if (opt.endFreq !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, opt.endFreq), t0 + opt.dur)
  }
  const peak = opt.gain ?? 0.18
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opt.dur)
  osc.connect(g).connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + opt.dur + 0.02)
}

// 短いノイズバースト (チップ/カードの「カサッ」感)。
function noise(c: AudioContext, opt: { dur: number; gain?: number; delay?: number; hp?: number }): void {
  const t0 = c.currentTime + (opt.delay ?? 0)
  const len = Math.max(1, Math.floor(c.sampleRate * opt.dur))
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const src = c.createBufferSource()
  src.buffer = buf
  const g = c.createGain()
  const peak = opt.gain ?? 0.12
  g.gain.setValueAtTime(peak, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opt.dur)
  if (opt.hp) {
    const filt = c.createBiquadFilter()
    filt.type = 'highpass'
    filt.frequency.value = opt.hp
    src.connect(filt).connect(g).connect(c.destination)
  } else {
    src.connect(g).connect(c.destination)
  }
  src.start(t0)
  src.stop(t0 + opt.dur + 0.02)
}

// ベット/レイズ: チップが当たる短い高音クリック2連。
export function playChip(): void {
  const c = ensureCtx()
  if (!c) return
  noise(c, { dur: 0.045, gain: 0.1, hp: 2500 })
  noise(c, { dur: 0.04, gain: 0.08, hp: 3000, delay: 0.06 })
}

// チェック: テーブルを叩く低めの単音。
export function playCheck(): void {
  const c = ensureCtx()
  if (!c) return
  tone(c, { freq: 180, endFreq: 120, type: 'sine', dur: 0.12, gain: 0.16 })
}

// フォールド: カードを伏せる「スッ」というノイズ + 下降音。
export function playFold(): void {
  const c = ensureCtx()
  if (!c) return
  noise(c, { dur: 0.13, gain: 0.08, hp: 1200 })
  tone(c, { freq: 320, endFreq: 160, type: 'triangle', dur: 0.14, gain: 0.1 })
}

// 配布: カードが滑る短いノイズ。
export function playDeal(): void {
  const c = ensureCtx()
  if (!c) return
  noise(c, { dur: 0.07, gain: 0.09, hp: 1800 })
}

// 勝利/ハンド完了: 上昇する2音アルペジオ。
export function playWin(): void {
  const c = ensureCtx()
  if (!c) return
  tone(c, { freq: 523.25, type: 'sine', dur: 0.16, gain: 0.16 })
  tone(c, { freq: 659.25, type: 'sine', dur: 0.18, gain: 0.16, delay: 0.1 })
  tone(c, { freq: 783.99, type: 'sine', dur: 0.22, gain: 0.16, delay: 0.2 })
}
