import { generateProblem, validateAnswer } from './generator.js';
import { sound } from './audio.js';

// 古いブラウザ・端末用 roundRect ポリフィル
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

    // ゲーム状態
    this.lives = 3;
    this.maxLives = 3;
    this.score = 0;
    this.highScore = parseInt(localStorage.getItem('fraction_td_highscore') || '0', 10);
    this.wave = 1;
    this.combo = 0;
    this.maxCombo = 0;
    this.totalDefeated = 0;
    this.mp = 0; // 0 ~ 100
    this.maxMp = 100;

    this.isPaused = false;
    this.isGameOver = false;
    this.isWaveClear = false;

    // モンスター・弾・エフェクト
    this.monsters = [];
    this.projectiles = [];
    this.particles = [];
    this.floatingTexts = [];

    // スポーン管理
    this.monstersToSpawn = [];
    this.spawnTimer = 0;
    this.spawnInterval = 2800; // ms

    // 現在のターゲット
    this.currentTarget = null;

    // 必殺技ステータス
    this.isFrozen = false;
    this.freezeTimer = 0;

    // 画面揺れ (Screen Shake)
    this.shakeIntensity = 0;

    // 復習用履歴
    this.battleHistory = [];

    // パス定義（城は左下、出現は右上〜右）
    this.path = [
      { x: 920, y: 120 },
      { x: 740, y: 120 },
      { x: 620, y: 220 },
      { x: 420, y: 220 },
      { x: 300, y: 360 },
      { x: 120, y: 360 }
    ];

    // タワー（魔法使いの城壁）の位置
    this.tower = {
      x: 100,
      y: 320,
      staffGlow: 0,
      castAnim: 0
    };

    this.lastTime = performance.now();
    this.initCanvasSize();
    window.addEventListener('resize', () => this.initCanvasSize());
  }

  initCanvasSize() {
    this.canvas.width = 960;
    this.canvas.height = 480;
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
    this.floatingTexts = [];
    this.battleHistory = [];
    this.currentTarget = null;

    this.updateHUD();
    this.prepareWave(this.wave);

    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.gameLoop(t));
  }

  prepareWave(waveNum) {
    this.isWaveClear = false;
    this.monstersToSpawn = [];

    // ウェーブごとの敵数と難易度レベル
    const count = 3 + Math.min(waveNum, 6);
    let levelId = 1;
    if (waveNum === 1) levelId = 1;       // 基礎通分（倍数）
    else if (waveNum === 2) levelId = 2;  // 基本通分（積）
    else if (waveNum === 3) levelId = 3;  // 発展通分（最小公倍数）
    else if (waveNum === 4) levelId = 4;  // 約分マスター
    else if (waveNum >= 5) levelId = 5;   // 帯分数・ボス級

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
        spawnDelay: i * 4000 // 各モンスターの間隔
      });
    }

    this.spawnTimer = 0;
    this.showFloatingText(`ウェーブ ${waveNum} スタート！`, 480, 200, '#fbbf24', 36);
  }

  spawnMonster(config) {
    const speeds = {
      slime: 0.55,
      goblin: 0.75,
      bat: 0.95,
      golem: 0.50,
      dragon: 0.45
    };

    const monster = {
      id: config.problem.id,
      type: config.type,
      isBoss: config.isBoss,
      problem: config.problem,
      pathIndex: 0,
      t: 0, // 0 to 1 between path segments
      x: this.path[0].x,
      y: this.path[0].y,
      speed: speeds[config.type] * (1 + (this.wave - 1) * 0.05),
      maxHp: config.isBoss ? 2 : 1,
      hp: config.isBoss ? 2 : 1,
      totalDistance: 0,
      bobOffset: Math.random() * Math.PI * 2,
      scale: config.isBoss ? 1.5 : 1.0,
      spawnTime: performance.now()
    };

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

    // 城に最も近い（totalDistanceが一番大きい）モンスターをターゲットに
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

  // 解答判定の実行
  submitAnswer(num, den, whole = 0) {
    if (!this.currentTarget || this.isGameOver) return { status: 'no_target' };

    const problem = this.currentTarget.problem;
    const result = validateAnswer(problem, num, den, whole);

    // 履歴に記録
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
      return result;
    } else {
      // 間違い
      sound.playWrong();
      this.combo = 0;
      this.updateHUD();
      return result;
    }
  }

  onCorrectAnswer(target) {
    sound.playCorrect();
    this.tower.castAnim = 1.0;

    // 魔法弾を発射
    this.projectiles.push({
      x: this.tower.x + 30,
      y: this.tower.y - 20,
      target: target,
      targetX: target.x,
      targetY: target.y,
      speed: 14,
      color: '#38bdf8',
      trail: []
    });

    sound.playShoot();

    // スコア計算（基本点 + タイムボーナス + コンボボーナス）
    const elapsedSec = (performance.now() - target.spawnTime) / 1000;
    const speedBonus = Math.max(0, Math.floor(100 - elapsedSec * 3));
    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;

    const comboMultiplier = 1 + Math.min(this.combo - 1, 10) * 0.15;
    const earnedScore = Math.floor((100 + speedBonus) * comboMultiplier);
    this.score += earnedScore;

    if (this.combo > 1) {
      sound.playCombo(this.combo);
      this.showFloatingText(`${this.combo}連続正解！ x${comboMultiplier.toFixed(1)}`, target.x, target.y - 40, '#f59e0b', 22);
    }
    this.showFloatingText(`+${earnedScore}点`, target.x, target.y - 20, '#10b981', 20);

    // MPゲージ蓄積 (+25%)
    this.mp = Math.min(this.maxMp, this.mp + 25);

    // ハイスコア更新チェック
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('fraction_td_highscore', this.highScore.toString());
    }

    this.updateHUD();
  }

  // 必殺技: タイムフリーズ（敵を8秒間氷漬け・減速）
  useSkillFreeze() {
    if (this.mp < 50 || this.isFrozen) return false;
    this.mp -= 50;
    this.isFrozen = true;
    this.freezeTimer = 8000; // 8秒
    sound.playFreeze();

    // 画面全体に氷エフェクト
    for (let i = 0; i < 40; i++) {
      this.particles.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        vx: (Math.random() - 0.5) * 2,
        vy: Math.random() * 2 + 1,
        size: Math.random() * 6 + 2,
        color: '#93c5fd',
        life: 1.0,
        decay: 0.015
      });
    }

    this.showFloatingText('❄️ タイムフリーズ発動！敵の動きが停止！', 480, 160, '#38bdf8', 26);
    this.updateHUD();
    return true;
  }

  // 必殺技: メテオボム（先頭の敵を一撃爆砕）
  useSkillMeteor() {
    if (this.mp < 100 || !this.currentTarget) return false;
    this.mp -= 100;
    sound.playMeteor();

    const target = this.currentTarget;
    this.shakeIntensity = 18;

    setTimeout(() => {
      // 巨大爆発
      for (let i = 0; i < 60; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = Math.random() * 8 + 3;
        this.particles.push({
          x: target.x,
          y: target.y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          size: Math.random() * 8 + 3,
          color: Math.random() < 0.5 ? '#f97316' : '#ef4444',
          life: 1.0,
          decay: 0.02
        });
      }

      this.score += 200;
      this.defeatMonster(target);
      this.showFloatingText('🔥 メテオ直撃！敵を粉砕！', target.x, target.y - 30, '#ea580c', 28);
      this.updateHUD();
    }, 400);

    return true;
  }

  defeatMonster(monster) {
    sound.playHit();
    this.totalDefeated++;

    // 撃破パーティクル
    for (let i = 0; i < 25; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = Math.random() * 5 + 1;
      this.particles.push({
        x: monster.x,
        y: monster.y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        size: Math.random() * 5 + 2,
        color: monster.isBoss ? '#f59e0b' : '#38bdf8',
        life: 1.0,
        decay: 0.03
      });
    }

    const idx = this.monsters.indexOf(monster);
    if (idx !== -1) {
      this.monsters.splice(idx, 1);
    }

    this.updateTarget();

    // ウェーブ終了判定
    if (this.monsters.length === 0 && this.monstersToSpawn.length === 0) {
      this.onWaveClear();
    }
  }

  onWaveClear() {
    this.isWaveClear = true;
    this.score += 500;
    this.showFloatingText(`🎉 ウェーブ ${this.wave} クリア！ (+500点)`, 480, 200, '#eab308', 32);

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
    this.shakeIntensity = 22;

    // ダメージエフェクト
    for (let i = 0; i < 30; i++) {
      this.particles.push({
        x: 100 + (Math.random() - 0.5) * 40,
        y: 350 + (Math.random() - 0.5) * 40,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 6,
        size: Math.random() * 6 + 2,
        color: '#ef4444',
        life: 1.0,
        decay: 0.03
      });
    }

    this.showFloatingText('💔 城が攻撃された！ ライフ -1', 200, 300, '#ef4444', 24);

    // 侵入モンスターを消滅
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

  showFloatingText(text, x, y, color = '#ffffff', size = 20) {
    this.floatingTexts.push({
      text,
      x,
      y,
      color,
      size,
      alpha: 1.0,
      vy: -1.0
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
      this.update(dt);
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

    // スポーン処理
    if (this.monstersToSpawn.length > 0) {
      this.spawnTimer += dt * 1000;
      if (this.spawnTimer >= this.spawnInterval) {
        this.spawnTimer = 0;
        const next = this.monstersToSpawn.shift();
        this.spawnMonster(next);
      }
    }

    // モンスター移動
    const speedScale = this.isFrozen ? 0.18 : 1.0;
    for (let i = this.monsters.length - 1; i >= 0; i--) {
      const m = this.monsters[i];
      const p1 = this.path[m.pathIndex];
      const p2 = this.path[m.pathIndex + 1];

      if (!p2) {
        // 城に到達
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

      p.trail.push({ x: p.x, y: p.y, alpha: 0.8 });
      if (p.trail.length > 6) p.trail.shift();

      if (dist < p.speed) {
        // 着弾
        if (p.target && this.monsters.includes(p.target)) {
          this.defeatMonster(p.target);
        }
        this.projectiles.splice(i, 1);
      } else {
        p.x += (dx / dist) * p.speed;
        p.y += (dy / dist) * p.speed;
      }
    }

    // パーティクル更新
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.life -= pt.decay;
      if (pt.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // フローティングテキスト更新
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y += ft.vy;
      ft.alpha -= 0.015;
      if (ft.alpha <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }

    // 画面揺れ減衰
    if (this.shakeIntensity > 0) {
      this.shakeIntensity *= 0.88;
      if (this.shakeIntensity < 0.2) this.shakeIntensity = 0;
    }

    // タワー詠唱アニメ
    if (this.tower.castAnim > 0) {
      this.tower.castAnim -= dt * 2.5;
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

    // 1. マップ背景・道
    this.drawBackground();
    this.drawPath();

    // 2. 城 & 防衛タワー
    this.drawCastleAndTower();

    // 3. モンスターたち
    this.monsters.forEach((m) => this.drawMonster(m));

    // 4. 魔法弾 & トレイル
    this.drawProjectiles();

    // 5. パーティクル
    this.drawParticles();

    // 6. フローティングテキスト
    this.drawFloatingTexts();

    // 7. タイムフリーズ・エフェクト枠
    if (this.isFrozen) {
      this.drawFreezeOverlay();
    }

    this.ctx.restore();
  }

  drawBackground() {
    // 豊かな草原グラデーション
    const bgGrad = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    bgGrad.addColorStop(0, '#6ee7b7');
    bgGrad.addColorStop(1, '#10b981');
    this.ctx.fillStyle = bgGrad;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // 背景の木々や花
    this.ctx.fillStyle = 'rgba(5, 150, 105, 0.4)';
    const trees = [
      { x: 500, y: 70, r: 25 },
      { x: 800, y: 50, r: 35 },
      { x: 250, y: 150, r: 20 },
      { x: 550, y: 350, r: 30 },
      { x: 780, y: 380, r: 28 },
      { x: 420, y: 440, r: 22 }
    ];
    trees.forEach(t => {
      this.ctx.beginPath();
      this.ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      this.ctx.fill();
    });
  }

  drawPath() {
    // 石畳の道
    this.ctx.beginPath();
    this.ctx.moveTo(this.path[0].x, this.path[0].y);
    for (let i = 1; i < this.path.length; i++) {
      this.ctx.lineTo(this.path[i].x, this.path[i].y);
    }
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    // 道の縁取り
    this.ctx.lineWidth = 54;
    this.ctx.strokeStyle = '#d97706';
    this.ctx.stroke();

    // 道の内側
    this.ctx.lineWidth = 46;
    this.ctx.strokeStyle = '#fef3c7';
    this.ctx.stroke();
  }

  drawCastleAndTower() {
    // 城の土台・門
    const cx = 90;
    const cy = 360;

    // 城壁
    this.ctx.fillStyle = '#64748b';
    this.ctx.fillRect(cx - 50, cy - 70, 70, 90);

    // 凸凹の城壁上部
    for (let i = 0; i < 4; i++) {
      this.ctx.fillRect(cx - 50 + i * 18, cy - 82, 12, 14);
    }

    // 城門
    this.ctx.fillStyle = '#1e293b';
    this.ctx.beginPath();
    this.ctx.arc(cx - 15, cy + 5, 18, Math.PI, 0);
    this.ctx.rect(cx - 33, cy + 5, 36, 15);
    this.ctx.fill();

    // ライフバナー
    this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
    this.ctx.beginPath();
    this.ctx.roundRect(cx - 60, cy - 110, 90, 24, 6);
    this.ctx.fill();

    let heartText = '';
    for (let h = 0; h < this.maxLives; h++) {
      heartText += h < this.lives ? '❤️' : '🖤';
    }
    this.ctx.font = '14px sans-serif';
    this.ctx.fillStyle = '#ffffff';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(`城防衛 ${heartText}`, cx - 15, cy - 93);

    // 魔法使いタワー（魔導士）
    const tx = this.tower.x;
    const ty = this.tower.y;

    // 魔法使いの帽子とローブ
    this.ctx.fillStyle = '#4f46e5'; // 青紫ローブ
    this.ctx.beginPath();
    this.ctx.moveTo(tx, ty - 25);
    this.ctx.lineTo(tx - 15, ty + 10);
    this.ctx.lineTo(tx + 15, ty + 10);
    this.ctx.closePath();
    this.ctx.fill();

    // 顔
    this.ctx.fillStyle = '#fde047';
    this.ctx.beginPath();
    this.ctx.arc(tx, ty - 25, 8, 0, Math.PI * 2);
    this.ctx.fill();

    // とんがり帽子
    this.ctx.fillStyle = '#312e81';
    this.ctx.beginPath();
    this.ctx.moveTo(tx - 12, ty - 27);
    this.ctx.lineTo(tx, ty - 50);
    this.ctx.lineTo(tx + 12, ty - 27);
    this.ctx.closePath();
    this.ctx.fill();

    // 魔法の杖
    this.ctx.strokeStyle = '#78350f';
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.moveTo(tx + 12, ty + 8);
    this.ctx.lineTo(tx + 22, ty - 35);
    this.ctx.stroke();

    // 杖のクリスタル（発光）
    const crystalGlow = 0.5 + Math.sin(performance.now() * 0.006) * 0.4 + (this.tower.castAnim * 1.5);
    const grad = this.ctx.createRadialGradient(tx + 22, ty - 35, 2, tx + 22, ty - 35, 18);
    grad.addColorStop(0, `rgba(56, 189, 248, ${crystalGlow})`);
    grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    this.ctx.arc(tx + 22, ty - 35, 18, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.fillStyle = '#38bdf8';
    this.ctx.beginPath();
    this.ctx.arc(tx + 22, ty - 35, 5, 0, Math.PI * 2);
    this.ctx.fill();
  }

  drawMonster(m) {
    this.ctx.save();
    const bob = Math.sin(performance.now() * 0.008 + m.bobOffset) * 4;
    this.ctx.translate(m.x, m.y + bob);

    const isTarget = (m === this.currentTarget);

    // ターゲットロックオン表示（点滅する金のリング）
    if (isTarget) {
      const ringScale = 1 + Math.sin(performance.now() * 0.01) * 0.15;
      this.ctx.strokeStyle = '#fbbf24';
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.ellipse(0, 5, 26 * ringScale, 14 * ringScale, 0, 0, Math.PI * 2);
      this.ctx.stroke();

      // ターゲットマーカー矢印
      this.ctx.fillStyle = '#ef4444';
      this.ctx.beginPath();
      this.ctx.moveTo(0, -48);
      this.ctx.lineTo(-8, -60);
      this.ctx.lineTo(8, -60);
      this.ctx.closePath();
      this.ctx.fill();
    }

    // モンスターのタイプ別グラフィック
    this.ctx.scale(m.scale, m.scale);

    if (m.type === 'slime') {
      // スライム（ぽよぽよ）
      this.ctx.fillStyle = '#22c55e';
      this.ctx.beginPath();
      this.ctx.ellipse(0, 0, 18, 14, 0, 0, Math.PI * 2);
      this.ctx.fill();

      // 目
      this.ctx.fillStyle = '#ffffff';
      this.ctx.beginPath();
      this.ctx.arc(-5, -2, 4, 0, Math.PI * 2);
      this.ctx.arc(5, -2, 4, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.fillStyle = '#0f172a';
      this.ctx.beginPath();
      this.ctx.arc(-6, -2, 2, 0, Math.PI * 2);
      this.ctx.arc(4, -2, 2, 0, Math.PI * 2);
      this.ctx.fill();

    } else if (m.type === 'goblin') {
      // ゴブリン
      this.ctx.fillStyle = '#eab308';
      this.ctx.beginPath();
      this.ctx.arc(0, -6, 14, 0, Math.PI * 2);
      this.ctx.fill();

      // 角/耳
      this.ctx.fillStyle = '#ca8a04';
      this.ctx.beginPath();
      this.ctx.moveTo(-12, -12);
      this.ctx.lineTo(-20, -22);
      this.ctx.lineTo(-6, -18);
      this.ctx.closePath();
      this.ctx.fill();

      this.ctx.beginPath();
      this.ctx.moveTo(12, -12);
      this.ctx.lineTo(20, -22);
      this.ctx.lineTo(6, -18);
      this.ctx.closePath();
      this.ctx.fill();

      // 目
      this.ctx.fillStyle = '#b91c1c';
      this.ctx.beginPath();
      this.ctx.arc(-4, -6, 3, 0, Math.PI * 2);
      this.ctx.arc(4, -6, 3, 0, Math.PI * 2);
      this.ctx.fill();

    } else if (m.type === 'bat') {
      // コウモリ/ワイバーン
      const wingFlap = Math.sin(performance.now() * 0.02) * 12;
      this.ctx.fillStyle = '#8b5cf6';

      // 翼（左）
      this.ctx.beginPath();
      this.ctx.moveTo(0, 0);
      this.ctx.lineTo(-25, -15 + wingFlap);
      this.ctx.lineTo(-10, 5);
      this.ctx.closePath();
      this.ctx.fill();

      // 翼（右）
      this.ctx.beginPath();
      this.ctx.moveTo(0, 0);
      this.ctx.lineTo(25, -15 + wingFlap);
      this.ctx.lineTo(10, 5);
      this.ctx.closePath();
      this.ctx.fill();

      // 胴体
      this.ctx.fillStyle = '#6d28d9';
      this.ctx.beginPath();
      this.ctx.arc(0, 0, 10, 0, Math.PI * 2);
      this.ctx.fill();

    } else if (m.type === 'golem') {
      // 岩石ゴーレム
      this.ctx.fillStyle = '#78716c';
      this.ctx.fillRect(-16, -16, 32, 32);

      // コアのルーン発光
      this.ctx.fillStyle = '#38bdf8';
      this.ctx.beginPath();
      this.ctx.arc(0, 0, 6, 0, Math.PI * 2);
      this.ctx.fill();

    } else if (m.type === 'dragon') {
      // 大魔竜ドラゴン（BOSS）
      const wingFlap = Math.sin(performance.now() * 0.015) * 16;
      this.ctx.fillStyle = '#dc2626';

      // 巨大な翼
      this.ctx.beginPath();
      this.ctx.moveTo(0, 0);
      this.ctx.lineTo(-45, -30 + wingFlap);
      this.ctx.lineTo(-20, 10);
      this.ctx.closePath();
      this.ctx.fill();

      this.ctx.beginPath();
      this.ctx.moveTo(0, 0);
      this.ctx.lineTo(45, -30 + wingFlap);
      this.ctx.lineTo(20, 10);
      this.ctx.closePath();
      this.ctx.fill();

      // ドラゴン頭部
      this.ctx.fillStyle = '#b91c1c';
      this.ctx.beginPath();
      this.ctx.arc(0, -6, 20, 0, Math.PI * 2);
      this.ctx.fill();

      // 角
      this.ctx.fillStyle = '#fbbf24';
      this.ctx.beginPath();
      this.ctx.moveTo(-8, -20);
      this.ctx.lineTo(-18, -38);
      this.ctx.lineTo(-2, -26);
      this.ctx.closePath();
      this.ctx.fill();

      this.ctx.beginPath();
      this.ctx.moveTo(8, -20);
      this.ctx.lineTo(18, -38);
      this.ctx.lineTo(2, -26);
      this.ctx.closePath();
      this.ctx.fill();
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

    this.ctx.font = isTarget ? 'bold 15px sans-serif' : '13px sans-serif';
    const textWidth = this.ctx.measureText(pText).width;
    const bubbleW = Math.max(textWidth + 18, 70);
    const bubbleH = 26;
    const bubbleY = m.isBoss ? -70 : -42;

    // バルーン背景
    this.ctx.fillStyle = isTarget ? '#fef08a' : 'rgba(255, 255, 255, 0.95)';
    this.ctx.strokeStyle = isTarget ? '#ca8a04' : '#64748b';
    this.ctx.lineWidth = isTarget ? 2.5 : 1.5;

    this.ctx.beginPath();
    this.ctx.roundRect(-bubbleW / 2, bubbleY, bubbleW, bubbleH, 6);
    this.ctx.fill();
    this.ctx.stroke();

    // しっぽ
    this.ctx.beginPath();
    this.ctx.moveTo(-4, bubbleY + bubbleH);
    this.ctx.lineTo(0, bubbleY + bubbleH + 6);
    this.ctx.lineTo(4, bubbleY + bubbleH);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();

    // テキスト描画
    this.ctx.fillStyle = '#0f172a';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(pText, 0, bubbleY + bubbleH / 2);
  }

  drawProjectiles() {
    this.projectiles.forEach((p) => {
      // トレイル
      p.trail.forEach((tr, idx) => {
        this.ctx.fillStyle = `rgba(56, 189, 248, ${(idx / p.trail.length) * 0.5})`;
        this.ctx.beginPath();
        this.ctx.arc(tr.x, tr.y, 4, 0, Math.PI * 2);
        this.ctx.fill();
      });

      // 弾頭
      this.ctx.fillStyle = '#ffffff';
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.strokeStyle = '#0284c7';
      this.ctx.lineWidth = 3;
      this.ctx.stroke();
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
      this.ctx.font = `bold ${ft.size}px "M PLUS Rounded 1c", sans-serif, system-ui`;
      this.ctx.fillStyle = ft.color;
      this.ctx.textAlign = 'center';
      this.ctx.shadowColor = 'rgba(0,0,0,0.7)';
      this.ctx.shadowBlur = 6;
      this.ctx.fillText(ft.text, ft.x, ft.y);
      this.ctx.restore();
    });
  }

  drawFreezeOverlay() {
    this.ctx.strokeStyle = 'rgba(147, 197, 253, 0.7)';
    this.ctx.lineWidth = 12;
    this.ctx.strokeRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.fillStyle = 'rgba(219, 234, 254, 0.15)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
