export interface RangeCell {
  hand: string
  raise: number // open raise / 3-bet 頻度
  call: number  // call 頻度 (BB defense のみ)
  fold: number  // fold 頻度
}

export interface RangeScenario {
  id: string
  label: string
  position: string
  raiseSize: number // in BB
  // 非foldsハンドのみ収録。未収録 = fold 1.0
  cells: Record<string, RangeCell>
}
