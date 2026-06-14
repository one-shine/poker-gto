import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { DrillKind, DrillResult, DrillStat } from '../types/stats'
import { idbStorage } from '../lib/storage/idbStorage'

// 直近結果リングの上限 (IDB 肥大化防止)。byKind/byBucket は件数固定 Record なので肥大化しない。
const RECENT_MAX = 50

const emptyStat = (): DrillStat => ({ attempts: 0, correct: 0 })
const emptyByKind = (): Record<DrillKind, DrillStat> => ({
  preflop: emptyStat(), postflop: emptyStat(), pushfold: emptyStat(), odds: emptyStat(), blocker: emptyStat(), sizing: emptyStat(),
})

interface DrillStore {
  byKind: Record<DrillKind, DrillStat>     // 種別ごとの通算
  byBucket: Record<string, DrillStat>      // bucketKey ごとの内訳
  recent: DrillResult[]                    // 直近結果 (新しい順)

  recordDrill: (r: Omit<DrillResult, 'timestamp'>) => void
  resetDrills: () => void
}

const bump = (st: DrillStat | undefined, correct: boolean): DrillStat => ({
  attempts: (st?.attempts ?? 0) + 1,
  correct: (st?.correct ?? 0) + (correct ? 1 : 0),
})

export const useDrillStore = create<DrillStore>()(
  persist(
    set => ({
      byKind: emptyByKind(),
      byBucket: {},
      recent: [],

      recordDrill: r =>
        set(s => ({
          byKind: { ...s.byKind, [r.kind]: bump(s.byKind[r.kind], r.correct) },
          byBucket: { ...s.byBucket, [r.bucketKey]: bump(s.byBucket[r.bucketKey], r.correct) },
          recent: [{ ...r, timestamp: Date.now() }, ...s.recent].slice(0, RECENT_MAX),
        })),

      resetDrills: () => set({ byKind: emptyByKind(), byBucket: {}, recent: [] }),
    }),
    {
      name: 'poker-gto-drill',
      storage: createJSONStorage(() => idbStorage),
      // 旧データに byKind の欠けた種別があっても初期値で補う。
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<DrillStore>
        return { ...current, ...p, byKind: { ...emptyByKind(), ...(p.byKind ?? {}) } }
      },
    },
  ),
)
