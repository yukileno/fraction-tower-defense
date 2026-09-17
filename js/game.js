/**
 * 分数タワーディフェンス メインゲームエンジン（超ド派手・大迫力エフェクト版）
 */
import { generateProblem, validateAnswer } from './generator.js';
import { sound } from './audio.js';

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
    this.ctx = canvas.getContext('2d');
    this.ui = uiElements;

    // ゲーム基本状態
    this.lives = 3;
    this.maxLives = 3;
    this.score = 0;
    this.highScore = parseInt(localStorage.getItem('fraction_td_highscore') || '0', 10);
    this.wave = 1;
    this.combo = 0;
    this.maxCombo = 0;
    this.totalDefeated = 0;
    this.mp = 0;
    this.maxMp = 100;

    this.isPaused = false;
    this.isGameOver = false;
    this.isWaveClear = false;

    // モンスター・弾・エフェクト
    this.monsters = [];
    this.projectiles = [];
    this.particles = [];
    this.shockwaves = [];
    this.floatingTexts = [];
    this.shootingStars = [];
    this.ambientSparks = [];

    // スポーン管理
    this.monstersToSpawn = [];
    this.spawnTimer = 0;
    this.spawnInterval = 8000;

    this.currentTarget = null;

    // 必殺技ステータス
    this.isFrozen = false;
    this.freezeTimer = 0;

    // 画面演出
    this.shakeIntensity = 0;
    this.flashAlpha = 0;
    this.hitStopTimer = 0;

    // 復習用履歴
    this.battleHistory = [];

    // パス定義（遠近感：右上奥(小さく) ➔ 左下手前(大きく迫る)）
    this.path = [
      { x: 610, y: 90, scale: 0.55 },
      { x: 480, y: 90, scale: 0.70 },
      { x: 390, y: 200, scale: 0.90 },
      { x: 260, y: 210, scale: 1.15 },
      { x: 180, y: 350, scale: 1.45 },
      { x: 80, y: 350, scale: 1.70 }
    ];

    // タワー（魔法使い）の位置
    this.tower = {
      x: 75,
      y: 310,
      ringAngle1: 0,
      ringAngle2: 0,
      castAnim: 0
    };

    this.lastTime = performance.now();
    this.initCanvasSize();
    this.initAmbientEffects();
    window.addEventListener('resize', () => this.initCanvasSize());
  }

  initCanvasSize() {
    this.canvas.width = 640;
    this.canvas.height = 480;
  }

  initAmbientEffects() {
    // 画面内を漂う神秘的なマナの光の粉（ホタル）
    this.ambientSparks = [];
    for (let i = 0; i < 30; i++) {
      this.ambientSparks.push({
        x: Math.random() * 640,
        y: Math.random() * 480,
        r: Math.random() * 2 + 1,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -Math.random() * 0.5 - 0.2,
        alpha: Math.random() * 0.8 + 0.2,
        color: Math.random() < 0.5 ? '#38bdf8' : '#a855f7'
      });
    }
  }

  start() {
    this.lives = 3;
    this.score = 0;
    this.wave = 1;
    this.combo = 0;
    this.maxCombo = 0;
    this.totalDefeated = 0;
    this.mp = 0;
    this.isGameOver = false;
    this.isWaveClear = false;
    this.monsters = [];
    this.projectiles = [];
    this.particles = [];
    this.shockwaves = [];
    this.floatingTexts = [];
    this.shootingStars = [];
    this.battleHistory = [];
    this.currentTarget = null;

    this.updateHUD();
    this.prepareWave(this.wave);

    this.render();
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.gameLoop(t));
  }

  prepareWave(waveNum) {
    this.isWaveClear = false;
    this.monstersToSpawn = [];

    const count = 3 + Math.min(waveNum, 5);
    let levelId = 1;
    if (waveNum === 1) levelId = 1;
    else if (waveNum === 2) levelId = 2;
    else if (waveNum === 3) levelId = 3;
    else if (waveNum === 4) levelId = 4;
    else if (waveNum >= 5) levelId = 5;

    for (let i = 0; i < count; i++) {
      const isBoss = (waveNum % 5 === 0 && i === count - 1);
      const enemyType = isBoss
        ? 'dragon'
        : (i % 4 === 0 ? 'slime' : (i % 4 === 1 ? 'goblin' : (i % 4 === 2 ? 'bat' : 'golem')));

      const problem = generateProblem(isBoss ? 5 : levelId);
      this.monstersToSpawn.push({
        type: enemyType,
        isBoss,
        problem,
        spawnDelay: i * 8000
      });
    }

    this.spawnTimer = 0;
    this.spawnInterval = 8000;
    if (this.monstersToSpawn.length > 0) {
      const first = this.monstersToSpawn.shift();
      this.spawnMonster(first);
    }
    this.showFloatingText(`⚔️ ウェーブ ${waveNum} 開始！`, 320, 180, '#fbbf24', 32, true);
  }

  spawnMonster(config) {
    const speeds = {
      slime: 0.16,
      golem: 0.13,
      goblin: 0.20,
      bat: 0.24,
      dragon: 0.14
    };

    const monster = {
      id: config.problem.id,
      type: config.type,
      isBoss: config.isBoss,
      problem: config.problem,
      pathIndex: 0,
      t: 0,
      x: this.path[0].x,
      y: this.path[0].y,
      currentScale: this.path[0].scale,
      speed: speeds[config.type] * (1 + (this.wave - 1) * 0.04),
      maxHp: config.isBoss ? 2 : 1,
      hp: config.isBoss ? 2 : 1,
      totalDistance: 0,
      bobOffset: Math.random() * Math.PI * 2,
      baseScale: config.isBoss ? 1.6 : 1.0,
      spawnTime: performance.now(),
      auraAngle: 0
    };

    // 出現ポータルエフェクト
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = Math.random() * 3 + 1;
      this.particles.push({
        x: monster.x,
        y: monster.y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        size: Math.random() * 4 + 2,
        color: '#c084fc',
        life: 1.0,
        decay: 0.03
      });
    }

    this.monsters.push(monster);
    this.updateTarget();
  }

  updateTarget() {
    if (this.monsters.length === 0) {
      this.currentTarget = null;
      if (this.ui.onTargetChange) {
        this.ui.onTargetChange(null);
      }
      return;
    }

    let best = this.monsters[0];
    for (let i = 1; i < this.monsters.length; i++) {
      if (this.monsters[i].totalDistance > best.totalDistance) {
        best = this.monsters[i];
      }
    }

    if (this.currentTarget !== best) {
      this.currentTarget = best;
      if (this.ui.onTargetChange) {
        this.ui.onTargetChange(best);
      }
    }
  }

  submitAnswer(num, den, whole = 0) {
    if (!this.currentTarget || this.isGameOver) return { status: 'no_target' };

    const problem = this.currentTarget.problem;
    const result = validateAnswer(problem, num, den, whole);

    this.battleHistory.push({
      problem,
      userAnswer: { num, den, whole },
      isCorrect: result.isCorrect,
      status: result.status,
      timestamp: Date.now()
    });

    if (result.isCorrect) {
      this.onCorrectAnswer(this.currentTarget);
      return result;
    } else if (result.status === 'needs_reduction') {
      sound.playAlmost();
      this.showFloatingText('💡 約分できるよ！', this.currentTarget.x, this.currentTarget.y - 45, '#f59e0b', 20);
      return result;
    } else {
      sound.playWrong();
      this.combo = 0;
      this.shakeIntensity = 6;
      this.showFloatingText('MISS...', this.currentTarget.x, this.currentTarget.y - 45, '#ef4444', 20);
      this.updateHUD();
      return result;
    }
  }

  onCorrectAnswer(target) {
    sound.playCorrect();
    this.tower.castAnim = 1.0;
    this.hitStopTimer = 0.08; // ヒットストップ

    // 豪華な魔法弾（彗星プラズマボール＋稲妻アーク）
    this.projectiles.push({
      x: this.tower.x + 25,
      y: this.tower.y - 30,
      target: target,
      targetX: target.x,
      targetY: target.y,
      speed: 16,
      radius: 9,
      color: '#38bdf8',
      trail: []
    });

    sound.playShoot();

    // 詠唱魔法陣の閃光
    for (let i = 0; i < 15; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = Math.random() * 4 + 1;
      this.particles.push({
        x: this.tower.x + 25,
        y: this.tower.y - 30,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        size: Math.random() * 4 + 2,
        color: '#67e8f9',
        life: 0.8,
        decay: 0.04
      });
    }

    const elapsedSec = (performance.now() - target.spawnTime) / 1000;
    const speedBonus = Math.max(0, Math.floor(100 - elapsedSec * 2));
    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;

    const comboMultiplier = 1 + Math.min(this.combo - 1, 10) * 0.15;
    const earnedScore = Math.floor((100 + speedBonus) * comboMultiplier);
    this.score += earnedScore;

    if (this.combo > 1) {
      sound.playCombo(this.combo);
      this.showFloatingText(`🔥 ${this.combo}連続正解! (x${comboMultiplier.toFixed(1)})`, target.x, target.y - 55, '#fbbf24', 22, true);
    }
    this.showFloatingText(`+${earnedScore}`, target.x, target.y - 30, '#34d399', 24, true);

    this.mp = Math.min(this.maxMp, this.mp + 25);

    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('fraction_td_highscore', this.highScore.toString());
    }

    this.updateHUD();
  }

  useSkillFreeze() {
    if (this.mp < 50 || this.isFrozen) return false;
    this.mp -= 50;
    this.isFrozen = true;
    this.freezeTimer = 8000;
    this.flashAlpha = 0.5;
    this.shakeIntensity = 8;
    sound.playFreeze();

    // 画面全体に吹雪・氷晶エフェクト
    for (let i = 0; i < 60; i++) {
      this.particles.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        vx: (Math.random() - 0.5) * 3,
        vy: Math.random() * 3 + 1,
        size: Math.random() * 7 + 3,
        color: Math.random() < 0.5 ? '#bae6fd' : '#e0f2fe',
        life: 1.2,
        decay: 0.015
      });
    }

    this.showFloatingText('❄️ タイムフリーズ発動！ 敵が完全停止！', 320, 160, '#38bdf8', 26, true);
    this.updateHUD();
    return true;
  }

  useSkillMeteor() {
    if (this.mp < 100 || !this.currentTarget) return false;
    this.mp -= 100;
    sound.playMeteor();

    const target = this.currentTarget;
    this.shakeIntensity = 24;
    this.flashAlpha = 0.8;

    // 上空から巨大メテオが突入
    for (let i = 0; i < 80; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = Math.random() * 10 + 3;
      this.particles.push({
        x: target.x,
        y: target.y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        size: Math.random() * 9 + 4,
        color: Math.random() < 0.5 ? '#f97316' : '#ef4444',
        life: 1.2,
        decay: 0.02
      });
    }

    // 2重衝撃波
    this.shockwaves.push({ x: target.x, y: target.y, r: 10, maxR: 180, color: '#f97316', alpha: 1 });
    this.shockwaves.push({ x: target.x, y: target.y, r: 5, maxR: 120, color: '#fef08a', alpha: 1 });

    this.score += 200;
    this.defeatMonster(target);
    this.showFloatingText('💥 ギガメテオ直撃！敵を消滅！', target.x, target.y - 40, '#f97316', 26, true);
    this.updateHUD();
    return true;
  }

  defeatMonster(monster) {
    sound.playHit();
    this.totalDefeated++;
    this.shakeIntensity = Math.max(this.shakeIntensity, monster.isBoss ? 20 : 10);
    this.flashAlpha = Math.max(this.flashAlpha, monster.isBoss ? 0.6 : 0.25);

    // スターバースト爆破エフェクト（60個以上の火花・破片）
    const count = monster.isBoss ? 80 : 45;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = Math.random() * (monster.isBoss ? 9 : 6) + 1.5;
      const palette = monster.isBoss
        ? ['#ef4444', '#f97316', '#fbbf24', '#ffffff']
        : ['#38bdf8', '#818cf8', '#34d399', '#ffffff'];
      this.particles.push({
        x: monster.x,
        y: monster.y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        size: Math.random() * 6 + 2,
        color: palette[Math.floor(Math.random() * palette.length)],
        life: 1.0,
        decay: Math.random() * 0.02 + 0.015
      });
    }

    // 衝撃波リング
    this.shockwaves.push({
      x: monster.x,
      y: monster.y,
      r: 10,
      maxR: monster.isBoss ? 160 : 90,
      color: monster.isBoss ? '#f59e0b' : '#38bdf8',
      alpha: 1.0
    });

    const idx = this.monsters.indexOf(monster);
    if (idx !== -1) {
      this.monsters.splice(idx, 1);
    }

    this.updateTarget();

    if (this.monsters.length === 0 && this.monstersToSpawn.length === 0) {
      this.onWaveClear();
    }
  }

  onWaveClear() {
    this.isWaveClear = true;
    this.score += 500;
    this.showFloatingText(`🎉 ウェーブ ${this.wave} 完全防衛！ (+500点)`, 320, 200, '#eab308', 30, true);

    // 勝利の花火
    for (let f = 0; f < 3; f++) {
      setTimeout(() => {
        const fx = 200 + Math.random() * 240;
        const fy = 100 + Math.random() * 150;
        this.shockwaves.push({ x: fx, y: fy, r: 5, maxR: 70, color: '#eab308', alpha: 1 });
        for (let i = 0; i < 35; i++) {
          const a = Math.random() * Math.PI * 2;
          const s = Math.random() * 5 + 1;
          this.particles.push({
            x: fx, y: fy,
            vx: Math.cos(a) * s, vy: Math.sin(a) * s,
            size: Math.random() * 5 + 2,
            color: ['#fbbf24', '#f43f5e', '#38bdf8', '#a855f7'][i % 4],
            life: 1.0, decay: 0.025
          });
        }
      }, f * 350);
    }

    setTimeout(() => {
      if (!this.isGameOver) {
        this.wave++;
        this.prepareWave(this.wave);
        this.updateHUD();
      }
    }, 2800);
  }

  onCastleDamage(monster) {
    sound.playCastleDamage();
    this.lives--;
    this.combo = 0;
    this.shakeIntensity = 28;
    this.flashAlpha = 0.8;

    // 城門大破壊エフェクト
    for (let i = 0; i < 50; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * 7 + 2;
      this.particles.push({
        x: 80,
        y: 350,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        size: Math.random() * 7 + 3,
        color: '#ef4444',
        life: 1.0,
        decay: 0.025
      });
    }

    this.shockwaves.push({ x: 80, y: 350, r: 10, maxR: 140, color: '#ef4444', alpha: 1 });
    this.showFloatingText('💔 城が破られた！ ライフ -1', 200, 320, '#ef4444', 24, true);

    const idx = this.monsters.indexOf(monster);
    if (idx !== -1) {
      this.monsters.splice(idx, 1);
    }
    this.updateTarget();
    this.updateHUD();

    if (this.lives <= 0) {
      this.triggerGameOver();
    }
  }

  triggerGameOver() {
    this.isGameOver = true;
    sound.playGameOver();
    if (this.ui.onGameOver) {
      this.ui.onGameOver({
        score: this.score,
        highScore: this.highScore,
        wave: this.wave,
        maxCombo: this.maxCombo,
        totalDefeated: this.totalDefeated,
        history: this.battleHistory
      });
    }
  }

  showFloatingText(text, x, y, color = '#ffffff', size = 20, isEpic = false) {
    this.floatingTexts.push({
      text,
      x,
      y,
      color,
      size,
      alpha: 1.0,
      vy: -1.2,
      isEpic,
      scale: 0.5
    });
  }

  updateHUD() {
    if (this.ui.updateHUD) {
      this.ui.updateHUD({
        lives: this.lives,
        maxLives: this.maxLives,
        score: this.score,
        highScore: this.highScore,
        wave: this.wave,
        combo: this.combo,
        mp: this.mp,
        maxMp: this.maxMp
      });
    }
  }

  // メインループ
  gameLoop(currentTime) {
    const dt = Math.min((currentTime - this.lastTime) / 1000, 0.1);
    this.lastTime = currentTime;

    if (!this.isPaused && !this.isGameOver) {
      // ヒットストップ処理
      if (this.hitStopTimer > 0) {
        this.hitStopTimer -= dt;
      } else {
        this.update(dt);
      }
    }

    this.render();

    if (!this.isGameOver) {
      requestAnimationFrame((t) => this.gameLoop(t));
    }
  }

  update(dt) {
    // タイムフリーズ管理
    if (this.isFrozen) {
      this.freezeTimer -= dt * 1000;
      if (this.freezeTimer <= 0) {
        this.isFrozen = false;
      }
    }

    // タワー魔法陣回転
    this.tower.ringAngle1 += dt * 1.5;
    this.tower.ringAngle2 -= dt * 2.2;
    if (this.tower.castAnim > 0) {
      this.tower.castAnim -= dt * 2.0;
    }

    // スポーン処理
    if (this.monstersToSpawn.length > 0) {
      this.spawnTimer += dt * 1000;
      if (this.spawnTimer >= this.spawnInterval) {
        this.spawnTimer = 0;
        const next = this.monstersToSpawn.shift();
        this.spawnMonster(next);
      }
    }

    // 流星（シューティングスター）の定期発生
    if (Math.random() < 0.015) {
      this.shootingStars.push({
        x: Math.random() * 400 + 100,
        y: Math.random() * 100,
        vx: -Math.random() * 8 - 4,
        vy: Math.random() * 4 + 2,
        length: Math.random() * 40 + 20,
        alpha: 1.0
      });
    }

    // 流星更新
    for (let i = this.shootingStars.length - 1; i >= 0; i--) {
      const st = this.shootingStars[i];
      st.x += st.vx;
      st.y += st.vy;
      st.alpha -= 0.03;
      if (st.alpha <= 0) {
        this.shootingStars.splice(i, 1);
      }
    }

    // マナの光粉更新
    this.ambientSparks.forEach(sp => {
      sp.x += sp.vx;
      sp.y += sp.vy;
      if (sp.y < 0) sp.y = 480;
      if (sp.x < 0) sp.x = 640;
      if (sp.x > 640) sp.x = 0;
    });

    // モンスター移動 & パースペクティブ計算
    const speedScale = this.isFrozen ? 0.12 : 1.0;
    for (let i = this.monsters.length - 1; i >= 0; i--) {
      const m = this.monsters[i];
      const p1 = this.path[m.pathIndex];
      const p2 = this.path[m.pathIndex + 1];

      if (!p2) {
        this.onCastleDamage(m);
        continue;
      }

      const segDx = p2.x - p1.x;
      const segDy = p2.y - p1.y;
      const segLen = Math.hypot(segDx, segDy);

      const step = (m.speed * speedScale * 45 * dt) / segLen;
      m.t += step;
      m.totalDistance += m.speed * speedScale * 45 * dt;

      if (m.t >= 1) {
        m.pathIndex++;
        m.t = 0;
      } else {
        m.x = p1.x + segDx * m.t;
        m.y = p1.y + segDy * m.t;
        // 遠近感スケール補間
        const s1 = p1.scale || 1.0;
        const s2 = p2.scale || 1.0;
        m.currentScale = s1 + (s2 - s1) * m.t;
      }

      m.auraAngle += dt * 3.0;

      // ゴーレムの地響き演出（近距離時）
      if (m.type === 'golem' && m.currentScale > 1.2 && Math.sin(performance.now() * 0.005) > 0.95) {
        this.shakeIntensity = Math.max(this.shakeIntensity, 2);
      }
    }

    // 魔法弾移動
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const tx = p.target ? p.target.x : p.targetX;
      const ty = p.target ? p.target.y : p.targetY;

      const dx = tx - p.x;
      const dy = ty - p.y;
      const dist = Math.hypot(dx, dy);

      p.trail.push({ x: p.x, y: p.y, alpha: 1.0, r: p.radius });
      if (p.trail.length > 10) p.trail.shift();

      if (dist < p.speed) {
        if (p.target && this.monsters.includes(p.target)) {
          this.defeatMonster(p.target);
        }
        this.projectiles.splice(i, 1);
      } else {
        p.x += (dx / dist) * p.speed;
        p.y += (dy / dist) * p.speed;
      }
    }

    // 衝撃波リング更新
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.r += (sw.maxR - sw.r) * 0.15 + 2;
      sw.alpha -= 0.035;
      if (sw.alpha <= 0 || sw.r >= sw.maxR) {
        this.shockwaves.splice(i, 1);
      }
    }

    // パーティクル更新
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.vy += 0.08; // 軽い重力
      pt.life -= pt.decay;
      if (pt.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // フローティングテキスト更新
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y += ft.vy;
      ft.scale = Math.min(1.0, ft.scale + 0.1);
      ft.alpha -= 0.014;
      if (ft.alpha <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }

    // 画面揺れ・閃光減衰
    if (this.shakeIntensity > 0) {
      this.shakeIntensity *= 0.86;
      if (this.shakeIntensity < 0.2) this.shakeIntensity = 0;
    }
    if (this.flashAlpha > 0) {
      this.flashAlpha *= 0.85;
      if (this.flashAlpha < 0.02) this.flashAlpha = 0;
    }
  }

  render() {
    this.ctx.save();

    // 画面揺れ
    if (this.shakeIntensity > 0) {
      const ox = (Math.random() - 0.5) * this.shakeIntensity * 2;
      const oy = (Math.random() - 0.5) * this.shakeIntensity * 2;
      this.ctx.translate(ox, oy);
    }

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // 1. 神秘的なファンタジー夕暮れ・夜空の背景
    this.drawEpicBackground();

    // 2. 遠近感のある石畳の道
    this.drawPerspectivePath();

    // 3. 城 & 魔導士タワー & 多重回転魔法陣
    this.drawCastleAndWizardTower();

    // 4. モンスター描画（立体影・迫りくるスケール・問題バルーン）
    // 遠い順（画面奥）からソートして描画（手前が上に重なる）
    const sortedMonsters = [...this.monsters].sort((a, b) => a.totalDistance - b.totalDistance);
    sortedMonsters.forEach((m) => this.drawDetailedMonster(m));

    // 5. 魔法弾 & 電撃アーク
    this.drawProjectiles();

    // 6. 衝撃波リング
    this.drawShockwaves();

    // 7. パーティクル
    this.drawParticles();

    // 8. フローティングテキスト
    this.drawFloatingTexts();

    // 9. タイムフリーズ氷結エフェクト
    if (this.isFrozen) {
      this.drawFreezeOverlay();
    }

    // 10. 近接デンジャー警報ビネット（先頭の敵が城に迫ったとき）
    this.drawDangerVignette();

    // 11. 全画面ホワイト/レッドフラッシュ（爆発衝撃）
    if (this.flashAlpha > 0) {
      this.ctx.fillStyle = `rgba(255, 255, 255, ${this.flashAlpha})`;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    this.ctx.restore();
  }

  drawEpicBackground() {
    // 暮れなずむファンタジースカイ
    const skyGrad = this.ctx.createLinearGradient(0, 0, 0, 240);
    skyGrad.addColorStop(0, '#0f172a');
    skyGrad.addColorStop(0.5, '#1e1b4b');
    skyGrad.addColorStop(1, '#312e81');
    this.ctx.fillStyle = skyGrad;
    this.ctx.fillRect(0, 0, this.canvas.width, 240);

    // 月と星屑
    this.ctx.fillStyle = '#fef08a';
    this.ctx.beginPath();
    this.ctx.arc(80, 50, 20, 0, Math.PI * 2);
    this.ctx.fill();
    // 三日月にするクリップ
    this.ctx.fillStyle = '#0f172a';
    this.ctx.beginPath();
    this.ctx.arc(88, 46, 17, 0, Math.PI * 2);
    this.ctx.fill();

    // 流星（シューティングスター）
    this.ctx.save();
    this.shootingStars.forEach(st => {
      this.ctx.strokeStyle = `rgba(254, 240, 138, ${st.alpha})`;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(st.x, st.y);
      this.ctx.lineTo(st.x + st.vx * 3, st.y + st.vy * 3);
      this.ctx.stroke();
    });
    this.ctx.restore();

    // 遠景の山並み
    this.ctx.fillStyle = '#1e1b4b';
    this.ctx.beginPath();
    this.ctx.moveTo(0, 200);
    this.ctx.lineTo(120, 140);
    this.ctx.lineTo(240, 190);
    this.ctx.lineTo(380, 130);
    this.ctx.lineTo(500, 180);
    this.ctx.lineTo(640, 120);
    this.ctx.lineTo(640, 240);
    this.ctx.lineTo(0, 240);
    this.ctx.closePath();
    this.ctx.fill();

    // 手前の草原グラデーション
    const groundGrad = this.ctx.createLinearGradient(0, 200, 0, 480);
    groundGrad.addColorStop(0, '#064e3b');
    groundGrad.addColorStop(0.4, '#047857');
    groundGrad.addColorStop(1, '#10b981');
    this.ctx.fillStyle = groundGrad;
    this.ctx.fillRect(0, 200, this.canvas.width, 280);

    // マナの光粉（ホタル）
    this.ambientSparks.forEach(sp => {
      this.ctx.fillStyle = sp.color;
      this.ctx.globalAlpha = sp.alpha * (0.6 + Math.sin(performance.now() * 0.005 + sp.x) * 0.4);
      this.ctx.beginPath();
      this.ctx.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2);
      this.ctx.fill();
    });
    this.ctx.globalAlpha = 1.0;
  }

  drawPerspectivePath() {
    // 遠近感のある道（奥は細く、手前は広く）
    this.ctx.save();
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    // 影の縁取り
    this.ctx.beginPath();
    this.ctx.moveTo(this.path[0].x, this.path[0].y);
    for (let i = 1; i < this.path.length; i++) {
      this.ctx.lineTo(this.path[i].x, this.path[i].y);
    }
    this.ctx.lineWidth = 50;
    this.ctx.strokeStyle = 'rgba(4, 47, 46, 0.6)';
    this.ctx.stroke();

    // 外枠（石畳の縁）
    this.ctx.lineWidth = 44;
    this.ctx.strokeStyle = '#b45309';
    this.ctx.stroke();

    // 内側の明るい石畳
    this.ctx.lineWidth = 36;
    this.ctx.strokeStyle = '#fef3c7';
    this.ctx.stroke();

    // 石畳のひび割れ・ブロック模様
    this.ctx.lineWidth = 2;
    this.ctx.strokeStyle = 'rgba(180, 83, 9, 0.25)';
    this.path.forEach(p => {
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
      this.ctx.stroke();
    });

    this.ctx.restore();
  }

  drawCastleAndWizardTower() {
    const cx = 65;
    const cy = 350;

    // 城壁の重厚な石組み
    this.ctx.fillStyle = '#475569';
    this.ctx.fillRect(cx - 45, cy - 65, 65, 85);
    for (let i = 0; i < 4; i++) {
      this.ctx.fillStyle = '#334155';
      this.ctx.fillRect(cx - 45 + i * 16, cy - 76, 11, 13);
    }

    // 城門
    this.ctx.fillStyle = '#0f172a';
    this.ctx.beginPath();
    this.ctx.arc(cx - 12, cy + 5, 16, Math.PI, 0);
    this.ctx.rect(cx - 28, cy + 5, 32, 15);
    this.ctx.fill();

    // 城壁の松明（たいまつ）のチラチラ揺れる炎
    const torchFlicker = Math.sin(performance.now() * 0.02) * 3;
    this.ctx.fillStyle = '#f97316';
    this.ctx.beginPath();
    this.ctx.arc(cx - 38, cy - 40, 5 + torchFlicker * 0.5, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.fillStyle = '#fef08a';
    this.ctx.beginPath();
    this.ctx.arc(cx - 38, cy - 40, 2.5, 0, Math.PI * 2);
    this.ctx.fill();

    // 防衛バリア（六角形シールドグリッドが城を包む）
    const barrierPulse = 0.3 + Math.sin(performance.now() * 0.004) * 0.2;
    this.ctx.strokeStyle = `rgba(56, 189, 248, ${barrierPulse})`;
    this.ctx.lineWidth = 2.5;
    this.ctx.beginPath();
    this.ctx.arc(cx - 12, cy - 20, 55, 0, Math.PI * 2);
    this.ctx.stroke();

    // ライフバナー
    this.ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    this.ctx.beginPath();
    this.ctx.roundRect(cx - 55, cy - 100, 85, 22, 6);
    this.ctx.fill();

    let heartText = '';
    for (let h = 0; h < this.maxLives; h++) {
      heartText += h < this.lives ? '❤️' : '🖤';
    }
    this.ctx.font = '12px sans-serif';
    this.ctx.fillStyle = '#ffffff';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(`城防衛 ${heartText}`, cx - 12, cy - 85);

    // 魔導士タワー
    const tx = this.tower.x;
    const ty = this.tower.y;

    // 二重回転魔法陣（足元）
    this.drawMagicCircle(tx + 18, ty - 25, 26, this.tower.ringAngle1, this.tower.ringAngle2);

    // 魔法使い（ローブ・顔・帽子）
    this.ctx.fillStyle = '#4338ca';
    this.ctx.beginPath();
    this.ctx.moveTo(tx, ty - 20);
    this.ctx.lineTo(tx - 14, ty + 12);
    this.ctx.lineTo(tx + 14, ty + 12);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.fillStyle = '#fde047';
    this.ctx.beginPath();
    this.ctx.arc(tx, ty - 20, 7, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.fillStyle = '#312e81';
    this.ctx.beginPath();
    this.ctx.moveTo(tx - 11, ty - 22);
    this.ctx.lineTo(tx, ty - 45);
    this.ctx.lineTo(tx + 11, ty - 22);
    this.ctx.closePath();
    this.ctx.fill();

    // 魔法の杖
    this.ctx.strokeStyle = '#78350f';
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.moveTo(tx + 10, ty + 8);
    this.ctx.lineTo(tx + 20, ty - 30);
    this.ctx.stroke();

    // 杖先端の超発光クリスタル
    const glow = 0.6 + Math.sin(performance.now() * 0.008) * 0.3 + (this.tower.castAnim * 2.0);
    const grad = this.ctx.createRadialGradient(tx + 20, ty - 30, 2, tx + 20, ty - 30, 24);
    grad.addColorStop(0, `rgba(56, 189, 248, ${glow})`);
    grad.addColorStop(0.5, `rgba(168, 85, 247, ${glow * 0.5})`);
    grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    this.ctx.arc(tx + 20, ty - 30, 24, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.fillStyle = '#ffffff';
    this.ctx.beginPath();
    this.ctx.arc(tx + 20, ty - 30, 5, 0, Math.PI * 2);
    this.ctx.fill();
  }

  drawMagicCircle(x, y, radius, angle1, angle2) {
    this.ctx.save();
    this.ctx.translate(x, y);

    // 外周魔法陣（時計回り）
    this.ctx.rotate(angle1);
    this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, radius, 0, Math.PI * 2);
    this.ctx.stroke();

    // 幾何学ルーンマーク
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      this.ctx.fillStyle = '#38bdf8';
      this.ctx.beginPath();
      this.ctx.arc(Math.cos(a) * radius, Math.sin(a) * radius, 2.5, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // 内周六芒星（反時計回り）
    this.ctx.rotate(angle2 - angle1);
    this.ctx.strokeStyle = 'rgba(192, 132, 252, 0.8)';
    this.ctx.lineWidth = 1.5;
    this.ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a1 = (i * Math.PI * 2) / 3;
      const a2 = ((i + 1) * Math.PI * 2) / 3;
      this.ctx.moveTo(Math.cos(a1) * (radius * 0.75), Math.sin(a1) * (radius * 0.75));
      this.ctx.lineTo(Math.cos(a2) * (radius * 0.75), Math.sin(a2) * (radius * 0.75));
    }
    this.ctx.stroke();

    this.ctx.restore();
  }

  drawDetailedMonster(m) {
    this.ctx.save();
    const bob = Math.sin(performance.now() * 0.008 + m.bobOffset) * (3 * m.currentScale);
    this.ctx.translate(m.x, m.y + bob);

    const isTarget = (m === this.currentTarget);
    const totalScale = m.currentScale * m.baseScale;

    // 1. 地面に落ちる動的な立体影
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    this.ctx.beginPath();
    this.ctx.ellipse(0, 10 * totalScale - bob * 0.5, 18 * totalScale, 7 * totalScale, 0, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();

    // 2. ターゲットロックオン魔導陣（足元で輝く金色の回転オーラ）
    if (isTarget) {
      this.ctx.save();
      const ringScale = (1 + Math.sin(performance.now() * 0.01) * 0.1) * totalScale;
      this.ctx.strokeStyle = '#fbbf24';
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.ellipse(0, 6 * totalScale, 26 * ringScale, 13 * ringScale, 0, 0, Math.PI * 2);
      this.ctx.stroke();

      // ロックオン誘導矢印
      this.ctx.fillStyle = '#ef4444';
      this.ctx.beginPath();
      this.ctx.moveTo(0, -42 * totalScale);
      this.ctx.lineTo(-7 * totalScale, -52 * totalScale);
      this.ctx.lineTo(7 * totalScale, -52 * totalScale);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.restore();
    }

    this.ctx.scale(totalScale, totalScale);

    // 3. モンスター本体の精緻なグラフィック
    if (m.type === 'slime') {
      // ぷるぷる半透明ゼリースライム
      const sGrad = this.ctx.createRadialGradient(-3, -4, 2, 0, 0, 18);
      sGrad.addColorStop(0, '#86efac');
      sGrad.addColorStop(0.6, '#22c55e');
      sGrad.addColorStop(1, '#15803d');
      this.ctx.fillStyle = sGrad;
      this.ctx.beginPath();
      this.ctx.ellipse(0, 0, 18, 14, 0, 0, Math.PI * 2);
      this.ctx.fill();

      // ハイライト光
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      this.ctx.beginPath();
      this.ctx.ellipse(-6, -6, 5, 2.5, -Math.PI / 6, 0, Math.PI * 2);
      this.ctx.fill();

      // 大きな瞳
      this.ctx.fillStyle = '#ffffff';
      this.ctx.beginPath();
      this.ctx.arc(-5, -2, 4, 0, Math.PI * 2);
      this.ctx.arc(5, -2, 4, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.fillStyle = '#0f172a';
      this.ctx.beginPath();
      this.ctx.arc(-5 + Math.sin(performance.now() * 0.005), -2, 2.2, 0, Math.PI * 2);
      this.ctx.arc(5 + Math.sin(performance.now() * 0.005), -2, 2.2, 0, Math.PI * 2);
      this.ctx.fill();

    } else if (m.type === 'goblin') {
      // ゴブリン戦士（角＋棍棒＋凶暴な目）
      this.ctx.fillStyle = '#ca8a04';
      this.ctx.beginPath();
      this.ctx.arc(0, -6, 14, 0, Math.PI * 2);
      this.ctx.fill();

      // トゲトゲの耳
      this.ctx.fillStyle = '#a16207';
      this.ctx.beginPath();
      this.ctx.moveTo(-12, -10);
      this.ctx.lineTo(-22, -20);
      this.ctx.lineTo(-6, -16);
      this.ctx.closePath();
      this.ctx.fill();

      this.ctx.beginPath();
      this.ctx.moveTo(12, -10);
      this.ctx.lineTo(22, -20);
      this.ctx.lineTo(6, -16);
      this.ctx.closePath();
      this.ctx.fill();

      // 凶暴な赤い光る目
      this.ctx.fillStyle = '#ef4444';
      this.ctx.beginPath();
      this.ctx.arc(-5, -6, 3.5, 0, Math.PI * 2);
      this.ctx.arc(5, -6, 3.5, 0, Math.PI * 2);
      this.ctx.fill();

      // 木の棍棒
      this.ctx.strokeStyle = '#78350f';
      this.ctx.lineWidth = 4;
      this.ctx.beginPath();
      this.ctx.moveTo(10, 0);
      this.ctx.lineTo(22, -14);
      this.ctx.stroke();

    } else if (m.type === 'bat') {
      // 翼竜ワイバーン（紫のダークオーラ＆2層の翼羽ばたき）
      const wingFlap = Math.sin(performance.now() * 0.02) * 14;
      this.ctx.fillStyle = '#9333ea';

      // 巨大なコウモリ翼
      this.ctx.beginPath();
      this.ctx.moveTo(0, -2);
      this.ctx.lineTo(-28, -16 + wingFlap);
      this.ctx.lineTo(-12, 6);
      this.ctx.closePath();
      this.ctx.fill();

      this.ctx.beginPath();
      this.ctx.moveTo(0, -2);
      this.ctx.lineTo(28, -16 + wingFlap);
      this.ctx.lineTo(12, 6);
      this.ctx.closePath();
      this.ctx.fill();

      // 胴体
      this.ctx.fillStyle = '#6b21a8';
      this.ctx.beginPath();
      this.ctx.ellipse(0, 0, 9, 12, 0, 0, Math.PI * 2);
      this.ctx.fill();

      // 黄色い発光眼
      this.ctx.fillStyle = '#fef08a';
      this.ctx.beginPath();
      this.ctx.arc(-3, -3, 2.5, 0, Math.PI * 2);
      this.ctx.arc(3, -3, 2.5, 0, Math.PI * 2);
      this.ctx.fill();

    } else if (m.type === 'golem') {
      // 岩石ゴーレム（青く発光する古代ルーン亀裂）
      this.ctx.fillStyle = '#4b5563';
      this.ctx.fillRect(-17, -17, 34, 34);

      this.ctx.strokeStyle = '#1f2937';
      this.ctx.lineWidth = 2.5;
      this.ctx.strokeRect(-17, -17, 34, 34);

      // コアの青色エネルギー脈動
      const runeGlow = 0.5 + Math.sin(performance.now() * 0.01) * 0.4;
      this.ctx.fillStyle = `rgba(56, 189, 248, ${runeGlow})`;
      this.ctx.beginPath();
      this.ctx.arc(0, 0, 7, 0, Math.PI * 2);
      this.ctx.fill();

      // 亀裂のルーン
      this.ctx.strokeStyle = '#38bdf8';
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.moveTo(0, -7);
      this.ctx.lineTo(0, -15);
      this.ctx.moveTo(-7, 0);
      this.ctx.lineTo(-15, 0);
      this.ctx.moveTo(7, 0);
      this.ctx.lineTo(15, 0);
      this.ctx.stroke();

    } else if (m.type === 'dragon') {
      // 大魔竜ドラゴン（BOSS: 噴き出す火の粉・威厳ある翼）
      const wingFlap = Math.sin(performance.now() * 0.012) * 18;
      this.ctx.fillStyle = '#dc2626';

      // 翼
      this.ctx.beginPath();
      this.ctx.moveTo(0, 0);
      this.ctx.lineTo(-48, -32 + wingFlap);
      this.ctx.lineTo(-18, 12);
      this.ctx.closePath();
      this.ctx.fill();

      this.ctx.beginPath();
      this.ctx.moveTo(0, 0);
      this.ctx.lineTo(48, -32 + wingFlap);
      this.ctx.lineTo(18, 12);
      this.ctx.closePath();
      this.ctx.fill();

      // 頭部
      this.ctx.fillStyle = '#991b1b';
      this.ctx.beginPath();
      this.ctx.arc(0, -6, 22, 0, Math.PI * 2);
      this.ctx.fill();

      // 黄金の角
      this.ctx.fillStyle = '#fbbf24';
      this.ctx.beginPath();
      this.ctx.moveTo(-9, -20);
      this.ctx.lineTo(-20, -42);
      this.ctx.lineTo(-2, -26);
      this.ctx.closePath();
      this.ctx.fill();

      this.ctx.beginPath();
      this.ctx.moveTo(9, -20);
      this.ctx.lineTo(20, -42);
      this.ctx.lineTo(2, -26);
      this.ctx.closePath();
      this.ctx.fill();

      // 口元から常時漏れ出る炎パーティクル
      if (Math.random() < 0.3) {
        this.particles.push({
          x: m.x + (Math.random() - 0.5) * 8,
          y: m.y - 2,
          vx: (Math.random() - 0.5) * 2,
          vy: -Math.random() * 2 - 1,
          size: Math.random() * 4 + 2,
          color: '#f97316',
          life: 0.6,
          decay: 0.04
        });
      }
    }

    // 頭上の分数問題バルーン
    this.drawMonsterProblemBubble(m, isTarget);

    this.ctx.restore();
  }

  drawMonsterProblemBubble(m, isTarget) {
    const f1 = m.problem.fraction1;
    const f2 = m.problem.fraction2;
    const op = m.problem.opSymbol;
    const pText = `${f1.toString()} ${op} ${f2.toString()}`;

    this.ctx.font = isTarget ? 'bold 14px sans-serif' : '12px sans-serif';
    const textWidth = this.ctx.measureText(pText).width;
    const bubbleW = Math.max(textWidth + 18, 70);
    const bubbleH = 26;
    const bubbleY = m.isBoss ? -76 : -46;

    // バルーン背景（ターゲット時は黄金発光）
    this.ctx.fillStyle = isTarget ? '#fef08a' : 'rgba(255, 255, 255, 0.95)';
    this.ctx.strokeStyle = isTarget ? '#b45309' : '#64748b';
    this.ctx.lineWidth = isTarget ? 2.5 : 1.5;

    this.ctx.beginPath();
    this.ctx.roundRect(-bubbleW / 2, bubbleY, bubbleW, bubbleH, 6);
    this.ctx.fill();
    this.ctx.stroke();

    // バルーンのしっぽ
    this.ctx.beginPath();
    this.ctx.moveTo(-4, bubbleY + bubbleH);
    this.ctx.lineTo(0, bubbleY + bubbleH + 6);
    this.ctx.lineTo(4, bubbleY + bubbleH);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();

    this.ctx.fillStyle = '#0f172a';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(pText, 0, bubbleY + bubbleH / 2);
  }

  drawProjectiles() {
    this.projectiles.forEach((p) => {
      // 尾を引く多重光彩トレイル
      p.trail.forEach((tr, idx) => {
        const ratio = idx / p.trail.length;
        this.ctx.fillStyle = `rgba(56, 189, 248, ${ratio * 0.7})`;
        this.ctx.beginPath();
        this.ctx.arc(tr.x, tr.y, tr.r * ratio, 0, Math.PI * 2);
        this.ctx.fill();
      });

      // 弾頭外周の電撃オーラ
      this.ctx.fillStyle = 'rgba(224, 242, 254, 0.85)';
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.radius * 1.5, 0, Math.PI * 2);
      this.ctx.fill();

      // コア
      this.ctx.fillStyle = '#ffffff';
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      this.ctx.fill();

      // ランダムな電撃アーク（放電）
      this.ctx.strokeStyle = '#38bdf8';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      for (let a = 0; a < 3; a++) {
        const rx = p.x + (Math.random() - 0.5) * 20;
        const ry = p.y + (Math.random() - 0.5) * 20;
        this.ctx.moveTo(p.x, p.y);
        this.ctx.lineTo(rx, ry);
      }
      this.ctx.stroke();
    });
  }

  drawShockwaves() {
    this.shockwaves.forEach((sw) => {
      this.ctx.save();
      this.ctx.strokeStyle = sw.color;
      this.ctx.globalAlpha = Math.max(0, sw.alpha);
      this.ctx.lineWidth = 4;
      this.ctx.beginPath();
      this.ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.restore();
    });
  }

  drawParticles() {
    this.particles.forEach((pt) => {
      this.ctx.fillStyle = pt.color;
      this.ctx.globalAlpha = Math.max(0, pt.life);
      this.ctx.beginPath();
      this.ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      this.ctx.fill();
    });
    this.ctx.globalAlpha = 1.0;
  }

  drawFloatingTexts() {
    this.floatingTexts.forEach((ft) => {
      this.ctx.save();
      this.ctx.globalAlpha = Math.max(0, ft.alpha);
      this.ctx.font = `900 ${ft.size}px "M PLUS Rounded 1c", sans-serif`;
      this.ctx.fillStyle = ft.color;
      this.ctx.textAlign = 'center';
      this.ctx.shadowColor = 'rgba(0,0,0,0.85)';
      this.ctx.shadowBlur = 8;

      if (ft.isEpic) {
        this.ctx.lineWidth = 4;
        this.ctx.strokeStyle = '#0f172a';
        this.ctx.strokeText(ft.text, ft.x, ft.y);
      }

      this.ctx.fillText(ft.text, ft.x, ft.y);
      this.ctx.restore();
    });
  }

  drawFreezeOverlay() {
    // 画面全体が凍りつく青白い霜・氷結ビネット
    this.ctx.strokeStyle = 'rgba(186, 230, 253, 0.85)';
    this.ctx.lineWidth = 14;
    this.ctx.strokeRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.fillStyle = 'rgba(224, 242, 254, 0.2)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  drawDangerVignette() {
    // 先頭の敵が城に近づいた時の緊迫アラート演出
    if (!this.currentTarget) return;
    const distToCastle = this.currentTarget.x - 80;
    if (distToCastle < 150 && distToCastle > 0) {
      const dangerPulse = (1 - distToCastle / 150) * (0.35 + Math.sin(performance.now() * 0.015) * 0.25);
      this.ctx.strokeStyle = `rgba(239, 68, 68, ${dangerPulse})`;
      this.ctx.lineWidth = 12;
      this.ctx.strokeRect(0, 0, this.canvas.width, this.canvas.height);

      this.ctx.fillStyle = `rgba(239, 68, 68, ${dangerPulse * 0.3})`;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      this.ctx.font = '900 16px sans-serif';
      this.ctx.fillStyle = `rgba(254, 202, 202, ${dangerPulse * 2})`;
      this.ctx.textAlign = 'center';
      this.ctx.fillText('⚠️ 城壁に接近中！ 時間内に解こう！', 320, 30);
    }
  }
}
