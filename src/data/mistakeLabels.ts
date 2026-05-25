import type { MistakeCategory } from '../types/stats'

// ミスカテゴリの日本語ラベル (LearnPage / AnalysisPage 共有)。
export const CATEGORY_JP: Record<MistakeCategory, string> = {
  preflop_too_wide: 'プリフロップ: 広すぎる', preflop_too_tight: 'プリフロップ: タイト過ぎ',
  preflop_passive: 'プリフロップ: 受動的', preflop_sizing: 'プリフロップ: サイズ',
  fold_to_3bet: '3betに降りすぎ', call_3bet_oop: 'OOPで3betコール',
  blind_defense_wide: 'BBディフェンス: 広すぎ', blind_defense_tight: 'BBディフェンス: タイト過ぎ',
  sb_limp: 'SBリンプ', missed_cbet_ip: 'IP CBet見送り', cbet_oop_too_wide: 'OOP CBet広すぎ',
  check_ip_missed_value: 'IPバリュー逃し', oop_donk_bet: 'OOPドンクベット',
  bluff_frequency: 'ブラフ頻度', value_bet_missed: 'バリューベット逃し',
}
