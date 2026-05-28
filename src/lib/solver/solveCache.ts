import { openDB, type IDBPDatabase } from 'idb'
import type { NodeSolution } from '../../types/solver'

// 求解結果の2層キャッシュ: L1=メモリ(同セッション即時) / L2=IndexedDB(リロード/再訪でも即時)。
// NodeSolution は純データ(Card/数値/文字列)なので structured clone でそのまま永続化できる。
// IndexedDB 非対応 (テスト/SSR) ではメモリのみで動作する。
//
// R18: 肥大化対策 (LRU 上限)。
// - L1 メモリ: Map の挿入順 = LRU。get 時に再挿入で最新化、超過時に先頭を捨てる。
// - L2 IDB: 件数上限 (IDB_LIMIT)。put 時に count() を見て超えていれば、
//   solvedAt が古いものをバッチ削除して制限内に戻す (live-solve の NodeSolution は
//   solvedAt を必ず持つ → meta.solvedAt で確実にソートできる)。

const DB_NAME = 'poker-gto-solver'
const STORE = 'solutions'

const MEM_LIMIT = 200
const IDB_LIMIT = 1000
const IDB_BATCH_TRIM = 50 // 超過時にこの数だけ追加で削る (毎 put でフルスキャンしない)

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

// メモリ側 LRU: get で再挿入 (最新化)、put で超過時に先頭 (LRU) を削除。
function memGet(key: string): NodeSolution | undefined {
  const v = mem.get(key)
  if (v !== undefined) {
    mem.delete(key)
    mem.set(key, v)
  }
  return v
}
function memSet(key: string, value: NodeSolution): void {
  if (mem.has(key)) mem.delete(key)
  mem.set(key, value)
  while (mem.size > MEM_LIMIT) {
    const first = mem.keys().next().value
    if (first === undefined) break
    mem.delete(first)
  }
}

// IDB のサイズが上限を超えていれば、solvedAt の古いものから batch 件削除する。
// 競合に強くするため、現在の overflow + バッチ分まで削る (頻度を下げる)。
async function trimIDBIfNeeded(db: IDBPDatabase): Promise<void> {
  try {
    const count = await db.count(STORE)
    if (count <= IDB_LIMIT) return
    const need = count - IDB_LIMIT + IDB_BATCH_TRIM
    // 全 (key,value) を取り出し solvedAt で昇順ソート (古い順)。
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const all: { key: IDBValidKey; ts: number }[] = []
    let cursor = await store.openCursor()
    while (cursor) {
      const v = cursor.value as NodeSolution
      all.push({ key: cursor.key, ts: v.meta?.solvedAt ?? 0 })
      cursor = await cursor.continue()
    }
    all.sort((a, b) => a.ts - b.ts)
    for (let i = 0; i < Math.min(need, all.length); i++) {
      await store.delete(all[i].key)
    }
    await tx.done
  } catch {
    /* 制限維持はベストエフォート */
  }
}

export async function getCachedSolution(key: string): Promise<NodeSolution | null> {
  const m = memGet(key)
  if (m) return m
  const db = await getDB()
  if (!db) return null
  try {
    const v = (await db.get(STORE, key)) as NodeSolution | undefined
    if (v) memSet(key, v)
    return v ?? null
  } catch {
    return null
  }
}

export async function putCachedSolution(key: string, node: NodeSolution): Promise<void> {
  memSet(key, node)
  const db = await getDB()
  if (!db) return
  try {
    await db.put(STORE, node, key)
    await trimIDBIfNeeded(db)
  } catch {
    /* 永続化失敗は致命的でない (メモリには載っている) */
  }
}

// テスト/メンテ用: メモリ・IDB の全消去。
export async function clearSolveCache(): Promise<void> {
  mem.clear()
  const db = await getDB()
  if (!db) return
  try { await db.clear(STORE) } catch { /* noop */ }
}

// テスト用の internal getters (本番コードでは未使用)。
export const __internals = {
  memSize: () => mem.size,
  memHas: (k: string) => mem.has(k),
  MEM_LIMIT, IDB_LIMIT, IDB_BATCH_TRIM,
}
