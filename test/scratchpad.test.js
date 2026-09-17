import assert from 'node:assert';
import { Scratchpad } from '../js/scratchpad.js';

// DOM Canvas モック
globalThis.window = {
  addEventListener: () => {}
};

class MockCanvas {
  constructor() {
    this.width = 400;
    this.height = 300;
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 400, height: 300 };
  }
  addEventListener() {}
  getContext() {
    return {
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      closePath: () => {},
      clearRect: () => {},
      getImageData: () => ({ data: [] }),
      putImageData: () => {},
      globalCompositeOperation: 'source-over',
      strokeStyle: '#000000',
      lineWidth: 1
    };
  }
}

console.log('--- Testing Scratchpad Logic ---');

const canvas = new MockCanvas();
const pad = new Scratchpad(canvas);

// 1. デフォルト線幅チェック（細字）
assert.ok(pad.lineWidth <= 1.6, `Default lineWidth should be thin (<= 1.6), got ${pad.lineWidth}`);
console.log(`✅ Default lineWidth is thin: ${pad.lineWidth}px`);

// 2. setLineWidth チェック
pad.setLineWidth(2.5);
assert.strictEqual(pad.lineWidth, 2.5, 'lineWidth should be updated to 2.5');
pad.setLineWidth(1.5);
assert.strictEqual(pad.lineWidth, 1.5, 'lineWidth should be reset to 1.5');
console.log('✅ setLineWidth works properly');

// 3. 消しゴムモードチェック
pad.setEraser(true);
assert.strictEqual(pad.isEraser, true, 'isEraser should be true');

pad.startDraw({ clientX: 50, clientY: 50 });
assert.strictEqual(pad.ctx.globalCompositeOperation, 'destination-out', 'Eraser must use destination-out so background grid stays intact');
console.log('✅ Eraser uses destination-out composite operation');

pad.stopDraw();
assert.strictEqual(pad.ctx.globalCompositeOperation, 'source-over', 'Must reset to source-over on stopDraw');

// 4. ペンカラー変更で消しゴム解除チェック
pad.setEraser(true);
pad.setColor('#ef4444');
assert.strictEqual(pad.isEraser, false, 'Selecting a color must disable eraser');
assert.strictEqual(pad.color, '#ef4444', 'Color must be set');
console.log('✅ Selecting color cancels eraser mode properly');

console.log('\nAll scratchpad tests passed successfully! ✍️');
