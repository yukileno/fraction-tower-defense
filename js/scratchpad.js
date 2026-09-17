/**
 * 手書き計算メモ（スクラッチパッド）機能
 * 画面上で通分や倍数、ひっ算をメモできるキャンバス
 */
export class Scratchpad {
  constructor(canvasElement, options = {}) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.isDrawing = false;
    this.color = '#2563eb'; // 青ペン
    this.lineWidth = 3;
    this.isEraser = false;

    this.init();
  }

  init() {
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // マウスイベント
    this.canvas.addEventListener('mousedown', (e) => this.startDraw(e));
    window.addEventListener('mousemove', (e) => this.draw(e));
    window.addEventListener('mouseup', () => this.stopDraw());

    // タッチイベント（タブレット・スマホ対応）
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.startDraw(e.touches[0]);
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (this.isDrawing) {
        e.preventDefault();
        this.draw(e.touches[0]);
      }
    }, { passive: false });

    window.addEventListener('touchend', () => this.stopDraw());
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      if (this.canvas.width > 0 && this.canvas.height > 0) {
        // 描画内容を一時退避
        const temp = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.ctx.putImageData(temp, 0, 0);
      } else {
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
      }
    }
  }

  getPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
      y: (e.clientY - rect.top) * (this.canvas.height / rect.height)
    };
  }

  startDraw(e) {
    this.isDrawing = true;
    const pos = this.getPos(e);
    this.ctx.beginPath();
    this.ctx.moveTo(pos.x, pos.y);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.strokeStyle = this.isEraser ? '#ffffff' : this.color;
    this.ctx.lineWidth = this.isEraser ? 16 : this.lineWidth;
  }

  draw(e) {
    if (!this.isDrawing) return;
    const pos = this.getPos(e);
    this.ctx.lineTo(pos.x, pos.y);
    this.ctx.stroke();
  }

  stopDraw() {
    if (this.isDrawing) {
      this.ctx.closePath();
      this.isDrawing = false;
    }
  }

  setColor(color) {
    this.isEraser = false;
    this.color = color;
  }

  setEraser(enabled = true) {
    this.isEraser = enabled;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
