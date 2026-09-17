/**
 * 小学校5年生用 分数問題生成モジュール
 */
import { Fraction, gcd, lcm } from './fraction.js';

export const DIFFICULTY_LEVELS = {
  LEVEL1: {
    id: 1,
    name: '基礎通分（倍数関係）',
    description: '大きい方の分母にそろえる通分',
    denPairs: [
      [2, 4], [2, 6], [2, 8], [2, 10],
      [3, 6], [3, 9], [3, 12],
      [4, 8], [4, 12],
      [5, 10]
    ],
    allowMixed: false
  },
  LEVEL2: {
    id: 2,
    name: '基本通分（かけ算）',
    description: '分母同士をかけてそろえる通分',
    denPairs: [
      [2, 3], [2, 5], [2, 7],
      [3, 4], [3, 5], [3, 7],
      [4, 5], [5, 6], [5, 7]
    ],
    allowMixed: false
  },
  LEVEL3: {
    id: 3,
    name: '発展通分（最小公倍数）',
    description: '積より小さい最小公倍数を見つける重要単元',
    denPairs: [
      [4, 6], [6, 8], [6, 9], [6, 10],
      [8, 12], [9, 12], [10, 15], [4, 10]
    ],
    allowMixed: false
  },
  LEVEL4: {
    id: 4,
    name: '約分マスター',
    description: '答えを約分してきれいにする問題',
    denPairs: [
      [2, 6], [3, 6], [4, 6], [6, 8], [4, 12], [6, 12], [8, 12], [10, 15], [5, 10]
    ],
    forceReduction: true,
    allowMixed: false
  },
  LEVEL5: {
    id: 5,
    name: '帯分数・くり下がり（ボス級）',
    description: '帯分数やくり下がりのある引き算',
    denPairs: [
      [2, 3], [2, 4], [3, 4], [3, 6], [4, 6], [6, 8]
    ],
    allowMixed: true
  }
};

/**
 * ランダムな整数を取得 [min, max]
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 配列からランダム選択
 */
function choice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 問題オブジェクトを作成
 */
export function generateProblem(levelId = 1) {
  const config = DIFFICULTY_LEVELS[`LEVEL${Math.min(Math.max(levelId, 1), 5)}`] || DIFFICULTY_LEVELS.LEVEL1;
  const isAddition = Math.random() < 0.55; // 55% 足し算, 45% 引き算
  const pair = choice(config.denPairs);
  let den1 = pair[0];
  let den2 = pair[1];

  // 左右入れ替えをランダムに
  if (Math.random() < 0.5 && !config.allowMixed) {
    [den1, den2] = [den2, den1];
  }

  const commonDen = lcm(den1, den2);

  let f1, f2;
  let attempts = 0;

  while (attempts++ < 100) {
    if (config.allowMixed) {
      // レベル5: 帯分数
      const whole1 = randomInt(1, 2);
      const whole2 = isAddition ? randomInt(0, 1) : 1;
      const num1 = randomInt(1, den1 - 1);
      const num2 = randomInt(1, den2 - 1);

      f1 = new Fraction(num1, den1, whole1);
      f2 = new Fraction(num2, den2, whole2);

      if (!isAddition && f1.valueOf() <= f2.valueOf()) {
        f1 = new Fraction(num1, den1, 2);
        f2 = new Fraction(num2, den2, 1);
      }
    } else {
      // 真分数同士
      const num1 = randomInt(1, den1 - 1);
      const num2 = randomInt(1, den2 - 1);

      f1 = new Fraction(num1, den1, 0);
      f2 = new Fraction(num2, den2, 0);

      // 引き算の場合、必ず f1 > f2 にする
      if (!isAddition && f1.valueOf() <= f2.valueOf()) {
        continue;
      }
    }

    const rawResult = isAddition ? f1.add(f2) : f1.subtract(f2);

    // レベル4（約分必須）の場合、約分可能でなければリトライ
    if (config.forceReduction) {
      if (!rawResult.canBeSimplified()) {
        continue;
      }
    }

    // 問題確定
    const simplifiedResult = rawResult.simplify();
    const mixedResult = rawResult.toMixed();

    // 通分の途中式
    const m1 = commonDen / den1;
    const m2 = commonDen / den2;
    const expandedNum1 = f1.improperNumerator * m1;
    const expandedNum2 = f2.improperNumerator * m2;

    const opSymbol = isAddition ? '+' : '−';
    const opText = isAddition ? '足し算' : '引き算';

    // 解説ステップの構築
    const explanation = {
      lcm: commonDen,
      step1: `${den1}と${den2}の最小公倍数は ${commonDen} です。`,
      step2: `通分すると:\n` +
             `・${f1.toString()} = ${expandedNum1}/${commonDen}\n` +
             `・${f2.toString()} = ${expandedNum2}/${commonDen}`,
      step3: `${isAddition ? '分子をたします' : '分子をひきます'}:\n` +
             `${expandedNum1} ${opSymbol} ${expandedNum2} = ${rawResult.improperNumerator} → ${rawResult.improperNumerator}/${commonDen}`,
      step4: rawResult.canBeSimplified()
        ? `約分します: 最大公約数 ${gcd(rawResult.improperNumerator, commonDen)} でわると、答えは ${simplifiedResult.improperNumerator}/${simplifiedResult.den} になります。`
        : `これ以上約分できないので、答えは ${simplifiedResult.improperNumerator}/${simplifiedResult.den} です。`,
      mixedAnswer: mixedResult.whole > 0 ? `${mixedResult.whole}と${mixedResult.num}/${mixedResult.den}` : null
    };

    return {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      levelId: config.id,
      levelName: config.name,
      isAddition,
      opSymbol,
      opText,
      fraction1: f1,
      fraction2: f2,
      rawResult,           // 通分直後の分数（未約分）
      simplifiedResult,    // 既約仮分数（または整数）
      mixedResult,         // 帯分数表記
      commonDen,
      explanation
    };
  }

  // 万が一ループを抜けた場合のフォールバック
  const fallbackF1 = new Fraction(1, 2);
  const fallbackF2 = new Fraction(1, 3);
  const fallbackRaw = fallbackF1.add(fallbackF2);
  return {
    id: `${Date.now()}_fallback`,
    levelId: 1,
    levelName: '基本',
    isAddition: true,
    opSymbol: '+',
    opText: '足し算',
    fraction1: fallbackF1,
    fraction2: fallbackF2,
    rawResult: fallbackRaw,
    simplifiedResult: fallbackRaw.simplify(),
    mixedResult: fallbackRaw.toMixed(),
    commonDen: 6,
    explanation: {
      lcm: 6,
      step1: '2と3の最小公倍数は6です。',
      step2: '1/2 = 3/6, 1/3 = 2/6',
      step3: '3/6 + 2/6 = 5/6',
      step4: '答えは 5/6 です。',
      mixedAnswer: null
    }
  };
}

/**
 * ユーザーの回答を判定・診断する
 * @param {Object} problem - generateProblemで生成した問題
 * @param {number} userNum - 入力された分子
 * @param {number} userDen - 入力された分母
 * @param {number} userWhole - 入力された整数部分（帯分数の場合。任意）
 */
export function validateAnswer(problem, userNum, userDen, userWhole = 0) {
  if (!userDen || userDen <= 0) {
    return {
      isCorrect: false,
      status: 'invalid_denominator',
      message: '分母に0より大きい数を入力してね！'
    };
  }

  const userAnswer = new Fraction(userNum, userDen, userWhole);
  const correctSimplified = problem.simplifiedResult;
  const rawResult = problem.rawResult;

  // 数学的に値が一致しているか？
  if (userAnswer.equals(correctSimplified)) {
    // 既約分数になっているかチェック
    if (userAnswer.canBeSimplified()) {
      const g = gcd(userAnswer.improperNumerator, userAnswer.den);
      return {
        isCorrect: false,
        status: 'needs_reduction',
        message: `惜しい！計算は合ってるよ！${g} で約分（分子と分母をわる）してみよう！`,
        almost: true
      };
    }

    // 正解！
    return {
      isCorrect: true,
      status: 'correct',
      message: 'せいかい！ナイス計算！'
    };
  }

  // 不正解の場合の親切な診断フィードバック

  // 1. よくある間違い: 分母同士を足し算・引き算してしまった（例: 1/2 + 1/3 = 2/5 や 3/4 - 1/2 = 2/2）
  const denSum = problem.fraction1.den + problem.fraction2.den;
  const denDiff = Math.abs(problem.fraction1.den - problem.fraction2.den);
  if (userDen === denSum || (denDiff > 0 && userDen === denDiff)) {
    return {
      isCorrect: false,
      status: 'mistake_added_denominators',
      message: '分母同士を足したり引いたりしちゃダメだよ！まず「通分」して分母をそろえよう！'
    };
  }

  // 2. 通分したのに分子をそのまま足してしまった（分子に倍数をかけ忘れた）
  const forgotMultiplyNum = problem.isAddition
    ? problem.fraction1.num + problem.fraction2.num
    : problem.fraction1.num - problem.fraction2.num;
  if (userDen === problem.commonDen && userNum === forgotMultiplyNum) {
    return {
      isCorrect: false,
      status: 'mistake_forgot_numerator_multiply',
      message: '分母を大きくしたとき、分子にも同じ数をかけるのを忘れてないかな？'
    };
  }

  // 3. 通分した分母が最小公倍数でも倍数でもない
  if (userDen % problem.fraction1.den !== 0 || userDen % problem.fraction2.den !== 0) {
    return {
      isCorrect: false,
      status: 'mistake_wrong_common_denominator',
      message: `分母がちがうよ！${problem.fraction1.den} と ${problem.fraction2.den} の公倍数（${problem.commonDen}など）にそろえよう！`
    };
  }

  // 4. その他の計算ミス
  return {
    isCorrect: false,
    status: 'wrong_calculation',
    message: 'ちがうみたい！もう一度落ち着いて計算してみよう！'
  };
}
