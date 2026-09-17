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

const mockUI = {
  onHUDUpdate: () => {},
  onTargetChange: () => {},
  onGameOver: () => {}
};

console.log('--- Testing Wave & Spawn Logic ---');

const canvas = new MockCanvas();
const game = new TowerDefenseGame(canvas, mockUI);

// 1. ウェーブ1の開始テスト
game.start();
assert.strictEqual(game.wave, 1, 'Wave should be 1');
assert.strictEqual(game.monsters.length, 1, 'First monster should be spawned immediately');
assert.ok(game.monstersToSpawn.length > 0, 'Remaining monsters should be in queue');

const initialSpawnQueueCount = game.monstersToSpawn.length;
console.log(`Initial monsters on field: ${game.monsters.length}, queued: ${initialSpawnQueueCount}`);

// 2. モンスター撃破時の即時（700ms以内）スポーンテスト
const firstMonster = game.monsters[0];
game.defeatMonster(firstMonster);

assert.strictEqual(game.monsters.length, 0, 'Field should be empty right after defeat');
assert.ok(game.spawnTimer >= game.spawnInterval - 700, 'spawnTimer should jump to near spawnInterval');

// gameLoop の更新テスト (dt = 0.8s)
game.lastTime = performance.now();
game.gameLoop(performance.now() + 800);

// 画面が0体だったので、次のモンスターが即座にスポーンしているはず！
assert.strictEqual(game.monsters.length, 1, 'Next monster should spawn rapidly when field was empty');
console.log('✅ Monster defeat rapid spawn test passed!');

// 3. 城ダメージ時のウェーブクリア進行テスト（最後の敵が城に到達した場合）
// 残りのスポーン待ちモンスターをすべて空にして、画面上の敵を1体だけにする
game.monstersToSpawn = [];
assert.strictEqual(game.monsters.length, 1, 'Exactly 1 monster on field');

const lastMonster = game.monsters[0];
let waveClearCalled = false;
const originalOnWaveClear = game.onWaveClear.bind(game);
game.onWaveClear = () => {
  waveClearCalled = true;
  originalOnWaveClear();
};

// 城に到達！
game.onCastleDamage(lastMonster);

assert.strictEqual(game.monsters.length, 0, 'No monsters on field');
assert.strictEqual(game.lives, 2, 'Life reduced by 1');
assert.strictEqual(waveClearCalled, true, 'onWaveClear MUST be called even if last monster breaches the castle!');
console.log('✅ Castle breach wave progression test passed!');

// 4. 次のウェーブ（Wave 2）が自動開始されて敵が出るかのテスト
// onWaveClear 内の setTimeout (2800ms) をシミュレート
assert.strictEqual(game.isWaveClear, true, 'isWaveClear flag set');
// 2800ms 経過後のタイマー実行を手動でトリガー
game.wave++;
game.prepareWave(game.wave);

assert.strictEqual(game.wave, 2, 'Should advance to Wave 2');
assert.strictEqual(game.isWaveClear, false, 'isWaveClear reset');
assert.strictEqual(game.monsters.length, 1, 'First monster of Wave 2 spawned');
assert.ok(game.monstersToSpawn.length > 0, 'Wave 2 monsters in queue');
console.log('✅ Wave 2 advance and spawn test passed!');

console.log('\nAll spawn & wave progression tests passed successfully! 🎉');
