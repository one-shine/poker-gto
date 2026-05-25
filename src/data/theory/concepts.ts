import type { SkillLevel } from '../../types/game'
import type { MistakeCategory } from '../../types/stats'

export type ConceptCategory = 'preflop' | 'postflop' | 'math' | 'mental'

export interface TheoryConcept {
  id: string
  title: string
  category: ConceptCategory
  skillLevel: SkillLevel
  summary: string // 1-2文
  body: string    // 段落は空行区切り
  relatedMistakes: MistakeCategory[]
}

export const CONCEPT_CATEGORY_JP: Record<ConceptCategory, string> = {
  preflop: 'プリフロップ',
  postflop: 'ポストフロップ',
  math: 'ポーカー数学',
  mental: 'メンタル/プロセス',
}

// 学習コンテンツ。各 relatedMistakes は弱点分析(AnalysisPage)からの導線に使う。
// 全 MistakeCategory を最低1つのコンセプトがカバーする(弱点カードが必ずリンク先を持つ)。
export const CONCEPTS: TheoryConcept[] = [
  {
    id: 'position',
    title: 'ポジションの優位性',
    category: 'preflop',
    skillLevel: 'beginner',
    summary: '後に行動できるほど情報が多く、同じレンジでも期待値が高い。',
    body: `ポーカーで最も価値ある情報は「相手が先に行動したか」です。ボタン(BTN)は全ストリートで最後に行動できるため、相手のアクションを見てから決められます。

この優位性ゆえに、後ろのポジションほど広いレンジでオープンできます。UTG は約15%、BTN は約45%が目安です。逆に SB/BB など先に行動する位置(OOP)では、レンジを締めて慎重に戦う必要があります。

「タイトな前ポジション、ワイドな後ろポジション」はGTOの基本骨格です。ポジションを無視した一律のレンジは、前では緩すぎ、後ろでは硬すぎになります。`,
    relatedMistakes: ['preflop_too_wide', 'preflop_too_tight'],
  },
  {
    id: 'rfi-ranges',
    title: 'RFI(オープンレイズ)レンジ',
    category: 'preflop',
    skillLevel: 'beginner',
    summary: 'ファーストインのレイズは、ポジションごとに決まった頻度のレンジで行う。',
    body: `RFI = Raise First In。誰もポットに入っていない状況で最初にレイズすることです。リンプ(コールで入る)は基本的に劣るため、GTOでは「レイズか降りるか」が原則です。

各ポジションの目安オープン頻度: UTG 15%、MP 18%、CO 27%、BTN 45%、SB 40%(SBはBBとのヘッズアップなので特殊)。標準サイズは 2.0〜2.5BB。

弱いプレイヤーほどポジションに関係なく同じ手を開きがちです。まずは自分の最も緩い/硬いポジションを把握しましょう。`,
    relatedMistakes: ['preflop_too_wide', 'preflop_too_tight', 'sb_limp'],
  },
  {
    id: 'no-limp',
    title: 'なぜリンプは劣るのか',
    category: 'preflop',
    skillLevel: 'beginner',
    summary: 'コールで入ると主導権を取れず、降ろす力もなく、ポジションも保証されない。',
    body: `リンプ(コールでポットに入る)は3つの理由で劣ります。①プリフロップで相手を降ろせない、②ポストフロップの主導権(イニシアチブ)を取れない、③後ろのプレイヤーにレイズされてポジションや権利を失いやすい。

特に SB からのリンプは、BB に無料でフロップを見せ、しかも残り全ストリートをOOPで戦うことになり最悪です。SB は「レイズして主導権を取る」か「降りる」が基本です。

例外的に超深いスタックや特殊な戦略でリンプが現れることはありますが、学習初期は「ノーリンプ」を徹底するのが上達の近道です。`,
    relatedMistakes: ['sb_limp', 'preflop_passive'],
  },
  {
    id: 'open-sizing',
    title: 'オープンサイズの考え方',
    category: 'preflop',
    skillLevel: 'intermediate',
    summary: 'レイズサイズはレンジ全体の期待値を最大化する一定値に統一する。',
    body: `GTOではハンドの強さでサイズを変えません(変えると相手に手を読まれる)。ポジションごとに一定サイズ(例: 100BBディープで 2.0〜2.5BB)を使います。

サイズを大きくすると降ろす力が増す反面、降りられたときの取りこぼし(続行レンジが強くなる)も増えます。小さくすると安く多くのポットを戦えますが、相手のコールレンジが広がります。ソルバーはこのバランスが取れる一定値を選びます。

「強い手だから大きく」「弱い手だから小さく」はサイズで手の強さを漏らす典型的なリークです。`,
    relatedMistakes: ['preflop_sizing'],
  },
  {
    id: 'bb-defense',
    title: 'BBディフェンス',
    category: 'preflop',
    skillLevel: 'intermediate',
    summary: 'BBは既にブラインドを払っているため、良いポットオッズで広く守る。',
    body: `BBは1BBを既に支払っているため、相手のオープンに対して非常に良いオッズでコールできます。例えば 2.5BB のオープンには 1.5BB のコールで 5.5BB のポットを受けられます。

そのため BBのディフェンスレンジは広く、相手のポジションが後ろ(BTNなど)ほどさらに広げます。ただし「広く守る」はコールだけでなく3betも含みます。守りすぎ(弱い手で無理にコール)も、降りすぎ(オッズが良いのに諦める)も両方リークです。

OOPで戦う点は不利なので、ポストフロップで難しくなる手は3betして主導権を取るか降りる判断も重要です。`,
    relatedMistakes: ['blind_defense_wide', 'blind_defense_tight'],
  },
  {
    id: 'facing-3bet',
    title: '3betへの対応',
    category: 'preflop',
    skillLevel: 'advanced',
    summary: 'オープンに3betされたら、4bet・コール・フォールドを手の強さとブロッカーで配分する。',
    body: `自分のオープンに3betされたとき、すべて降りるのは搾取されます。GTOは続行レンジ(4bet/コール)を一定割合持ちます。

4betはバリュー(QQ+, AK)に加えて、Aブロッカーを持つ手(A5sなど)をブラフで混ぜます。コールは ポジションがあるとき(BTNなど)に広く、OOPでは狭くなります。

「3betされたら良い手以外は降りる」だと、相手にブラフ3betの利益を与えます。逆にコールしすぎるとOOPで難しい状況を量産します。`,
    relatedMistakes: ['fold_to_3bet', 'call_3bet_oop'],
  },
  {
    id: 'cbet-ip',
    title: 'IPのCベット',
    category: 'postflop',
    skillLevel: 'intermediate',
    summary: 'ポジションがあるプリフロップレイザーは、多くのフロップで高頻度に小さく打てる。',
    body: `ポジションがあり、かつプリフロップの主導権(レンジの強さ)を持つ側は、多くのフロップで継続ベット(Cベット)できます。特に乾いた(コネクトしにくい)ボードでは小サイズ(1/3ポット程度)で高頻度に打てます。

Cベットを打たずにチェックで回すと、せっかくのレンジ優位とポジションを活かせず、無料でカードを与えます。これがIPでのCベット見送り(missed_cbet_ip)です。

ただし全ボード一律ではありません。相手のレンジに刺さるウェットなボードでは頻度を落とし、チェックも混ぜます。`,
    relatedMistakes: ['missed_cbet_ip', 'check_ip_missed_value'],
  },
  {
    id: 'cbet-oop',
    title: 'OOPのCベットとレンジ優位',
    category: 'postflop',
    skillLevel: 'advanced',
    summary: 'OOPでは打ちすぎが危険。レンジ優位のあるボードに絞り、チェックを多めに混ぜる。',
    body: `OOP(アウトオブポジション)では、相手が後から行動できるぶん不利です。ここで全ボードに高頻度Cベットすると、相手にコール/レイズで搾取されます(cbet_oop_too_wide)。

OOPでのCベットは、自分のレンジが明確に強い(Aハイや高いペアボードなど)局面に絞り、それ以外はチェックを多めにしてレンジを守ります。チェックレンジに強い手を残すことで、相手のベットに対応できます。

「主導権を持っているから毎回打つ」はOOPでは通用しません。ポジションの不利を頻度で補正します。`,
    relatedMistakes: ['cbet_oop_too_wide', 'oop_donk_bet'],
  },
  {
    id: 'donk-bet',
    title: 'ドンクベットの是非',
    category: 'postflop',
    skillLevel: 'advanced',
    summary: 'プリフロップでコールした側が先に打つドンクは、ほとんどの局面で不要。',
    body: `ドンクベットとは、プリフロップでアグレッサーでなかった側(コールした側)がフロップで先にベットすることです。

一般にレンジ優位はプリフロップレイザー側にあるため、コール側がリードで打つ理由は乏しく、GTOでは大半のボードでドンク頻度はほぼ0です。先にチェックしてアグレッサーのCベットに対応するほうが、強い手も守れて効率的です。

ドンクが有効なのは、ボードがコール側のレンジに著しく有利になる特殊な場合(例: 低い連結ボードでBBが有利)に限られます。乱発はリークです。`,
    relatedMistakes: ['oop_donk_bet'],
  },
  {
    id: 'value-bluff-balance',
    title: 'バリューとブラフのバランス',
    category: 'postflop',
    skillLevel: 'advanced',
    summary: 'ベットレンジはバリューとブラフを適正比で混ぜ、相手を無差別にする。',
    body: `ベットするときは、強い手(バリュー)だけでなくブラフも混ぜます。ブラフがゼロだと相手は安全に降りられ、バリューだけがコールされて損します。逆にブラフが多すぎると、コールされて負けます。

リバーのポットサイズベットなら、おおよそ「バリュー2:ブラフ1」が、相手のコール/フォールドを無差別にする比率です(ベットが大きいほどブラフ比率を上げる)。

ブラフを打てない(bluff_frequencyの不足は逆方向だが)・ブラフを打ちすぎる(bluff_frequency過多)、どちらもこのバランスからの逸脱です。`,
    relatedMistakes: ['bluff_frequency', 'value_bet_missed'],
  },
  {
    id: 'thin-value',
    title: 'シンバリューを逃さない',
    category: 'postflop',
    skillLevel: 'advanced',
    summary: '中程度の手でも、より弱い手にコールされるなら薄いバリューベットが成立する。',
    body: `バリューベットは「自分よりわずかに弱い手にコールしてもらえる」なら成立します。トップペア弱キッカーや2ペアでも、相手の続行レンジに負ける手があれば打つべきです。

中級者は強い手しか打たず、ミドルクラスの手をチェックして見せ合いに行きがちです(value_bet_missed)。これは取れるはずのバリューを毎回取りこぼします。

もちろん打ちすぎて、より強い手にしかコールされない(=自分が負けている)状況でのベットは別問題です。相手の続行レンジを基準に判断します。`,
    relatedMistakes: ['value_bet_missed', 'check_ip_missed_value'],
  },
  {
    id: 'pot-odds',
    title: 'ポットオッズと必要勝率',
    category: 'math',
    skillLevel: 'beginner',
    summary: 'コール額 ÷ (ポット+コール額) が、コールが見合う最低勝率。',
    body: `ポットオッズは「コールに必要な金額」と「勝ったときに得られるポット」の比です。必要勝率 = コール額 ÷ (現在のポット + 相手のベット + コール額)。

例: ポット 6BB に 3BB のベット。コール 3BB で、必要勝率 = 3 / (6+3+3) = 25%。自分の手が25%以上勝つなら、コールはプラスEVです。

これはドローの判断やブラフキャッチの基礎です。エクイティ(勝率)とポットオッズを比べる習慣が、感覚的なコール/フォールドを数学に置き換えます。`,
    relatedMistakes: ['blind_defense_tight', 'fold_to_3bet'],
  },
  {
    id: 'equity-realization',
    title: 'エクイティ実現',
    category: 'math',
    skillLevel: 'advanced',
    summary: '生の勝率は、ポジションや実現の難しさで割り引いて考える。',
    body: `「エクイティ(全部見せ合ったときの勝率)」と「実際に得られる価値」は違います。OOPの手やドローは、ベットを浴びて降ろされ、勝率を100%実現できません。これをエクイティ実現率(R)と呼びます。

ポジションがあると実現率は上がり(100%超のことも)、OOPでは下がります。だから同じ勝率の手でも、BTNではプレイし、SBでは降りる、という判断が生まれます。

プリフロップのコール判断が「オッズは足りるのに損」になるのは、エクイティを実現しきれないためです。`,
    relatedMistakes: ['call_3bet_oop', 'blind_defense_wide'],
  },
  {
    id: 'mixed-strategy',
    title: 'ミックス戦略はなぜ正解か',
    category: 'math',
    skillLevel: 'pro',
    summary: '同じ手を複数アクションに割り振ることで、相手に読まれず搾取されない。',
    body: `GTOでは、ある手を「60%レイズ・40%コール」のように確率で混ぜることがあります。一見どっちつかずですが、これは相手に自分のレンジを読ませないための均衡戦略です。

もし常に同じアクションなら、相手はあなたの手を絞り込めます。混ぜることで、どのアクションを見てもあなたのレンジに強い手と弱い手が両方含まれ、相手は最適な反応を取れなくなります。

実戦では、どちらを選んでも大きな損はありません(EVがほぼ等しいから混ざる)。頻度通りに散らすほど均衡に近づきますが、迷ったらEVの高い方でも問題ありません。`,
    relatedMistakes: ['preflop_passive', 'bluff_frequency'],
  },
  {
    id: 'ev-thinking',
    title: 'EV(期待値)で判断する',
    category: 'math',
    skillLevel: 'intermediate',
    summary: '結果ではなく、長期的な平均利益(EV)が正しいかで判断する。',
    body: `ポーカーは短期では運に支配されます。正しいプレイが負け、ミスが勝つことは日常茶飯事です。だから1ハンドの勝敗ではなく、その判断の期待値(EV)で良し悪しを測ります。

このアプリのコーチは「EV損失 = 最善手のEV − あなたの選択のEV」を表示します。EV損失0なら正解、0.5BB未満は軽微、2BB超は大きなミス(ブランダー)です。

「勝ったから正解」「負けたから失敗」という結果論(リザルトオリエンテッド)を捨てることが、上達の前提です。`,
    relatedMistakes: ['preflop_passive', 'preflop_sizing'],
  },
  {
    id: 'tilt-control',
    title: 'ティルトとプロセス重視',
    category: 'mental',
    skillLevel: 'beginner',
    summary: '感情的になると判断が崩れる。結果ではなく判断の質に集中する。',
    body: `バッドビートや連敗で冷静さを失う状態を「ティルト」と呼びます。ティルト中は無理なコールやブラフが増え、リークが一気に膨らみます。

対策は「結果ではなくプロセスを評価する」こと。良い判断を続けていれば長期では報われる、と信じて1手1手の質に集中します。負けたセッションでも、EV損失が小さければそれは良いセッションです。

このアプリで精度(GTO一致率)とEV損失を追うのは、結果から切り離して自分の判断を測るためです。`,
    relatedMistakes: ['preflop_too_wide', 'bluff_frequency'],
  },
]

export function conceptsForMistake(category: MistakeCategory): TheoryConcept[] {
  return CONCEPTS.filter(c => c.relatedMistakes.includes(category))
}

export function conceptById(id: string): TheoryConcept | undefined {
  return CONCEPTS.find(c => c.id === id)
}
