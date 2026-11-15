import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { resolveServerUrl } from '@/utils/serverUrl';
import type { CabineDoMapa, CabineFechadaDoMapa, PessoaDoMapa, SalaDoMapa } from '@/components/MapaDaCasa';
import type { FotoDeFundo } from '@/components/CenaDaSala';

/**
 * A Casa "por dentro": cada sala em primeira pessoa (WebGL). Arrastar para os
 * lados olha em volta (na vertical a página continua rolando); tocar no chão anda.
 * Quem está na sala aparece em pé (homem de azul, mulher de rosa, casal um de
 * cada) com a foto do perfil em cima. As paredes usam a mesma foto de fundo
 * configurada no admin, tratada como no chat (preto e branco, desfocada e
 * tingida com a cor da sala). As portas levam às outras salas.
 * Só tela: os dados são os mesmos da planta (pedido do dono, 14/11/2026).
 */
type Props = {
  salas: SalaDoMapa[];
  onEntrar: (salaId: string) => void;
  onEspiar: (salaId: string, cabineId: string) => void;
  fechadas?: CabineFechadaDoMapa[];
  pedindo?: string | null;
  onPedir?: (cabineId: string) => void;
  /** Abre o perfil da pessoa por cima d'A Casa. */
  onVerPerfil?: (id: string) => void;
  /** Entra na sala e já deixa a pessoa marcada no chat. */
  onEntrarChamando?: (salaId: string, nome: string) => void;
  /** Sala que abre primeiro. */
  salaInicial?: string;
  /** Sala onde a pessoa já está (dentro do chat): o botão vira "voltar ao chat". */
  salaAtual?: string;
  /** Entra na sala e já abre o cartão da pessoa (drink, cabine, desafio…). */
  onAgirCom?: (salaId: string, pessoaId: string) => void;
};

export const COR_DA_PULSEIRA: Record<string, string> = { verde: '#22c55e', amarela: '#facc15', roxa: '#a855f7', vermelha: '#ef4444' };
export const NOME_DA_PULSEIRA: Record<string, string> = { verde: 'aberto(a) a tudo', amarela: 'só soft', roxa: 'single é bem-vindo', vermelha: 'só olhando hoje' };

type Painel =
  | { tipo: 'pessoa'; pessoa: PessoaDoMapa }
  | { tipo: 'porta'; sala: SalaDoMapa }
  | { tipo: 'cabine'; c: CabineDoMapa }
  | null;

const ROSA = '#f472b6';
const AZUL = '#60a5fa';
const COR_DO_PERFIL: Record<PessoaDoMapa['cat'], string> = { casal: ROSA, mulher: ROSA, homem: AZUL, outros: '#a78bfa' };
const RW = 9;
const RD = 7;
const RH = 4.6;
const EYE = 1.6;
const MAX_PESSOAS = 12;

type Tema = {
  tinta: string; neon: number; parede: string; moldura: string; luzes: [number, number, number, number, number][];
  ceu: number; nevoa: [number, number]; ambiente: number;
  /** Lugares onde as pessoas ficam (x, z), longe dos móveis. */
  lugares: [number, number, number?][];
};
const TEMAS: Record<string, Tema> = {
  salao: {
    tinta: '#a855f7', neon: 0xff2d8a, parede: '#3a0d18', moldura: '#6b2a1c', ceu: 0x12060a, nevoa: [12, 26], ambiente: 1.6,
    luzes: [[-4, 3.6, -2, 0xff4f8a, 18], [3, 3.6, -2, 0xffb070, 18], [0, 3.6, 3, 0xc04cff, 18], [7, 3, 1, 0xffc070, 18]],
    lugares: [[-0.8, -0.8], [0.9, -1.4], [0.2, 0.7], [-1.9, 0.3], [1.9, 0.2], [-7.3, -0.4], [-7.3, 3.3], [5.6, -0.6], [5.6, 2.2], [-4.6, -4.4], [3.2, -4.6], [-3.4, 2.8]],
  },
  casais: {
    tinta: '#f43f5e', neon: 0xff3d6e, parede: '#3a0a16', moldura: '#7a1d34', ceu: 0x14050a, nevoa: [11, 24], ambiente: 1.3,
    luzes: [[-3, 3.4, -3, 0xff5a7a, 20], [3, 3.4, -3, 0xff7aa0, 20], [0, 3.2, 2, 0xffa070, 14]],
    lugares: [[-1.6, 0.6], [1.6, 0.6], [0, 1.5], [-2.2, -1.9], [2.2, -1.9], [-1.1, 2.7], [1.1, 2.7], [-2.6, 1.6], [2.6, 1.6], [0, -5.6], [-5.5, -3.5], [5.5, -3.5]],
  },
  quarto: {
    tinta: '#dc2626', neon: 0x991b1b, parede: '#1f0507', moldura: '#3a0a0c', ceu: 0x050102, nevoa: [5, 15], ambiente: 0.45,
    luzes: [[-3.5, 2.6, -4.2, 0xff2020, 14], [3, 2.2, 1, 0xb01020, 8]],
    lugares: [[-1.4, -1.3], [1.4, -1.3], [0, 0.3], [-2.2, 1.2], [2.2, 1.2], [-1, 2.4], [1, 2.4], [-0.8, -3.4, 0.7], [0.8, -3.4, 0.7], [-5.6, -4], [5.6, -4], [-4, 3.8]],
  },
  cuckold: {
    tinta: '#d97706', neon: 0xf59e0b, parede: '#2a1404', moldura: '#5a3208', ceu: 0x0c0602, nevoa: [10, 22], ambiente: 0.9,
    luzes: [[-5, 3.4, 2, 0xffa040, 12], [5, 3.4, 2, 0xffa040, 12]],
    lugares: [[-0.6, -3.6, 0.7], [0.6, -3.6, 0.7], [-1.8, -1.3], [1.8, -1.3], [-0.9, 1], [1.2, 1.1], [2.6, 1.8], [-1.6, 2.6], [1.8, 2.8], [-6, -4], [6, -4], [4.4, -4.6]],
  },
  glory: {
    tinta: '#b91c1c', neon: 0xff1f3d, parede: '#200406', moldura: '#4a0a10', ceu: 0x070102, nevoa: [8, 20], ambiente: 0.8,
    luzes: [[0, 3.6, -1.5, 0xff2040, 26], [-6, 3, 3, 0xc01030, 10], [6, 3, 3, 0xc01030, 10]],
    lugares: [[-0.9, -1.4, 0.75], [0.9, -1.4, 0.75], [0, -2.9, 0.75], [-1.6, -2.6, 0.75], [1.6, -2.6, 0.75], [-1.9, 1.5], [1.9, 1.5], [0, 1.7], [-0.6, -3.8, 0.75], [0.6, -3.8, 0.75], [-3.4, 0.8], [3.4, 0.8]],
  },
};
const temaDe = (id: string) => TEMAS[id] ?? TEMAS.salao;

// Lugares de porta nas paredes; cada sala usa os livres para as outras salas.
const VAGAS_DE_PORTA = [
  { x: -3, z: -RD + 0.06, ry: 0 },
  { x: -RW + 0.06, z: -2.4, ry: Math.PI / 2 },
  { x: -RW + 0.06, z: 3.6, ry: Math.PI / 2 },
  { x: RW - 0.06, z: -4.6, ry: -Math.PI / 2 },
  { x: RW - 0.06, z: 3.6, ry: -Math.PI / 2 },
];
const COR_DA_PORTA: Record<string, number> = { salao: 0xa855f7, quarto: 0xdc2626, casais: 0xf43f5e, glory: 0xef4444, cuckold: 0xf59e0b };

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
    while (g.measureText(texto).width > W - 40 && tam > 22) { tam -= 4; g.font = `600 ${tam}px Georgia, serif`; }
    g.fillText(texto, W / 2, H / 2 + 3);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
}

function carregarImagem(url: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((ok) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = resolveServerUrl(url);
  });
}

/** Papel de parede: painéis da sala e, se houver, a foto do admin tratada como no chat. */
function desenharParede(g: CanvasRenderingContext2D, W: number, H: number, tema: Tema, foto: HTMLImageElement | null, intensidade: number) {
  g.fillStyle = tema.parede; g.fillRect(0, 0, W, H);
  if (foto) {
    const escala = Math.max(W / foto.naturalWidth, H / foto.naturalHeight);
    const w = foto.naturalWidth * escala, h = foto.naturalHeight * escala;
    g.save();
    g.globalAlpha = Math.max(0.15, Math.min(1, intensidade));
    g.filter = 'grayscale(1) contrast(1.15) brightness(.8) blur(1.5px)';
    g.drawImage(foto, (W - w) / 2, (H - h) / 2, w, h);
    g.restore();
    g.save();
    g.globalCompositeOperation = 'color';
    g.fillStyle = tema.tinta; g.fillRect(0, 0, W, H);
    g.restore();
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, 'rgba(0,0,0,.45)'); gr.addColorStop(0.5, 'rgba(0,0,0,.08)'); gr.addColorStop(1, 'rgba(0,0,0,.55)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  } else {
    g.strokeStyle = tema.moldura; g.lineWidth = 6;
    for (let x = 16; x < W; x += 128) { g.strokeRect(x, H * 0.08, 96, H * 0.36); g.strokeRect(x, H * 0.54, 96, H * 0.4); }
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, H * 0.46, W, H * 0.04);
  }
}

/** Crachá em cima da pessoa: foto do perfil redonda (ou a inicial) e o nome. Casal: aro metade rosa, metade azul. */
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
    g.lineWidth = 10;
    if (p.cat === 'casal') {
      g.beginPath(); g.arc(cx, cy, r, Math.PI / 2, Math.PI * 1.5); g.strokeStyle = ROSA; g.stroke();
      g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2); g.strokeStyle = AZUL; g.stroke();
    } else {
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.strokeStyle = COR_DO_PERFIL[p.cat]; g.stroke();
    }
    if (p.querBrincar) { g.beginPath(); g.arc(cx, cy, r + 9, 0, Math.PI * 2); g.lineWidth = 7; g.strokeStyle = '#22c55e'; g.stroke(); }
    if (p.destaque) { g.beginPath(); g.arc(cx, cy, r + (p.querBrincar ? 16 : 9), 0, Math.PI * 2); g.lineWidth = 5; g.strokeStyle = '#fbbf24'; g.stroke(); }
    const corPulseira = p.pulseira ? COR_DA_PULSEIRA[p.pulseira] : null;
    if (corPulseira) { g.fillStyle = corPulseira; g.beginPath(); g.roundRect(cx - 52, cy + 40, 30, 16, 8); g.fill(); g.lineWidth = 3; g.strokeStyle = '#14060a'; g.stroke(); }
    g.beginPath(); g.arc(cx + 48, cy + 46, 13, 0, Math.PI * 2); g.fillStyle = '#3ddc97'; g.fill(); g.lineWidth = 5; g.strokeStyle = '#14060a'; g.stroke();
    const nome = (p.nome || '').length > 13 ? `${p.nome.slice(0, 12)}…` : p.nome || '';
    g.font = '700 40px Inter, sans-serif';
    const tw = Math.min(W - 4, g.measureText(nome).width + 36);
    const x0 = (W - tw) / 2;
    g.fillStyle = 'rgba(20,6,10,.92)';
    g.beginPath(); g.roundRect(x0, 160, tw, 58, 29); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(nome, W / 2, 190, W - 20);
  });
}

/** Avatar em pé: homem de terno azul, mulher de vestido rosa. */
function boneco(mulher: boolean, pele: THREE.Material) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: mulher ? 0xec4899 : 0x2563eb, roughness: 0.45, metalness: mulher ? 0.25 : 0.1 });
  const corpo = new THREE.Mesh(new THREE.CylinderGeometry(mulher ? 0.16 : 0.2, mulher ? 0.3 : 0.22, 1.25, 14), mat);
  corpo.position.y = 0.62; g.add(corpo);
  const ombro = new THREE.Mesh(new THREE.SphereGeometry(mulher ? 0.17 : 0.21, 14, 10), mat);
  ombro.position.y = 1.25; ombro.scale.y = 0.5; g.add(ombro);
  const cabeca = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), pele);
  cabeca.position.y = 1.47; g.add(cabeca);
  return g;
}

const caixa = (w: number, h: number, d: number, cor: number, x: number, y: number, z: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: cor, roughness: 0.7, ...extra }));
  m.position.set(x, y, z); return m;
};

function cama(scene: THREE.Scene, x: number, z: number, lencol: number, largura = 3, comprimento = 3.6) {
  const g = new THREE.Group();
  g.add(caixa(largura + 0.2, 0.4, comprimento + 0.2, 0x1a0806, 0, 0.2, 0));
  g.add(caixa(largura, 0.3, comprimento, lencol, 0, 0.55, 0, { roughness: 0.9 }));
  g.add(caixa(largura + 0.2, 1.6, 0.2, 0x2a0a0c, 0, 0.8, -comprimento / 2 - 0.1));
  [-0.7, 0.7].forEach((px) => g.add(caixa(0.9, 0.18, 0.5, 0xf3e3e3, px * (largura / 3), 0.78, -comprimento / 2 + 0.45, { roughness: 1 })));
  g.position.set(x, 0, z); scene.add(g);
}

function sofa(scene: THREE.Scene, x: number, z: number, ry: number, cor: number, comprimento = 2.6) {
  const veludo = new THREE.MeshStandardMaterial({ color: cor, roughness: 0.9 });
  const s = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(1, 0.45, comprimento), veludo); base.position.y = 0.23; s.add(base);
  const costas = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.9, comprimento), veludo); costas.position.set(-0.4, 0.6, 0); s.add(costas);
  s.position.set(x, 0, z); s.rotation.y = ry; scene.add(s);
}

function velas(scene: THREE.Scene, pontos: [number, number, number][]) {
  pontos.forEach(([x, y, z]) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 8), new THREE.MeshBasicMaterial({ color: 0xffe0a0 })); c.position.set(x, y, z); scene.add(c);
    const l = new THREE.PointLight(0xffa040, 2.5, 3, 2); l.position.set(x, y + 0.2, z); scene.add(l);
  });
}

const NIVEL = ['💬', '🔥', '🔥🔥'];
const VAGAS_DE_CABINE = 4;

/**
 * Cabine em 3D, encostada na parede do fundo. Porta fechada: porta de madeira,
 * luz vermelha em cima e o "calor" da conversa (sem dizer quem está). Porta
 * aberta: a porta abre para fora, luz quente dentro e os bonecos de quem está lá.
 */
function cabine3D(c: CabineDoMapa, pele: THREE.Material) {
  const g = new THREE.Group();
  const madeira = 0x2a0b0f;
  g.add(caixa(1.4, 2.8, 0.08, madeira, 0, 1.4, -0.95));
  g.add(caixa(0.08, 2.8, 1, madeira, -0.7, 1.4, -0.5));
  g.add(caixa(0.08, 2.8, 1, madeira, 0.7, 1.4, -0.5));
  g.add(caixa(1.48, 0.1, 1.05, 0x1a0608, 0, 2.85, -0.5));
  const luz = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), new THREE.MeshBasicMaterial({ color: c.aberta ? 0xffb040 : 0xff2030 }));
  luz.position.set(0, 2.62, 0.05); g.add(luz);
  if (c.aberta) {
    const porta = caixa(1.25, 2.5, 0.06, 0x4a1a10, 0.62, 1.25, 0, { roughness: 0.5 });
    const dobradica = new THREE.Group(); dobradica.position.set(-0.62, 0, 0); dobradica.add(porta); dobradica.rotation.y = -1.25; g.add(dobradica);
    const dentro = new THREE.PointLight(0xffa040, 6, 3, 1.8); dentro.position.set(0, 2, -0.4); g.add(dentro);
    const chao = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.9), new THREE.MeshBasicMaterial({ color: 0x5a1a10 })); chao.rotation.x = -Math.PI / 2; chao.position.set(0, 0.02, -0.5); g.add(chao);
    const tipos = (c.tipos.length ? c.tipos : Array.from({ length: Math.min(3, c.pessoas) }, () => 'outros' as const)).slice(0, 3);
    const corpos: boolean[] = tipos.flatMap((t) => (t === 'casal' ? [true, false] : [t === 'mulher']));
    corpos.slice(0, 4).forEach((mulher, k, arr) => {
      const b = boneco(mulher, pele); b.scale.setScalar(0.62);
      b.position.set((k - (arr.length - 1) / 2) * 0.32, 0, -0.5); g.add(b);
    });
  } else {
    g.add(caixa(1.3, 2.55, 0.08, 0x3a120c, 0, 1.28, 0, { roughness: 0.45 }));
    const macaneta = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 10), new THREE.MeshStandardMaterial({ color: 0xe8b45a, metalness: 1, roughness: 0.3 }));
    macaneta.position.set(0.45, 1.2, 0.07); g.add(macaneta);
    const fresta = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.05), new THREE.MeshBasicMaterial({ color: 0xff2040 })); fresta.position.set(0, 0.03, 0.05); fresta.rotation.x = -Math.PI / 2; g.add(fresta);
  }
  const rotulo = c.aberta
    ? `🚪 Aberta · ${c.pessoas}${c.espiando > 0 ? ` · 👀${c.espiando}` : ''}`
    : `🔒 ${c.pessoas} · ${NIVEL[Math.max(0, Math.min(2, c.nivel ?? 0))]}`;
  const t = placa(rotulo, 1.5, 0.34, c.aberta ? '#ffc061' : '#ff7a8a'); t.position.set(0, 3.15, 0.02); g.add(t);
  g.userData = { tipo: 'cabine', id: c.id };
  return g;
}

/** Móveis de cada sala, de acordo com o tema. Devolve as animações. */
function mobiliar(scene: THREE.Scene, id: string, tema: Tema) {
  const anima: ((t: number) => void)[] = [];
  if (id === 'salao') {
    // Bar na parede direita, entre as portas.
    const bar = new THREE.Group();
    bar.add(caixa(1, 1.1, 5, 0x2a0d0a, 0, 0.55, 0, { roughness: 0.4 }));
    bar.add(caixa(1.2, 0.06, 5.2, 0x1a1210, 0, 1.12, 0, { roughness: 0.15, metalness: 0.3 }));
    const luz = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 5), new THREE.MeshBasicMaterial({ color: 0xffb050 })); luz.position.set(-0.51, 1, 0); bar.add(luz);
    const cores = [0xffc060, 0xff8040, 0xff4f8a, 0x80e0ff, 0xffe0a0];
    for (let r = 0; r < 2; r++) for (let z = -2.2, k = 0; z <= 2.2; z += 0.32, k++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.32, 8), new THREE.MeshBasicMaterial({ color: cores[(k + r) % cores.length] })); b.position.set(1.42, 1.62 + r * 0.7, z); bar.add(b);
    }
    bar.position.set(RW - 2, 0, -0.4); scene.add(bar);
    sofa(scene, -RW + 0.7, 0.6, 0, 0x5a0a1e);
    const ladrilhos: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 1; j++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), new THREE.MeshBasicMaterial({ color: 0x5a1a70, transparent: true, opacity: 0.35 }));
      m.rotation.x = -Math.PI / 2; m.position.set(i, 0.01, j - 0.2); scene.add(m); ladrilhos.push(m);
    }
    const lustre = new THREE.Group();
    for (let k = 0; k < 36; k++) { const a = (k / 36) * Math.PI * 2, r = 0.5 + (k % 3) * 0.18; const c = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.35 + (k % 4) * 0.1, 6), new THREE.MeshBasicMaterial({ color: 0xffe6b0 })); c.position.set(Math.cos(a) * r, -(k % 4) * 0.06, Math.sin(a) * r); lustre.add(c); }
    lustre.position.set(0, RH - 0.5, -0.6); scene.add(lustre);
    anima.push((t) => { ladrilhos.forEach((m, i) => m.material.color.setHSL(0.8 + ((t * 0.1 + i * 0.07) % 1) * 0.15, 0.8, 0.35 + 0.15 * Math.sin(t * 2 + i))); lustre.rotation.y = t * 0.05; });
  } else if (id === 'casais') {
    // Lounge de casais: sofás em U em volta da mesa de centro com velas e flores.
    sofa(scene, -3.4, -0.6, 0, 0x7a1030, 3.2);
    sofa(scene, 3.4, -0.6, Math.PI, 0x7a1030, 3.2);
    sofa(scene, 0, -3.4, -Math.PI / 2, 0x7a1030, 3.6);
    const mesa = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.08, 28), new THREE.MeshStandardMaterial({ color: 0x2a1a14, roughness: 0.2, metalness: 0.4 })); mesa.position.set(0, 0.45, -0.8); scene.add(mesa);
    const pe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.45, 10), new THREE.MeshStandardMaterial({ color: 0xc89a50, metalness: 1, roughness: 0.3 })); pe.position.set(0, 0.22, -0.8); scene.add(pe);
    velas(scene, [[-0.4, 0.56, -0.8], [0.4, 0.56, -0.8], [0, 0.56, -0.4]]);
    for (let k = 0; k < 9; k++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), new THREE.MeshStandardMaterial({ color: 0xc8102e })); f.position.set(-0.15 + (k % 3) * 0.15, 0.62 + Math.floor(k / 3) * 0.06, -1.15); scene.add(f); }
    const coracao = placa('♥', 1, 1, '#ff5a7a'); coracao.position.set(0, 3, -RD + 0.03); scene.add(coracao);
  } else if (id === 'quarto') {
    // Quarto escuro: cama grande, abajur vermelho e quase nada de luz.
    cama(scene, 0, -4.2, 0x5a0810, 3.4, 4);
    const abajur = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.4, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xff2020, side: THREE.DoubleSide })); abajur.position.set(-2.6, 1.1, -5.6); scene.add(abajur);
    scene.add(caixa(0.6, 0.7, 0.6, 0x1a0606, -2.6, 0.35, -5.6));
    velas(scene, [[2.4, 0.75, -5.6]]);
    scene.add(caixa(0.6, 0.7, 0.6, 0x1a0606, 2.4, 0.35, -5.6));
  } else if (id === 'cuckold') {
    // Cama no fundo sob o holofote e a poltrona de frente para ela.
    cama(scene, 0, -4.3, 0x6b0f1a, 3.2, 3.8);
    const holofote = new THREE.SpotLight(0xffb040, 60, 12, 0.5, 0.6, 1.4);
    holofote.position.set(0, RH - 0.1, -1.5); holofote.target.position.set(0, 0, -4.3); scene.add(holofote); scene.add(holofote.target);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.8, RH - 0.2, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false }));
    cone.position.set(0, (RH - 0.2) / 2, -4); scene.add(cone);
    const poltrona = new THREE.Group();
    const couro = new THREE.MeshStandardMaterial({ color: 0x3a1a08, roughness: 0.5 });
    const assento = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 1), couro); assento.position.y = 0.3; poltrona.add(assento);
    const encosto = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.2, 0.25), couro); encosto.position.set(0, 0.85, 0.45); poltrona.add(encosto);
    [-0.5, 0.5].forEach((bx) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.7, 1), couro); b.position.set(bx, 0.55, 0); poltrona.add(b); });
    poltrona.position.set(-2.8, 0, 0.4); poltrona.rotation.y = 0.5; scene.add(poltrona);
    const pp = placa('a poltrona', 1.3, 0.3, '#f5b04a'); pp.position.set(-2.8, 1.75, 0.6); pp.rotation.y = 0.5; scene.add(pp);
    scene.add(caixa(2.4, 0.25, 1.4, 0x4a2a08, 3.2, 0.13, -1.2));
  } else if (id === 'glory') {
    // Suruba: cama redonda gigante no meio, espelhos nas laterais.
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.7, 0.45, 40), new THREE.MeshStandardMaterial({ color: 0x1a0406 })); base.position.set(0, 0.23, -2.2); scene.add(base);
    const colchao = new THREE.Mesh(new THREE.CylinderGeometry(2.45, 2.45, 0.3, 40), new THREE.MeshStandardMaterial({ color: 0x8a0a1c, roughness: 0.9 })); colchao.position.set(0, 0.6, -2.2); scene.add(colchao);
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; const tr = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.18, 0.45), new THREE.MeshStandardMaterial({ color: 0xf0d8d8, roughness: 1 })); tr.position.set(Math.cos(a) * 1.9, 0.82, -2.2 + Math.sin(a) * 1.9); tr.rotation.y = -a; scene.add(tr); }
    const anel = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.04, 8, 60), new THREE.MeshBasicMaterial({ color: 0xff1f3d })); anel.rotation.x = Math.PI / 2; anel.position.set(0, 0.47, -2.2); scene.add(anel);
    [-RW + 0.1, RW - 0.1].forEach((x) => { const e = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.4), new THREE.MeshStandardMaterial({ color: 0x552a30, metalness: 1, roughness: 0.08 })); e.position.set(x, 1.7, 0.2); e.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2; scene.add(e); });
    anima.push((t) => { (anel.material as THREE.MeshBasicMaterial).color.setHSL(0.98, 1, 0.4 + 0.12 * Math.sin(t * 2.4)); });
  }
  void tema;
  return { anima };
}

type CenaApi = { focar: (id: string) => void };
type CenaProps = {
  sala: SalaDoMapa;
  outras: SalaDoMapa[];
  aoTocarPessoa: (p: PessoaDoMapa) => void;
  aoTocarPorta: (s: SalaDoMapa) => void;
  aoTocarCabine: (c: CabineDoMapa) => void;
  aoUsar: () => void;
  /** Fundo do chat: câmera girando devagar, sem toque, mais leve. */
  ambiente?: boolean;
};

const Cena = forwardRef<CenaApi, CenaProps>(function Cena({ sala, outras, aoTocarPessoa, aoTocarPorta, aoTocarCabine, aoUsar, ambiente = false }, ref) {
  const palco = useRef<HTMLDivElement>(null);
  const [falhou, setFalhou] = useState(false);
  const presentes = (sala.presentes ?? []).slice(0, MAX_PESSOAS);
  const chavePessoas = presentes.map((p) => `${p.id}:${p.cat}:${p.avatar ?? ''}:${p.destaque ? 1 : 0}:${p.querBrincar ? 1 : 0}:${p.pulseira ?? ''}`).join('|');
  const chaveFalas = presentes.map((p) => `${p.id}:${p.fala ?? ''}`).join('|');
  const chavePortas = outras.map((s) => `${s.id}:${s.nome}:${s.total}:${s.trancada || s.bloqueadaParaMim ? 1 : 0}`).join('|');
  const chaveFundo = sala.fundo ? `${sala.fundo.url}:${sala.fundo.intensidade}` : '';
  const cabines = sala.cabines ?? [];
  const chaveCabines = cabines.map((c) => `${c.id}:${c.aberta ? 1 : 0}:${c.pessoas}:${c.espiando}:${c.nivel ?? 0}:${c.tipos.join(',')}`).join('|');

  // Guardados em ref para o loop de toque sempre usar os dados e callbacks mais novos.
  const atual = useRef({ presentes, outras, cabines, fundo: sala.fundo ?? null, aoTocarPessoa, aoTocarPorta, aoTocarCabine, aoUsar });
  atual.current = { presentes, outras, cabines, fundo: sala.fundo ?? null, aoTocarPessoa, aoTocarPorta, aoTocarCabine, aoUsar };
  const cena = useRef<{ pessoas: () => void; portas: () => void; cabines: () => void; fundo: () => void; falas: () => void; focar: (id: string) => void } | null>(null);
  useImperativeHandle(ref, () => ({ focar: (id: string) => cena.current?.focar(id) }), []);

  useEffect(() => {
    const el = palco.current;
    if (!el) return;
    const tema = temaDe(sala.id);
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch { setFalhou(true); return; }
    renderer.setPixelRatio(ambiente ? 1 : Math.min(1.5, window.devicePixelRatio || 1));
    Object.assign(renderer.domElement.style, { display: 'block', width: '100%', height: '100%' });
    el.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(tema.ceu);
    scene.fog = new THREE.Fog(tema.ceu, tema.nevoa[0], tema.nevoa[1]);
    const cam = new THREE.PerspectiveCamera(76, 1, 0.05, 60);
    cam.position.set(0, EYE, 5.5);
    let yaw = 0;
    const pitch = -0.06;
    const ajustar = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h, false); cam.aspect = w / Math.max(1, h); cam.updateProjectionMatrix(); };
    const ro = new ResizeObserver(ajustar); ro.observe(el); ajustar();

    // Piso, paredes (com a foto de fundo) e teto.
    const piso = texturaDeCanvas(512, 512, (g, w, h) => {
      g.fillStyle = '#2a120c'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 128) {
        const o = (y / 32) % 2 ? 64 : 0;
        g.fillStyle = `hsl(15,${35 + ((x * 7 + y) % 10)}%,${(sala.id === 'quarto' ? 6 : 10) + ((x + y * 3) % 7)}%)`; g.fillRect(x + o, y, 126, 30);
      }
    });
    piso.wrapS = piso.wrapT = THREE.RepeatWrapping; piso.repeat.set(5, 4);
    const chao = new THREE.Mesh(new THREE.PlaneGeometry(RW * 2, RD * 2), new THREE.MeshStandardMaterial({ map: piso, roughness: 0.35, metalness: 0.2 }));
    chao.rotation.x = -Math.PI / 2; chao.name = 'chao'; scene.add(chao);
    const paredeMat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    const telaParede = document.createElement('canvas'); telaParede.width = 1024; telaParede.height = 300;
    const texParede = new THREE.CanvasTexture(telaParede); texParede.colorSpace = THREE.SRGBColorSpace;
    paredeMat.map = texParede;
    // A parede brilha um pouco sozinha: a foto de fundo aparece mesmo nas salas escuras.
    paredeMat.emissiveMap = texParede; paredeMat.emissive = new THREE.Color(0xffffff); paredeMat.emissiveIntensity = sala.id === 'quarto' ? 0.25 : 0.4;
    const pintarParede = (foto: HTMLImageElement | null, intensidade: number) => {
      const g = telaParede.getContext('2d'); if (!g) return;
      g.clearRect(0, 0, telaParede.width, telaParede.height);
      desenharParede(g, telaParede.width, telaParede.height, tema, foto, intensidade);
      texParede.needsUpdate = true;
    };
    pintarParede(null, 0);
    const parede = (w: number, x: number, z: number, ry: number) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, RH), paredeMat); m.position.set(x, RH / 2, z); m.rotation.y = ry; scene.add(m); };
    parede(RW * 2, 0, -RD, 0); parede(RW * 2, 0, RD, Math.PI); parede(RD * 2, -RW, 0, Math.PI / 2); parede(RD * 2, RW, 0, -Math.PI / 2);
    const teto = new THREE.Mesh(new THREE.PlaneGeometry(RW * 2, RD * 2), new THREE.MeshStandardMaterial({ color: 0x140507 }));
    teto.rotation.x = Math.PI / 2; teto.position.y = RH; scene.add(teto);
    const neon = new THREE.MeshBasicMaterial({ color: tema.neon });
    const f1 = new THREE.Mesh(new THREE.BoxGeometry(RW * 2 - 1, 0.06, 0.12), neon); f1.position.set(0, RH - 0.2, -RD + 0.1); scene.add(f1);
    const f2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, RD * 2 - 1), neon); f2.position.set(-RW + 0.1, RH - 0.2, 0); scene.add(f2);
    const f3 = f2.clone(); f3.position.x = RW - 0.1; scene.add(f3);
    scene.add(new THREE.HemisphereLight(0xffb0c8, 0x1a0508, tema.ambiente));
    tema.luzes.forEach(([x, y, z, c, i]) => { const l = new THREE.PointLight(c, i, 14, 1.6); l.position.set(x, y, z); scene.add(l); });
    // Nome da sala no fundo, à esquerda (a direita do fundo é das cabines).
    const titulo = placa(sala.nome, 3, 0.6, '#e8b45a'); titulo.position.set(-6.2, 3.35, -RD + 0.03); scene.add(titulo);

    const { anima } = mobiliar(scene, sala.id, tema);

    // Portas para as outras salas.
    const portas = new THREE.Group(); scene.add(portas);
    const montarPortas = () => {
      portas.children.slice().forEach((c) => portas.remove(c));
      atual.current.outras.slice(0, VAGAS_DE_PORTA.length).forEach((s, i) => {
        const pos = VAGAS_DE_PORTA[i];
        const travada = !!(s.trancada || s.bloqueadaParaMim);
        const cor = COR_DA_PORTA[s.id] ?? 0xdc2626;
        const g = new THREE.Group();
        g.add(caixa(1.3, 2.5, 0.08, travada ? 0x2a1a1c : 0x5a0c14, 0, 1.25, 0, { roughness: 0.5 }));
        const moldura = new THREE.Mesh(new THREE.BoxGeometry(1.55, 2.75, 0.04), new THREE.MeshBasicMaterial({ color: travada ? 0x55474a : cor })); moldura.position.set(0, 1.37, -0.03); g.add(moldura);
        const t = placa(`${travada ? '🔒 ' : ''}${s.nome}${s.total > 0 ? ` · ${s.total}` : ''}`, 2.2, 0.45, travada ? '#9a8a8c' : '#e8b45a'); t.position.set(0, 3, 0); g.add(t);
        g.position.set(pos.x, 0, pos.z); g.rotation.y = pos.ry; g.userData = { tipo: 'porta', id: s.id };
        portas.add(g);
      });
    };

    // Pessoas.
    const pele = new THREE.MeshStandardMaterial({ color: 0xd9a07e, roughness: 0.7 });
    const gente = new THREE.Group(); scene.add(gente);
    let geracao = 0;
    const montarPessoas = () => {
      const minha = ++geracao;
      gente.children.slice().forEach((c) => { gente.remove(c); c.traverse((o) => { const s = o as THREE.Sprite; if (s.isSprite) { s.material.map?.dispose(); s.material.dispose(); } }); });
      atual.current.presentes.forEach((p, i) => {
        const [x, z, y = 0] = tema.lugares[i % tema.lugares.length];
        const g = new THREE.Group();
        const corpos: boolean[] = p.cat === 'casal' ? [true, false] : [p.cat === 'mulher'];
        corpos.forEach((mulher, k) => { const f = boneco(mulher, pele); if (corpos.length > 1) { f.position.x = k ? 0.2 : -0.2; f.rotation.y = k ? -0.5 : 0.5; } g.add(f); });
        if (p.cat === 'outros') g.children.forEach((f) => f.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.material !== pele) (m.material as THREE.MeshStandardMaterial).color.set(0x7c3aed); }));
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: cracha(p, null), depthTest: false, transparent: true }));
        // Crachás maiores e em alturas alternadas, para não ficarem um em cima do outro.
        spr.scale.set(1.25, 1.46, 1); spr.position.y = i % 2 ? 2.85 : 2.35; spr.renderOrder = 10; g.add(spr);
        g.position.set(x, y, z); g.userData = { tipo: 'pessoa', id: p.id, fase: i * 1.3 };
        gente.add(g);
        void carregarImagem(p.avatar).then((img) => {
          if (!img || minha !== geracao) return;
          const antiga = spr.material.map; spr.material.map = cracha(p, img); spr.material.needsUpdate = true; antiga?.dispose();
        });
      });
    };

    let fundoGeracao = 0;
    const montarFundo = () => {
      const minha = ++fundoGeracao;
      const f: FotoDeFundo | null = atual.current.fundo;
      if (!f) { pintarParede(null, 0); return; }
      void carregarImagem(f.url).then((img) => { if (minha === fundoGeracao) pintarParede(img, f.intensidade); });
    };
    // Cabines desta sala (vêm do servidor): sobem quando abrem, somem quando fecham.
    const grupoCabines = new THREE.Group(); scene.add(grupoCabines);
    const montarCabines = () => {
      grupoCabines.children.slice().forEach((c) => grupoCabines.remove(c));
      const lista = atual.current.cabines;
      lista.slice(0, VAGAS_DE_CABINE).forEach((c, i) => {
        const g = cabine3D(c, pele);
        g.position.set(3 + i * 1.6, 0, -RD + 1.02);
        grupoCabines.add(g);
      });
      if (lista.length > VAGAS_DE_CABINE) {
        const mais = placa(`+${lista.length - VAGAS_DE_CABINE} cabines`, 1.6, 0.36, '#e8b45a'); mais.position.set(5.1, 3.9, -RD + 0.03); grupoCabines.add(mais);
      }
    };
    montarPortas(); montarPessoas(); montarCabines(); montarFundo();

    // Olhar, andar e tocar.
    const raio = new THREE.Raycaster();
    const v2 = new THREE.Vector2();
    let destino: THREE.Vector3 | null = null;
    let toque: { x: number; y: number; yaw: number; girando: boolean; id: number } | null = null;
    const olhar = () => cam.lookAt(cam.position.x + Math.sin(yaw) * Math.cos(pitch), cam.position.y + Math.sin(pitch), cam.position.z - Math.cos(yaw) * Math.cos(pitch));
    const virarPara = (x: number, z: number) => { yaw = Math.atan2(x - cam.position.x, -(z - cam.position.z)); };
    // Anda até a pessoa (para 1,8 m antes) e vira de frente para ela.
    const focar = (id: string) => {
      const g = gente.children.find((c) => c.userData.id === id);
      if (!g) return;
      const alvo = g.position;
      const dx = cam.position.x - alvo.x, dz = cam.position.z - alvo.z;
      const l = Math.hypot(dx, dz) || 1;
      const x = Math.max(-RW + 1, Math.min(RW - 1.2, alvo.x + (dx / l) * 1.8));
      const z = Math.max(-RD + 1, Math.min(RD - 0.5, alvo.z + (dz / l) * 1.8));
      destino = new THREE.Vector3(x, EYE, z);
      yaw = Math.atan2(alvo.x - x, -(alvo.z - z));
    };
    // Balões com a última fala de cada um, por cima do boneco (HTML projetado na cena).
    const camadaBaloes = document.createElement('div');
    Object.assign(camadaBaloes.style, { position: 'absolute', inset: '0', pointerEvents: 'none', overflow: 'hidden' });
    el.appendChild(camadaBaloes);
    const baloes = new Map<string, HTMLDivElement>();
    const montarFalas = () => {
      const ativas = new Set<string>();
      for (const p of atual.current.presentes) {
        if (!p.fala) continue;
        ativas.add(p.id);
        let b = baloes.get(p.id);
        if (!b) {
          b = document.createElement('div');
          Object.assign(b.style, {
            position: 'absolute', transform: 'translate(-50%, -100%)', maxWidth: '62%', padding: '5px 10px', borderRadius: '14px',
            background: '#f6efe9', color: '#2b1216', font: '600 12px Inter, system-ui, sans-serif', lineHeight: '1.25',
            boxShadow: '0 2px 0 rgba(0,0,0,.35)', whiteSpace: 'normal', textAlign: 'center', transition: 'opacity .3s',
          });
          camadaBaloes.appendChild(b); baloes.set(p.id, b);
        }
        if (b.textContent !== p.fala) b.textContent = p.fala;
      }
      for (const [id, b] of baloes) if (!ativas.has(id)) { b.remove(); baloes.delete(id); }
    };
    const vTmp = new THREE.Vector3();
    const posicionarBaloes = () => {
      if (baloes.size === 0) return;
      const w = el.clientWidth, h = el.clientHeight;
      for (const [id, b] of baloes) {
        const g = gente.children.find((c) => c.userData.id === id);
        if (!g) { b.style.display = 'none'; continue; }
        const spr = g.children.find((c) => (c as THREE.Sprite).isSprite);
        vTmp.copy(g.position); vTmp.y += (spr?.position.y ?? 2.4) + 0.85;
        vTmp.project(cam);
        if (vTmp.z > 1 || Math.abs(vTmp.x) > 1.1 || vTmp.y > 1.2) { b.style.display = 'none'; continue; }
        b.style.display = '';
        b.style.left = `${((vTmp.x + 1) / 2) * w}px`;
        b.style.top = `${((1 - vTmp.y) / 2) * h}px`;
      }
    };
    montarFalas();
    cena.current = { pessoas: montarPessoas, portas: montarPortas, cabines: montarCabines, fundo: montarFundo, falas: montarFalas, focar };
    const canvas = renderer.domElement;
    const aoDescer = (e: PointerEvent) => { toque = { x: e.clientX, y: e.clientY, yaw, girando: false, id: e.pointerId }; };
    const aoMover = (e: PointerEvent) => {
      if (!toque) return;
      const dx = e.clientX - toque.x, dy = e.clientY - toque.y;
      if (!toque.girando && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) { toque.girando = true; try { canvas.setPointerCapture(toque.id); } catch { /* ok */ } atual.current.aoUsar(); }
      if (toque.girando) yaw = toque.yaw - dx * 0.006;
    };
    const aoSubir = (e: PointerEvent) => {
      const t = toque; toque = null;
      if (!t || t.girando || Math.abs(e.clientX - t.x) + Math.abs(e.clientY - t.y) > 10) return;
      const r = canvas.getBoundingClientRect();
      v2.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raio.setFromCamera(v2, cam);
      const acertos = raio.intersectObjects([...gente.children, ...portas.children, ...grupoCabines.children, chao], true);
      if (!acertos.length) return;
      let o: THREE.Object3D | null = acertos[0].object;
      while (o && !o.userData.tipo && o.name !== 'chao') o = o.parent;
      if (!o) return;
      atual.current.aoUsar();
      if (o.name === 'chao') {
        const p = acertos[0].point;
        destino = new THREE.Vector3(Math.max(-RW + 1, Math.min(RW - 1.2, p.x)), EYE, Math.max(-RD + 1, Math.min(RD - 0.5, p.z)));
        return;
      }
      const alvo = o.getWorldPosition(new THREE.Vector3());
      virarPara(alvo.x, alvo.z);
      const a = atual.current;
      if (o.userData.tipo === 'pessoa') { const p = a.presentes.find((x) => x.id === o!.userData.id); if (p) a.aoTocarPessoa(p); }
      else if (o.userData.tipo === 'porta') { const s = a.outras.find((x) => x.id === o!.userData.id); if (s) a.aoTocarPorta(s); }
      else if (o.userData.tipo === 'cabine') { const c = a.cabines.find((x) => x.id === o!.userData.id); if (c) a.aoTocarCabine(c); }
    };
    const aoCancelar = () => { toque = null; };
    canvas.addEventListener('pointerdown', aoDescer);
    canvas.addEventListener('pointermove', aoMover);
    canvas.addEventListener('pointerup', aoSubir);
    canvas.addEventListener('pointercancel', aoCancelar);

    const calma = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const relogio = new THREE.Clock();
    let quadro = 0;
    let visivel = true;
    const io = new IntersectionObserver(([en]) => { visivel = !!en?.isIntersecting; }, { threshold: 0.05 });
    io.observe(el);
    let ultimoQuadro = 0;
    const desenhar = () => {
      quadro = requestAnimationFrame(desenhar);
      if (!visivel || document.hidden) return;
      if (ambiente) { const agora = performance.now(); if (agora - ultimoQuadro < 33) return; ultimoQuadro = agora; }
      const dt = Math.min(0.05, relogio.getDelta()), t = relogio.elapsedTime;
      if (ambiente && !calma) yaw = Math.sin(t * 0.06) * 0.55;
      if (destino) { const d = destino.clone().sub(cam.position); if (d.length() < 0.05) destino = null; else cam.position.add(d.multiplyScalar(Math.min(1, dt * 2.2))); }
      olhar();
      if (!calma) {
        gente.children.forEach((g) => {
          const naPista = sala.id === 'salao' && Math.abs(g.position.x) < 2.6 && g.position.z > -2.6 && g.position.z < 1.5;
          g.children.forEach((c, i) => { if ((c as THREE.Sprite).isSprite) return; c.position.y = Math.abs(Math.sin(t * (naPista ? 4 : 1.5) + g.userData.fase + i)) * (naPista ? 0.06 : 0.015); });
        });
        anima.forEach((f) => f(t));
      }
      renderer.render(scene, cam);
      posicionarBaloes();
    };
    olhar(); desenhar();

    return () => {
      cena.current = null;
      cancelAnimationFrame(quadro);
      ro.disconnect(); io.disconnect();
      canvas.removeEventListener('pointerdown', aoDescer);
      canvas.removeEventListener('pointermove', aoMover);
      canvas.removeEventListener('pointerup', aoSubir);
      canvas.removeEventListener('pointercancel', aoCancelar);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        mats.forEach((mt) => { (mt as THREE.MeshBasicMaterial).map?.dispose(); mt.dispose(); });
      });
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      camadaBaloes.remove();
    };
  // A cena é montada uma vez por sala (o pai troca a key); o resto se atualiza abaixo.
  }, []);

  useEffect(() => { cena.current?.pessoas(); }, [chavePessoas]);
  useEffect(() => { cena.current?.portas(); }, [chavePortas]);
  useEffect(() => { cena.current?.cabines(); }, [chaveCabines]);
  useEffect(() => { cena.current?.fundo(); }, [chaveFundo]);
  useEffect(() => { cena.current?.falas(); }, [chaveFalas]);

  if (falhou) return <p className="py-10 text-center text-sm text-white/60">Seu aparelho não abriu a visão por dentro. Use a planta ou o 3D.</p>;
  return <div ref={palco} className="absolute inset-0" />;
});

/** A sala em 3D atrás do chat: só ambiente, sem toque, mais leve. Sem balões:
 *  as falas já estão no próprio chat, por cima. */
export function FundoDaSala3D({ sala }: { sala: SalaDoMapa }) {
  const nada = () => {};
  const semFalas = { ...sala, presentes: (sala.presentes ?? []).map((p) => ({ ...p, fala: null })) };
  return <Cena key={sala.id} sala={semFalas} outras={[]} aoTocarPessoa={nada} aoTocarPorta={nada} aoTocarCabine={nada} aoUsar={nada} ambiente />;
}

// Nome curto cabe inteiro ("T&T", "Casal 65"); nome longo fica no primeiro pedaço.
const primeiroNome = (n: string) => ((n || '').length <= 12 ? n : (n || '').split(/\s*&\s*|\s+/)[0] || n);

export default function SalaoPorDentro({ salas, onEntrar, onEspiar, fechadas = [], pedindo = null, onPedir, onVerPerfil, onEntrarChamando, salaInicial, salaAtual, onAgirCom }: Props) {
  const cenaRef = useRef<CenaApi>(null);
  const [salaId, setSalaId] = useState(() => (salaInicial && salas.some((s) => s.id === salaInicial) ? salaInicial : salas.some((s) => s.id === 'salao') ? 'salao' : salas[0]?.id ?? 'salao'));
  const [painel, setPainel] = useState<Painel>(null);
  const [dica, setDica] = useState(true);
  const sala = salas.find((s) => s.id === salaId) ?? salas[0];
  const outras = useMemo(() => salas.filter((s) => s.id !== sala?.id), [salas, sala?.id]);
  if (!sala) return null;
  const travada = (s: SalaDoMapa) => !!(s.trancada || s.bloqueadaParaMim);
  const fechadaDe = (id: string) => fechadas.find((f) => f.id === id);
  const presentes = sala.presentes ?? [];

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]" role="tablist" aria-label="Escolha a sala para ver por dentro">
        {salas.map((s) => (
          <button key={s.id} type="button" role="tab" aria-selected={s.id === sala.id} onClick={() => { setSalaId(s.id); setPainel(null); }}
            className={`shrink-0 rounded-full border px-3 py-1 text-[11px] ${s.id === sala.id ? 'border-fuchsia-400 bg-fuchsia-500/25 text-white' : 'border-white/15 text-white/70'}`}>
            {s.emoji} {s.nome}{s.total > 0 ? ` · ${s.total}` : ''}{travada(s) ? ' 🔒' : ''}
          </button>
        ))}
      </div>
      <div className="relative h-[min(68vh,520px)] w-full overflow-hidden rounded-2xl bg-[#12060a] [touch-action:pan-y]" aria-label={`${sala.nome} por dentro: arraste para os lados para olhar, toque no chão para andar`}>
        <Cena ref={cenaRef} key={sala.id} sala={sala} outras={outras}
          aoTocarPessoa={(p) => setPainel({ tipo: 'pessoa', pessoa: p })}
          aoTocarPorta={(s) => setPainel({ tipo: 'porta', sala: s })}
          aoTocarCabine={(c) => setPainel({ tipo: 'cabine', c })}
          aoUsar={() => setDica(false)} />
        {dica
          ? <span className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/15 bg-black/70 px-3 py-1 text-[11px] text-white/80">⇠ arraste para olhar · toque no chão para andar ⇢</span>
          : <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white/80">{sala.total} aqui{sala.espiando > 0 ? ` · 👀${sala.espiando}` : ''}</span>}
        {presentes.length === 0 && <span className="pointer-events-none absolute inset-x-0 bottom-20 text-center text-xs text-white/60">{sala.nome} vazio… seja o primeiro 😏</span>}
        <button type="button" disabled={travada(sala)} onClick={() => onEntrar(sala.id)} className="absolute inset-x-3 bottom-3 rounded-xl bg-gradient-to-r from-rose-600 to-fuchsia-600 py-3 text-sm font-bold text-white shadow-lg disabled:opacity-50">
          {sala.id === salaAtual ? '💬 Voltar ao chat' : sala.trancada ? `🔒 Abre com mais ${sala.faltamParaAbrir} na Casa` : sala.bloqueadaParaMim ? '🔒 Fechada para o seu perfil' : sala.lotadaParaMim ? `Entrar na fila · ${sala.nome}` : `Entrar no chat · ${sala.nome}`}
        </button>
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
                      <p className="text-xs text-white/60">{sala.emoji} {sala.nome} agora{painel.pessoa.destaque ? ' · o mais animado 🔥' : ''}</p>
                      {(painel.pessoa.querBrincar || painel.pessoa.pulseira) && (
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                          {painel.pessoa.querBrincar && <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-emerald-200">🎲 quer brincar</span>}
                          {painel.pessoa.pulseira && <span className="rounded-full px-2 py-0.5 text-white/90" style={{ background: `${COR_DA_PULSEIRA[painel.pessoa.pulseira] ?? '#666'}33` }}>pulseira {NOME_DA_PULSEIRA[painel.pessoa.pulseira] ?? painel.pessoa.pulseira}</span>}
                        </p>
                      )}
                      {painel.pessoa.fala && <p className="mt-1 rounded-lg bg-white/5 px-2 py-1 text-xs italic text-white/80">“{painel.pessoa.fala}”</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {onVerPerfil && <button type="button" onClick={() => { const id = painel.pessoa.id; setPainel(null); onVerPerfil(id); }} className="rounded-xl border border-white/20 py-3 text-sm font-bold">👤 Ver perfil</button>}
                    <button type="button" disabled={travada(sala)} onClick={() => { const n = painel.pessoa.nome; setPainel(null); if (onEntrarChamando) onEntrarChamando(sala.id, n); else onEntrar(sala.id); }}
                      className={`rounded-xl bg-rose-600 py-3 text-sm font-bold disabled:opacity-50 ${onVerPerfil ? '' : 'col-span-2'}`}>💬 Entrar e chamar {primeiroNome(painel.pessoa.nome)}</button>
                    {onAgirCom && (
                      <button type="button" disabled={travada(sala) && sala.id !== salaAtual} onClick={() => { const id = painel.pessoa.id; setPainel(null); onAgirCom(sala.id, id); }}
                        className="col-span-2 rounded-xl border border-amber-400/50 bg-amber-500/15 py-3 text-sm font-bold text-amber-100 disabled:opacity-50">🍸 Drink, cabine, desafio…</button>
                    )}
                  </div>
                </>
              )}
              {painel.tipo === 'porta' && (
                <>
                  <p className="font-bold">{painel.sala.emoji} {painel.sala.nome}</p>
                  <p className="text-xs text-white/60">{painel.sala.total} lá dentro{painel.sala.espiando > 0 ? ` · ${painel.sala.espiando} espiando` : ''}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => { setSalaId(painel.sala.id); setPainel(null); }} className="rounded-xl border border-white/20 py-3 text-sm font-bold">👀 Ver por dentro</button>
                    {travada(painel.sala)
                      ? <span className="grid place-items-center rounded-xl bg-white/5 px-2 text-center text-xs text-amber-200">{painel.sala.trancada ? `🔒 Abre com mais ${painel.sala.faltamParaAbrir}` : '🔒 Fechada para você'}</span>
                      : <button type="button" onClick={() => { setPainel(null); onEntrar(painel.sala.id); }} className="rounded-xl bg-rose-600 py-3 text-sm font-bold">{painel.sala.lotadaParaMim ? 'Entrar na fila' : 'Entrar'}</button>}
                  </div>
                </>
              )}
              {painel.tipo === 'cabine' && (() => {
                const c = painel.c;
                const f = fechadaDe(c.id);
                const quem = c.tipos.length ? c.tipos.map((t) => ({ casal: 'casal', mulher: 'mulher', homem: 'homem', outros: 'perfil' } as const)[t]).join(' + ') : `${c.pessoas} pessoa${c.pessoas === 1 ? '' : 's'}`;
                return (
                  <>
                    <p className="font-bold">{c.aberta ? '🚪 Cabine de porta aberta' : '🔒 Cabine de porta fechada'}</p>
                    <p className="text-sm text-white/70">
                      {c.aberta ? <>Lá dentro: {quem}{c.espiando > 0 ? ` · ${c.espiando} espiando` : ''}. Quem está na sala pode espiar; entrar e interagir só se eles deixarem.</>
                        : <>{c.pessoas} lá dentro · {['conversando 💬', 'esquentando 🔥', 'pegando fogo 🔥🔥'][Math.max(0, Math.min(2, c.nivel ?? 0))]}. Porta fechada: só entra quem eles aceitarem.</>}
                    </p>
                    {c.aberta
                      ? <button type="button" onClick={() => { setPainel(null); onEspiar(sala.id, c.id); }} className="w-full rounded-xl bg-amber-500 py-3 text-sm font-bold text-black">👀 Espiar</button>
                      : f && onPedir
                        ? <button type="button" disabled={f.pedi || pedindo === f.id} onClick={() => onPedir(f.id)} className="w-full rounded-xl bg-rose-600 py-3 text-sm font-bold disabled:opacity-60">{f.pedi ? 'Pedido enviado ✓' : 'Pedir pra entrar'}</button>
                        : <p className="rounded-xl bg-white/5 p-2 text-center text-xs text-white/60">Essa cabine não está recebendo pedidos agora.</p>}
                  </>
                );
              })()}
              <button type="button" onClick={() => setPainel(null)} className="w-full py-2 text-sm text-white/60">Fechar</button>
            </div>
          </div>
        )}
      </div>
      {(presentes.length > 0 || sala.total > 0) && (
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" aria-label={`Quem está em ${sala.nome}`}>
          {presentes.map((p) => (
            <button key={p.id} type="button" onClick={() => { setDica(false); cenaRef.current?.focar(p.id); setPainel({ tipo: 'pessoa', pessoa: p }); }}
              className="flex w-16 shrink-0 flex-col items-center gap-1" title={p.nome}>
              <span className={`relative block h-12 w-12 rounded-full p-[2px] ${p.querBrincar ? 'ring-2 ring-emerald-400 ring-offset-1 ring-offset-zinc-950' : ''}`} style={{ background: p.cat === 'casal' ? `linear-gradient(90deg, ${ROSA} 50%, ${AZUL} 50%)` : p.destaque ? '#fbbf24' : COR_DO_PERFIL[p.cat] }}>
                {p.pulseira && COR_DA_PULSEIRA[p.pulseira] && <span className="absolute -left-0.5 bottom-0 z-10 h-2.5 w-4 rounded-full border-2 border-zinc-950" style={{ background: COR_DA_PULSEIRA[p.pulseira] }} />}
                {p.avatar
                  ? <img src={resolveServerUrl(p.avatar)} alt="" loading="lazy" className="h-full w-full rounded-full object-cover" />
                  : <span className="grid h-full w-full place-items-center rounded-full bg-zinc-900 text-sm font-bold text-white">{(p.nome || '?').charAt(0)}</span>}
                <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-zinc-950 bg-emerald-400" />
              </span>
              <span className="w-full truncate text-center text-[10px] text-white/80">{primeiroNome(p.nome)}</span>
            </button>
          ))}
          {sala.total > presentes.length && (
            <button type="button" disabled={travada(sala)} onClick={() => onEntrar(sala.id)} className="flex w-16 shrink-0 flex-col items-center gap-1 disabled:opacity-50" title="Entre para ver todo mundo">
              <span className="grid h-12 w-12 place-items-center rounded-full border border-dashed border-white/40 text-sm font-bold text-white">+{sala.total - presentes.length}</span>
              <span className="w-full truncate text-center text-[10px] text-white/60">entre p/ ver</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
