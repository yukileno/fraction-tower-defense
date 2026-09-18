/**
 * 家庭訪問ウォーズ 〜迫りくるワタナベ先生を分数魔法で押し返せ！〜
 * メインゲームエンジン
 */
import { generateProblem, validateAnswer } from './generator.js';
import { sound } from './audio.js';
import { TEACHER_IMAGE_DATA, BEAM_SPRITE_DATA, HOUSE_IMAGE_DATA, CHILD_SPRITE_DATA, PIXEL_BG_DATA, TEACHER_WALK_SPRITE_DATA, CHILD_HERO_SPRITE_DATA } from './assets.js';

// 古いブラウザ用 roundRect ポリフィル
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, radii = 0) {
    const r = typeof radii === 'number' ? radii : (Array.isArray(radii) ? radii[0] : 0);
    this.beginPath();
    this.moveTo(x + r, y);
    this.lineTo(x + w - r, y);
    this.quadraticCurveTo(x + w, y, x + w, y + r);
    this.lineTo(x + w, y + h - r);
    this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.lineTo(x + r, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - r);
    this.lineTo(x, y + r);
    this.quadraticCurveTo(x, y, x + r, y);
    this.closePath();
    return this;
  };
}

export class TowerDefenseGame {
  constructor(canvas, uiElements) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    this.ui = uiElements || {};

    // ゲーム基本状態
    this.score = 0;
    this.highScore = parseInt((typeof localStorage !== 'undefined' && localStorage.getItem('fraction_td_highscore')) || '0', 10);
    this.combo = 0;
    this.maxCombo = 0;
    this.questionsCleared = 0;
    this.mistakesCount = 0;
    this.elapsedTime = 0;
    this.phase = 1;

    this.mp = 0;
    this.maxMp = 100;

    this.isPaused = false;
    this.isGameOver = false;

    // 先生キャラクター（単一ボス）
    this.teacher = {
      distance: 80.0,
      baseSpeed: 0.57,
      currentSpeed: 0.57,
      angerMultiplier: 1.0,
      angerLevel: 0.0,
      walkCycle: 0,
      knockbackVelocity: 0,
      knockbackTimer: 0,
      image: null,
      imageLoaded: false
    };

    if (typeof Image !== 'undefined') {
      this.teacher.image = new Image();
      this.teacher.image.onload = () => {
        this.teacher.imageLoaded = true;
      };
      this.teacher.image.src = TEACHER_IMAGE_DATA;
      if (this.teacher.image.complete) {
        this.teacher.imageLoaded = true;
      }
    }

    // ビーム & 爆発 VFX スプライトシート (4x4, 16フレーム)
    this.beamSprite = {
      image: null,
      loaded: false,
      cols: 4,
      rows: 4,
      frameWidth: 128,
      frameHeight: 128
    };

    if (typeof Image !== 'undefined' && BEAM_SPRITE_DATA) {
      this.beamSprite.image = new Image();
      this.beamSprite.image.onload = () => {
        this.beamSprite.loaded = true;
      };
      this.beamSprite.image.src = BEAM_SPRITE_DATA;
      if (this.beamSprite.image.complete) {
        this.beamSprite.loaded = true;
      }
    }

    // ピクセルアート背景画像 (1024x573)
    this.pixelBgImage = null;
    this.pixelBgLoaded = false;
    if (typeof Image !== 'undefined' && PIXEL_BG_DATA) {
      this.pixelBgImage = new Image();
      this.pixelBgImage.onload = () => {
        this.pixelBgLoaded = true;
      };
      this.pixelBgImage.src = PIXEL_BG_DATA;
      if (this.pixelBgImage.complete) {
        this.pixelBgLoaded = true;
      }
    }

    // 先生歩行スプライトシート (6フレーム: 720x270, 各フレーム 120x270)
    this.teacherWalkSprite = {
      image: null,
      loaded: false,
      frameWidth: 120,
      frameHeight: 270,
      totalFrames: 6
    };
    if (typeof Image !== 'undefined' && TEACHER_WALK_SPRITE_DATA) {
      this.teacherWalkSprite.image = new Image();
      this.teacherWalkSprite.image.onload = () => {
        this.teacherWalkSprite.loaded = true;
      };
      this.teacherWalkSprite.image.src = TEACHER_WALK_SPRITE_DATA;
      if (this.teacherWalkSprite.image.complete) {
        this.teacherWalkSprite.loaded = true;
      }
    }

    // 子供ヒーロースプライトシート (2フレーム: 280x170, 0=構え待機, 1=ビーム詠唱攻撃)
    this.childHeroSprite = {
      image: null,
      loaded: false,
      frameWidth: 140,
      frameHeight: 170,
      totalFrames: 2
    };
    if (typeof Image !== 'undefined' && CHILD_HERO_SPRITE_DATA) {
      this.childHeroSprite.image = new Image();
      this.childHeroSprite.image.onload = () => {
        this.childHeroSprite.loaded = true;
      };
      this.childHeroSprite.image.src = CHILD_HERO_SPRITE_DATA;
      if (this.childHeroSprite.image.complete) {
        this.childHeroSprite.loaded = true;
      }
    }

    this.currentProblem = null;

    this.projectiles = [];
    this.spriteExplosions = [];
    this.particles = [];
    this.shockwaves = [];
    this.floatingTexts = [];
    this.ambientSparks = [];

    this.isFrozen = false;
    this.freezeTimer = 0;

    this.shakeIntensity = 0;
    this.flashAlpha = 0;
    this.dangerPulse = 0;

    this.battleHistory = [];

    this.pathStart = { x: 580, y: 100, scale: 0.35 };
    this.pathEnd = { x: 130, y: 310, scale: 1.65 };

    this.player = {
      x: 70,
      y: 330,
      ringAngle1: 0,
      ringAngle2: 0,
      castAnim: 0,
      breathTime: 0
    };

    this.lastTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (this.canvas) {
      this.initCanvasSize();
      this.initAmbientEffects();
      if (typeof window !== 'undefined') {
        window.addEventListener('resize', () => this.initCanvasSize());
      }
    }
  }

  initCanvasSize() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect ? this.canvas.getBoundingClientRect() : null;
    if (rect && rect.width > 0 && rect.height > 0) {
      this.canvas.width = rect.width;
      this.canvas.height = rect.height;
    } else {
      this.canvas.width = 640;
      this.canvas.height = 420;
    }
  }

  initAmbientEffects() {
    this.ambientSparks = [];
    const w = (this.canvas && this.canvas.width) || 640;
    const h = (this.canvas && this.canvas.height) || 420;
    for (let i = 0; i < 25; i++) {
      this.ambientSparks.push({
        x: Math.random() * w,
        y: Math.random() * h,
        size: Math.random() * 2 + 1,
        speedY: -(Math.random() * 0.4 + 0.2),
        speedX: (Math.random() - 0.5) * 0.3,
        alpha: Math.random() * 0.7 + 0.2
      });
    }
  }

  start() {
    this.reset();
    this.spawnNextProblem();
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.gameLoop(t));
  }

  reset() {
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.questionsCleared = 0;
    this.mistakesCount = 0;
    this.elapsedTime = 0;
    this.phase = 1;
    this.mp = 0;
    this.isPaused = false;
    this.isGameOver = false;

    this.teacher.distance = 80.0;
    this.teacher.baseSpeed = 0.57;
    this.teacher.currentSpeed = 0.57;
    this.teacher.angerMultiplier = 1.0;
    this.teacher.angerLevel = 0.0;
    this.teacher.walkCycle = 0;
    this.teacher.knockbackVelocity = 0;
    this.teacher.knockbackTimer = 0;

    this.projectiles = [];
    this.spriteExplosions = [];
    this.particles = [];
    this.shockwaves = [];
    this.floatingTexts = [];
    this.battleHistory = [];

    this.updateUI();
  }

  spawnNextProblem() {
    let level = Math.min(5, Math.floor(this.questionsCleared / 10) + 1);
    this.currentProblem = generateProblem(level);
    this.currentProblem.level = level;
    if (typeof this.ui.onProblemChange === 'function') {
      this.ui.onProblemChange(this.currentProblem);
    }
    if (typeof this.ui.onTargetChange === 'function') {
      this.ui.onTargetChange({ problem: this.currentProblem });
    }
    return this.currentProblem;
  }

  getCurrentProblem() {
    return this.currentProblem;
  }

  updatePhaseAndSpeed() {
    this.phase = Math.min(5, Math.floor(this.questionsCleared / 10) + 1);

    if (this.phase === 1) {
      this.teacher.baseSpeed = 0.57;
    } else if (this.phase === 2) {
      this.teacher.baseSpeed = 0.83;
    } else if (this.phase === 3) {
      this.teacher.baseSpeed = 1.23;
    } else if (this.phase === 4) {
      this.teacher.baseSpeed = 1.77;
    } else if (this.phase === 5) {
      const overtime = Math.max(0, this.elapsedTime - 200);
      this.teacher.baseSpeed = 2.4 + overtime * 0.01;
    }

    this.teacher.currentSpeed = this.teacher.baseSpeed * this.teacher.angerMultiplier;
  }

  submitAnswer(num, den, whole = 0) {
    return this.answer(num, den, whole);
  }

  answer(arg1, arg2, arg3) {
    if (this.isGameOver || !this.currentProblem) return { status: 'none' };

    let userNum, userDen, userWhole = 0;
    if (typeof arg1 === 'object' && arg1 !== null) {
      userNum = arg1.num;
      userDen = arg1.den;
      userWhole = arg1.whole || 0;
    } else {
      userNum = arg1;
      userDen = arg2;
      userWhole = arg3 || 0;
    }

    const problem = this.currentProblem;
    const validation = validateAnswer(problem, userNum, userDen, userWhole);
    const userAnswerObj = { num: userNum, den: userDen, whole: userWhole };

    if (validation.isCorrect) {
      this.onCorrectAnswer(problem, userAnswerObj);
      return { 
        status: 'correct', 
        problem, 
        message: validation.message || '💨 正解！先生を押し返した！' 
      };
    } else if (validation.status === 'needs_reduction') {
      sound.playWrong();
      return { 
        status: 'needs_reduction', 
        almost: true,
        message: validation.message 
      };
    } else if (validation.status === 'mistake_added_denominators') {
      sound.playWrong();
      return { 
        status: 'error_den', 
        message: validation.message 
      };
    } else {
      this.onWrongAnswer(problem, userAnswerObj);
      return { 
        status: 'wrong', 
        message: validation.message || 'ざんねん！計算をもう一度見直してみよう！' 
      };
    }
  }

  onCorrectAnswer(problem, userAnswer = null) {
    this.questionsCleared++;
    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;

    const basePoints = 100 * this.phase;
    const comboBonus = Math.min(200, (this.combo - 1) * 20);
    const earnedScore = basePoints + comboBonus;
    this.score += earnedScore;

    this.mp = Math.min(this.maxMp, this.mp + 15);

    let basePush = 13.0;
    if (this.phase === 2) basePush = 11.0;
    if (this.phase === 3) basePush = 9.5;
    if (this.phase === 4) basePush = 8.0;
    if (this.phase === 5) {
      const overtime = Math.max(0, this.elapsedTime - 200);
      basePush = Math.max(4.0, 7.0 - overtime * 0.01);
    }
    const comboPush = Math.min(3.0, (this.combo - 1) * 0.3);
    const totalPush = basePush + comboPush;

    this.teacher.distance = Math.min(100.0, this.teacher.distance + totalPush);
    this.teacher.knockbackVelocity = totalPush;
    this.teacher.knockbackTimer = 0.5;

    this.teacher.angerLevel = Math.max(0, this.teacher.angerLevel - 0.15);

    const teacherPos = this.getTeacherRenderPosition();

    // コンボに応じたビームのカラー・太さ・演出強化
    let beamGlowColor = '#38bdf8'; // シアン
    let beamCoreColor = '#e0f2fe';
    let beamWidth = 26;
    let shakePower = 15;
    let flashPower = 0.35;

    if (this.combo >= 6) {
      // ハイパーコンボ: ソーラーゴールド＆虹色プラズマ
      beamGlowColor = '#f59e0b';
      beamCoreColor = '#fef08a';
      beamWidth = 48;
      shakePower = 25;
      flashPower = 0.65;
    } else if (this.combo >= 3) {
      // ミドルコンボ: アメジスト＆マゼンタ
      beamGlowColor = '#a855f7';
      beamCoreColor = '#f472b6';
      beamWidth = 34;
      shakePower = 18;
      flashPower = 0.45;
    }

    sound.playHit();
    this.triggerShake(shakePower);
    this.flashAlpha = flashPower;
    this.player.castAnim = 1.0;

    const playerPos = this.getPlayerRenderPosition();
    const startX = playerPos.handX;
    const startY = playerPos.handY;
    const targetX = teacherPos.chestX || teacherPos.x;
    const targetY = teacherPos.chestY || (teacherPos.y - 40);

    this.projectiles.push({
      startX,
      startY,
      targetX,
      targetY,
      x: startX,
      y: startY,
      progress: 0,
      speed: 4.5,
      beamWidth,
      glowColor: beamGlowColor,
      coreColor: beamCoreColor,
      lightningBolts: this.generateLightningPoints(startX, startY, targetX, targetY),
      combo: this.combo,
      hitTriggered: false
    });

    this.floatingTexts.push({
      text: `💨 +${totalPush.toFixed(1)}m 押し返した！`,
      x: teacherPos.x,
      y: (teacherPos.y - (teacherPos.drawH || 60)) - 30,
      alpha: 1.0,
      vy: -1.5,
      color: '#38bdf8',
      size: 18
    });

    this.floatingTexts.push({
      text: `+${earnedScore}`,
      x: teacherPos.x,
      y: (teacherPos.y - (teacherPos.drawH || 60)) - 55,
      alpha: 1.0,
      vy: -2.0,
      color: '#fbbf24',
      size: 20
    });

    this.createExplosion(targetX, targetY, '#818cf8', 25);

    const safeAnswer = userAnswer || {
      num: problem.simplifiedResult.num,
      den: problem.simplifiedResult.den,
      whole: problem.simplifiedResult.whole || 0
    };

    this.battleHistory.push({
      problem: problem,
      isCorrect: true,
      cleared: true,
      userAnswer: safeAnswer,
      phase: this.phase,
      distance: this.teacher.distance
    });

    this.updatePhaseAndSpeed();
    this.spawnNextProblem();
    this.updateUI();
  }

  onWrongAnswer(problem, userAnswer = null) {
    this.combo = 0;
    this.mistakesCount++;

    this.teacher.angerMultiplier += 0.18;
    this.teacher.angerLevel = Math.min(1.0, this.teacher.angerLevel + 0.35);

    this.teacher.distance = Math.max(0, this.teacher.distance - 5.0);

    sound.playWrong();
    this.triggerShake(18);
    this.dangerPulse = 1.0;

    const teacherPos = this.getTeacherRenderPosition();

    this.floatingTexts.push({
      text: '😡 先生が怒ってスピードUP!!',
      x: teacherPos.x,
      y: teacherPos.y - 40,
      alpha: 1.0,
      vy: -1.5,
      color: '#ef4444',
      size: 18
    });

    this.createExplosion(teacherPos.x, teacherPos.y, '#f87171', 15);

    const safeAnswer = userAnswer || { num: 0, den: 1, whole: 0 };

    this.battleHistory.push({
      problem: problem,
      isCorrect: false,
      cleared: false,
      userAnswer: safeAnswer,
      phase: this.phase,
      distance: this.teacher.distance
    });

    this.updatePhaseAndSpeed();
    this.updateUI();

    if (this.teacher.distance <= 0) {
      this.gameOver();
    }
  }

  useFreeze() {
    if (this.mp < 50 || this.isFrozen || this.isGameOver) return false;
    this.mp -= 50;
    this.isFrozen = true;
    this.freezeTimer = 4.0;
    sound.playFreeze();

    const teacherPos = this.getTeacherRenderPosition();
    this.floatingTexts.push({
      text: '🍵 お母さんのお茶出しトラップ！（足止め）',
      x: (this.canvas ? this.canvas.width : 640) / 2,
      y: 120,
      alpha: 1.0,
      vy: -1.0,
      color: '#34d399',
      size: 20
    });

    this.createExplosion(teacherPos.chestX || teacherPos.x, teacherPos.chestY || teacherPos.y, '#34d399', 30);
    this.updateUI();
    return true;
  }

  useMeteor() {
    if (this.mp < 100 || this.isGameOver) return false;
    this.mp -= 100;
    sound.playMeteor();
    this.triggerShake(25);
    this.flashAlpha = 0.8;

    this.teacher.distance = Math.min(100.0, this.teacher.distance + 25.0);
    this.teacher.knockbackVelocity = 25.0;
    this.teacher.knockbackTimer = 0.8;

    const teacherPos = this.getTeacherRenderPosition();
    this.floatingTexts.push({
      text: '📄 宿題プリント大嵐！ 超ノックバック！',
      x: (this.canvas ? this.canvas.width : 640) / 2,
      y: 140,
      alpha: 1.0,
      vy: -1.0,
      color: '#fbbf24',
      size: 22
    });

    this.createExplosion(teacherPos.chestX || teacherPos.x, teacherPos.chestY || teacherPos.y, '#f59e0b', 50);
    this.updateUI();
    return true;
  }

  useSkillFreeze() {
    return this.useFreeze();
  }

  useSkillMeteor() {
    return this.useMeteor();
  }

  triggerShake(intensity) {
    this.shakeIntensity = intensity;
  }

  createExplosion(x, y, color, count = 20) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 5 + 2;
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() * 4 + 2,
        color: color,
        alpha: 1.0,
        decay: Math.random() * 0.03 + 0.02
      });
    }
    this.shockwaves.push({
      x: x,
      y: y,
      radius: 10,
      color: color,
      alpha: 0.8
    });
  }

  generateLightningPoints(x1, y1, x2, y2, segments = 12, jitter = 18) {
    const points = [];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      let x = x1 + dx * t;
      let y = y1 + dy * t;
      if (i > 0 && i < segments) {
        const offset = (Math.random() - 0.5) * 2 * jitter;
        x += nx * offset;
        y += ny * offset;
      }
      points.push({ x, y });
    }
    return points;
  }

  createBeamImpact(x, y, color, combo = 1) {
    // 1. スプライト爆発アニメーション（コマ4〜15）
    this.spriteExplosions.push({
      x: x,
      y: y,
      frame: 4,
      maxFrame: 15,
      timer: 0,
      frameDuration: 0.032,
      scale: 1.5 + Math.min(1.0, (combo - 1) * 0.2),
      rotation: (Math.random() - 0.5) * 0.5,
      color: color
    });

    // 2. 四方八方に飛び散るプラズマスパーク粒子（35〜60個）
    const count = 35 + Math.min(30, (combo - 1) * 6);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 9 + 3;
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.5,
        size: Math.random() * 6 + 2,
        color: i % 2 === 0 ? color : '#ffffff',
        alpha: 1.0,
        decay: Math.random() * 0.04 + 0.025
      });
    }

    // 3. 多重ショックウェーブリング
    this.shockwaves.push({
      x: x,
      y: y,
      radius: 14,
      color: color,
      alpha: 1.0
    });
    this.shockwaves.push({
      x: x,
      y: y,
      radius: 6,
      color: '#ffffff',
      alpha: 0.95
    });
  }

  getPlayerRenderPosition() {
    const w = (this.canvas && this.canvas.width) || 1024;
    const h = (this.canvas && this.canvas.height) || 573;
    const scale = Math.min(w / 1024, h / 573) * 0.95;
    const px = w * 0.25;
    const py = h * 0.77;
    const handX = px + (48 * scale);
    const handY = py - (86 * scale);
    return { x: px, y: py, handX, handY, scale };
  }

  getTeacherRenderPosition() {
    const w = (this.canvas && this.canvas.width) || 1024;
    const h = (this.canvas && this.canvas.height) || 573;

    // 道路のアスファルト中央を正確に通るウェイポイント（比率座標）
    // 進行度 progress = 0.0 (最遠 80m) 〜 1.0 (我が家玄関前 0m)
    const waypoints = [
      { t: 0.00, x: 0.81, y: 0.22, scale: 0.35 }, // 坂の頂上（ガードレール内側）
      { t: 0.20, x: 0.86, y: 0.33, scale: 0.45 }, // 坂上部（右カーブアスファルト中央）
      { t: 0.45, x: 0.86, y: 0.47, scale: 0.58 }, // 坂中腹（広いアスファルト中央）
      { t: 0.65, x: 0.77, y: 0.62, scale: 0.72 }, // ガードレールが途切れる手前のアスファルト
      { t: 0.82, x: 0.60, y: 0.76, scale: 0.85 }, // 坂を下りきって我が家前道路へ曲がる
      { t: 1.00, x: 0.42, y: 0.83, scale: 1.00 }  // 男の子の前（家庭訪問突入）
    ];

    const progress = Math.max(0, Math.min(1.0, (80.0 - this.teacher.distance) / 80.0));

    // 区間検索と滑らかな補間（Smoothstep）
    let i = 0;
    while (i < waypoints.length - 1 && progress > waypoints[i + 1].t) {
      i++;
    }
    const pA = waypoints[i];
    const pB = waypoints[Math.min(waypoints.length - 1, i + 1)];
    const segRange = pB.t - pA.t;
    const segT = segRange > 0 ? (progress - pA.t) / segRange : 0;
    const smoothT = segT * segT * (3 - 2 * segT);

    let x = (pA.x + (pB.x - pA.x) * smoothT) * w;
    let y = (pA.y + (pB.y - pA.y) * smoothT) * h;
    const scale = pA.scale + (pB.scale - pA.scale) * smoothT;

    // ノックバック演出（上流方向・斜め右上へ押し戻される）
    if (this.teacher.knockbackTimer > 0) {
      const kb = this.teacher.knockbackTimer * 28 * scale;
      x += kb * 0.75;
      y -= kb * 0.5;
    }

    // 歩行の上下揺れ
    const bobbing = Math.sin(this.teacher.walkCycle * 2.5) * 4 * scale;
    y += bobbing;

    const drawW = 120 * scale;
    const drawH = 270 * scale;
    const chestX = x;
    const chestY = y - (drawH * 0.55);

    return { x, y, scale, progress, drawW, drawH, chestX, chestY };
  }

  gameLoop(timestamp) {
    if (this.isPaused) return;
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1);
    this.lastTime = timestamp;

    this.update(dt);
    this.render();

    if (!this.isGameOver && typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame((t) => this.gameLoop(t));
    }
  }

  update(dt) {
    if (this.isGameOver) return;

    this.elapsedTime += dt;
    this.updatePhaseAndSpeed();

    if (this.isFrozen) {
      this.freezeTimer -= dt;
      if (this.freezeTimer <= 0) {
        this.isFrozen = false;
      }
    } else {
      if (this.teacher.knockbackTimer > 0) {
        this.teacher.knockbackTimer -= dt;
      } else {
        this.teacher.distance -= this.teacher.currentSpeed * dt;
        this.teacher.walkCycle += dt * (this.teacher.currentSpeed * 3.5);
      }
    }

    if (this.teacher.angerLevel > 0) {
      this.teacher.angerLevel = Math.max(0, this.teacher.angerLevel - dt * 0.05);
    }

    if (this.teacher.distance <= 0) {
      this.teacher.distance = 0;
      this.gameOver();
      return;
    }

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.progress += dt * 4.5;
      p.x = p.startX + (p.targetX - p.startX) * p.progress;
      p.y = p.startY + (p.targetY - p.startY) * p.progress;
      if (p.progress >= 1.0) {
        if (!p.hitTriggered) {
          p.hitTriggered = true;
          this.createBeamImpact(p.targetX, p.targetY, p.glowColor, p.combo || 1);
        }
        this.projectiles.splice(i, 1);
      }
    }

    for (let i = this.spriteExplosions.length - 1; i >= 0; i--) {
      const exp = this.spriteExplosions[i];
      exp.timer += dt;
      if (exp.timer >= exp.frameDuration) {
        exp.timer -= exp.frameDuration;
        exp.frame++;
        if (exp.frame > exp.maxFrame) {
          this.spriteExplosions.splice(i, 1);
        }
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.alpha -= pt.decay;
      if (pt.alpha <= 0) this.particles.splice(i, 1);
    }

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.radius += dt * 180;
      sw.alpha -= dt * 1.5;
      if (sw.alpha <= 0) this.shockwaves.splice(i, 1);
    }

    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y += ft.vy;
      ft.alpha -= dt * 0.8;
      if (ft.alpha <= 0) this.floatingTexts.splice(i, 1);
    }

    if (this.shakeIntensity > 0) this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 25);
    if (this.flashAlpha > 0) this.flashAlpha = Math.max(0, this.flashAlpha - dt * 2.0);
    if (this.dangerPulse > 0) this.dangerPulse = Math.max(0, this.dangerPulse - dt * 1.5);

    this.player.ringAngle1 += dt * 1.5;
    this.player.ringAngle2 -= dt * 2.0;
    this.player.breathTime = (this.player.breathTime || 0) + dt * 2.5;
    if (this.player.castAnim > 0) {
      this.player.castAnim = Math.max(0, this.player.castAnim - dt * 2.5);
    }

    for (const sp of this.ambientSparks) {
      sp.y += sp.speedY;
      sp.x += sp.speedX;
      if (sp.y < 0 && this.canvas) {
        sp.y = this.canvas.height;
        sp.x = Math.random() * this.canvas.width;
      }
    }

    this.updateUI();
  }

  gameOver() {
    this.isGameOver = true;
    sound.playGameOver();

    if (typeof localStorage !== 'undefined' && this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('fraction_td_highscore', String(this.highScore));
    }

    if (typeof this.ui.onGameOver === 'function') {
      this.ui.onGameOver({
        score: this.score,
        highScore: this.highScore,
        questionsCleared: this.questionsCleared,
        totalDefeated: this.questionsCleared,
        maxCombo: this.maxCombo,
        elapsedTime: Math.round(this.elapsedTime),
        phase: this.phase,
        wave: `第${this.phase}段階`,
        history: this.battleHistory,
        battleHistory: this.battleHistory
      });
    }
  }

  updateUI() {
    if (this.ui.scoreDisplay) this.ui.scoreDisplay.textContent = this.score.toLocaleString();
    if (this.ui.highScoreDisplay) this.ui.highScoreDisplay.textContent = this.highScore.toLocaleString();
    if (this.ui.comboDisplay) this.ui.comboDisplay.textContent = this.combo;

    if (this.ui.distanceDisplay) {
      this.ui.distanceDisplay.textContent = `${this.teacher.distance.toFixed(1)}m`;
    }

    if (this.ui.waveDisplay) {
      this.ui.waveDisplay.textContent = `第${this.phase}段階 (${this.questionsCleared}問)`;
    }

    if (this.ui.mpBar) {
      this.ui.mpBar.style.width = `${(this.mp / this.maxMp) * 100}%`;
    }
    if (this.ui.mpText) {
      this.ui.mpText.textContent = `${Math.round((this.mp / this.maxMp) * 100)}%`;
    }

    if (typeof this.ui.updateHUD === 'function') {
      this.ui.updateHUD({
        score: this.score,
        highScore: this.highScore,
        combo: this.combo,
        distance: this.teacher.distance,
        phase: this.phase,
        wave: this.phase,
        questionsCleared: this.questionsCleared,
        mp: this.mp,
        maxMp: this.maxMp,
        isFrozen: this.isFrozen
      });
    }
  }

  render() {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.save();

    if (this.shakeIntensity > 0) {
      const sx = (Math.random() - 0.5) * this.shakeIntensity;
      const sy = (Math.random() - 0.5) * this.shakeIntensity;
      ctx.translate(sx, sy);
    }

    this.renderBackground(ctx, w, h);
    this.renderPath(ctx, w, h);
    this.renderAmbientSparks(ctx);
    this.renderTeacher(ctx);
    this.renderProjectiles(ctx);
    this.renderSpriteExplosions(ctx);
    this.renderParticles(ctx);
    this.renderShockwaves(ctx);
    this.renderPlayer(ctx);
    this.renderFloatingTexts(ctx);
    this.renderScreenOverlays(ctx, w, h);

    ctx.restore();
  }

  renderBackground(ctx, w, h) {
    if (this.pixelBgLoaded && this.pixelBgImage) {
      // ユーザー提供の美麗ピクセルアート背景 (夕暮れ和風住宅・坂道)
      ctx.drawImage(this.pixelBgImage, 0, 0, w, h);
      return;
    }

    // フォールバック: プロシージャル夜空グラデーション
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.7);
    skyGrad.addColorStop(0, '#090d16');
    skyGrad.addColorStop(0.6, '#151d30');
    skyGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.shadowColor = '#fef08a';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#fef9c3';
    ctx.beginPath();
    ctx.arc(w * 0.15, 60, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.65);
    ctx.lineTo(w * 0.1, h * 0.55);
    ctx.lineTo(w * 0.25, h * 0.62);
    ctx.lineTo(w * 0.4, h * 0.52);
    ctx.lineTo(w * 0.55, h * 0.6);
    ctx.lineTo(w * 0.75, h * 0.5);
    ctx.lineTo(w, h * 0.62);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    const groundGrad = ctx.createLinearGradient(0, h * 0.55, 0, h);
    groundGrad.addColorStop(0, '#134e4a');
    groundGrad.addColorStop(0.5, '#064e3b');
    groundGrad.addColorStop(1, '#022c22');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, h * 0.55, w, h * 0.45);
  }

  renderPath(ctx, w, h) {
    if (this.pixelBgLoaded && this.pixelBgImage) {
      // ピクセルアート背景には既に美麗な坂道が描かれているためスキップ
      return;
    }

    ctx.save();
    const pStart = this.pathStart;
    const pEnd = this.pathEnd;

    ctx.beginPath();
    ctx.moveTo(pStart.x - 20, pStart.y);
    ctx.lineTo(pStart.x + 20, pStart.y);
    ctx.lineTo(pEnd.x + 90, pEnd.y + 40);
    ctx.lineTo(pEnd.x - 70, pEnd.y + 40);
    ctx.closePath();

    const pathGrad = ctx.createLinearGradient(pStart.x, pStart.y, pEnd.x, pEnd.y);
    pathGrad.addColorStop(0, '#fde68a');
    pathGrad.addColorStop(0.5, '#fed7aa');
    pathGrad.addColorStop(1, '#ffedd5');
    ctx.fillStyle = pathGrad;
    ctx.shadowColor = '#f59e0b';
    ctx.shadowBlur = 10;
    ctx.fill();

    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 1.5;
    for (let i = 1; i <= 6; i++) {
      const t = i / 7;
      const x1 = (pStart.x - 20) + (pEnd.x - 70 - (pStart.x - 20)) * t;
      const y1 = pStart.y + (pEnd.y + 40 - pStart.y) * t;
      const x2 = (pStart.x + 20) + (pEnd.x + 90 - (pStart.x + 20)) * t;
      const y2 = y1;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();
  }

  renderAmbientSparks(ctx) {
    ctx.save();
    for (const sp of this.ambientSparks) {
      ctx.fillStyle = `rgba(167, 139, 250, ${sp.alpha})`;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sp.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  renderTeacher(ctx) {
    const pos = this.getTeacherRenderPosition();
    const t = this.teacher;
    const isWalkSprite = this.teacherWalkSprite && this.teacherWalkSprite.loaded && this.teacherWalkSprite.image;
    const baseW = (isWalkSprite ? 120 : 100) * pos.scale * 1.1;
    const baseH = (isWalkSprite ? 270 : 100) * pos.scale * 1.1;

    ctx.save();
    ctx.translate(pos.x, pos.y);

    // 1. 接地影（道路へのドロップシャドウ）
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 0, baseW * 0.45, Math.max(4, baseH * 0.05), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 2. 怒り演出（黒い楕円は描かず、スプライト背後を赤〜紫に発光）
    if (t.angerLevel > 0.05 || t.angerMultiplier > 1.1) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const auraPulse = (Math.sin(performance.now() * 0.01) + 1) * 0.5;
      const isEnraged = t.angerMultiplier > 1.3;
      const glowGrad = ctx.createRadialGradient(0, -baseH * 0.5, 5, 0, -baseH * 0.5, baseW * 0.8 + auraPulse * 10);
      glowGrad.addColorStop(0, isEnraged ? 'rgba(239, 68, 68, 0.45)' : 'rgba(168, 85, 247, 0.35)');
      glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(0, -baseH * 0.5, baseW * 0.8 + auraPulse * 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (t.knockbackTimer > 0) {
      ctx.rotate(-0.08);
      ctx.translate(0, -6);
    }

    // 3. 先生スプライト描画
    if (isWalkSprite) {
      // 6フレーム歩行アニメーション
      const frameIdx = Math.floor(t.walkCycle * 2.2) % 6;
      const sw = this.teacherWalkSprite.frameWidth || 120;
      const sh = this.teacherWalkSprite.frameHeight || 270;
      const sx = frameIdx * sw;
      const sy = 0;
      ctx.drawImage(this.teacherWalkSprite.image, sx, sy, sw, sh, -baseW / 2, -baseH, baseW, baseH);
    } else if (t.imageLoaded && t.image) {
      ctx.drawImage(t.image, -baseW / 2, -baseH, baseW, baseH);
    } else {
      ctx.fillStyle = '#4f46e5';
      ctx.fillRect(-baseW / 2, -baseH, baseW, baseH);
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.max(12, 14 * pos.scale)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('渡部先生', 0, -baseH * 0.5);
    }

    // 4. ネームプレート「渡部先生」
    ctx.save();
    const nameY = -baseH - 8;
    const namePlateW = Math.max(90, 105 * pos.scale);
    const namePlateH = Math.max(22, 25 * pos.scale);
    const namePlateR = 5;

    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = t.angerMultiplier > 1.3 ? '#ef4444' : '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-namePlateW / 2, nameY - namePlateH, namePlateW, namePlateH, namePlateR);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = t.angerMultiplier > 1.3 ? '#dc2626' : '#0f172a';
    ctx.font = `bold ${Math.max(12, 13 * pos.scale)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const teacherName = t.angerMultiplier > 1.3 ? '🔥 渡部先生' : '渡部先生';
    ctx.fillText(teacherName, 0, nameY - namePlateH / 2);
    ctx.restore();

    // 5. 吹き出し「家庭訪問じゃぁ～」
    ctx.save();
    const bubbleText = t.angerMultiplier > 1.3 ? '家庭訪問じゃぁ〜!!' : '家庭訪問じゃぁ～';
    const bubbleScale = Math.min(1.2, Math.max(0.85, pos.scale));
    const bubbleH = Math.max(26, 28 * bubbleScale);
    const bubbleW = Math.max(128, 136 * bubbleScale);
    const bubbleY = nameY - namePlateH - bubbleH - 10;

    const jitter = t.angerMultiplier > 1.3 ? (Math.random() - 0.5) * 3 : Math.sin(performance.now() * 0.006) * 2;
    ctx.translate(0, jitter);

    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 5;
    ctx.fillStyle = t.angerMultiplier > 1.3 ? '#fef2f2' : '#ffffff';
    ctx.strokeStyle = t.angerMultiplier > 1.3 ? '#ef4444' : '#0f172a';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.roundRect(-bubbleW / 2, bubbleY, bubbleW, bubbleH, 8);
    ctx.fill();
    ctx.stroke();

    // フキダシのしっぽ
    ctx.beginPath();
    ctx.moveTo(-5, bubbleY + bubbleH);
    ctx.lineTo(0, bubbleY + bubbleH + 6);
    ctx.lineTo(5, bubbleY + bubbleH);
    ctx.closePath();
    ctx.fillStyle = ctx.fillStyle;
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = t.angerMultiplier > 1.3 ? '#dc2626' : '#0f172a';
    ctx.font = `bold ${Math.max(11, 13 * bubbleScale)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(bubbleText, 0, bubbleY + bubbleH / 2);
    ctx.restore();

    ctx.restore();
  }

  renderPlayer(ctx) {
    const playerPos = this.getPlayerRenderPosition();
    const scale = playerPos.scale;
    const isCasting = this.player.castAnim > 0;
    const isHeroSprite = this.childHeroSprite && this.childHeroSprite.loaded && this.childHeroSprite.image;

    ctx.save();
    ctx.translate(playerPos.x, playerPos.y);

    // 1. フォールバック時の家描画（ピクセルアート背景が無い場合のみ）
    if (!this.pixelBgLoaded || !this.pixelBgImage) {
      if (this.houseImage && this.houseImageLoaded) {
        ctx.save();
        ctx.drawImage(this.houseImage, -80, -145, 160, 160);
        ctx.restore();
      }
    }

    // 2. 足元の回転魔法陣（作成イメージ.jpg に完全一致する青白い楕円魔法陣）
    ctx.save();
    const circleRx = 68 * scale;
    const circleRy = 25 * scale;
    ctx.scale(1, circleRy / circleRx); // 楕円パースペクティブ
    ctx.rotate(this.player.ringAngle1);

    // 魔法陣のネオングロー
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = isCasting ? 22 : 12;
    ctx.strokeStyle = isCasting ? 'rgba(56, 189, 248, 0.95)' : 'rgba(56, 189, 248, 0.65)';
    ctx.lineWidth = isCasting ? 2.5 : 1.5;

    // 外枠二重円
    ctx.beginPath();
    ctx.arc(0, 0, circleRx, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, circleRx * 0.88, 0, Math.PI * 2);
    ctx.stroke();

    // 内側の幾何学模様（六芒星）
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3;
      const x = Math.cos(a) * circleRx * 0.88;
      const y = Math.sin(a) * circleRx * 0.88;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3 + Math.PI;
      const x = Math.cos(a) * circleRx * 0.88;
      const y = Math.sin(a) * circleRx * 0.88;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    // 中心部の発光
    const innerGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, circleRx * 0.7);
    innerGrad.addColorStop(0, isCasting ? 'rgba(224, 242, 254, 0.6)' : 'rgba(56, 189, 248, 0.25)');
    innerGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = innerGrad;
    ctx.beginPath();
    ctx.arc(0, 0, circleRx * 0.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // 3. 子供キャラクターの描画
    const breathOffset = isCasting ? 0 : Math.sin(this.player.breathTime || 0) * 2;
    const recoilX = isCasting ? -Math.sin(this.player.castAnim * Math.PI) * 8 : 0;
    const recoilY = isCasting ? Math.sin(this.player.castAnim * Math.PI) * 2 : 0;

    if (isHeroSprite) {
      // ユーザー提供の子供スプライト（Frame 0: 構え待機, Frame 1: 作成イメージ.jpg の両手突き出し攻撃）
      const frameIdx = isCasting ? 1 : 0;
      const sw = this.childHeroSprite.frameWidth || 140;
      const sh = this.childHeroSprite.frameHeight || 170;
      const sx = frameIdx * sw;
      const sy = 0;

      const drawW = sw * scale * 1.15;
      const drawH = sh * scale * 1.15;
      // 男の子の足元が (0, 0) に来るように配置
      const drawX = recoilX - (drawW * 0.42);
      const drawY = recoilY + breathOffset - drawH + (12 * scale);

      ctx.drawImage(this.childHeroSprite.image, sx, sy, sw, sh, drawX, drawY, drawW, drawH);
    } else if (this.childSprite.loaded) {
      const childSource = this.childSprite.canvas || this.childSprite.image;
      const frameIdx = isCasting ? 1 : 0;
      ctx.drawImage(childSource, frameIdx * 256, 0, 256, 256, -40, -80, 80, 80);
    }

    // 4. 手元のアークシールド & マズルフラッシュ（作成イメージ.jpg の弧状シールド）
    const handOffsetX = (48 * scale) + recoilX;
    const handOffsetY = (-86 * scale) + recoilY + breathOffset;

    if (isCasting) {
      ctx.save();
      ctx.translate(handOffsetX, handOffsetY);
      ctx.globalCompositeOperation = 'lighter';

      // 弧状のアークシールド（前方に広がる三日月・円弧状の光輪）
      ctx.save();
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 20;
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = 4 * scale;
      ctx.beginPath();
      ctx.arc(0, 0, 42 * scale, -Math.PI * 0.45, Math.PI * 0.45);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
      ctx.lineWidth = 10 * scale;
      ctx.beginPath();
      ctx.arc(0, 0, 42 * scale, -Math.PI * 0.4, Math.PI * 0.4);
      ctx.stroke();
      ctx.restore();

      // 手元の強烈な発光球
      const auraGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, 36 * this.player.castAnim * scale);
      auraGrad.addColorStop(0, '#ffffff');
      auraGrad.addColorStop(0.3, 'rgba(56, 189, 248, 0.95)');
      auraGrad.addColorStop(0.7, 'rgba(147, 51, 234, 0.5)');
      auraGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = auraGrad;
      ctx.beginPath();
      ctx.arc(0, 0, 36 * this.player.castAnim * scale, 0, Math.PI * 2);
      ctx.fill();

      // 十字スターフレア
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 2.5 * scale;
      const flareLen = 32 * this.player.castAnim * scale;
      ctx.beginPath();
      ctx.moveTo(-flareLen, 0);
      ctx.lineTo(flareLen, 0);
      ctx.moveTo(0, -flareLen);
      ctx.lineTo(0, flareLen);
      ctx.stroke();

      ctx.restore();
    } else {
      // 待機時の手元の淡い魔力光球
      ctx.save();
      ctx.translate(handOffsetX - 15 * scale, handOffsetY + 15 * scale);
      ctx.globalCompositeOperation = 'lighter';
      const pulse = (Math.sin(performance.now() * 0.006) + 1) * 0.5;
      const sphereGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, 12 * scale + pulse * 4);
      sphereGrad.addColorStop(0, '#ffffff');
      sphereGrad.addColorStop(0.4, 'rgba(56, 189, 248, 0.8)');
      sphereGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = sphereGrad;
      ctx.beginPath();
      ctx.arc(0, 0, 12 * scale + pulse * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  renderProjectiles(ctx) {
    if (!this.projectiles || this.projectiles.length === 0) return;
    ctx.save();
    // ネオン発光成分を加算合成で極めて鮮やかに描画
    ctx.globalCompositeOperation = 'lighter';

    for (const p of this.projectiles) {
      const startX = p.startX;
      const startY = p.startY;
      const currentX = p.x;
      const currentY = p.y;
      const glowColor = p.glowColor || '#38bdf8';
      const coreColor = p.coreColor || '#e0f2fe';
      const beamWidth = p.beamWidth || 28;

      // 1. マズルフラッシュ（魔法陣先端の強烈な放射光球と光芒）
      const muzzleGrad = ctx.createRadialGradient(startX, startY, 2, startX, startY, beamWidth * 1.5);
      muzzleGrad.addColorStop(0, '#ffffff');
      muzzleGrad.addColorStop(0.3, coreColor);
      muzzleGrad.addColorStop(0.7, glowColor);
      muzzleGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = muzzleGrad;
      ctx.beginPath();
      ctx.arc(startX, startY, beamWidth * 1.5, 0, Math.PI * 2);
      ctx.fill();

      // 十字スターフレア
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(startX - beamWidth * 1.8, startY);
      ctx.lineTo(startX + beamWidth * 1.8, startY);
      ctx.moveTo(startX, startY - beamWidth * 1.8);
      ctx.lineTo(startX, startY + beamWidth * 1.8);
      ctx.stroke();

      // 2. 多重プラズマレーザー主砲
      // レイヤーA: 巨大アウターグローオーラ
      ctx.save();
      ctx.strokeStyle = glowColor;
      ctx.lineWidth = beamWidth * 1.6;
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 25;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(currentX, currentY);
      ctx.stroke();
      ctx.restore();

      // レイヤーB: インナービームボディ
      ctx.save();
      ctx.strokeStyle = coreColor;
      ctx.lineWidth = beamWidth * 0.7;
      ctx.shadowColor = coreColor;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(currentX, currentY);
      ctx.stroke();
      ctx.restore();

      // レイヤーC: 超高熱ホワイトコア
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(3, beamWidth * 0.25);
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(currentX, currentY);
      ctx.stroke();

      // 3. レーザーに巻き付く放電稲妻ボルト（2本の暴れる電撃）
      for (let b = 0; b < 2; b++) {
        const jitterAmount = 14 + b * 8;
        const lightning = this.generateLightningPoints(startX, startY, currentX, currentY, 10, jitterAmount);
        ctx.strokeStyle = b === 0 ? '#ffffff' : coreColor;
        ctx.lineWidth = b === 0 ? 2.0 : 3.0;
        ctx.beginPath();
        if (lightning.length > 0) {
          ctx.moveTo(lightning[0].x, lightning[0].y);
          for (let j = 1; j < lightning.length; j++) {
            ctx.lineTo(lightning[j].x, lightning[j].y);
          }
        }
        ctx.stroke();
      }

      // 4. 先端スプライトヘッド（スプライトシート コマ0〜3の回転エネルギー渦）
      if (this.beamSprite && this.beamSprite.loaded && this.beamSprite.image) {
        const headFrame = Math.floor(performance.now() * 0.018) % 4;
        const fw = this.beamSprite.frameWidth;
        const fh = this.beamSprite.frameHeight;
        const inset = 8;
        const sx = headFrame * fw + inset;
        const sy = inset;
        const sw = fw - inset * 2;
        const sh = fh - inset * 2;
        const headSize = Math.max(80, beamWidth * 3.2);

        ctx.save();
        ctx.translate(currentX, currentY);
        ctx.rotate(performance.now() * 0.006);

        // 円形マスクでセルの四隅のコマ番号やグリッド線を完全に遮断
        ctx.beginPath();
        ctx.arc(0, 0, headSize * 0.48, 0, Math.PI * 2);
        ctx.clip();

        ctx.drawImage(
          this.beamSprite.image,
          sx, sy, sw, sh,
          -headSize / 2, -headSize / 2, headSize, headSize
        );
        ctx.restore();
      } else {
        // スプライト未読み込み時のフォールバック発光球
        const headGrad = ctx.createRadialGradient(currentX, currentY, 4, currentX, currentY, beamWidth * 1.6);
        headGrad.addColorStop(0, '#ffffff');
        headGrad.addColorStop(0.4, coreColor);
        headGrad.addColorStop(0.8, glowColor);
        headGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = headGrad;
        ctx.beginPath();
        ctx.arc(currentX, currentY, beamWidth * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  renderSpriteExplosions(ctx) {
    if (!this.spriteExplosions || this.spriteExplosions.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (const exp of this.spriteExplosions) {
      if (this.beamSprite && this.beamSprite.loaded && this.beamSprite.image) {
        const col = exp.frame % this.beamSprite.cols;
        const row = Math.floor(exp.frame / this.beamSprite.cols);
        const fw = this.beamSprite.frameWidth;
        const fh = this.beamSprite.frameHeight;
        const inset = 8;
        const sx = col * fw + inset;
        const sy = row * fh + inset;
        const sw = fw - inset * 2;
        const sh = fh - inset * 2;
        const drawSize = 150 * (exp.scale || 1.5);

        ctx.save();
        ctx.translate(exp.x, exp.y);
        ctx.rotate(exp.rotation || 0);

        // 円形マスクでセルの四隅のコマ番号や境界グリッド線を完全除去
        ctx.beginPath();
        ctx.arc(0, 0, drawSize * 0.44, 0, Math.PI * 2);
        ctx.clip();

        ctx.drawImage(
          this.beamSprite.image,
          sx, sy, sw, sh,
          -drawSize / 2, -drawSize / 2, drawSize, drawSize
        );

        ctx.restore();
      } else {
        // 画像未完了時のフォールバック爆発描画
        ctx.save();
        ctx.translate(exp.x, exp.y);
        const progress = Math.min(1, Math.max(0, (exp.frame - 4) / 12));
        const radius = (35 + progress * 75) * (exp.scale || 1.0);
        const alpha = Math.max(0, 1.0 - progress);
        ctx.fillStyle = exp.color || '#38bdf8';
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  renderParticles(ctx) {
    ctx.save();
    for (const pt of this.particles) {
      ctx.fillStyle = pt.color;
      ctx.globalAlpha = Math.max(0, pt.alpha);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  renderShockwaves(ctx) {
    ctx.save();
    for (const sw of this.shockwaves) {
      ctx.strokeStyle = sw.color;
      ctx.lineWidth = 3;
      ctx.globalAlpha = Math.max(0, sw.alpha);
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  renderFloatingTexts(ctx) {
    ctx.save();
    for (const ft of this.floatingTexts) {
      ctx.fillStyle = ft.color;
      ctx.font = `bold ${ft.size}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 6;
      ctx.globalAlpha = Math.max(0, ft.alpha);
      ctx.fillText(ft.text, ft.x, ft.y);
    }
    ctx.restore();
  }

  renderScreenOverlays(ctx, w, h) {
    if (this.teacher.distance < 20.0) {
      const dangerRatio = 1.0 - (this.teacher.distance / 20.0);
      const pulse = (Math.sin(performance.now() * 0.008) + 1) * 0.5;
      const alpha = dangerRatio * 0.35 * pulse;
      ctx.fillStyle = `rgba(220, 38, 38, ${alpha})`;
      ctx.fillRect(0, 0, w, h);

      if (this.teacher.distance < 12.0) {
        ctx.save();
        ctx.fillStyle = '#ef4444';
        ctx.font = 'black 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 8;
        ctx.fillText(`🚨 緊急警告！ 玄関まで あと ${this.teacher.distance.toFixed(1)}m！ 🚨`, w / 2, 45);
        ctx.restore();
      }
    }

    if (this.flashAlpha > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${this.flashAlpha})`;
      ctx.fillRect(0, 0, w, h);
    }

    if (this.dangerPulse > 0) {
      ctx.fillStyle = `rgba(239, 68, 68, ${this.dangerPulse * 0.4})`;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.save();
    const barW = Math.min(280, w * 0.55);
    const barH = 14;
    const barX = (w - barW) / 2;
    const barY = 12;

    // 半透明ダークスモーク背景
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
    ctx.roundRect(barX, barY, barW, barH, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const fillRatio = Math.max(0, Math.min(1, this.teacher.distance / 100.0));
    let fillColor = '#10b981';
    if (fillRatio < 0.25) fillColor = '#ef4444';
    else if (fillRatio < 0.55) fillColor = '#f59e0b';

    ctx.fillStyle = fillColor;
    ctx.roundRect(barX + 2, barY + 2, (barW - 4) * fillRatio, barH - 4, 5);
    ctx.fill();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 6;
    ctx.fillText(`🚪 家庭訪問まで あと ${this.teacher.distance.toFixed(1)}m`, w / 2, barY + barH + 15);
    ctx.restore();
  }
}