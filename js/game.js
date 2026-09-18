/**
 * 家庭訪問ウォーズ 〜迫りくるワタナベ先生を分数魔法で押し返せ！〜
 * メインゲームエンジン
 */
import { generateProblem, validateAnswer } from './generator.js';
import { sound } from './audio.js';
import { TEACHER_IMAGE_DATA, BEAM_SPRITE_DATA, HOUSE_IMAGE_DATA, CHILD_SPRITE_DATA } from './assets.js';

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
      baseSpeed: 0.85,
      currentSpeed: 0.85,
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

    // わが家イラスト画像 (512x512)
    this.houseImage = null;
    this.houseImageLoaded = false;
    if (typeof Image !== 'undefined' && HOUSE_IMAGE_DATA) {
      this.houseImage = new Image();
      this.houseImage.onload = () => {
        this.houseImageLoaded = true;
      };
      this.houseImage.src = HOUSE_IMAGE_DATA;
      if (this.houseImage.complete) {
        this.houseImageLoaded = true;
      }
    }

    // 子供の後ろ姿スプライト (512x256, 2フレーム: 0=待機, 1=攻撃魔法詠唱)
    this.childSprite = {
      image: null,
      canvas: null,
      loaded: false,
      frameWidth: 256,
      frameHeight: 256,
      totalFrames: 2
    };

    if (typeof Image !== 'undefined' && CHILD_SPRITE_DATA) {
      this.childSprite.image = new Image();
      const processChildTransparency = () => {
        try {
          if (typeof document !== 'undefined') {
            const c = document.createElement('canvas');
            c.width = this.childSprite.image.naturalWidth || 512;
            c.height = this.childSprite.image.naturalHeight || 256;
            const cCtx = c.getContext('2d');
            cCtx.drawImage(this.childSprite.image, 0, 0);
            const imgData = cCtx.getImageData(0, 0, c.width, c.height);
            const d = imgData.data;
            for (let i = 0; i < d.length; i += 4) {
              // 暗い背景（RGB各値 < 30）を完全透明化
              if (d[i] < 30 && d[i + 1] < 30 && d[i + 2] < 30) {
                d[i + 3] = 0;
              }
            }
            cCtx.putImageData(imgData, 0, 0);
            this.childSprite.canvas = c;
          }
        } catch (e) {
          // フォールバック: そのままの Image を利用
        }
        this.childSprite.loaded = true;
      };

      this.childSprite.image.onload = processChildTransparency;
      this.childSprite.image.src = CHILD_SPRITE_DATA;
      if (this.childSprite.image.complete && this.childSprite.image.naturalWidth > 0) {
        processChildTransparency();
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
    this.teacher.baseSpeed = 0.85;
    this.teacher.currentSpeed = 0.85;
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
      this.teacher.baseSpeed = 0.85;
    } else if (this.phase === 2) {
      this.teacher.baseSpeed = 1.25;
    } else if (this.phase === 3) {
      this.teacher.baseSpeed = 1.85;
    } else if (this.phase === 4) {
      this.teacher.baseSpeed = 2.65;
    } else if (this.phase === 5) {
      const overtime = Math.max(0, this.elapsedTime - 200);
      this.teacher.baseSpeed = 3.6 + overtime * 0.015;
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

    const startX = this.player.x + 58;
    const startY = this.player.y - 24;
    const targetX = teacherPos.x;
    const targetY = teacherPos.y - 25;

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
      y: teacherPos.y - 40,
      alpha: 1.0,
      vy: -1.5,
      color: '#38bdf8',
      size: 18
    });

    this.floatingTexts.push({
      text: `+${earnedScore}`,
      x: teacherPos.x,
      y: teacherPos.y - 70,
      alpha: 1.0,
      vy: -2.0,
      color: '#fbbf24',
      size: 20
    });

    this.createExplosion(teacherPos.x, teacherPos.y, '#818cf8', 25);

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

    this.createExplosion(teacherPos.x, teacherPos.y, '#34d399', 30);
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

    this.createExplosion(teacherPos.x, teacherPos.y, '#f59e0b', 50);
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

  getTeacherRenderPosition() {
    const progress = Math.max(0, Math.min(1, 1.0 - (this.teacher.distance / 100.0)));
    const x = this.pathStart.x + (this.pathEnd.x - this.pathStart.x) * progress;
    const y = this.pathStart.y + (this.pathEnd.y - this.pathStart.y) * progress;
    const scale = this.pathStart.scale + (this.pathEnd.scale - this.pathStart.scale) * progress;
    const bobbing = Math.sin(this.teacher.walkCycle) * 6 * scale;
    return { x, y: y + bobbing, scale, progress };
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
    const baseW = 100 * pos.scale;
    const baseH = 100 * pos.scale;

    ctx.save();
    ctx.translate(pos.x, pos.y);

    if (t.angerLevel > 0.05 || t.angerMultiplier > 1.2) {
      ctx.save();
      const auraPulse = (Math.sin(performance.now() * 0.01) + 1) * 0.5;
      const auraColor = t.angerMultiplier > 1.4 ? 'rgba(239, 68, 68, 0.5)' : 'rgba(168, 85, 247, 0.4)';
      ctx.shadowColor = t.angerMultiplier > 1.4 ? '#ef4444' : '#a855f7';
      ctx.shadowBlur = 20 * pos.scale + auraPulse * 15;
      ctx.fillStyle = auraColor;
      ctx.beginPath();
      ctx.ellipse(0, -baseH * 0.4, baseW * 0.7 + auraPulse * 8, baseH * 0.8 + auraPulse * 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (t.knockbackTimer > 0) {
      ctx.rotate(-0.15);
      ctx.translate(0, -10);
    }

    if (t.imageLoaded && t.image) {
      ctx.drawImage(t.image, -baseW / 2, -baseH, baseW, baseH);
    } else {
      ctx.fillStyle = '#4f46e5';
      ctx.fillRect(-baseW / 2, -baseH, baseW, baseH);
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.max(12, 14 * pos.scale)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('ワタナベ先生', 0, -baseH * 0.5);
    }

    if (this.currentProblem) {
      const f1 = this.currentProblem.fraction1;
      const f2 = this.currentProblem.fraction2;
      const op = this.currentProblem.opSymbol || (this.currentProblem.isAddition ? '+' : '−');
      const f1Str = f1.whole ? `${f1.whole}と${f1.num}/${f1.den}` : `${f1.num}/${f1.den}`;
      const f2Str = f2.whole ? `${f2.whole}と${f2.num}/${f2.den}` : `${f2.num}/${f2.den}`;
      const probStr = `${f1Str} ${op} ${f2Str} = ?`;

      ctx.save();
      const bubbleW = Math.max(130, 160 * Math.min(1.2, pos.scale));
      const bubbleH = 34 * Math.min(1.2, pos.scale);
      const bubbleY = -baseH - bubbleH - 12;

      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 8;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.strokeStyle = t.angerMultiplier > 1.3 ? '#ef4444' : '#6366f1';
      ctx.lineWidth = 2.5;

      ctx.roundRect(-bubbleW / 2, bubbleY, bubbleW, bubbleH, 10);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-6, bubbleY + bubbleH);
      ctx.lineTo(0, bubbleY + bubbleH + 8);
      ctx.lineTo(6, bubbleY + bubbleH);
      ctx.closePath();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();

      ctx.fillStyle = '#f8fafc';
      ctx.font = `bold ${Math.max(11, 14 * Math.min(1.2, pos.scale))}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(probStr, 0, bubbleY + bubbleH / 2);
      ctx.restore();
    }

    ctx.save();
    const nameY = -baseH - 4;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.roundRect(-45 * pos.scale, nameY - 14, 90 * pos.scale, 16, 4);
    ctx.fill();

    ctx.fillStyle = t.angerMultiplier > 1.3 ? '#fca5a5' : '#fef08a';
    ctx.font = `bold ${Math.max(9, 11 * pos.scale)}px sans-serif`;
    ctx.textAlign = 'center';
    const stateTitle = t.angerMultiplier > 1.3 ? '🔥激怒接近中！' : '家庭訪問 担任';
    ctx.fillText(stateTitle, 0, nameY - 3);
    ctx.restore();

    ctx.restore();
  }

  renderPlayer(ctx) {
    ctx.save();
    ctx.translate(this.player.x, this.player.y);

    // 1. わが家（玄関・ポーチ・表札）の描画
    if (this.houseImage && this.houseImageLoaded) {
      // AI生成の美麗なわが家イラスト (ポーチ、玄関灯、表札「わが家」、石畳)
      const houseW = 160;
      const houseH = 160;
      const houseX = -80;
      const houseY = -145;

      ctx.save();
      // 角丸と周囲のやわらかなシャドウ
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.roundRect(houseX, houseY, houseW, houseH, 8);
      ctx.clip();
      ctx.drawImage(this.houseImage, houseX, houseY, houseW, houseH);
      ctx.restore();

      // わが家の外枠（夜景になじむシックな境界線）
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(houseX, houseY, houseW, houseH, 8);
      ctx.stroke();

      // 玄関灯のほのかな暖色グロー
      const lanternGrad = ctx.createRadialGradient(houseX + 90, houseY + 65, 5, houseX + 90, houseY + 65, 45);
      lanternGrad.addColorStop(0, 'rgba(253, 224, 71, 0.35)');
      lanternGrad.addColorStop(1, 'rgba(253, 224, 71, 0)');
      ctx.fillStyle = lanternGrad;
      ctx.beginPath();
      ctx.arc(houseX + 90, houseY + 65, 45, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // フォールバック（画像未ロード時）
      ctx.fillStyle = '#334155';
      ctx.roundRect(-45, -75, 90, 85, 4);
      ctx.fill();
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#b91c1c';
      ctx.beginPath();
      ctx.moveTo(-55, -75);
      ctx.lineTo(0, -110);
      ctx.lineTo(55, -75);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#78350f';
      ctx.roundRect(-22, -65, 44, 75, 4);
      ctx.fill();

      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(-16, -60, 32, 12);
      ctx.fillStyle = '#78350f';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('わが家', 0, -51);
    }

    // 2. 子供キャラクター（後ろ姿＆ランドセル）の描画
    // 配置基準: 玄関ポーチのステップ前（x: 35, y: -10）
    const childBaseX = 35;
    const childBaseY = -10;
    const childSize = 78;

    // 待機時の微細な呼吸上下運動
    const breathOffset = Math.sin(this.player.breathTime || 0) * 1.5;

    // 詠唱時のリコイル（発射の瞬間後方に踏ん張り、前へ戻る）
    const isCasting = this.player.castAnim > 0;
    const recoilX = isCasting ? -Math.sin(this.player.castAnim * Math.PI) * 7 : 0;
    const recoilY = isCasting ? Math.sin(this.player.castAnim * Math.PI) * 2 : 0;

    const childDrawX = childBaseX + recoilX - childSize / 2;
    const childDrawY = childBaseY + recoilY + (isCasting ? 0 : breathOffset) - childSize / 2;

    // 子供の足元の影（楕円シャドウ）
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(childBaseX + recoilX, childBaseY + 28, 20, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 子供スプライトの描画
    const childSource = this.childSprite.canvas || this.childSprite.image;
    if (childSource && this.childSprite.loaded) {
      // フレーム選択: 0 = 待機, 1 = 攻撃魔法ポーズ
      const frameIdx = isCasting ? 1 : 0;
      const sw = 256;
      const sh = 256;
      const sx = frameIdx * sw;
      const sy = 0;

      ctx.drawImage(childSource, sx, sy, sw, sh, childDrawX, childDrawY, childSize, childSize);
    } else {
      // スプライト未ロード時は待機
    }

    // 3. プレイヤー魔法陣 & 詠唱オーラ演出
    // 右手の位置（攻撃ポーズ時に手を右上方向へ突き出している位置）
    const handX = isCasting ? (childBaseX + recoilX + 23) : (childBaseX + 12);
    const handY = isCasting ? (childBaseY + recoilY - 14) : (childBaseY - 6 + breathOffset);

    // 回転する二重魔法陣（右手付近に展開）
    ctx.save();
    ctx.translate(handX, handY);
    ctx.rotate(this.player.ringAngle1);
    ctx.strokeStyle = isCasting ? 'rgba(168, 85, 247, 0.85)' : 'rgba(99, 102, 241, 0.6)';
    ctx.lineWidth = isCasting ? 2.5 : 1.5;
    const ringSize = isCasting ? 22 : 16;
    ctx.strokeRect(-ringSize / 2, -ringSize / 2, ringSize, ringSize);
    ctx.restore();

    ctx.save();
    ctx.translate(handX, handY);
    ctx.rotate(this.player.ringAngle2);
    ctx.strokeStyle = isCasting ? 'rgba(56, 189, 248, 0.95)' : 'rgba(56, 189, 248, 0.5)';
    ctx.lineWidth = isCasting ? 2 : 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, isCasting ? 18 : 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // 魔法弾詠唱時のオーラパルス & マズルフラッシュ
    if (isCasting) {
      ctx.save();
      ctx.translate(handX, handY);
      ctx.globalCompositeOperation = 'lighter';

      // 輝く魔力球
      const auraGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, 32 * this.player.castAnim);
      auraGrad.addColorStop(0, '#ffffff');
      auraGrad.addColorStop(0.3, 'rgba(56, 189, 248, 0.9)');
      auraGrad.addColorStop(0.7, 'rgba(147, 51, 234, 0.5)');
      auraGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = auraGrad;
      ctx.beginPath();
      ctx.arc(0, 0, 32 * this.player.castAnim, 0, Math.PI * 2);
      ctx.fill();

      // 十字スターフレア
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 2 * this.player.castAnim;
      const flareLen = 28 * this.player.castAnim;
      ctx.beginPath();
      ctx.moveTo(-flareLen, 0);
      ctx.lineTo(flareLen, 0);
      ctx.moveTo(0, -flareLen);
      ctx.lineTo(0, flareLen);
      ctx.stroke();

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
    const barW = Math.min(260, w * 0.6);
    const barH = 14;
    const barX = (w - barW) / 2;
    const barY = 12;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.roundRect(barX, barY, barW, barH, 7);
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const fillRatio = Math.max(0, Math.min(1, this.teacher.distance / 100.0));
    let fillColor = '#10b981';
    if (fillRatio < 0.3) fillColor = '#ef4444';
    else if (fillRatio < 0.6) fillColor = '#f59e0b';

    ctx.fillStyle = fillColor;
    ctx.roundRect(barX + 2, barY + 2, (barW - 4) * fillRatio, barH - 4, 5);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`🚪 玄関までの距離: ${this.teacher.distance.toFixed(1)}m`, w / 2, barY + barH + 14);
    ctx.restore();
  }
}