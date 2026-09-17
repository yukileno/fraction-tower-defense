import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import fs from 'node:fs';

async function run() {
  const edgePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const userDataDir = path.join(os.tmpdir(), 'edge-debug-' + Date.now());

  // 簡易静的ファイルサーバーを起動（カレントディレクトリ td）
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
  await new Promise(resolve => server.listen(8888, resolve));

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
        // Find page target matching localhost or td
        target = json.find(t => t.type === 'page' && (t.url.includes('localhost:8888') || t.url.includes('fraction-tower-defense'))) || json.find(t => t.type === 'page');
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

  let shotIndex = 0;
  ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);
    if (data.method === 'Page.loadEventFired') {
      console.log('Page loaded! Waiting 2.5s for animation/render...');
      await new Promise(r => setTimeout(r, 2500));

      send('Runtime.evaluate', {
        expression: `(() => {
          const overlay = document.getElementById("startOverlay");
          const startBtn = document.getElementById("startGameBtn");
          const rankBtn = document.getElementById("titleRankingBtn");
          return {
            overlayVisible: overlay && !overlay.classList.contains("hidden"),
            startBtnText: startBtn ? startBtn.innerText.trim() : null,
            rankBtnText: rankBtn ? rankBtn.innerText.trim() : null
          };
        })()`,
        returnByValue: true
      });

      // 1. 初期画面のスクリーンショット
      send('Page.captureScreenshot', { format: 'png' });

      // 2. ランキングボタンをクリックしてモーダルを開く
      setTimeout(() => {
        console.log('Clicking ranking button to open modal...');
        send('Runtime.evaluate', {
          expression: `(() => {
            const rankBtn = document.getElementById("titleRankingBtn");
            if (rankBtn) rankBtn.click();
            return true;
          })()`
        });

        setTimeout(() => {
          console.log('Capturing ranking modal screenshot...');
          send('Runtime.evaluate', {
            expression: `(() => {
              const modal = document.getElementById("rankingModal");
              const rows = document.querySelectorAll("#rankingTableBody tr");
              return {
                modalVisible: modal && !modal.classList.contains("hidden"),
                rowCount: rows.length
              };
            })()`,
            returnByValue: true
          });
          send('Page.captureScreenshot', { format: 'png' });

          // 3. ランキングモーダルを閉じて「ゲームスタート」をクリック
          setTimeout(() => {
            console.log('Closing ranking modal and clicking start game...');
            send('Runtime.evaluate', {
              expression: `(() => {
                const closeBtn = document.getElementById("closeRankingBtn");
                if (closeBtn) closeBtn.click();
                const startBtn = document.getElementById("startGameBtn");
                if (startBtn) startBtn.click();
                return true;
              })()`
            });

            setTimeout(() => {
              console.log('Capturing live game screen after start...');
              send('Runtime.evaluate', {
                expression: `(() => {
                  const p = document.getElementById("problemArea");
                  const s = document.getElementById("scoreDisplay");
                  return {
                    gameProblem: p ? p.innerText.replace(/\\s+/g, ' ').trim() : null,
                    score: s ? s.innerText : null
                  };
                })()`,
                returnByValue: true
              });
              send('Page.captureScreenshot', { format: 'png' });
            }, 2000);
          }, 1500);
        }, 3500);
      }, 1500);
    }

    if (data.id && data.result) {
      if (data.result.result && data.result.result.value) {
        console.log('Inspection result:', JSON.stringify(data.result.result.value, null, 2));
      }
      if (data.result.data) {
        shotIndex++;
        const filenames = ['title_screen_cdp.png', 'ranking_modal_cdp.png', 'live_site_cdp.png'];
        const name = filenames[shotIndex - 1] || `screen_${shotIndex}.png`;
        const buf = Buffer.from(data.result.data, 'base64');
        const outPath = path.join('C:\\Users\\yukil\\.gemini\\antigravity\\brain\\838fdd43-5d91-4bac-8e34-849bea01ba04', name);
        fs.writeFileSync(outPath, buf);
        console.log('Saved screenshot to', outPath, `(${buf.length} bytes)`);
      }
    }

    if (data.method === 'Runtime.consoleAPICalled') {
      console.log(`[BROWSER CONSOLE ${data.params.type.toUpperCase()}]`, ...data.params.args.map(a => a.value || a.description));
    }
    if (data.method === 'Runtime.exceptionThrown') {
      console.error(`[BROWSER UNCAUGHT EXCEPTION]`, JSON.stringify(data.params.exceptionDetails, null, 2));
    }
  };

  // Wait 13 seconds to observe full flow
  await new Promise(r => setTimeout(r, 13000));

  ws.close();
  browser.kill();
  server.close();
  process.exit(0);
}

run().catch(console.error);
