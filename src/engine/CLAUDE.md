# Engine API 早見表

`src/engine/` はReact非依存の純粋TypeScript。テストはNode環境 (jsdom不要)。

## cards/

- `Card.ts` — `RANKS`, `SUITS`, `RANK_VALUES`, `SUIT_SYMBOLS`; `cardToString(c)`, `parseCard(s)`, `parseCards(s)`, `sameCard(a,b)`
- `Deck.ts` — `createDeck()`, `shuffleDeck(d)`, `createShuffledDeck()`, `dealCards(deck,n)→{dealt,remaining}`
- `HandEvaluator.ts` — `evaluateBestHand(cards)→HandEvalResult`, `compareHands(a,b)→-1|0|1`

## game/

- `PositionManager.ts` — `getPosition(seat,btn)`, `getPreflopActionOrder(players,btn)`, `getPostflopActionOrder(players,btn)`, `isHeroIP(heroSeat,btn,activeSeats[])`
- `GameState.ts` — `PlayerConfig{id,agentType,stackBB,isHero}`; `createInitialGameState(configs,deck,btn,handNum)→{state,remainingDeck}` (ブラインドposting・ホールカード配布込み)
- `BettingEngine.ts` — `getTotalPot(s)`, `getCurrentCallAmount(s,pid)`, `getMinRaiseToAmount(s)`, `applyAction(s,pid,action,raiseToAmt?)→s`, `collectBetsIntoPot(s)→s`
- `GameStateMachine.ts` — `dealFlop(s,cards[3])`, `dealTurn(s,card)`, `dealRiver(s,card)`, `goToShowdown(s)` ※各関数内でcollectBetsIntoPotを呼ぶ
- `Showdown.ts` — `determineWinners(s)→ShowdownResult[]` (サイドポット対応)

## agents/

- `AgentBus.ts` — `AgentBus`クラス; `on/off/emit`; イベント: `HAND_START`, `STREET_DEALT`, `ACTION_REQUIRED{state,playerId,validActions,callAmount,minRaiseToAmount}`, `HAND_COMPLETE{state,results}`, `PLAYER_ACTION{playerId,action,amount}`, `NEW_HAND_REQUEST`
- `DealerAgent.ts` — `new DealerAgent(bus,configs,btnSeat=0)`, `startNewHand()` — ゲーム全体を同期制御。リレイズ後のキュー再構築あり。
- `AIPlayerAgent.ts` — `new AIPlayerAgent(bus,playerId,schedule?)` — Fish AI。判断は `fishHeuristic.decideFishAction` に委譲。`schedule` は送出タイミング注入 (デフォルト同期)。`fishDelayScheduler` も持つが、UI の「間」は gameStore 側の aiSpeed 対応スケジューラを注入する (U9・engine は設定非依存)。
- `fishHeuristic.ts` — `decideFishAction(state,playerId,validActions,callAmount,minRaiseToAmount)→{action,amount}`。プリフロップ未オープン=raise-or-fold(レンジ駆動・全6ポジション)、対レイズ/ポストフロップはヒューリスティクス。AIPlayerAgent と GTOPlayerAgent フォールバックで共有。
- `GTOPlayerAgent.ts` — `new GTOPlayerAgent(bus,playerId,schedule?)` (trainer相手)。`sampleStrategyAction(sols,rng)` で頻度抽選 + `mapToValid(sampled,payload)` で有効化。getSolution(live solveなし)命中時はサンプリング、未カバーは decideFishAction。`gtoDelayScheduler` も持つが、UI の「間」は gameStore 側の aiSpeed 対応スケジューラを注入 (U9)。
- `cards/handCategory.ts` — `handCategory(cards)→"AKs"|"AKo"|"AA"` (169種レンジ表記、レンジデータのキーと一致)

## テスト

```bash
npx vitest run src/engine/                              # 全19テスト (Phase 1 完了)
npx vitest run src/engine/cards/HandEvaluator.test.ts   # HandEvaluator変更後に必ず実行
```
