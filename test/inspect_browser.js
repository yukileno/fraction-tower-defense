import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

async function run() {
  const edgePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const userDataDir = path.join(os.tmpdir(), 'edge-debug-' + Date.now());

  const targetUrl = 'https://yukileno.github.io/fraction-tower-defense/';
  console.log('Launching browser with target URL...', targetUrl);
  const browser = spawn(edgePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--ignore-certificate-errors',
    targetUrl
  ], { stdio: 'ignore' });

  // Wait for port 9222
  let target = null;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const res = await fetch('http://localhost:9222/json/list');
      const json = await res.json();
      if (json && json.length > 0) {
        // Find page target matching fraction-tower-defense
        target = json.find(t => t.type === 'page' && t.url.includes('fraction-tower-defense')) || json.find(t => t.type === 'page');
        if (target && target.webSocketDebuggerUrl) break;
      }
    } catch (e) {}
  }

  if (!target || !target.webSocketDebuggerUrl) {
    console.error('Failed to connect to browser debugging port');
    browser.kill();
    process.exit(1);
  }

  console.log('Connected to target:', target.title, target.url);
  const ws = new WebSocket(target.webSocketDebuggerUrl);

  let msgId = 1;
  function send(method, params = {}) {
    ws.send(JSON.stringify({ id: msgId++, method, params }));
  }

  const fs = await import('node:fs');

  ws.onopen = () => {
    send('Runtime.enable');
    send('Log.enable');
    send('Network.enable');
    send('Page.enable');
    send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false
    });
  };

  ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);
    if (data.method === 'Page.loadEventFired') {
      console.log('Page loaded! Waiting 2.5s for animation/render...');
      await new Promise(r => setTimeout(r, 2500));

      send('Runtime.evaluate', {
        expression: `(() => {
          const p = document.getElementById("problemArea");
          const s = document.getElementById("scoreDisplay");
          const canvas = document.getElementById("gameCanvas");
          const scratch = document.getElementById("scratchCanvas");
          const widthBtns = document.querySelectorAll(".pen-width-btn");

          // 手書きキャンバスにテスト用の計算メモ（細字 1.5px）をシミュレート描画
          if (scratch) {
            const ctx = scratch.getContext("2d");
            ctx.strokeStyle = "#3b82f6";
            ctx.lineWidth = 1.5;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            
            // "1/3 + 1/6" の手書きメモを描画
            ctx.beginPath();
            // "1"
            ctx.moveTo(40, 50); ctx.lineTo(40, 90);
            // 横棒
            ctx.moveTo(30, 95); ctx.lineTo(55, 95);
            // "3"
            ctx.moveTo(35, 105); ctx.lineTo(50, 105); ctx.lineTo(40, 115); ctx.lineTo(50, 125); ctx.lineTo(35, 125);
            // "+"
            ctx.moveTo(70, 95); ctx.lineTo(85, 95);
            ctx.moveTo(77, 87); ctx.lineTo(77, 103);
            // "1"
            ctx.moveTo(105, 50); ctx.lineTo(105, 90);
            // 横棒
            ctx.moveTo(95, 95); ctx.lineTo(120, 95);
            // "6"
            ctx.moveTo(115, 105); ctx.lineTo(100, 115); ctx.lineTo(115, 125); ctx.lineTo(100, 125); ctx.lineTo(100, 115);
            // "="
            ctx.moveTo(135, 92); ctx.lineTo(150, 92);
            ctx.moveTo(135, 98); ctx.lineTo(150, 98);
            // "3/6 = 1/2"
            ctx.stroke();
          }

          return {
            title: document.title,
            problem: p ? p.innerText.replace(/\\s+/g, ' ').trim() : null,
            score: s ? s.innerText : null,
            penWidthBtnCount: widthBtns.length,
            penWidthLabels: Array.from(widthBtns).map(b => b.innerText)
          };
        })()`,
        returnByValue: true
      });

      send('Page.captureScreenshot', { format: 'png' });
    }

    if (data.id && data.result) {
      if (data.result.result && data.result.result.value) {
        console.log('DOM & Canvas state:', JSON.stringify(data.result.result.value, null, 2));
      }
      if (data.result.data) {
        const buf = Buffer.from(data.result.data, 'base64');
        const outPath = 'C:\\Users\\yukil\\.gemini\\antigravity\\brain\\838fdd43-5d91-4bac-8e34-849bea01ba04\\live_site_cdp.png';
        fs.writeFileSync(outPath, buf);
        console.log('Saved CDP screenshot to', outPath, `(${buf.length} bytes)`);
      }
    }

    if (data.method === 'Runtime.consoleAPICalled') {
      console.log(`[BROWSER CONSOLE ${data.params.type.toUpperCase()}]`, ...data.params.args.map(a => a.value || a.description));
    }
    if (data.method === 'Runtime.exceptionThrown') {
      console.error(`[BROWSER UNCAUGHT EXCEPTION]`, JSON.stringify(data.params.exceptionDetails, null, 2));
    }
  };

  // Wait 6 seconds to observe
  await new Promise(r => setTimeout(r, 6000));

  ws.close();
  browser.kill();
  process.exit(0);
}

run().catch(console.error);
