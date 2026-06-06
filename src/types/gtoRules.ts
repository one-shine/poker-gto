// GTO 評価の共有しきい値(CLAUDE.md 設計ルール2)。単一の真実の源とし、
// drill / CoachAgent が各自で 0.10 を再定義してドリフトしないようにする。
//
// 10% 以上の頻度があれば「正解」(ミックス戦略対応)。
export const MIXED_STRATEGY_THRESHOLD = 0.10
