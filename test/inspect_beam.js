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
      res.writeHead(200, {
        'Content-Type': mimeTypes[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
      });
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
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false
    });
  };

  let pageLoadCount = 0;

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
      pageLoadCount++;
      console.log(`Page load #${pageLoadCount}...`);

      if (pageLoadCount === 1) {
        // Step 1: Process images and update assets.js
        console.log('Reading source image files...');
        const houseBuf = fs.readFileSync('C:\\Users\\yukil\\.gemini\\antigravity\\brain\\838fdd43-5d91-4bac-8e34-849bea01ba04\\house_entrance_1789692095941.jpg');
        const houseUri = 'data:image/jpeg;base64,' + houseBuf.toString('base64');

        const childBuf = fs.readFileSync('C:\\Users\\yukil\\.gemini\\antigravity\\brain\\838fdd43-5d91-4bac-8e34-849bea01ba04\\child_back_view_1789692140812.jpg');
        const childUri = 'data:image/jpeg;base64,' + childBuf.toString('base64');

        console.log('Processing house & child in browser canvas...');
        const processed = await send('Runtime.evaluate', {
          expression: `(async (hSrc, cSrc) => {
            // 1. House canvas
            const hImg = new Image();
            await new Promise(r => { hImg.onload = r; hImg.src = hSrc; });
            const c1 = document.createElement('canvas');
            c1.width = 512;
            c1.height = 512;
            const ctx1 = c1.getContext('2d');
            ctx1.drawImage(hImg, 0, 0, 512, 512);

            // Nameplate "わが家"
            const plateX = 388, plateY = 196, plateW = 44, plateH = 82;
            ctx1.fillStyle = '#fef3c7';
            ctx1.beginPath();
            ctx1.roundRect(plateX, plateY, plateW, plateH, 4);
            ctx1.fill();
            ctx1.strokeStyle = '#78350f';
            ctx1.lineWidth = 2;
            ctx1.stroke();

            ctx1.fillStyle = '#451a03';
            ctx1.font = '900 15px sans-serif';
            ctx1.textAlign = 'center';
            ctx1.fillText('わ', plateX + plateW/2, plateY + 24);
            ctx1.fillText('が', plateX + plateW/2, plateY + 46);
            ctx1.fillText('家', plateX + plateW/2, plateY + 68);
            const houseData = c1.toDataURL('image/jpeg', 0.84);

            // 2. Child sprite (512x256, 2 frames: idle left, attack right)
            const cImg = new Image();
            await new Promise(r => { cImg.onload = r; cImg.src = cSrc; });
            const c2 = document.createElement('canvas');
            c2.width = 512;
            c2.height = 256;
            const ctx2 = c2.getContext('2d');

            // Left: Idle
            ctx2.drawImage(cImg, 30, 80, 440, 800, 10, 10, 236, 236);
            // Right: Magic attack
            ctx2.drawImage(cImg, 480, 50, 520, 840, 260, 8, 246, 240);

            // Threshold dark background to pure black #000000
            const imgData = ctx2.getImageData(0, 0, 512, 256);
            const data = imgData.data;
            for (let i = 0; i < data.length; i += 4) {
              if (data[i] < 22 && data[i+1] < 22 && data[i+2] < 22) {
                data[i] = 0;
                data[i+1] = 0;
                data[i+2] = 0;
              }
            }
            ctx2.putImageData(imgData, 0, 0);
            const childData = c2.toDataURL('image/jpeg', 0.86);

            return { houseData, childData };
          })(${JSON.stringify(houseUri)}, ${JSON.stringify(childUri)})`,
          awaitPromise: true,
          returnByValue: true
        });

        const { houseData, childData } = processed.result.value;
        console.log('House Base64 length:', houseData.length);
        console.log('Child Base64 length:', childData.length);

        // Update assets.js
        const assetsPath = path.join(process.cwd(), 'js', 'assets.js');
        let assetsContent = fs.readFileSync(assetsPath, 'utf8');

        if (!assetsContent.includes('HOUSE_IMAGE_DATA')) {
          assetsContent += `\nexport const HOUSE_IMAGE_DATA = '${houseData}';\n`;
        } else {
          const hPrefix = "export const HOUSE_IMAGE_DATA = '";
          const hIdx = assetsContent.indexOf(hPrefix);
          const hEnd = assetsContent.indexOf("';", hIdx);
          assetsContent = assetsContent.substring(0, hIdx + hPrefix.length) + houseData + assetsContent.substring(hEnd);
        }

        if (!assetsContent.includes('CHILD_SPRITE_DATA')) {
          assetsContent += `\nexport const CHILD_SPRITE_DATA = '${childData}';\n`;
        } else {
          const cPrefix = "export const CHILD_SPRITE_DATA = '";
          const cIdx = assetsContent.indexOf(cPrefix);
          const cEnd = assetsContent.indexOf("';", cIdx);
          assetsContent = assetsContent.substring(0, cIdx + cPrefix.length) + childData + assetsContent.substring(cEnd);
        }

        fs.writeFileSync(assetsPath, assetsContent, 'utf8');
        console.log('Updated js/assets.js with HOUSE_IMAGE_DATA & CHILD_SPRITE_DATA!');

        // Reload page to let game load the new assets
        console.log('Reloading page...');
        await send('Page.reload');
        return;
      }

      // Step 2: Test game with new house and child sprite
      console.log('Page reloaded with new assets! Waiting 1s...');
      await new Promise(r => setTimeout(r, 1000));

      // Click start game button
      await send('Runtime.evaluate', {
        expression: `(() => {
          const startBtn = document.getElementById("startGameBtn");
          if (startBtn) startBtn.click();
          return true;
        })()`
      });

      // Wait for game loop to render running frames
      await new Promise(r => setTimeout(r, 600));

      // Capture idle state showing house and child from behind
      console.log('Capturing player_house_idle.png...');
      const idleShot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync('C:\\Users\\yukil\\.gemini\\antigravity\\brain\\838fdd43-5d91-4bac-8e34-849bea01ba04\\player_house_idle.png', Buffer.from(idleShot.data, 'base64'));
      console.log('Saved player_house_idle.png');

      // Answer problem to trigger attack and capture casting pose
      console.log('Answering problem to trigger magic cast animation...');
      await send('Runtime.evaluate', {
        expression: `(() => {
          const prob = window.gameInstance.getCurrentProblem();
          const ans = prob.simplifiedResult;
          document.getElementById("inputNum").value = String(ans.num);
          document.getElementById("inputDen").value = String(ans.den);
          document.getElementById("attackBtn").click();
        })()`
      });

      // Capture mid-cast (~100ms)
      await new Promise(r => setTimeout(r, 100));
      const castShot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync('C:\\Users\\yukil\\.gemini\\antigravity\\brain\\838fdd43-5d91-4bac-8e34-849bea01ba04\\player_beam_cast.png', Buffer.from(castShot.data, 'base64'));
      console.log('Saved player_beam_cast.png');

      console.log('All verification screenshots captured successfully!');
      ws.close();
      browser.kill();
      server.close();
      process.exit(0);
    }
  };
}

run().catch(console.error);
