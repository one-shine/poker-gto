import { idbStorage } from './idbStorage'

// 学習データの一括エクスポート/インポート (U11)。
// 完全ローカル: Blob ダウンロード / file 読み込みのみで外部送信は一切しない。
// 3つの persist 先 (localStorage 2 + IndexedDB 1) の「zustand エンベロープ {state,version} 生文字列」を
// そのまま束ねて移送する。生値を保持するので、将来ストア側に persist migrate が入っても
// rehydrate 時に各ストアの version migrate が自動適用される。
export const EXPORT_VERSION = 1

export const STORAGE_KEYS = {
  settings: 'poker-gto-settings', // localStorage
  progress: 'poker-gto-progress', // localStorage
  session: 'poker-gto-session', // IndexedDB (idbStorage)
} as const

export interface PokerGtoExport {
  app: 'poker-gto'
  version: number
  exportedAt: string
  // 各値は zustand エンベロープ {state, version} の生オブジェクト (未保存は null)。
  data: { settings: unknown; progress: unknown; session: unknown }
}

const lsGet = (k: string) => (typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null)
const lsSet = (k: string, v: string) => { if (typeof localStorage !== 'undefined') localStorage.setItem(k, v) }

// 保存済みエンベロープ文字列を parse。未保存(null)/壊れていれば null。
function parseEnvelope(raw: string | null): unknown {
  if (raw == null) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// 全永続データを 1 つの JSON 文字列にまとめる。session は IndexedDB から async 取得。
export async function exportAll(): Promise<string> {
  const session = await idbStorage.getItem(STORAGE_KEYS.session)
  const payload: PokerGtoExport = {
    app: 'poker-gto',
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      settings: parseEnvelope(lsGet(STORAGE_KEYS.settings)),
      progress: parseEnvelope(lsGet(STORAGE_KEYS.progress)),
      session: parseEnvelope(session),
    },
  }
  return JSON.stringify(payload, null, 2)
}

export interface ImportResult {
  ok: boolean
  errors: string[]
  applied: string[] // 反映できたキー名
}

// エンベロープらしさの緩い検証 (version:0 互換のため厳密にしない)。オブジェクトであれば許容。
function looksLikeEnvelope(v: unknown): boolean {
  return typeof v === 'object' && v !== null
}

// JSON を検証して各 storage へ書き戻す。rehydrate/reload は呼び出し側 (SettingsPage) に委譲する
// (lib は storage 操作に徹し、依存方向 lib ← stores/UI を保つ)。
export async function importAll(text: string): Promise<ImportResult> {
  const errors: string[] = []
  const applied: string[] = []

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, errors: ['JSON として読み取れませんでした。'], applied }
  }

  const obj = parsed as Partial<PokerGtoExport>
  if (!obj || typeof obj !== 'object' || obj.app !== 'poker-gto') {
    return { ok: false, errors: ['このアプリのバックアップファイルではありません。'], applied }
  }
  if (typeof obj.version !== 'number' || obj.version > EXPORT_VERSION) {
    return { ok: false, errors: [`対応していないバージョンです (file=${String(obj.version)} / 対応=${EXPORT_VERSION})。アプリを更新してください。`], applied }
  }
  const data = obj.data
  if (!data || typeof data !== 'object') {
    return { ok: false, errors: ['バックアップの中身が壊れています。'], applied }
  }

  // localStorage 2 件 (同期) → IndexedDB 1 件 (async) の順で書き戻し。
  const local: [keyof typeof STORAGE_KEYS, string][] = [
    ['settings', STORAGE_KEYS.settings],
    ['progress', STORAGE_KEYS.progress],
  ]
  for (const [field, key] of local) {
    const v = (data as Record<string, unknown>)[field]
    if (v == null) continue // 欠落キーはスキップ (部分インポート許容)
    if (!looksLikeEnvelope(v)) { errors.push(`${field} の形式が不正なためスキップしました。`); continue }
    try {
      lsSet(key, JSON.stringify(v))
      applied.push(field)
    } catch {
      errors.push(`${field} の書き込みに失敗しました。`)
    }
  }

  const sessionVal = (data as Record<string, unknown>).session
  if (sessionVal != null) {
    if (!looksLikeEnvelope(sessionVal)) {
      errors.push('session の形式が不正なためスキップしました。')
    } else {
      try {
        await idbStorage.setItem(STORAGE_KEYS.session, JSON.stringify(sessionVal))
        applied.push('session')
      } catch {
        errors.push('session の書き込みに失敗しました。')
      }
    }
  }

  return { ok: applied.length > 0, errors, applied }
}
