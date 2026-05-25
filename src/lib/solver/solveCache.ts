import { openDB, type IDBPDatabase } from 'idb'
import type { NodeSolution } from '../../types/solver'

// 求解結果の2層キャッシュ: L1=メモリ(同セッション即時) / L2=IndexedDB(リロード/再訪でも即時)。
// NodeSolution は純データ(Card/数値/文字列)なので structured clone でそのまま永続化できる。
// IndexedDB 非対応 (テスト/SSR) ではメモリのみで動作する。

const DB_NAME = 'poker-gto-solver'
const STORE = 'solutions'

const mem = new Map<string, NodeSolution>()
let dbPromise: Promise<IDBPDatabase | null> | null = null

function getDB(): Promise<IDBPDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = (async () => {
    try {
      if (typeof indexedDB === 'undefined') return null
      return await openDB(DB_NAME, 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
        },
      })
    } catch {
      return null // 非対応/失敗時はメモリのみ
    }
  })()
  return dbPromise
}

export async function getCachedSolution(key: string): Promise<NodeSolution | null> {
  const m = mem.get(key)
  if (m) return m
  const db = await getDB()
  if (!db) return null
  try {
    const v = (await db.get(STORE, key)) as NodeSolution | undefined
    if (v) mem.set(key, v)
    return v ?? null
  } catch {
    return null
  }
}

export async function putCachedSolution(key: string, node: NodeSolution): Promise<void> {
  mem.set(key, node)
  const db = await getDB()
  if (!db) return
  try {
    await db.put(STORE, node, key)
  } catch {
    /* 永続化失敗は致命的でない (メモリには載っている) */
  }
}
