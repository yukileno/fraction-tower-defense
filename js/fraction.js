/**
 * 分数計算・通分・約分コアモジュール（小学校5年生算数学習用）
 */

// 最大公約数 (Greatest Common Divisor)
export function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a || 1;
}

// 最小公倍数 (Least Common Multiple)
export function lcm(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  if (a === 0 || b === 0) return 0;
  return Math.floor((a * b) / gcd(a, b));
}

/**
 * 分数クラス
 */
export class Fraction {
  /**
   * @param {number} num 分子 (Numerator)
   * @param {number} den 分母 (Denominator)
   * @param {number} whole 整数部分 (帯分数の場合)
   */
  constructor(num, den, whole = 0) {
    if (den === 0) throw new Error('分母を0にすることはできません');
    this.whole = Math.floor(whole);
    this.num = Math.floor(num);
    this.den = Math.floor(den);

    // 負の分母の正規化
    if (this.den < 0) {
      this.den = -this.den;
      this.num = -this.num;
    }
  }

  // 仮分数としての分子を取得（帯分数を考慮）
  get improperNumerator() {
    return this.whole * this.den + this.num;
  }

  // 小数値を取得
  valueOf() {
    return this.improperNumerator / this.den;
  }

  // 約分（既約分数化）
  simplify() {
    const totalNum = this.improperNumerator;
    if (totalNum === 0) {
      return new Fraction(0, 1, 0);
    }
    const g = gcd(totalNum, this.den);
    const reducedNum = totalNum / g;
    const reducedDen = this.den / g;

    return new Fraction(reducedNum, reducedDen, 0);
  }

  // 帯分数形式で既約分数化
  toMixed() {
    const simplified = this.simplify();
    const whole = Math.floor(simplified.num / simplified.den);
    const remNum = simplified.num % simplified.den;
    return new Fraction(remNum, simplified.den, whole);
  }

  // 加算
  add(other) {
    const l = lcm(this.den, other.den);
    const m1 = l / this.den;
    const m2 = l / other.den;
    const newNum = (this.improperNumerator * m1) + (other.improperNumerator * m2);
    return new Fraction(newNum, l, 0);
  }

  // 減算
  subtract(other) {
    const l = lcm(this.den, other.den);
    const m1 = l / this.den;
    const m2 = l / other.den;
    const newNum = (this.improperNumerator * m1) - (other.improperNumerator * m2);
    return new Fraction(newNum, l, 0);
  }

  // 数学的に等しいか判定
  equals(other) {
    return this.improperNumerator * other.den === other.improperNumerator * this.den;
  }

  // 既約分数として完全に一致しているか判定
  strictlyEquals(other) {
    const s1 = this.simplify();
    const s2 = other.simplify();
    return s1.num === s2.num && s1.den === s2.den;
  }

  // 約分が必要な状態か判定
  canBeSimplified() {
    const g = gcd(this.improperNumerator, this.den);
    return g > 1 && this.improperNumerator !== 0;
  }

  toString() {
    if (this.whole > 0 && this.num > 0) {
      return `${this.whole}と${this.num}/${this.den}`;
    }
    return `${this.improperNumerator}/${this.den}`;
  }
}
