import { openDB, type IDBPDatabase } from 'idb'
import type { StateStorage } from 'zustand/middleware'

// ── Zustand persist 用 IndexedDB バックエンド ─────────────────────────────────
// R25: 大きなデータ (handHistory 等) を IDB に移行し、localStorage 容量上限と
// 「履歴 50 件」の足切りを撤廃する。
// - 単一 DB `poker-gto`, 単一ストア `zustand` を使用
// - キー = ストアの persist `name`(例 `poker-gto-session`)
// - 初回呼び出しで localStorage から自動マイグレーション (存在し IDB が空の時)
// - SSR/IDB 非対応環境では localStorage にフォールバック (Zustand 既定挙動を再現)

const DB_NAME = 'poker-gto'
const STORE = 'zustand'

let dbPromise: Promise<IDBPDatabase> | null = null
function getDB(): Promise<IDBPDatabase> | null {
  if (typeof indexedDB === 'undefined') return null
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      },
    }).catch(() => {
      dbPromise = null
      throw new Error('idb unavailable')
    })
  }
  return dbPromise
}

// localStorage フォールバック (SSR セーフ)。
const lsGet = (k: string) => (typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null)
const lsSet = (k: string, v: string) => { if (typeof localStorage !== 'undefined') localStorage.setItem(k, v) }
const lsRm = (k: string) => { if (typeof localStorage !== 'undefined') localStorage.removeItem(k) }

export const idbStorage: StateStorage = {
  async getItem(name: string): Promise<string | null> {
    try {
      const db = await getDB()
      if (!db) return lsGet(name)
      const v = (await db.get(STORE, name)) as string | undefined
      if (v != null) return v
      // 旧 localStorage データを発見 → IDB へワンタイム移行 (取得は同期的に返す)
      const fromLs = lsGet(name)
      if (fromLs != null) {
        await db.put(STORE, fromLs, name)
        lsRm(name)
        return fromLs
      }
      return null
    } catch {
      return lsGet(name)
    }
  },
  async setItem(name: string, value: string): Promise<void> {
    try {
      const db = await getDB()
      if (!db) { lsSet(name, value); return }
      await db.put(STORE, value, name)
    } catch {
      lsSet(name, value)
    }
  },
  async removeItem(name: string): Promise<void> {
    try {
      const db = await getDB()
      if (db) await db.delete(STORE, name)
    } catch {
      // noop
    }
    lsRm(name)
  },
}
