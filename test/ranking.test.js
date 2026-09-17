import assert from 'node:assert';
import { RankingManager } from '../js/ranking.js';

// localStorage モック
const storage = {};
globalThis.localStorage = {
  getItem: (key) => storage[key] || null,
  setItem: (key, val) => { storage[key] = String(val); },
  removeItem: (key) => { delete storage[key]; }
};

console.log('--- Testing RankingManager ---');

const rm = new RankingManager();

// 1. 初期状態チェック
const initialScores = rm.getLocalScores();
assert.ok(initialScores.length > 0, 'Initial sample scores should exist');
console.log('✅ Initial scores loaded properly');

// 2. スコア保存（新規登録）
rm.saveLocalScore({
  name: '勇者タカシ',
  score: 4500,
  wave: 5,
  defeated: 18,
  combo: 9
});

const scoresAfterNew = rm.getLocalScores();
const foundNew = scoresAfterNew.find(s => s.name === '勇者タカシ');
assert.ok(foundNew, 'New score should be stored');
assert.strictEqual(foundNew.score, 4500);
assert.strictEqual(scoresAfterNew[0].score >= scoresAfterNew[1].score, true, 'Scores should be sorted descending');
console.log('✅ New score registered and sorted descending');

// 3. スコア更新（同名でのUPSERT: 高いスコアで更新）
rm.saveLocalScore({
  name: '勇者タカシ',
  score: 6000,
  wave: 7,
  defeated: 28,
  combo: 14
});

const scoresAfterHigher = rm.getLocalScores();
const countTakashi = scoresAfterHigher.filter(s => s.name === '勇者タカシ').length;
assert.strictEqual(countTakashi, 1, 'Should NOT create duplicate rows for same player');
const updatedTakashi = scoresAfterHigher.find(s => s.name === '勇者タカシ');
assert.strictEqual(updatedTakashi.score, 6000, 'Score should be updated to higher value');
assert.strictEqual(scoresAfterHigher[0].name, '勇者タカシ', 'Top score should be Takashi');
console.log('✅ UPSERT logic verified (high score updated, no duplicates)');

// 4. スコア更新（同名での低いスコアは更新されない）
rm.saveLocalScore({
  name: '勇者タカシ',
  score: 3000,
  wave: 3
});

const scoresAfterLower = rm.getLocalScores();
const takashiAfterLower = scoresAfterLower.find(s => s.name === '勇者タカシ');
assert.strictEqual(takashiAfterLower.score, 6000, 'Score should remain 6000 (lower score ignored)');
console.log('✅ Lower score does not overwrite existing high score');

// 5. submitScore のテスト
await rm.submitScore({
  name: 'アリス',
  score: 3200,
  wave: 4,
  defeated: 12,
  combo: 6
});

assert.strictEqual(rm.getLastPlayerName(), 'アリス', 'Player name should be remembered');
const aliceScore = rm.getLocalScores().find(s => s.name === 'アリス');
assert.ok(aliceScore, 'Alice score should be saved in local storage');
console.log('✅ submitScore successfully saved local record and remembered name');

// 6. GAS URL 設定とリセット
const customUrl = 'https://custom.gas.url/exec';
rm.setGasUrl(customUrl);
assert.strictEqual(rm.getGasUrl(), customUrl, 'Custom GAS URL should be saved');

rm.setGasUrl('');
assert.ok(rm.getGasUrl().includes('script.google.com'), 'Resetting should restore default GAS URL');
console.log('✅ GAS URL setter and reset verified');

console.log('\nAll RankingManager tests passed successfully! 🏆');
