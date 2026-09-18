import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import fs from 'node:fs';

async function run() {
  const edgePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const userDataDir = path.join(os.tmpdir(), 'chrome-debug-beam-' + Date.now());

  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.json': 'application/json'
  };
  const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
    const filePath = path.join(process.cwd(), reqPath);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  await new Promise(resolve => server.listen(8889, resolve));

  const targetUrl = 'http://localhost:8889/index.html';
  console.log('Launching browser with local URL...', targetUrl);
  const browser = spawn(edgePath, [
    '--headless=new',
    '--remote-debugging-port=9223',
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--ignore-certificate-errors',
    targetUrl
  ], { stdio: 'ignore' });

  let target = null;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const res = await fetch('http://localhost:9223/json/list');
      const json = await res.json();
      if (json && json.length > 0) {
        target = json.find(t => t.type === 'page' && t.url.includes('localhost:8889')) || json.find(t => t.type === 'page');
        if (target && target.webSocketDebuggerUrl) break;
      }
    } catch (e) {}
  }

  if (!target || !target.webSocketDebuggerUrl) {
    console.error('Failed to connect to browser debugging port');
    browser.kill();
    server.close();
    process.exit(1);
  }

  console.log('Connected to target:', target.title, target.url);
  const ws = new WebSocket(target.webSocketDebuggerUrl);

  let msgId = 1;
  const callbacks = new Map();
  function send(method, params = {}) {
    return new Promise((resolve) => {
      const id = msgId++;
      callbacks.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  ws.onopen = async () => {
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Network.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false
    });
  };

  ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);

    if (data.id && callbacks.has(data.id)) {
      const resolve = callbacks.get(data.id);
      callbacks.delete(data.id);
      resolve(data.result);
    }

    if (data.method === 'Runtime.consoleAPICalled') {
      console.log(`[CONSOLE ${data.params.type.toUpperCase()}]`, ...data.params.args.map(a => a.value || a.description));
    }
    if (data.method === 'Runtime.exceptionThrown') {
      console.error(`[UNCAUGHT EXCEPTION]`, JSON.stringify(data.params.exceptionDetails, null, 2));
    }

    if (data.method === 'Page.loadEventFired') {
      console.log('Page loaded! Waiting 1s...');
      await new Promise(r => setTimeout(r, 1000));

      // Click start game button
      await send('Runtime.evaluate', {
        expression: `(() => {
          const startBtn = document.getElementById("startGameBtn");
          if (startBtn) startBtn.click();
          return true;
        })()`
      });
      await new Promise(r => setTimeout(r, 800));

      // Check beamSprite status
      const spriteStatus = await send('Runtime.evaluate', {
        expression: `(() => {
          return {
            hasInstance: !!window.gameInstance,
            hasBeamSprite: !!(window.gameInstance && window.gameInstance.beamSprite),
            loaded: window.gameInstance && window.gameInstance.beamSprite && window.gameInstance.beamSprite.loaded,
            imageWidth: window.gameInstance && window.gameInstance.beamSprite && window.gameInstance.beamSprite.image ? window.gameInstance.beamSprite.image.width : 0
          };
        })()`,
        returnByValue: true
      });
      console.log('Sprite status in browser:', spriteStatus.result.value);

      // 1. Answer correctly to fire standard beam & capture during travel
      console.log('Answering problem 1 (Normal Beam)...');
      await send('Runtime.evaluate', {
        expression: `(() => {
          const prob = window.gameInstance.getCurrentProblem();
          const ans = prob.simplifiedResult;
          document.getElementById("inputNum").value = String(ans.num);
          document.getElementById("inputDen").value = String(ans.den);
          document.getElementById("attackBtn").click();
        })()`
      });

      // Capture mid-beam flight (~90ms)
      await new Promise(r => setTimeout(r, 90));
      const beamShot1 = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync('C:\\Users\\yukil\\.gemini\\antigravity\\brain\\838fdd43-5d91-4bac-8e34-849bea01ba04\\beam_laser_flight.png', Buffer.from(beamShot1.data, 'base64'));
      console.log('Saved beam_laser_flight.png');

      // Capture explosion impact (~160ms later, total ~250ms)
      await new Promise(r => setTimeout(r, 160));
      const impactShot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync('C:\\Users\\yukil\\.gemini\\antigravity\\brain\\838fdd43-5d91-4bac-8e34-849bea01ba04\\beam_sprite_impact.png', Buffer.from(impactShot.data, 'base64'));
      console.log('Saved beam_sprite_impact.png');

      // Wait a bit, then set combo to 6 and answer to trigger Hyper Beam (gold & high power)
      await new Promise(r => setTimeout(r, 700));
      console.log('Triggering Hyper Combo Beam (Combo 6+)...');
      await send('Runtime.evaluate', {
        expression: `(() => {
          window.gameInstance.combo = 6;
          const prob = window.gameInstance.getCurrentProblem();
          const ans = prob.simplifiedResult;
          document.getElementById("inputNum").value = String(ans.num);
          document.getElementById("inputDen").value = String(ans.den);
          document.getElementById("attackBtn").click();
        })()`
      });

      await new Promise(r => setTimeout(r, 100));
      const hyperShot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync('C:\\Users\\yukil\\.gemini\\antigravity\\brain\\838fdd43-5d91-4bac-8e34-849bea01ba04\\hyper_beam_combo.png', Buffer.from(hyperShot.data, 'base64'));
      console.log('Saved hyper_beam_combo.png');

      await new Promise(r => setTimeout(r, 200));
      const hyperImpact = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync('C:\\Users\\yukil\\.gemini\\antigravity\\brain\\838fdd43-5d91-4bac-8e34-849bea01ba04\\hyper_beam_impact.png', Buffer.from(hyperImpact.data, 'base64'));
      console.log('Saved hyper_beam_impact.png');

      console.log('All beam verification screenshots captured successfully!');
      ws.close();
      browser.kill();
      server.close();
      process.exit(0);
    }
  };
}

run().catch(console.error);
