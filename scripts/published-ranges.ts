/**
 * Phase V1: 公開 GTO 6-max 100bb RFI レンジ(per-hand 検証の基準)。
 *
 * 出典 = 公開プリフロップチャート(GTO Wizard/bbzpoker/pokercoaching 等で広く一致する標準レンジ・
 * 2026-06 調査)。**手リストを自前で書き起こしたもの**(他社ソルバーの JSON 出力は同梱しない = L1 順守)。
 * scripts/ 配下 = アプリバンドルに含まれない検証専用データ。混成頻度は公開チャートが二値表記のため
 * 「レンジ内=1」で符号化(=実ソルバーの mixed とは別物・あくまで per-hand の in/out 検証基準)。
 *
 * SB は公開の raise-or-fold 幅がリンプ込み/抜きで割れるため V1 では除外(リンプ抽象=V3 後に追加)。
 */
import { CATEGORIES } from '../src/lib/solver/pushFold.ts'

const RANKS = '23456789TJQKA'
const ri = (c: string): number => RANKS.indexOf(c)
const combos = (cat: string): number => (cat.length === 2 ? 6 : cat[2] === 's' ? 4 : 12)

// レンジ記法トークン("66+"/"A3s+"/"ATo+"/"T9s")を 169 カテゴリへ展開。
function parseToken(tok: string): string[] {
  const plus = tok.endsWith('+')
  const base = plus ? tok.slice(0, -1) : tok
  const out: string[] = []
  if (base.length === 2 && base[0] === base[1]) {
    const r = ri(base[0])
    if (plus) for (let x = r; x <= 12; x++) out.push(RANKS[x] + RANKS[x])
    else out.push(base)
  } else if (base.length === 3) {
    const hi = ri(base[0]), lo = ri(base[1]), suit = base[2]
    if (plus) for (let x = lo; x < hi; x++) out.push(RANKS[hi] + RANKS[x] + suit)
    else out.push(base)
  }
  return out
}

// 各ポジションの公開 RFI(トークン列)。pct は出典の公称幅(自己検証で照合)。
export const PUBLISHED_TOKENS: Record<string, { pct: number; tokens: string[] }> = {
  UTG: { pct: 17.6, tokens: ['66+', 'A3s+', 'K8s+', 'Q9s+', 'J9s+', 'T9s', 'ATo+', 'KJo+', 'QJo'] },
  MP: { pct: 21.4, tokens: ['55+', 'A2s+', 'K6s+', 'Q9s+', 'J9s+', 'T9s', '98s', '87s', '76s', 'ATo+', 'KTo+', 'QTo+'] },
  CO: { pct: 27.8, tokens: ['33+', 'A2s+', 'K3s+', 'Q6s+', 'J8s+', 'T7s+', '97s+', '87s', '76s', 'A8o+', 'KTo+', 'QTo+', 'JTo'] },
  BTN: { pct: 43.5, tokens: ['33+', 'A2s+', 'K2s+', 'Q3s+', 'J4s+', 'T6s+', '96s+', '85s+', '75s+', '64s+', '53s+', 'A4o+', 'K8o+', 'Q9o+', 'J9o+', 'T8o+', '98o'] },
}

export const POSITIONS_V1 = ['UTG', 'MP', 'CO', 'BTN'] as const

// ポジションの公開レンジを per-category 二値マップ(1=レンジ内)に展開。
export function publishedCells(pos: string): Record<string, number> {
  const set = new Set<string>()
  for (const tok of PUBLISHED_TOKENS[pos].tokens) for (const c of parseToken(tok)) set.add(c)
  const cells: Record<string, number> = {}
  for (const cat of CATEGORIES) cells[cat] = set.has(cat) ? 1 : 0
  return cells
}

export function publishedWidthPct(pos: string): number {
  const cells = publishedCells(pos)
  let num = 0
  for (const cat of CATEGORIES) num += cells[cat] * combos(cat)
  return +(100 * num / 1326).toFixed(1)
}

// 自己検証: 展開幅が公称幅と概ね一致するか(パーサの健全性)。
if (process.argv[1] && process.argv[1].endsWith('published-ranges.ts')) {
  console.log('公開レンジ 自己検証(展開幅 vs 公称幅):')
  for (const pos of POSITIONS_V1) {
    const w = publishedWidthPct(pos), p = PUBLISHED_TOKENS[pos].pct
    console.log(`  ${pos.padEnd(4)} 展開=${w}%  公称=${p}%  Δ=${Math.abs(w - p).toFixed(1)}  ${Math.abs(w - p) < 1.5 ? '✓' : '⚠'}`)
  }
}
