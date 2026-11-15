import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { resolveServerUrl } from '@/utils/serverUrl';
import type { CabineFechadaDoMapa, PessoaDoMapa, SalaDoMapa } from '@/components/MapaDaCasa';

/**
 * A Casa "por dentro": o Salão em primeira pessoa (WebGL). Arrastar para os lados
 * olha em volta (na vertical a página continua rolando); tocar no chão anda.
 * Quem está no Salão aparece em pé com a foto do perfil em cima; as portas levam
 * às outras salas de verdade e a parede das cabines lista as de porta aberta.
 * Só tela: os dados são os mesmos da planta (pedido do dono, 14/11/2026).
 */
type Props = {
  salas: SalaDoMapa[];
  onEntrar: (salaId: string) => void;
  onEspiar: (salaId: string, cabineId: string) => void;
  fechadas?: CabineFechadaDoMapa[];
  pedindo?: string | null;
  onPedir?: (cabineId: string) => void;
};

type Painel =
  | { tipo: 'pessoa'; pessoa: PessoaDoMapa }
  | { tipo: 'porta'; sala: SalaDoMapa }
  | { tipo: 'cabines' }
  | null;

export const aceitaWebGL = () => {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
};

const COR_DO_PERFIL: Record<PessoaDoMapa['cat'], string> = { casal: '#f472b6', mulher: '#fb7185', homem: '#60a5fa', outros: '#a78bfa' };
const RW = 9;
const RD = 7;
const RH = 4.6;
const EYE = 1.6;
const MAX_PESSOAS = 12;
// Lugares do Salão onde as pessoas ficam (pista no meio, sofás à esquerda, bar à direita).
const LUGARES: [number, number][] = [
  [-0.8, -0.8], [0.9, -1.4], [0.2, 0.7], [-1.9, 0.3], [1.9, 0.2], [-7.3, -0.4],
  [-7.3, 3.3], [5.6, -0.6], [5.6, 2.2], [-4.6, -4.4], [3.2, -4.6], [-3.4, 2.8],
];
// Onde fica a porta de cada sala no Salão.
const PORTAS: Record<string, { x: number; z: number; ry: number }> = {
  quarto: { x: -3, z: -RD + 0.06, ry: 0 },
  casais: { x: -RW + 0.06, z: -2.4, ry: Math.PI / 2 },
  glory: { x: -RW + 0.06, z: 3.6, ry: Math.PI / 2 },
  cuckold: { x: RW - 0.06, z: -4.6, ry: -Math.PI / 2 },
};
const COR_DA_PORTA: Record<string, number> = { quarto: 0xdc2626, casais: 0xf43f5e, glory: 0xef4444, cuckold: 0xf59e0b };

function texturaDeCanvas(w: number, h: number, desenhar: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (g) desenhar(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function placa(texto: string, w: number, h: number, cor: string) {
  const tex = texturaDeCanvas(512, 128, (g, W, H) => {
    g.fillStyle = '#1a0507'; g.fillRect(0, 0, W, H);
    g.strokeStyle = cor; g.lineWidth = 6; g.strokeRect(6, 6, W - 12, H - 12);
    g.fillStyle = cor; g.textAlign = 'center'; g.textBaseline = 'middle';
    let tam = 58;
    g.font = `600 ${tam}px Georgia, serif`;
    while (g.measureText(texto).width > W - 40 && tam > 24) { tam -= 4; g.font = `600 ${tam}px Georgia, serif`; }
    g.fillText(texto, W / 2, H / 2 + 3);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
}

/** Crachá em cima da pessoa: foto do perfil redonda (ou a inicial) e o nome. */
function cracha(p: PessoaDoMapa, foto: HTMLImageElement | null) {
  return texturaDeCanvas(256, 300, (g, W) => {
    const r = 64, cx = W / 2, cy = 80;
    g.save();
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.closePath(); g.clip();
    if (foto) {
      const lado = Math.min(foto.naturalWidth, foto.naturalHeight);
      g.drawImage(foto, (foto.naturalWidth - lado) / 2, (foto.naturalHeight - lado) / 2, lado, lado, cx - r, cy - r, r * 2, r * 2);
    } else {
      g.fillStyle = COR_DO_PERFIL[p.cat]; g.fillRect(cx - r, cy - r, r * 2, r * 2);
      g.fillStyle = '#fff'; g.font = '700 60px Inter, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText((p.nome || '?').trim().charAt(0).toUpperCase(), cx, cy + 4);
    }
    g.restore();
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.lineWidth = 9; g.strokeStyle = p.destaque ? '#fbbf24' : COR_DO_PERFIL[p.cat]; g.stroke();
    g.beginPath(); g.arc(cx + 48, cy + 46, 13, 0, Math.PI * 2); g.fillStyle = '#3ddc97'; g.fill(); g.lineWidth = 5; g.strokeStyle = '#14060a'; g.stroke();
    const nome = (p.nome || '').length > 16 ? `${p.nome.slice(0, 15)}…` : p.nome || '';
    g.font = '600 30px Inter, sans-serif';
    const tw = g.measureText(nome).width + 36;
    const x0 = (W - tw) / 2;
    g.fillStyle = 'rgba(20,6,10,.9)';
    g.beginPath(); g.roundRect(x0, 162, tw, 46, 23); g.fill();
    g.strokeStyle = 'rgba(255,79,138,.6)'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#f8ece9'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(nome, W / 2, 186);
  });
}

function carregarFoto(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((ok) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = resolveServerUrl(url);
  });
}

function boneco(cor: number, vestido: boolean, pele: THREE.Material) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: cor, roughness: 0.5, metalness: vestido ? 0.3 : 0.05 });
  const corpo = new THREE.Mesh(new THREE.CylinderGeometry(vestido ? 0.16 : 0.2, vestido ? 0.3 : 0.22, 1.25, 14), mat);
  corpo.position.y = 0.62; g.add(corpo);
  const ombro = new THREE.Mesh(new THREE.SphereGeometry(vestido ? 0.17 : 0.21, 14, 10), mat);
  ombro.position.y = 1.25; ombro.scale.y = 0.5; g.add(ombro);
  const cabeca = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), pele);
  cabeca.position.y = 1.47; g.add(cabeca);
  return g;
}

export default function SalaoPorDentro({ salas, onEntrar, onEspiar, fechadas = [], pedindo = null, onPedir }: Props) {
  const palco = useRef<HTMLDivElement>(null);
  const [painel, setPainel] = useState<Painel>(null);
  const [dica, setDica] = useState(true);
  const [falhou, setFalhou] = useState(false);
  const salao = salas.find((s) => s.id === 'salao');
  const outras = useMemo(() => salas.filter((s) => s.id !== 'salao' && PORTAS[s.id]), [salas]);
  const abertas = useMemo(() => salas.flatMap((s) => (s.cabines ?? []).filter((c) => c.aberta).map((c) => ({ sala: s, c }))), [salas]);
  const presentes = (salao?.presentes ?? []).slice(0, MAX_PESSOAS);
  const chavePessoas = presentes.map((p) => `${p.id}:${p.avatar ?? ''}:${p.destaque ? 1 : 0}`).join('|');
  const chavePortas = outras.map((s) => `${s.id}:${s.nome}:${s.total}:${s.trancada || s.bloqueadaParaMim ? 1 : 0}`).join('|');

  // Guardado em ref para o loop de toque sempre usar os dados mais novos.
  const dados = useRef({ presentes, outras });
  dados.current = { presentes, outras };
  const cena = useRef<{ atualizarPessoas: () => void; atualizarPortas: () => void } | null>(null);

  useEffect(() => {
    const el = palco.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch { setFalhou(true); return; }
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    el.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x12060a);
    scene.fog = new THREE.Fog(0x12060a, 12, 26);
    const cam = new THREE.PerspectiveCamera(70, 1, 0.05, 60);
    cam.position.set(0, EYE, 5.5);
    let yaw = 0;
    const pitch = -0.06;
    const ajustar = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h, false); cam.aspect = w / Math.max(1, h); cam.updateProjectionMatrix(); };
    const ro = new ResizeObserver(ajustar); ro.observe(el); ajustar();

    // ── Salão ────────────────────────────────────────────────────────────
    const piso = texturaDeCanvas(512, 512, (g, w, h) => {
      g.fillStyle = '#2a120c'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 128) {
        const o = (y / 32) % 2 ? 64 : 0;
        g.fillStyle = `hsl(15,${35 + ((x * 7 + y) % 10)}%,${10 + ((x + y * 3) % 7)}%)`; g.fillRect(x + o, y, 126, 30);
      }
    });
    piso.wrapS = piso.wrapT = THREE.RepeatWrapping; piso.repeat.set(5, 4);
    const chao = new THREE.Mesh(new THREE.PlaneGeometry(RW * 2, RD * 2), new THREE.MeshStandardMaterial({ map: piso, roughness: 0.35, metalness: 0.2 }));
    chao.rotation.x = -Math.PI / 2; chao.name = 'chao'; scene.add(chao);
    const paredeTex = texturaDeCanvas(512, 512, (g, w, h) => {
      g.fillStyle = '#3a0d18'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#6b2a1c'; g.lineWidth = 6;
      for (let x = 16; x < w; x += 128) { g.strokeRect(x, 40, 96, 180); g.strokeRect(x, 270, 96, 200); }
      g.fillStyle = '#24070e'; g.fillRect(0, 232, w, 22);
    });
    paredeTex.wrapS = THREE.RepeatWrapping; paredeTex.repeat.set(4, 1);
    const paredeMat = new THREE.MeshStandardMaterial({ map: paredeTex, roughness: 0.8 });
    const parede = (w: number, x: number, z: number, ry: number) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, RH), paredeMat); m.position.set(x, RH / 2, z); m.rotation.y = ry; scene.add(m); };
    parede(RW * 2, 0, -RD, 0); parede(RW * 2, 0, RD, Math.PI); parede(RD * 2, -RW, 0, Math.PI / 2); parede(RD * 2, RW, 0, -Math.PI / 2);
    const teto = new THREE.Mesh(new THREE.PlaneGeometry(RW * 2, RD * 2), new THREE.MeshStandardMaterial({ color: 0x1a0709 }));
    teto.rotation.x = Math.PI / 2; teto.position.y = RH; scene.add(teto);
    const neon = new THREE.MeshBasicMaterial({ color: 0xff2d8a });
    const faixa = new THREE.Mesh(new THREE.BoxGeometry(RW * 2 - 1, 0.06, 0.12), neon); faixa.position.set(0, RH - 0.2, -RD + 0.1); scene.add(faixa);
    scene.add(new THREE.HemisphereLight(0xffb0c8, 0x1a0508, 1.6));
    ([[-4, 3.6, -2, 0xff4f8a], [3, 3.6, -2, 0xffb070], [0, 3.6, 3, 0xc04cff], [7, 3, 1, 0xffc070]] as const).forEach(([x, y, z, c]) => {
      const l = new THREE.PointLight(c, 18, 14, 1.6); l.position.set(x, y, z); scene.add(l);
    });
    const nome = placa('A CASA', 2.4, 0.6, '#e8b45a'); nome.position.set(1, 2.9, -RD + 0.02); scene.add(nome);

    const tocaveis: THREE.Object3D[] = [];

    // Cabines (parede do fundo, à direita): mostram quantas estão montadas agora.
    const cabines = new THREE.Group();
    const cortina = texturaDeCanvas(128, 256, (g, w, h) => {
      for (let x = 0; x < w; x += 16) { const gr = g.createLinearGradient(x, 0, x + 16, 0); gr.addColorStop(0, '#3a0612'); gr.addColorStop(0.5, '#9a1030'); gr.addColorStop(1, '#3a0612'); g.fillStyle = gr; g.fillRect(x, 0, 16, h); }
    });
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 1.45;
      const fr = new THREE.Mesh(new THREE.BoxGeometry(1.35, 2.7, 0.1), new THREE.MeshStandardMaterial({ color: 0x2a0b0f })); fr.position.set(x, 1.35, -0.05); cabines.add(fr);
      const cu = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 2.45), new THREE.MeshStandardMaterial({ map: cortina, emissive: 0x400010 })); cu.position.set(x, 1.25, 0.02); cabines.add(cu);
    }
    const placaCab = placa('Cabines', 2.2, 0.45, '#e8b45a'); placaCab.position.set(0, 3.05, 0); cabines.add(placaCab);
    cabines.position.set(4.4, 0, -RD + 0.08); cabines.userData.tipo = 'cabines'; scene.add(cabines); tocaveis.push(cabines);

    // Bar (parede direita).
    const bar = new THREE.Group();
    const balcao = new THREE.Mesh(new THREE.BoxGeometry(1, 1.1, 6), new THREE.MeshStandardMaterial({ color: 0x2a0d0a, roughness: 0.4 })); balcao.position.set(0, 0.55, 0); bar.add(balcao);
    const tampo = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 6.2), new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.15, metalness: 0.3 })); tampo.position.y = 1.12; bar.add(tampo);
    const luzBar = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 6), new THREE.MeshBasicMaterial({ color: 0xffb050 })); luzBar.position.set(-0.51, 1, 0); bar.add(luzBar);
    const cores = [0xffc060, 0xff8040, 0xff4f8a, 0x80e0ff, 0xffe0a0];
    for (let r = 0; r < 2; r++) for (let z = -2.6, k = 0; z <= 2.6; z += 0.32, k++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.32, 8), new THREE.MeshBasicMaterial({ color: cores[(k + r) % cores.length] })); b.position.set(1.42, 1.62 + r * 0.7, z); bar.add(b);
    }
    bar.position.set(RW - 2, 0, 1.4); scene.add(bar);

    // Sofás de veludo (parede esquerda, entre as portas).
    const veludo = new THREE.MeshStandardMaterial({ color: 0x5a0a1e, roughness: 0.9 });
    const sofa = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1, 0.45, 2.6), veludo); base.position.y = 0.23; sofa.add(base);
    const costas = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.9, 2.6), veludo); costas.position.set(-0.4, 0.6, 0); sofa.add(costas);
    sofa.position.set(-RW + 0.7, 0, 0.6); scene.add(sofa);

    // Pista de dança com luz.
    const ladrilhos: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 1; j++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), new THREE.MeshBasicMaterial({ color: 0x5a1a70, transparent: true, opacity: 0.35 }));
      m.rotation.x = -Math.PI / 2; m.position.set(i, 0.01, j - 0.2); scene.add(m); ladrilhos.push(m);
    }
    const lustre = new THREE.Group();
    for (let k = 0; k < 36; k++) { const a = (k / 36) * Math.PI * 2, r = 0.5 + (k % 3) * 0.18; const c = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.35 + (k % 4) * 0.1, 6), new THREE.MeshBasicMaterial({ color: 0xffe6b0 })); c.position.set(Math.cos(a) * r, -(k % 4) * 0.06, Math.sin(a) * r); lustre.add(c); }
    lustre.position.set(0, RH - 0.5, -0.6); scene.add(lustre);

    // ── Portas das outras salas ─────────────────────────────────────────
    const portas = new THREE.Group(); scene.add(portas);
    const atualizarPortas = () => {
      portas.children.slice().forEach((c) => portas.remove(c));
      tocaveis.splice(0, tocaveis.length, cabines);
      for (const s of dados.current.outras) {
        const pos = PORTAS[s.id];
        const travada = !!(s.trancada || s.bloqueadaParaMim);
        const cor = COR_DA_PORTA[s.id] ?? 0xdc2626;
        const g = new THREE.Group();
        const folha = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.5, 0.08), new THREE.MeshStandardMaterial({ color: travada ? 0x2a1a1c : 0x5a0c14, roughness: 0.5 })); folha.position.y = 1.25; g.add(folha);
        const moldura = new THREE.Mesh(new THREE.BoxGeometry(1.55, 2.75, 0.04), new THREE.MeshBasicMaterial({ color: travada ? 0x55474a : cor })); moldura.position.set(0, 1.37, -0.03); g.add(moldura);
        const titulo = placa(`${travada ? '🔒 ' : ''}${s.nome}${s.total > 0 ? ` · ${s.total}` : ''}`, 2.2, 0.45, travada ? '#9a8a8c' : '#e8b45a'); titulo.position.set(0, 3, 0); g.add(titulo);
        g.position.set(pos.x, 0, pos.z); g.rotation.y = pos.ry; g.userData = { tipo: 'porta', id: s.id };
        portas.add(g); tocaveis.push(g);
      }
    };

    // ── Pessoas ─────────────────────────────────────────────────────────
    const pele = new THREE.MeshStandardMaterial({ color: 0xd9a07e, roughness: 0.7 });
    const gente = new THREE.Group(); scene.add(gente);
    let geracao = 0;
    const atualizarPessoas = () => {
      const minha = ++geracao;
      gente.children.slice().forEach((c) => { gente.remove(c); c.traverse((o) => { const m = o as THREE.Sprite; if (m.isSprite) { m.material.map?.dispose(); m.material.dispose(); } }); });
      dados.current.presentes.forEach((p, i) => {
        const [x, z] = LUGARES[i % LUGARES.length];
        const g = new THREE.Group();
        const figuras: [number, boolean][] = p.cat === 'casal' ? [[0xb0183c, true], [0x15151c, false]] : p.cat === 'mulher' ? [[0xb0183c, true]] : p.cat === 'homem' ? [[0x15151c, false]] : [[0x6d28d9, false]];
        figuras.forEach(([c, v], k) => { const f = boneco(c, v, pele); if (figuras.length > 1) { f.position.x = k ? 0.2 : -0.2; f.rotation.y = k ? -0.5 : 0.5; } g.add(f); });
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: cracha(p, null), depthTest: false, transparent: true }));
        spr.scale.set(0.95, 1.11, 1); spr.position.y = 2.22; spr.renderOrder = 10; g.add(spr);
        g.position.set(x, 0, z); g.userData = { tipo: 'pessoa', id: p.id, fase: i * 1.3 };
        gente.add(g);
        void carregarFoto(p.avatar).then((img) => {
          if (!img || minha !== geracao) return;
          const antiga = spr.material.map; spr.material.map = cracha(p, img); spr.material.needsUpdate = true; antiga?.dispose();
        });
      });
    };
    atualizarPortas(); atualizarPessoas();
    cena.current = { atualizarPessoas, atualizarPortas };

    // ── Olhar, andar e tocar ────────────────────────────────────────────
    const raio = new THREE.Raycaster();
    const v2 = new THREE.Vector2();
    let destino: THREE.Vector3 | null = null;
    let toque: { x: number; y: number; yaw: number; girando: boolean; id: number } | null = null;
    const olhar = () => cam.lookAt(cam.position.x + Math.sin(yaw) * Math.cos(pitch), cam.position.y + Math.sin(pitch), cam.position.z - Math.cos(yaw) * Math.cos(pitch));
    const virarPara = (x: number, z: number) => { yaw = Math.atan2(x - cam.position.x, -(z - cam.position.z)); };
    const canvas = renderer.domElement;
    const aoDescer = (e: PointerEvent) => { toque = { x: e.clientX, y: e.clientY, yaw, girando: false, id: e.pointerId }; };
    const aoMover = (e: PointerEvent) => {
      if (!toque) return;
      const dx = e.clientX - toque.x, dy = e.clientY - toque.y;
      if (!toque.girando && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) { toque.girando = true; try { canvas.setPointerCapture(toque.id); } catch { /* ok */ } setDica(false); }
      if (toque.girando) yaw = toque.yaw - dx * 0.006;
    };
    const aoSubir = (e: PointerEvent) => {
      const t = toque; toque = null;
      if (!t || t.girando || Math.abs(e.clientX - t.x) + Math.abs(e.clientY - t.y) > 10) return;
      const r = canvas.getBoundingClientRect();
      v2.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raio.setFromCamera(v2, cam);
      const acertos = raio.intersectObjects([...gente.children, ...tocaveis, chao], true);
      if (!acertos.length) return;
      let o: THREE.Object3D | null = acertos[0].object;
      while (o && !o.userData.tipo && o.name !== 'chao') o = o.parent;
      if (!o) return;
      setDica(false);
      if (o.name === 'chao') {
        const p = acertos[0].point;
        destino = new THREE.Vector3(Math.max(-RW + 1, Math.min(RW - 2.8, p.x)), EYE, Math.max(-RD + 1, Math.min(RD - 0.5, p.z)));
        return;
      }
      const alvo = o.getWorldPosition(new THREE.Vector3());
      virarPara(alvo.x, alvo.z);
      if (o.userData.tipo === 'pessoa') {
        const pessoa = dados.current.presentes.find((p) => p.id === o!.userData.id);
        if (pessoa) setPainel({ tipo: 'pessoa', pessoa });
      } else if (o.userData.tipo === 'porta') {
        const sala = dados.current.outras.find((s) => s.id === o!.userData.id);
        if (sala) setPainel({ tipo: 'porta', sala });
      } else if (o.userData.tipo === 'cabines') setPainel({ tipo: 'cabines' });
    };
    canvas.addEventListener('pointerdown', aoDescer);
    canvas.addEventListener('pointermove', aoMover);
    canvas.addEventListener('pointerup', aoSubir);
    canvas.addEventListener('pointercancel', () => { toque = null; });

    const calma = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const relogio = new THREE.Clock();
    let quadro = 0;
    let visivel = true;
    const io = new IntersectionObserver(([en]) => { visivel = !!en?.isIntersecting; }, { threshold: 0.05 });
    io.observe(el);
    const desenhar = () => {
      quadro = requestAnimationFrame(desenhar);
      if (!visivel || document.hidden) return;
      const dt = Math.min(0.05, relogio.getDelta()), t = relogio.elapsedTime;
      if (destino) { const d = destino.clone().sub(cam.position); if (d.length() < 0.05) destino = null; else cam.position.add(d.multiplyScalar(Math.min(1, dt * 2.2))); }
      olhar();
      if (!calma) {
        gente.children.forEach((g) => {
          const naPista = Math.abs(g.position.x) < 2.6 && g.position.z > -2.6 && g.position.z < 1.5;
          g.children.forEach((c, i) => { if ((c as THREE.Sprite).isSprite) return; c.position.y = Math.abs(Math.sin(t * (naPista ? 4 : 1.5) + g.userData.fase + i)) * (naPista ? 0.06 : 0.015); });
        });
        ladrilhos.forEach((m, i) => m.material.color.setHSL(0.8 + ((t * 0.1 + i * 0.07) % 1) * 0.15, 0.8, 0.35 + 0.15 * Math.sin(t * 2 + i)));
        lustre.rotation.y = t * 0.05;
      }
      renderer.render(scene, cam);
    };
    olhar(); desenhar();

    return () => {
      cena.current = null;
      cancelAnimationFrame(quadro);
      ro.disconnect(); io.disconnect();
      canvas.removeEventListener('pointerdown', aoDescer);
      canvas.removeEventListener('pointermove', aoMover);
      canvas.removeEventListener('pointerup', aoSubir);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        mats.forEach((mt) => { (mt as THREE.MeshBasicMaterial).map?.dispose(); mt.dispose(); });
      });
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  // A cena é montada uma vez; pessoas e portas se atualizam pelos efeitos abaixo.
  }, []);

  useEffect(() => { cena.current?.atualizarPessoas(); }, [chavePessoas]);
  useEffect(() => { cena.current?.atualizarPortas(); }, [chavePortas]);

  if (falhou) return <p className="py-10 text-center text-sm text-white/60">Seu aparelho não abriu a visão por dentro. Use a planta ou o 3D.</p>;

  const fechadaDe = (id: string) => fechadas.find((f) => f.id === id);
  const salaoTravado = !!(salao?.trancada || salao?.bloqueadaParaMim);
  return (
    <div className="relative">
      <div ref={palco} className="relative h-[min(68vh,520px)] w-full overflow-hidden rounded-2xl bg-[#12060a] [touch-action:pan-y]" aria-label="Salão por dentro: arraste para os lados para olhar, toque no chão para andar">
        {dica && <span className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/15 bg-black/70 px-3 py-1 text-[11px] text-white/80">⇠ arraste para olhar · toque no chão para andar ⇢</span>}
        <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white/80" style={{ display: dica ? 'none' : undefined }}>
          {salao ? `${salao.total} no Salão${salao.espiando > 0 ? ` · 👀${salao.espiando}` : ''}` : ''}
        </span>
        {salao && presentes.length === 0 && <span className="pointer-events-none absolute inset-x-0 bottom-20 text-center text-xs text-white/60">Salão vazio… seja o primeiro 😏</span>}
        {salao && (
          <button type="button" disabled={salaoTravado} onClick={() => onEntrar('salao')} className="absolute inset-x-3 bottom-3 rounded-xl bg-gradient-to-r from-rose-600 to-fuchsia-600 py-3 text-sm font-bold text-white shadow-lg disabled:opacity-50">
            {salaoTravado ? '🔒 Salão fechado para você agora' : 'Entrar no Salão'}
          </button>
        )}
        {painel && (
          <div className="absolute inset-0 z-10 flex items-end bg-black/50" onClick={(e) => { if (e.target === e.currentTarget) setPainel(null); }}>
            <div className="w-full space-y-3 rounded-t-2xl border-t border-white/10 bg-[#26101a] p-4 text-white" role="dialog" aria-modal="true">
              {painel.tipo === 'pessoa' && (
                <>
                  <div className="flex items-center gap-3">
                    {painel.pessoa.avatar
                      ? <img src={resolveServerUrl(painel.pessoa.avatar)} alt="" className="h-12 w-12 rounded-full border-2 object-cover" style={{ borderColor: COR_DO_PERFIL[painel.pessoa.cat] }} />
                      : <span className="grid h-12 w-12 place-items-center rounded-full text-lg font-bold" style={{ background: COR_DO_PERFIL[painel.pessoa.cat] }}>{painel.pessoa.nome.charAt(0)}</span>}
                    <div>
                      <p className="font-bold">{painel.pessoa.nome}</p>
                      <p className="text-xs text-white/60">No Salão agora{painel.pessoa.destaque ? ' · o mais animado 🔥' : ''}</p>
                    </div>
                  </div>
                  <button type="button" disabled={salaoTravado} onClick={() => { setPainel(null); onEntrar('salao'); }} className="w-full rounded-xl bg-rose-600 py-3 text-sm font-bold disabled:opacity-50">Entrar no Salão para falar</button>
                </>
              )}
              {painel.tipo === 'porta' && (
                <>
                  <p className="font-bold">{painel.sala.emoji} {painel.sala.nome}</p>
                  <p className="text-xs text-white/60">{painel.sala.total} lá dentro{painel.sala.espiando > 0 ? ` · ${painel.sala.espiando} espiando` : ''}</p>
                  {painel.sala.trancada
                    ? <p className="text-sm text-amber-200">🔒 Abre com mais {painel.sala.faltamParaAbrir} na Casa.</p>
                    : painel.sala.bloqueadaParaMim
                      ? <p className="text-sm text-amber-200">🔒 Essa sala não está aberta para o seu perfil.</p>
                      : <button type="button" onClick={() => { setPainel(null); onEntrar(painel.sala.id); }} className="w-full rounded-xl bg-rose-600 py-3 text-sm font-bold">{painel.sala.lotadaParaMim ? 'Entrar na fila' : 'Entrar'}</button>}
                </>
              )}
              {painel.tipo === 'cabines' && (
                <>
                  <p className="font-bold">Cabines</p>
                  {abertas.length === 0 && fechadas.length === 0 && <p className="text-sm text-white/60">Nenhuma cabine montada agora.</p>}
                  {abertas.map(({ sala, c }) => (
                    <div key={c.id} className="flex items-center justify-between gap-2 rounded-xl border border-amber-400/40 bg-amber-500/10 p-2 text-sm">
                      <span>🚪 Porta aberta · {sala.nome}{c.espiando > 0 ? ` · 👀${c.espiando}` : ''}</span>
                      <button type="button" onClick={() => { setPainel(null); onEspiar(sala.id, c.id); }} className="shrink-0 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-bold text-black">Espiar</button>
                    </div>
                  ))}
                  {fechadas.map((f) => (
                    <div key={f.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 p-2 text-sm">
                      <span>🔒 Porta fechada</span>
                      {onPedir && <button type="button" disabled={fechadaDe(f.id)?.pedi || pedindo === f.id} onClick={() => onPedir(f.id)} className="shrink-0 rounded-full bg-rose-600 px-3 py-1.5 text-xs font-bold disabled:opacity-60">{fechadaDe(f.id)?.pedi ? 'Pedido enviado' : 'Pedir pra entrar'}</button>}
                    </div>
                  ))}
                </>
              )}
              <button type="button" onClick={() => setPainel(null)} className="w-full py-2 text-sm text-white/60">Fechar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
