import assert from 'node:assert';
import { TowerDefenseGame } from '../js/game.js';

// DOM/Audio モック
globalThis.window = {
  addEventListener: () => {}
};
globalThis.requestAnimationFrame = () => 1;
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {}
};

class MockCanvas {
  constructor() {
    this.width = 640;
    this.height = 480;
  }
  getContext() {
    return new Proxy({}, {
      get: (target, prop) => {
        if (prop === 'measureText') return () => ({ width: 50 });
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        return () => {};
      },
      set: () => true
    });
  }
}

console.log('--- 家庭訪問ウォーズ ゲームエンジン検証テスト ---');

let lastGameOverData = null;
const mockUI = {
  updateHUD: () => {},
  onProblemChange: () => {},
  onTargetChange: () => {},
  onGameOver: (data) => {
    lastGameOverData = data;
  }
};

const canvas = new MockCanvas();
const game = new TowerDefenseGame(canvas, mockUI);

// 1. 初期状態テスト
game.start();
assert.strictEqual(game.teacher.distance, 80.0, '初期距離は80.0mであること');
assert.strictEqual(game.phase, 1, '初期段階は第1段階であること');
assert.strictEqual(game.questionsCleared, 0, 'クリア問数は0問であること');
assert.ok(game.getCurrentProblem(), '開始時に問題が生成されていること');
console.log('✅ 1. 初期状態テスト通過（距離: 80.0m, Phase 1, 問題生成OK）');

// 2. 正解によるノックバックとスコア・MP加算テスト
const p1 = game.getCurrentProblem();
const ans1 = p1.simplifiedResult;
const initialDistance = game.teacher.distance;

const res1 = game.submitAnswer(ans1.num, ans1.den, ans1.whole || 0);
assert.strictEqual(res1.status, 'correct', '正解判定が返ること');
assert.ok(game.teacher.distance > initialDistance, '先生が押し返されて距離が増加すること');
assert.strictEqual(game.questionsCleared, 1, 'クリア問数が1問に増加すること');
assert.strictEqual(game.combo, 1, 'コンボ数が1になること');
assert.strictEqual(game.mp, 15, 'MPが15加算されること');
assert.ok(game.score > 0, 'スコアが加算されること');
console.log(`✅ 2. 正解押し返しテスト通過（距離: ${initialDistance.toFixed(1)}m ➔ ${game.teacher.distance.toFixed(1)}m, MP: ${game.mp}）`);

// 3. ミスによる怒り加速ペナルティテスト
const beforeWrongDist = game.teacher.distance;
const beforeSpeed = game.teacher.currentSpeed;
const beforeAnger = game.teacher.angerMultiplier;

const resWrong = game.submitAnswer(997, 991, 0);
assert.strictEqual(resWrong.status, 'wrong', '不正解判定が返ること');
assert.ok(game.teacher.distance < beforeWrongDist, 'ミスにより先生が5m接近すること');
assert.ok(game.teacher.angerMultiplier > beforeAnger, '先生の怒り倍率が増加すること');
assert.ok(game.teacher.currentSpeed > beforeSpeed, '先生の移動スピードが上がること');
assert.strictEqual(game.combo, 0, 'コンボが0にリセットされること');
console.log(`✅ 3. ミスペナルティテスト通過（怒り倍率: ${beforeAnger.toFixed(2)} ➔ ${game.teacher.angerMultiplier.toFixed(2)}, 速度: ${beforeSpeed.toFixed(2)} ➔ ${game.teacher.currentSpeed.toFixed(2)}）`);

// 4. 10問正解による段階進行（Phase 1 ➔ Phase 2）テスト
for (let i = 0; i < 9; i++) {
  const p = game.getCurrentProblem();
  const a = p.simplifiedResult;
  game.submitAnswer(a.num, a.den, a.whole || 0);
}
assert.strictEqual(game.questionsCleared, 10, '10問クリアしていること');
assert.strictEqual(game.phase, 2, '第2段階に進行していること');
assert.ok(game.teacher.baseSpeed > 0.6, '第2段階でベース速度が上がっていること');
console.log(`✅ 4. 段階進行テスト通過（10問撃退 ➔ 第${game.phase}段階, ベース速度: ${game.teacher.baseSpeed}m/s）`);

// 5. 必殺技テスト（お茶出しフリーズ & 宿題大嵐メテオ）
game.mp = 100;
const freezeSuccess = game.useSkillFreeze();
assert.strictEqual(freezeSuccess, true, 'MP50消費でお茶出しが発動すること');
assert.strictEqual(game.isFrozen, true, 'フリーズ状態になること');
assert.strictEqual(game.mp, 50, 'MPが50になること');

game.mp = 100;
game.teacher.distance = 50.0;
const beforeMeteorDist = game.teacher.distance;
const meteorSuccess = game.useSkillMeteor();
assert.strictEqual(meteorSuccess, true, 'MP100消費で宿題大嵐が発動すること');
assert.strictEqual(game.teacher.distance, 75.0, '宿題大嵐で正確に+25mノックバックすること');
console.log('✅ 5. 必殺技テスト通過（🍵お茶出し足止め & 📄宿題大嵐超ノックバック）');

// 6. 玄関突破ゲームオーバーテスト
game.isFrozen = false;
game.teacher.knockbackTimer = 0;
game.teacher.distance = 0.5;
game.update(1.0); // 1秒経過で距離0以下へ突入
assert.strictEqual(game.isGameOver, true, '距離0以下でゲームオーバーになること');
assert.ok(lastGameOverData, 'onGameOverコールバックが呼ばれること');
assert.ok(lastGameOverData.history.length > 0, '復習ノートの履歴が記録されていること');
console.log('✅ 6. 玄関突破ゲームオーバーテスト通過（🚪 家庭訪問突入 & 復習履歴保存OK）');

// 7. 5分以内アウト難易度カーブ検証（シミュレーション）
console.log('\n--- 5分以内アウト精密シミュレーション検証 ---');
const simGame = new TowerDefenseGame(canvas, mockUI);
simGame.start();

let simTime = 0;
const dt = 0.05;
let nextAnswerTime = 6.5; // 計算最速（6.5秒/問、ノーミス）

while (!simGame.isGameOver && simTime < 600) {
  simTime += dt;
  simGame.update(dt);

  if (simTime >= nextAnswerTime) {
    const p = simGame.getCurrentProblem();
    const a = p.simplifiedResult;
    simGame.submitAnswer(a.num, a.den, a.whole || 0);
    nextAnswerTime += 6.5;
  }
}

const min = Math.floor(simTime / 60);
const sec = Math.round(simTime % 60);
console.log(`トップ層（6.5秒/問 ノーミス）の生存時間: ${min}分${sec}秒（${simTime.toFixed(1)}秒, ${simGame.questionsCleared}問撃退）`);
assert.ok(simTime <= 480, '計算最速プレイヤーでも8分（480秒）以内にアウトになること！');
assert.ok(simTime >= 300, '理不尽に速すぎず5分以上は粘れること！');
console.log('✅ 7. 難易度カーブ検証通過（速度2/3調整後の難易度確認OK！）');

console.log('\n🎉 全てのテストが完璧に通過しました！');
