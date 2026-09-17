/**
 * アプリケーション コントローラー & UI バインディング
 */
import { TowerDefenseGame } from './game.js';
import { Scratchpad } from './scratchpad.js';
import { sound } from './audio.js';

// DOM要素
const canvas = document.getElementById('gameCanvas');
const scratchCanvas = document.getElementById('scratchCanvas');

// HUD 要素
const livesDisplay = document.getElementById('livesDisplay');
const scoreDisplay = document.getElementById('scoreDisplay');
const highScoreDisplay = document.getElementById('highScoreDisplay');
const waveDisplay = document.getElementById('waveDisplay');
const comboBadge = document.getElementById('comboBadge');
const comboText = document.getElementById('comboText');
const mpBar = document.getElementById('mpBar');
const mpText = document.getElementById('mpText');
const freezeSkillBtn = document.getElementById('freezeSkillBtn');
const meteorSkillBtn = document.getElementById('meteorSkillBtn');

// 入力・問題要素
const problemArea = document.getElementById('problemArea');
const hintBox = document.getElementById('hintBox');
const hintText = document.getElementById('hintText');
const toggleHintBtn = document.getElementById('toggleHintBtn');
const feedbackBox = document.getElementById('feedbackBox');

const mixedContainer = document.getElementById('mixedContainer');
const wholeInput = document.getElementById('inputWhole');
const numInput = document.getElementById('inputNum');
const denInput = document.getElementById('inputDen');
const attackBtn = document.getElementById('attackBtn');

// スクラッチパッド & モーダル要素
const scratchpadModal = document.getElementById('scratchpadModal');
const toggleScratchBtn = document.getElementById('toggleScratchBtn');
const closeScratchBtn = document.getElementById('closeScratchBtn');
const clearScratchBtn = document.getElementById('clearScratchBtn');
const penColorBtns = document.querySelectorAll('.pen-color-btn');
const eraserBtn = document.getElementById('eraserBtn');

// サウンド切替
const soundToggleBtn = document.getElementById('soundToggleBtn');

// ゲームオーバーモーダル
const gameOverModal = document.getElementById('gameOverModal');
const finalScoreDisplay = document.getElementById('finalScoreDisplay');
const finalHighScoreDisplay = document.getElementById('finalHighScoreDisplay');
const finalWaveDisplay = document.getElementById('finalWaveDisplay');
const finalComboDisplay = document.getElementById('finalComboDisplay');
const finalDefeatedDisplay = document.getElementById('finalDefeatedDisplay');
const reviewListContainer = document.getElementById('reviewListContainer');
const restartBtn = document.getElementById('restartBtn');

// ガイドモーダル
const guideModal = document.getElementById('guideModal');
const guideBtn = document.getElementById('guideBtn');
const closeGuideBtn = document.getElementById('closeGuideBtn');

// 入力状態管理
let activeInput = numInput; // デフォルトは分子
let isMixedMode = false;

// スクラッチパッド初期化
const scratchpad = new Scratchpad(scratchCanvas);

// ゲームインスタンス初期化
const game = new TowerDefenseGame(canvas, {
  updateHUD: (status) => {
    // ライフ表示
    let hearts = '';
    for (let i = 0; i < status.maxLives; i++) {
      hearts += i < status.lives ? '❤️' : '🖤';
    }
    livesDisplay.textContent = hearts;

    // スコア & ウェーブ
    scoreDisplay.textContent = status.score.toLocaleString();
    highScoreDisplay.textContent = status.highScore.toLocaleString();
    waveDisplay.textContent = `ウェーブ ${status.wave}`;

    // コンボバッジ
    if (status.combo > 1) {
      comboBadge.classList.remove('hidden');
      comboText.textContent = `${status.combo} 連続せいかい！`;
    } else {
      comboBadge.classList.add('hidden');
    }

    // MPゲージ
    const percent = Math.min(100, Math.floor((status.mp / status.maxMp) * 100));
    mpBar.style.width = `${percent}%`;
    mpText.textContent = `${percent}%`;

    // 必殺技ボタン有効状態
    if (status.mp >= 50 && !game.isFrozen) {
      freezeSkillBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      freezeSkillBtn.classList.add('animate-pulse');
    } else {
      freezeSkillBtn.classList.add('opacity-50', 'cursor-not-allowed');
      freezeSkillBtn.classList.remove('animate-pulse');
    }

    if (status.mp >= 100) {
      meteorSkillBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      meteorSkillBtn.classList.add('animate-bounce');
    } else {
      meteorSkillBtn.classList.add('opacity-50', 'cursor-not-allowed');
      meteorSkillBtn.classList.remove('animate-bounce');
    }
  },

  onTargetChange: (monster) => {
    if (!monster) {
      renderProblem(null);
      return;
    }
    renderProblem(monster.problem);
  },

  onGameOver: (result) => {
    showGameOver(result);
  }
});

// 問題の描画
function renderProblem(problem) {
  if (!problem) {
    problemArea.innerHTML = `
      <div class="text-slate-400 font-bold text-lg py-3 flex items-center justify-center gap-2">
        <span class="inline-block animate-spin">🌀</span> 次のモンスターが迫っています...
      </div>
    `;
    hintBox.classList.add('hidden');
    return;
  }

  const f1 = problem.fraction1;
  const f2 = problem.fraction2;
  const op = problem.opSymbol;

  // 分数のHTMLフォーマット作成（帯分数・真分数対応）
  const formatFractionHtml = (f) => {
    const wholeHtml = f.whole > 0 ? `<span class="text-3xl font-extrabold text-amber-600 mr-1">${f.whole}</span>` : '';
    return `
      <div class="inline-flex items-center mx-1">
        ${wholeHtml}
        <div class="inline-flex flex-col items-center justify-center align-middle">
          <span class="text-xl font-bold border-b-2 border-slate-700 px-2 leading-tight">${f.num}</span>
          <span class="text-xl font-bold px-2 leading-tight">${f.den}</span>
        </div>
      </div>
    `;
  };

  problemArea.innerHTML = `
    <div class="flex items-center justify-center gap-2 text-2xl font-bold text-slate-800">
      <span class="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">${problem.levelName}</span>
      ${formatFractionHtml(f1)}
      <span class="text-2xl font-black text-rose-500 mx-1">${op}</span>
      ${formatFractionHtml(f2)}
      <span class="text-2xl font-black text-slate-600 mx-1">=</span>
      <span class="text-2xl font-black text-indigo-600 animate-pulse">?</span>
    </div>
  `;

  // ヒント情報の更新
  hintText.textContent = `${f1.den} と ${f2.den} の最小公倍数は 【 ${problem.commonDen} 】 だよ！`;
  hintBox.classList.add('hidden'); // 新しい問題では初期非表示
}

// ヒントの表示切替
toggleHintBtn.addEventListener('click', () => {
  sound.playClick();
  hintBox.classList.toggle('hidden');
});

// 入力フォーカス設定
function setActiveInput(target) {
  [wholeInput, numInput, denInput].forEach(el => el.classList.remove('ring-4', 'ring-blue-400', 'bg-blue-50'));
  activeInput = target;
  if (activeInput) {
    activeInput.classList.add('ring-4', 'ring-blue-400', 'bg-blue-50');
  }
}

numInput.addEventListener('click', () => setActiveInput(numInput));
denInput.addEventListener('click', () => setActiveInput(denInput));
wholeInput.addEventListener('click', () => setActiveInput(wholeInput));

// 帯分数モード切り替え
function toggleMixedMode() {
  sound.playClick();
  isMixedMode = !isMixedMode;
  if (isMixedMode) {
    mixedContainer.classList.remove('hidden');
    setActiveInput(wholeInput);
  } else {
    mixedContainer.classList.add('hidden');
    wholeInput.value = '';
    setActiveInput(numInput);
  }
}

document.getElementById('toggleMixedBtn').addEventListener('click', toggleMixedMode);

// テンキー入力処理
function appendDigit(d) {
  sound.playClick();
  if (!activeInput) setActiveInput(numInput);
  if (activeInput.value.length < 3) {
    activeInput.value += d.toString();
  }
}

function deleteDigit() {
  sound.playClick();
  if (activeInput && activeInput.value.length > 0) {
    activeInput.value = activeInput.value.slice(0, -1);
  } else if (activeInput === denInput) {
    setActiveInput(numInput);
  } else if (activeInput === numInput && isMixedMode) {
    setActiveInput(wholeInput);
  }
}

function clearInputs() {
  wholeInput.value = '';
  numInput.value = '';
  denInput.value = '';
  setActiveInput(numInput);
}

// 数字パッドボタン登録
document.querySelectorAll('.numpad-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const digit = e.currentTarget.dataset.digit;
    if (digit !== undefined) {
      appendDigit(digit);
    }
  });
});

document.getElementById('numpadClearBtn').addEventListener('click', deleteDigit);
document.getElementById('numpadNextBtn').addEventListener('click', () => {
  sound.playClick();
  if (activeInput === wholeInput) {
    setActiveInput(numInput);
  } else if (activeInput === numInput) {
    setActiveInput(denInput);
  } else {
    setActiveInput(isMixedMode ? wholeInput : numInput);
  }
});

// 解答送信
function submitAnswer() {
  const num = parseInt(numInput.value, 10);
  const den = parseInt(denInput.value, 10);
  const whole = isMixedMode ? parseInt(wholeInput.value || '0', 10) : 0;

  if (isNaN(num) || isNaN(den)) {
    showFeedback('分子と分母の両方を入力してね！', 'warn');
    sound.playWrong();
    return;
  }

  const result = game.submitAnswer(num, den, whole);

  if (result.status === 'correct') {
    showFeedback(result.message, 'success');
    clearInputs();
  } else if (result.status === 'needs_reduction') {
    showFeedback(result.message, 'warning');
    // 約分のために分子・分母にフォーカス
    setActiveInput(numInput);
  } else {
    showFeedback(result.message || 'ちがうみたい！落ち着いて再挑戦！', 'error');
  }
}

attackBtn.addEventListener('click', submitAnswer);

// フィードバックバナー
let feedbackTimer = null;
function showFeedback(text, type = 'info') {
  feedbackBox.textContent = text;
  feedbackBox.className = 'text-center font-bold px-4 py-2 rounded-xl text-sm transition-all duration-300 transform scale-100 shadow-sm ';

  if (type === 'success') {
    feedbackBox.classList.add('bg-emerald-100', 'text-emerald-800', 'border-2', 'border-emerald-400');
  } else if (type === 'warning') {
    feedbackBox.classList.add('bg-amber-100', 'text-amber-800', 'border-2', 'border-amber-400');
  } else if (type === 'error') {
    feedbackBox.classList.add('bg-rose-100', 'text-rose-800', 'border-2', 'border-rose-400');
  } else {
    feedbackBox.classList.add('bg-blue-100', 'text-blue-800', 'border-2', 'border-blue-400');
  }

  feedbackBox.classList.remove('hidden');

  if (feedbackTimer) clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => {
    feedbackBox.classList.add('hidden');
  }, 4000);
}

// 物理キーボード操作対応
window.addEventListener('keydown', (e) => {
  if (game.isGameOver) return;

  if (e.key >= '0' && e.key <= '9') {
    appendDigit(e.key);
  } else if (e.key === 'Backspace') {
    e.preventDefault();
    deleteDigit();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    submitAnswer();
  } else if (e.key === '/' || e.key === 'Tab' || e.key === 'ArrowDown') {
    e.preventDefault();
    sound.playClick();
    if (activeInput === wholeInput) setActiveInput(numInput);
    else if (activeInput === numInput) setActiveInput(denInput);
    else setActiveInput(numInput);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    sound.playClick();
    if (activeInput === denInput) setActiveInput(numInput);
    else if (activeInput === numInput && isMixedMode) setActiveInput(wholeInput);
  } else if (e.key === 'f' || e.key === 'F') {
    // Fキーでタイムフリーズ
    game.useSkillFreeze();
  } else if (e.key === 'm' || e.key === 'M') {
    // Mキーでメテオ
    game.useSkillMeteor();
  }
});

// 必殺技ボタン登録
freezeSkillBtn.addEventListener('click', () => {
  game.useSkillFreeze();
});
meteorSkillBtn.addEventListener('click', () => {
  game.useSkillMeteor();
});

// サウンド切替
soundToggleBtn.addEventListener('click', () => {
  const isMuted = sound.toggleMute();
  soundToggleBtn.innerHTML = isMuted ? '🔇 <span class="hidden sm:inline">消音中</span>' : '🔊 <span class="hidden sm:inline">サウンドON</span>';
});

// スクラッチパッド開閉
toggleScratchBtn.addEventListener('click', () => {
  sound.playClick();
  scratchpadModal.classList.remove('hidden');
  setTimeout(() => scratchpad.resize(), 50);
});

closeScratchBtn.addEventListener('click', () => {
  sound.playClick();
  scratchpadModal.classList.add('hidden');
});

clearScratchBtn.addEventListener('click', () => {
  sound.playClick();
  scratchpad.clear();
});

eraserBtn.addEventListener('click', () => {
  sound.playClick();
  scratchpad.setEraser(true);
  eraserBtn.classList.add('ring-2', 'ring-blue-600');
  penColorBtns.forEach(b => b.classList.remove('ring-2', 'ring-blue-600'));
});

penColorBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    sound.playClick();
    const color = e.currentTarget.dataset.color;
    scratchpad.setColor(color);
    eraserBtn.classList.remove('ring-2', 'ring-blue-600');
    penColorBtns.forEach(b => b.classList.remove('ring-2', 'ring-blue-600'));
    e.currentTarget.classList.add('ring-2', 'ring-blue-600');
  });
});

// ガイドモーダル
guideBtn.addEventListener('click', () => {
  sound.playClick();
  guideModal.classList.remove('hidden');
});
closeGuideBtn.addEventListener('click', () => {
  sound.playClick();
  guideModal.classList.add('hidden');
});

// ゲームオーバー画面 & 復習リスト
function showGameOver(data) {
  finalScoreDisplay.textContent = data.score.toLocaleString();
  finalHighScoreDisplay.textContent = data.highScore.toLocaleString();
  finalWaveDisplay.textContent = data.wave;
  finalComboDisplay.textContent = `${data.maxCombo} 回`;
  finalDefeatedDisplay.textContent = `${data.totalDefeated} 体`;

  // 復習リストの生成
  reviewListContainer.innerHTML = '';
  if (data.history.length === 0) {
    reviewListContainer.innerHTML = '<p class="text-slate-400 text-center py-4">出題履歴がありません</p>';
  } else {
    data.history.forEach((h, idx) => {
      const card = document.createElement('div');
      card.className = `p-4 rounded-xl border ${h.isCorrect ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'} text-left`;

      const p = h.problem;
      const ans = p.simplifiedResult;
      const mixedText = ans.toMixed().whole > 0 ? ` （帯分数: ${ans.toMixed().toString()}）` : '';

      card.innerHTML = `
        <div class="flex items-center justify-between mb-2">
          <span class="font-bold text-slate-800 text-base">問${idx + 1}: ${p.fraction1.toString()} ${p.opSymbol} ${p.fraction2.toString()}</span>
          <span class="text-xs font-bold px-2 py-0.5 rounded-full ${h.isCorrect ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}">
            ${h.isCorrect ? '⭕ せいかい' : '❌ まちがい'}
          </span>
        </div>
        <div class="text-xs text-slate-600 mb-1">
          あなたの解答: <span class="font-bold">${h.userAnswer.whole > 0 ? h.userAnswer.whole + 'と' : ''}${h.userAnswer.num}/${h.userAnswer.den}</span>
          ／ 正しい答え: <span class="font-bold text-emerald-700">${ans.num}/${ans.den}${mixedText}</span>
        </div>
        <div class="text-xs bg-white/80 p-2 rounded border border-slate-200 space-y-0.5 text-slate-700">
          <div>💡 <strong>通分のポイント:</strong> ${p.explanation.step1}</div>
          <div>📝 <strong>途中式:</strong> ${p.explanation.step2.replace(/\n/g, ' ')}</div>
          <div>🎯 <strong>答え:</strong> ${p.explanation.step4}</div>
        </div>
      `;
      reviewListContainer.appendChild(card);
    });
  }

  gameOverModal.classList.remove('hidden');
}

restartBtn.addEventListener('click', () => {
  sound.playClick();
  gameOverModal.classList.add('hidden');
  clearInputs();
  game.start();
});

// ゲーム初期起動
function initGame() {
  setActiveInput(numInput);
  game.start();
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initGame);
} else {
  initGame();
}
