// Grava o tour (tour.html) quadro a quadro pelo protocolo do Chrome (sem instalar nada).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORTA = 9333;
const FPS = 24;
const DURACAO = Number(process.env.DURACAO || 71.24);
const PASTA = process.env.PASTA || 'C:/Projetos/dev/NoSigilo/divulgacao/video/quadros';
mkdirSync(PASTA, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
  '--allow-file-access-from-files', `--remote-debugging-port=${PORTA}`, '--window-size=1080,1920',
  `--user-data-dir=C:/Users/Pichau/AppData/Local/Temp/chrome-tour-${Date.now()}`, 'about:blank',
], { stdio: 'ignore' });

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let alvo;
for (let i = 0; i < 40 && !alvo; i++) {
  await espera(250);
  try { alvo = (await (await fetch(`http://127.0.0.1:${PORTA}/json`)).json()).find((x) => x.type === 'page'); } catch { /* subindo */ }
}
if (!alvo) throw new Error('Chrome não respondeu');

const ws = new WebSocket(alvo.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pendentes = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pendentes.has(m.id)) { pendentes.get(m.id)(m); pendentes.delete(m.id); }
});
const cdp = (method, params = {}) => new Promise((r) => { const id = ++seq; pendentes.set(id, r); ws.send(JSON.stringify({ id, method, params })); });

await cdp('Emulation.setDeviceMetricsOverride', { width: 1080, height: 1920, deviceScaleFactor: 1, mobile: false });
await cdp('Page.enable');
await cdp('Page.navigate', { url: process.env.PAGINA || 'file:///C:/Projetos/dev/NoSigilo/divulgacao/video/tour.html' });
await espera(4000); // fontes e imagens

const total = Math.ceil(DURACAO * FPS);
const inicio = Date.now();
for (let i = 0; i < total; i++) {
  const t = i / FPS;
  await cdp('Runtime.evaluate', { expression: `render(${t.toFixed(4)})` });
  const r = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
  writeFileSync(`${PASTA}/q${String(i).padStart(5, '0')}.jpg`, Buffer.from(r.result.data, 'base64'));
  if (i % 120 === 0) console.log(`${i}/${total} (${Math.round((Date.now() - inicio) / 1000)}s)`);
}
console.log('pronto', total);
ws.close();
chrome.kill();
