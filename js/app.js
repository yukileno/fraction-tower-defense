/**
 * アプリケーション コントローラー & UI バインディング（キーボード専用・2分割レイアウト）
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
const freezeSkillBadge = document.getElementById('freezeSkillBadge');
const meteorSkillBadge = document.getElementById('meteorSkillBadge');

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
const toggleMixedBtn = document.getElementById('toggleMixedBtn');

// スクラッチパッド（手書き計算スペース）
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

// 入力フォーカス状態
let activeInput = numInput;
let isMixedMode = false;

// スクラッチパッド（手書きメモ）初期化
const scratchpad = new Scratchpad(scratchCanvas);
// 右半分に常時配置されているので初期リサイズを実行
setTimeout(() => scratchpad.resize(), 100);

// ゲームインスタンス初期化
const game = new TowerDefenseGame(canvas, {
  updateHUD: (status) => {
    // ライフ表示
    let hearts = '';
    for (let i = 0; i < status.maxLives; i++) {
      hearts += i < status.lives ? '❤️' : '🖤';
    }
    if (livesDisplay) livesDisplay.textContent = hearts;

    // スコア & ウェーブ & ハイスコア
    if (scoreDisplay) scoreDisplay.textContent = status.score.toLocaleString();
    if (highScoreDisplay) highScoreDisplay.textContent = status.highScore.toLocaleString();
    if (waveDisplay) waveDisplay.textContent = `ウェーブ ${status.wave}`;

    // コンボバッジ
    if (comboBadge && comboText) {
      if (status.combo > 1) {
        comboBadge.classList.remove('hidden');
        comboText.textContent = `${status.combo} 連続せいかい！`;
      } else {
        comboBadge.classList.add('hidden');
      }
    }

    // MPゲージ
    const percent = Math.min(100, Math.floor((status.mp / status.maxMp) * 100));
    if (mpBar) mpBar.style.width = `${percent}%`;
    if (mpText) mpText.textContent = `${percent}%`;

    // 必殺技バッジ表示
    if (freezeSkillBadge) {
      if (status.mp >= 50 && !game.isFrozen) {
        freezeSkillBadge.classList.remove('opacity-50');
        freezeSkillBadge.classList.add('animate-pulse', 'border-sky-400', 'text-sky-200');
      } else {
        freezeSkillBadge.classList.add('opacity-50');
        freezeSkillBadge.classList.remove('animate-pulse', 'border-sky-400', 'text-sky-200');
      }
    }

    if (meteorSkillBadge) {
      if (status.mp >= 100) {
        meteorSkillBadge.classList.remove('opacity-50');
        meteorSkillBadge.classList.add('animate-bounce', 'border-orange-400', 'text-orange-200');
      } else {
        meteorSkillBadge.classList.add('opacity-50');
        meteorSkillBadge.classList.remove('animate-bounce', 'border-orange-400', 'text-orange-200');
      }
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
      <div class="text-slate-400 font-bold text-sm py-2 flex items-center justify-center gap-2">
        <span class="inline-block animate-spin">🌀</span> 次のモンスターが迫っています...
      </div>
    `;
    hintBox.classList.add('hidden');
    return;
  }

  const f1 = problem.fraction1;
  const f2 = problem.fraction2;
  const op = problem.opSymbol;

  // 分数のHTMLフォーマット
  const formatFractionHtml = (f) => {
    const wholeHtml = f.whole > 0 ? `<span class="text-2xl font-black text-amber-400 mr-1">${f.whole}</span>` : '';
    return `
      <div class="inline-flex items-center mx-1.5">
        ${wholeHtml}
        <div class="inline-flex flex-col items-center justify-center align-middle">
          <span class="text-2xl font-black border-b-2 border-slate-400 px-1.5 leading-tight text-slate-100">${f.num}</span>
          <span class="text-2xl font-black px-1.5 leading-tight text-slate-100">${f.den}</span>
        </div>
      </div>
    `;
  };

  problemArea.innerHTML = `
    <div class="flex items-center justify-center gap-2 text-xl font-bold">
      <span class="text-[11px] bg-indigo-900/90 text-indigo-300 border border-indigo-600 px-2 py-0.5 rounded-full font-bold self-center">${problem.levelName}</span>
      ${formatFractionHtml(f1)}
      <span class="text-2xl font-black text-rose-400 mx-1.5">${op}</span>
      ${formatFractionHtml(f2)}
      <span class="text-2xl font-black text-slate-400 mx-1.5">=</span>
      <span class="text-2xl font-black text-sky-400 animate-pulse">?</span>
    </div>
  `;

  // ヒント情報の更新
  hintText.textContent = `${f1.den} と ${f2.den} の最小公倍数は 【 ${problem.commonDen} 】 だよ！`;
  hintBox.classList.add('hidden');
}

// ヒントの表示切替
toggleHintBtn.addEventListener('click', () => {
  sound.playClick();
  hintBox.classList.toggle('hidden');
});

// 入力フォーカス設定
function setActiveInput(target) {
  [wholeInput, numInput, denInput].forEach(el => {
    if (el) el.classList.remove('active');
  });
  activeInput = target;
  if (activeInput) {
    activeInput.classList.add('active');
    activeInput.focus();
  }
}

numInput.addEventListener('focus', () => setActiveInput(numInput));
denInput.addEventListener('focus', () => setActiveInput(denInput));
wholeInput.addEventListener('focus', () => setActiveInput(wholeInput));

// 帯分数モード切り替え
function toggleMixedMode() {
  sound.playClick();
  isMixedMode = !isMixedMode;
  if (isMixedMode) {
    mixedContainer.classList.remove('hidden');
    toggleMixedBtn.textContent = '仮分数で答える';
    setActiveInput(wholeInput);
  } else {
    mixedContainer.classList.add('hidden');
    toggleMixedBtn.textContent = '帯分数で答える';
    wholeInput.value = '';
    setActiveInput(numInput);
  }
}

toggleMixedBtn.addEventListener('click', toggleMixedMode);

// 解答のクリア
function clearInputs() {
  wholeInput.value = '';
  numInput.value = '';
  denInput.value = '';
  setActiveInput(numInput);
}

// 解答送信
function submitAnswer() {
  const num = parseInt(numInput.value, 10);
  const den = parseInt(denInput.value, 10);
  const whole = isMixedMode ? parseInt(wholeInput.value || '0', 10) : 0;

  if (isNaN(num) || isNaN(den)) {
    showFeedback('分子と分母の両方に数字を入力してね！', 'warn');
    sound.playWrong();
    return;
  }

  const result = game.submitAnswer(num, den, whole);

  if (result.status === 'correct') {
    showFeedback(result.message, 'success');
    clearInputs();
  } else if (result.status === 'needs_reduction') {
    showFeedback(result.message, 'warning');
    setActiveInput(numInput);
  } else {
    showFeedback(result.message || 'ちがうみたい！もう一度落ち着いて計算してみてね！', 'error');
  }
}

if (attackBtn) {
  attackBtn.addEventListener('click', submitAnswer);
}

// フィードバックバナー
let feedbackTimer = null;
function showFeedback(text, type = 'info') {
  feedbackBox.textContent = text;
  feedbackBox.className = 'w-full text-center font-bold px-3 py-1.5 rounded-lg text-xs transition-all duration-300 shadow ';

  if (type === 'success') {
    feedbackBox.classList.add('bg-emerald-950', 'text-emerald-200', 'border', 'border-emerald-500');
  } else if (type === 'warning') {
    feedbackBox.classList.add('bg-amber-950', 'text-amber-200', 'border', 'border-amber-500');
  } else if (type === 'error') {
    feedbackBox.classList.add('bg-rose-950', 'text-rose-200', 'border', 'border-rose-500');
  } else {
    feedbackBox.classList.add('bg-sky-950', 'text-sky-200', 'border', 'border-sky-500');
  }

  feedbackBox.classList.remove('hidden');

  if (feedbackTimer) clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => {
    feedbackBox.classList.add('hidden');
  }, 4500);
}

// キーボード操作（数字、/、Tab、Enter、矢印、Backspace、F、M）
window.addEventListener('keydown', (e) => {
  if (game.isGameOver) return;

  // 必殺技キー
  if (e.key === 'f' || e.key === 'F') {
    if (game.useSkillFreeze()) {
      e.preventDefault();
    }
    return;
  }
  if (e.key === 'm' || e.key === 'M') {
    if (game.useSkillMeteor()) {
      e.preventDefault();
    }
    return;
  }

  // Enterキーで解答決定
  if (e.key === 'Enter') {
    e.preventDefault();
    submitAnswer();
    return;
  }

  // 分子と分母の移動キー
  if (e.key === '/' || e.key === 'Tab' || e.key === 'ArrowDown') {
    e.preventDefault();
    sound.playClick();
    if (activeInput === wholeInput) setActiveInput(numInput);
    else if (activeInput === numInput) setActiveInput(denInput);
    else setActiveInput(numInput);
    return;
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault();
    sound.playClick();
    if (activeInput === denInput) setActiveInput(numInput);
    else if (activeInput === numInput && isMixedMode) setActiveInput(wholeInput);
    return;
  }

  // 数字キーが押された場合（手書きメモなどを触った後でも直接入力できるように保証）
  if (e.key >= '0' && e.key <= '9') {
    if (document.activeElement !== wholeInput &&
        document.activeElement !== numInput &&
        document.activeElement !== denInput) {
      if (!activeInput) setActiveInput(numInput);
      activeInput.focus();
      // activeInputに文字を追加
      if (activeInput.value.length < 3) {
        activeInput.value += e.key;
        sound.playClick();
        e.preventDefault();
      }
    } else {
      sound.playClick();
    }
  }
});

// 手書き計算スペースのツール
clearScratchBtn.addEventListener('click', () => {
  sound.playClick();
  scratchpad.clear();
});

eraserBtn.addEventListener('click', () => {
  sound.playClick();
  scratchpad.setEraser(true);
  eraserBtn.classList.add('ring-2', 'ring-amber-400');
  penColorBtns.forEach(b => b.classList.remove('ring-2', 'ring-blue-500'));
});

penColorBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    sound.playClick();
    const color = e.currentTarget.dataset.color;
    scratchpad.setColor(color);
    eraserBtn.classList.remove('ring-2', 'ring-amber-400');
    penColorBtns.forEach(b => b.classList.remove('ring-2', 'ring-blue-500'));
    e.currentTarget.classList.add('ring-2', 'ring-blue-500');
  });
});

// サウンド切替
soundToggleBtn.addEventListener('click', () => {
  const isMuted = sound.toggleMute();
  soundToggleBtn.innerHTML = isMuted ? '🔇' : '🔊';
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

  reviewListContainer.innerHTML = '';
  if (data.history.length === 0) {
    reviewListContainer.innerHTML = '<p class="text-slate-400 text-center py-4">出題履歴がありません</p>';
  } else {
    data.history.forEach((h, idx) => {
      const card = document.createElement('div');
      card.className = `p-3 rounded-xl border ${h.isCorrect ? 'bg-emerald-950/60 border-emerald-600' : 'bg-rose-950/60 border-rose-600'} text-left`;

      const p = h.problem;
      const ans = p.simplifiedResult;
      const mixedText = ans.toMixed().whole > 0 ? ` （帯分数: ${ans.toMixed().toString()}）` : '';

      card.innerHTML = `
        <div class="flex items-center justify-between mb-1">
          <span class="font-bold text-slate-100">問${idx + 1}: ${p.fraction1.toString()} ${p.opSymbol} ${p.fraction2.toString()}</span>
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${h.isCorrect ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}">
            ${h.isCorrect ? '⭕ せいかい' : '❌ まちがい'}
          </span>
        </div>
        <div class="text-[11px] text-slate-300 mb-1">
          あなたの解答: <span class="font-bold text-white">${h.userAnswer.whole > 0 ? h.userAnswer.whole + 'と' : ''}${h.userAnswer.num}/${h.userAnswer.den}</span>
          ／ 正しい答え: <span class="font-bold text-emerald-400">${ans.num}/${ans.den}${mixedText}</span>
        </div>
        <div class="text-[10px] bg-slate-900/80 p-2 rounded border border-slate-700 space-y-0.5 text-slate-300">
          <div>💡 <strong>通分:</strong> ${p.explanation.step1}</div>
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
  setTimeout(() => scratchpad.resize(), 200);
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initGame);
} else {
  initGame();
}
