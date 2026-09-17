/**
 * 分数計算・生成エンジンの自動テスト
 */
import { gcd, lcm, Fraction } from '../js/fraction.js';
import { generateProblem, validateAnswer, DIFFICULTY_LEVELS } from '../js/generator.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`❌ FAIL: ${message}`);
  }
}

console.log('--- 1. GCD / LCM Tests ---');
assert(gcd(4, 6) === 2, 'gcd(4, 6) == 2');
assert(gcd(12, 18) === 6, 'gcd(12, 18) == 6');
assert(gcd(7, 13) === 1, 'gcd(7, 13) == 1');
assert(lcm(4, 6) === 12, 'lcm(4, 6) == 12');
assert(lcm(6, 8) === 24, 'lcm(6, 8) == 24');
assert(lcm(3, 5) === 15, 'lcm(3, 5) == 15');
assert(lcm(2, 4) === 4, 'lcm(2, 4) == 4');

console.log('--- 2. Fraction Operations Tests ---');
const f1 = new Fraction(1, 2);
const f2 = new Fraction(1, 3);
const sum = f1.add(f2);
assert(sum.num === 5 && sum.den === 6, '1/2 + 1/3 = 5/6');

const f3 = new Fraction(3, 4);
const f4 = new Fraction(1, 6);
const diff = f3.subtract(f4);
assert(diff.num === 7 && diff.den === 12, '3/4 - 1/6 = 7/12');

const fReduce = new Fraction(4, 6);
assert(fReduce.canBeSimplified() === true, '4/6 can be simplified');
const simplified = fReduce.simplify();
assert(simplified.num === 2 && simplified.den === 3, '4/6 simplifies to 2/3');

const fMixed = new Fraction(7, 4);
const mixed = fMixed.toMixed();
assert(mixed.whole === 1 && mixed.num === 3 && mixed.den === 4, '7/4 to mixed is 1 and 3/4');

console.log('--- 3. Problem Generator Tests (100 runs per level) ---');
for (let lvl = 1; lvl <= 5; lvl++) {
  for (let i = 0; i < 100; i++) {
    const p = generateProblem(lvl);
    assert(p.fraction1.den > 0 && p.fraction2.den > 0, `Valid denoms on lvl ${lvl}`);
    assert(p.rawResult.improperNumerator >= 0, `Non-negative result on lvl ${lvl}`);
    assert(p.simplifiedResult.den > 0, `Valid simplified result on lvl ${lvl}`);
    assert(!p.simplifiedResult.canBeSimplified(), `Simplified result is truly irreducible on lvl ${lvl}`);

    // Verify answer validation
    const correctVal = validateAnswer(p, p.simplifiedResult.num, p.simplifiedResult.den, p.simplifiedResult.whole);
    assert(correctVal.isCorrect, `Correct answer should validate as correct (problem: ${p.fraction1.toString()} ${p.opSymbol} ${p.fraction2.toString()})`);

    // Verify unsimplified answer detection if applicable
    if (p.rawResult.canBeSimplified()) {
      const unsimplifiedVal = validateAnswer(p, p.rawResult.improperNumerator, p.rawResult.den, 0);
      assert(unsimplifiedVal.isCorrect === false && unsimplifiedVal.status === 'needs_reduction',
        `Unreduced answer should trigger needs_reduction feedback`);
    }

    // Verify denominator-addition common mistake detection
    const wrongDen = p.fraction1.den + p.fraction2.den;
    const testNum = 999; // A numerator that won't accidentally equal the simplified answer
    const commonMistakeVal = validateAnswer(p, testNum, wrongDen, 0);
    if (wrongDen !== p.simplifiedResult.den) {
      assert(commonMistakeVal.status === 'mistake_added_denominators',
        `Added denominators mistake should be flagged`);
    }
  }
}

console.log(`\n============================`);
console.log(`Tests finished! Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('All 500+ math tests passed cleanly! ✅');
}
