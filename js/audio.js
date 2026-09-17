/**
 * Web Audio API による完全内蔵サウンドシステム（外部ファイル依存ゼロ）
 */
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.bgmVolume = 0.25;
    this.sfxVolume = 0.5;
    this.bgmNode = null;
    this.isBgmPlaying = false;
    this.tempo = 130;
    this.bgmTimer = null;
    this.bgmStep = 0;
  }

  // ユーザー操作時にAudioContextを初期化・再開
  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.stopBgm();
    } else {
      this.startBgm();
    }
    return this.isMuted;
  }

  // UIクリック音
  playClick() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const t = this.ctx.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(800, t + 0.05);

    gain.gain.setValueAtTime(0.2 * this.sfxVolume, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.05);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.05);
  }

  // 正解音（ピンポン♪・明るい2音）
  playCorrect() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const playNote = (freq, start, duration) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.4 * this.sfxVolume, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + duration);
    };

    // ド（高）→ ソ（高）
    playNote(523.25, t, 0.18);        // C5
    playNote(659.25, t + 0.12, 0.28); // E5
    playNote(783.99, t + 0.22, 0.45); // G5
  }

  // 惜しい！（約分忘れ）音（やさしい木琴風アラート）
  playAlmost() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const notes = [440, 554.37, 440];
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + idx * 0.1);

      gain.gain.setValueAtTime(0.3 * this.sfxVolume, t + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, t + idx * 0.1 + 0.12);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t + idx * 0.1);
      osc.stop(t + idx * 0.1 + 0.12);
    });
  }

  // 不正解音（やわらかいブブー）
  playWrong() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.linearRampToValueAtTime(110, t + 0.28);

    gain.gain.setValueAtTime(0.25 * this.sfxVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.28);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.28);
  }

  // 魔法発射音（シュイン！）
  playShoot() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(1400, t + 0.18);

    gain.gain.setValueAtTime(0.3 * this.sfxVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.2);
  }

  // 敵撃破音（ドカン＆キラキラ）
  playHit() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    // 低音爆破ノイズ風
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.25);

    gain.gain.setValueAtTime(0.4 * this.sfxVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.25);

    // 高音キラキラ
    const chime = this.ctx.createOscillator();
    const chimeGain = this.ctx.createGain();
    chime.type = 'sine';
    chime.frequency.setValueAtTime(987.77, t + 0.05);
    chime.frequency.exponentialRampToValueAtTime(1567.98, t + 0.2);

    chimeGain.gain.setValueAtTime(0.2 * this.sfxVolume, t + 0.05);
    chimeGain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);

    chime.connect(chimeGain);
    chimeGain.connect(this.ctx.destination);
    chime.start(t + 0.05);
    chime.stop(t + 0.25);
  }

  // 城ダメージ音（ズズーン重低音）
  playCastleDamage() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.45);

    gain.gain.setValueAtTime(0.6 * this.sfxVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.45);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.45);
  }

  // 必殺技・時間停止（冷気・キーン）
  playFreeze() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.linearRampToValueAtTime(2400, t + 0.6);

    gain.gain.setValueAtTime(0.35 * this.sfxVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.65);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.65);
  }

  // 必殺技・メテオボム（大爆発）
  playMeteor() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    // 落下ホイッスル
    const drop = this.ctx.createOscillator();
    const dropGain = this.ctx.createGain();
    drop.type = 'sine';
    drop.frequency.setValueAtTime(900, t);
    drop.frequency.exponentialRampToValueAtTime(100, t + 0.35);

    dropGain.gain.setValueAtTime(0.3 * this.sfxVolume, t);
    dropGain.gain.linearRampToValueAtTime(0.01, t + 0.35);
    drop.connect(dropGain);
    dropGain.connect(this.ctx.destination);
    drop.start(t);
    drop.stop(t + 0.35);

    // 轟音爆発
    setTimeout(() => {
      if (this.isMuted || !this.ctx) return;
      const t2 = this.ctx.currentTime;
      const boom = this.ctx.createOscillator();
      const boomGain = this.ctx.createGain();
      boom.type = 'square';
      boom.frequency.setValueAtTime(80, t2);
      boom.frequency.exponentialRampToValueAtTime(20, t2 + 0.6);

      boomGain.gain.setValueAtTime(0.7 * this.sfxVolume, t2);
      boomGain.gain.exponentialRampToValueAtTime(0.01, t2 + 0.65);

      boom.connect(boomGain);
      boomGain.connect(this.ctx.destination);
      boom.start(t2);
      boom.stop(t2 + 0.65);
    }, 320);
  }

  // コンボ時のピッチ上昇チャイム
  playCombo(combo) {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const baseFreq = 523.25; // C5
    const semitones = Math.min(combo * 2, 16);
    const freq = baseFreq * Math.pow(2, semitones / 12);

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);

    gain.gain.setValueAtTime(0.35 * this.sfxVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  // ゲームオーバー
  playGameOver() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const notes = [440, 415.3, 392, 349.23]; // A4 -> Ab4 -> G4 -> F4
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + idx * 0.25);

      gain.gain.setValueAtTime(0.35 * this.sfxVolume, t + idx * 0.25);
      gain.gain.exponentialRampToValueAtTime(0.01, t + idx * 0.25 + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t + idx * 0.25);
      osc.stop(t + idx * 0.25 + 0.35);
    });
  }

  // 軽快なチプトーンBGMループ
  startBgm() {
    if (this.isMuted || this.isBgmPlaying) return;
    this.init();
    if (!this.ctx) return;

    this.isBgmPlaying = true;
    this.bgmStep = 0;

    // 16ステップの親しみやすいメロディとベースライン (Cメジャー/Aマイナー)
    const melody = [
      523.25, 0, 659.25, 0, 783.99, 659.25, 523.25, 0,
      587.33, 0, 659.25, 0, 523.25, 0, 392.00, 0
    ];
    const bass = [
      130.81, 130.81, 164.81, 164.81, 196.00, 196.00, 130.81, 130.81,
      146.83, 146.83, 164.81, 164.81, 130.81, 130.81, 98.00, 98.00
    ];

    const stepDuration = 60 / (this.tempo * 2); // 16分音符

    const loop = () => {
      if (!this.isBgmPlaying || !this.ctx) return;

      const t = this.ctx.currentTime;
      const note = melody[this.bgmStep % 16];
      const bassNote = bass[this.bgmStep % 16];

      // メロディ
      if (note > 0) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(note, t);

        gain.gain.setValueAtTime(0.08 * this.bgmVolume, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + stepDuration * 0.85);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + stepDuration * 0.85);
      }

      // ベース
      if (bassNote > 0) {
        const bOsc = this.ctx.createOscillator();
        const bGain = this.ctx.createGain();
        bOsc.type = 'sine';
        bOsc.frequency.setValueAtTime(bassNote, t);

        bGain.gain.setValueAtTime(0.12 * this.bgmVolume, t);
        bGain.gain.exponentialRampToValueAtTime(0.001, t + stepDuration * 0.9);

        bOsc.connect(bGain);
        bGain.connect(this.ctx.destination);
        bOsc.start(t);
        bOsc.stop(t + stepDuration * 0.9);
      }

      this.bgmStep++;
      this.bgmTimer = setTimeout(loop, stepDuration * 1000);
    };

    loop();
  }

  stopBgm() {
    this.isBgmPlaying = false;
    if (this.bgmTimer) {
      clearTimeout(this.bgmTimer);
      this.bgmTimer = null;
    }
  }
}

export const sound = new SoundEngine();
