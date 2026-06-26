import QRCode from 'qrcode';

/**
 * Gera uma imagem de divulgação (story 9:16, 1080×1920) para o promotor:
 * marca NoSigilo.net em destaque + QR Code do link de convite DELE
 * (preserva a atribuição/comissão). Retorna um Blob PNG.
 */

const W = 1080;
const H = 1920;
const PINK = '#eb4778';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Desenha texto centralizado quebrando em várias linhas; retorna o y final. */
function drawWrapped(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const words = text.split(' ');
  let line = '';
  let curY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, cx, curY);
      line = word;
      curY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, cx, curY);
  return curY;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Arte base fornecida (story pronto). O QR do convite é desenhado por cima. */
const BACKGROUND_ART = '/promo-match.png';

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Falha ao gerar imagem'))), 'image/png', 0.95);
  });
}

/** Compõe o QR do convite sobre a arte base (mantém o visual e a atribuição). */
async function composeOnBackground(bgImg: HTMLImageElement, inviteUrl: string, promoterName?: string): Promise<Blob> {
  const cw = bgImg.naturalWidth || bgImg.width;
  const ch = bgImg.naturalHeight || bgImg.height;
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas não suportado');

  ctx.drawImage(bgImg, 0, 0, cw, ch);

  // QR num cartão branco no canto SUPERIOR DIREITO (área livre; rodapé tem botões/tagline).
  // Posições em proporção da largura — fácil de ajustar de canto se precisar.
  const margin = Math.round(cw * 0.04);
  const card = Math.round(cw * 0.26);
  const cardX = cw - card - margin;
  const cardY = margin;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = Math.round(cw * 0.03);
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, cardX, cardY, card, card, Math.round(card * 0.10));
  ctx.fill();
  ctx.restore();

  const qrPad = Math.round(card * 0.09);
  const qrSize = card - qrPad * 2;
  const qrDataUrl = await QRCode.toDataURL(inviteUrl, {
    margin: 0,
    width: qrSize * 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#0d0710', light: '#ffffff' },
  });
  const qrImg = await loadImage(qrDataUrl);
  if (qrImg) ctx.drawImage(qrImg, cardX + qrPad, cardY + qrPad, qrSize, qrSize);

  // Legenda ABAIXO do cartão (QR está no topo)
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = Math.round(cw * 0.02);
  ctx.font = `700 ${Math.round(cw * 0.028)}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  ctx.fillText('Aponte a câmera', cardX + card / 2, cardY + card + Math.round(cw * 0.05));
  ctx.font = `500 ${Math.round(cw * 0.022)}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  ctx.fillText('e entre agora', cardX + card / 2, cardY + card + Math.round(cw * 0.085));
  if (promoterName) {
    ctx.font = `500 ${Math.round(cw * 0.020)}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.fillText(`Convite de ${promoterName}`, cardX + card / 2, cardY + card + Math.round(cw * 0.12));
  }
  ctx.restore();

  return canvasToBlob(canvas);
}

export async function generatePromoterStoryImage(
  inviteUrl: string,
  promoterName?: string,
): Promise<Blob> {
  // Se a arte base existir em /public, usa-a como fundo e sobrepõe o QR.
  const baseArt = await loadImage(BACKGROUND_ART);
  if (baseArt && (baseArt.naturalWidth || baseArt.width)) {
    return composeOnBackground(baseArt, inviteUrl, promoterName);
  }

  // Fallback: arte gerada do zero (caso o arquivo ainda não exista).
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas não suportado');

  // --- Fundo: gradiente escuro + brilho rosa ---
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1a0a14');
  bg.addColorStop(0.5, '#0d0710');
  bg.addColorStop(1, '#09090b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W / 2, 460, 60, W / 2, 460, 760);
  glow.addColorStop(0, 'rgba(235,71,120,0.28)');
  glow.addColorStop(1, 'rgba(235,71,120,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // --- Topo: logo à esquerda + wordmark "NoSigilo.net" em gradiente (igual à marca do app) ---
  const logoSize = 132;
  const gap = 28;
  const rowY = 230; // centro vertical da linha do cabeçalho
  const wordmark = 'NoSigilo.net';
  ctx.font = '800 84px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  const textW = ctx.measureText(wordmark).width;
  const totalW = logoSize + gap + textW;
  const startX = W / 2 - totalW / 2;
  const logoY = rowY - logoSize / 2;

  const logo = await loadImage('/icon.jpg');
  ctx.save();
  roundRect(ctx, startX, logoY, logoSize, logoSize, 30);
  ctx.clip();
  if (logo) {
    ctx.drawImage(logo, startX, logoY, logoSize, logoSize);
  } else {
    ctx.fillStyle = PINK;
    ctx.fillRect(startX, logoY, logoSize, logoSize);
  }
  ctx.restore();

  const tx = startX + logoSize + gap;
  const wordGrad = ctx.createLinearGradient(tx, 0, tx + textW, 0);
  wordGrad.addColorStop(0, '#EB4763');
  wordGrad.addColorStop(1, '#DD3C71');
  ctx.fillStyle = wordGrad;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(wordmark, tx, rowY);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // --- Headline ---
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 92px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  let y = drawWrapped(ctx, 'A rede social liberal que mais cresce no Brasil', W / 2, 560, 920, 104);

  ctx.fillStyle = PINK;
  ctx.font = '700 50px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText('Swing • Troca de casais • Ménage', W / 2, y + 96);

  // --- QR Code num cartão branco ---
  const qrDataUrl = await QRCode.toDataURL(inviteUrl, {
    margin: 1,
    width: 620,
    errorCorrectionLevel: 'M',
    color: { dark: '#0d0710', light: '#ffffff' },
  });
  const qrImg = await loadImage(qrDataUrl);

  const cardSize = 660;
  const cardX = W / 2 - cardSize / 2;
  const cardY = 980;
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(235,71,120,0.45)';
  ctx.shadowBlur = 60;
  roundRect(ctx, cardX, cardY, cardSize, cardSize, 48);
  ctx.fill();
  ctx.shadowBlur = 0;
  if (qrImg) {
    const qrSize = 580;
    ctx.drawImage(qrImg, W / 2 - qrSize / 2, cardY + (cardSize - qrSize) / 2, qrSize, qrSize);
  }

  // --- Chamada do QR ---
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 48px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText('Aponte a câmera e entre agora', W / 2, cardY + cardSize + 90);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '500 38px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText('Cadastro gratuito • 100% discreto • +18', W / 2, cardY + cardSize + 150);

  // --- Rodapé: marca + crédito do promotor ---
  ctx.font = '800 66px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  const footW = ctx.measureText('nosigilo.net').width;
  const footGrad = ctx.createLinearGradient(W / 2 - footW / 2, 0, W / 2 + footW / 2, 0);
  footGrad.addColorStop(0, '#EB4763');
  footGrad.addColorStop(1, '#DD3C71');
  ctx.fillStyle = footGrad;
  ctx.fillText('nosigilo.net', W / 2, H - 110);
  if (promoterName) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '500 36px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText(`Convite de ${promoterName}`, W / 2, H - 56);
  }

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Falha ao gerar imagem'))), 'image/png', 0.95);
  });
}
