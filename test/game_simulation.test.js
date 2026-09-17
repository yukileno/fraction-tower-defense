/**
 * ゲームエンジン & 出題シミュレーションテスト
 */
import { Fraction, gcd, lcm } from '../js/fraction.js';
import { generateProblem, validateAnswer, DIFFICULTY_LEVELS } from '../js/generator.js';

console.log('=== 1. ゲームセッション模擬テスト ===');

let totalScore = 0;
let combo = 0;
let maxCombo = 0;
let lives = 3;
let mp = 0;

for (let wave = 1; wave <= 5; wave++) {
  console.log(`\n--- Wave ${wave} ---`);
  const enemyCount = 3 + wave;

  for (let e = 0; e < enemyCount; e++) {
    const isBoss = (wave === 5 && e === enemyCount - 1);
    const problem = generateProblem(isBoss ? 5 : wave);

    // ユーザーの正解シミュレーション
    const ans = problem.simplifiedResult;
    const res = validateAnswer(problem, ans.num, ans.den, ans.whole);

    if (!res.isCorrect) {
      console.error(`❌ エラー: 正解が不正と判定されました:`, problem, ans);
      process.exit(1);
    }

    combo++;
    if (combo > maxCombo) maxCombo = combo;
    mp = Math.min(100, mp + 25);

    const comboMult = 1 + Math.min(combo - 1, 10) * 0.15;
    const pts = Math.floor(150 * comboMult);
    totalScore += pts;

    // 必殺技テスト
    if (mp >= 100) {
      // メテオストライク
      mp -= 100;
      totalScore += 200;
    }
  }

  // Wave Clear Bonus
  totalScore += 500;
}

console.log(`Simulation finished successfully!`);
console.log(`Final Score: ${totalScore}`);
console.log(`Max Combo: ${maxCombo}`);
console.log(`Lives remaining: ${lives}`);

console.log('\n=== 2. 約分忘れ（惜しい判定）テスト ===');
// 2/4 = 1/2 のような約分未済ケース
const unreducedProblem = {
  isAddition: true,
  fraction1: new Fraction(1, 4),
  fraction2: new Fraction(1, 4),
  rawResult: new Fraction(2, 4),
  simplifiedResult: new Fraction(1, 2),
  commonDen: 4
};
const unreducedCheck = validateAnswer(unreducedProblem, 2, 4, 0);
if (unreducedCheck.status !== 'needs_reduction') {
  console.error('❌ 約分忘れが検知されませんでした:', unreducedCheck);
  process.exit(1);
} else {
  console.log('✅ 約分忘れ検知（惜しい！メッセージ）正常:', unreducedCheck.message);
}

console.log('\n=== 3. 分母足し算ミス検知テスト ===');
const denomMistakeCheck = validateAnswer(unreducedProblem, 2, 8, 0);
if (denomMistakeCheck.status !== 'mistake_added_denominators') {
  console.error('❌ 分母足し算ミスが検知されませんでした:', denomMistakeCheck);
  process.exit(1);
} else {
  console.log('✅ 分母足し算ミス検知正常:', denomMistakeCheck.message);
}

console.log('\nAll simulation tests passed with flying colors! 🚀');
