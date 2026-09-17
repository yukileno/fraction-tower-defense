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
          const ctx = canvas ? canvas.getContext("2d") : null;
          const pixel = ctx ? ctx.getImageData(100, 100, 1, 1).data : null;
          return {
            title: document.title,
            problem: p ? p.innerText : null,
            score: s ? s.innerText : null,
            canvasPixel: pixel ? Array.from(pixel) : null
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
