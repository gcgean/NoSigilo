/**
 * Marca d'água nas mídias enviadas.
 *
 * Grava, no canto inferior direito, o apelido de quem postou, o site e a data.
 * Fica dentro do arquivo: se a foto for baixada e repostada em outro lugar, a
 * marca vai junto. Isso NÃO impede a cópia — impede o anonimato de quem
 * vaza, que é o que de fato assusta quem publica.
 */

/** Só o que o drawtext aceita sem dor de cabeça de escape. */
function limparTexto(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 _.@-]/g, '')
    .trim()
    .slice(0, 24);
}

export function textoDaMarca(apelido: string | null | undefined, quando = new Date()): string {
  const nome = limparTexto(String(apelido || ''));
  const data = `${String(quando.getDate()).padStart(2, '0')}.${String(quando.getMonth() + 1).padStart(2, '0')}.${quando.getFullYear()}`;
  return nome ? `@${nome} - nosigilo.net - ${data}` : `nosigilo.net - ${data}`;
}

/**
 * Filtro do ffmpeg que desenha a marca. A fonte vem do pacote ttf-dejavu,
 * instalado na imagem do backend em /usr/share/fonts/dejavu (sem fonte, o drawtext não desenha nada).
 * Tamanho proporcional à largura para ficar legível tanto em foto pequena
 * quanto em vídeo grande.
 */
export function filtroMarcaDagua(texto: string): string {
  const seguro = texto.replace(/\\/g, '').replace(/'/g, '').replace(/:/g, '-').replace(/%/g, '');
  return [
    "drawtext=fontfile=/usr/share/fonts/dejavu/DejaVuSans.ttf",
    `text='${seguro}'`,
    // Discreta de propósito: pequena e bem transparente, para identificar a
    // origem sem atrapalhar quem está olhando a foto.
    'fontcolor=white@0.38',
    'fontsize=h/45',
    'shadowcolor=black@0.35',
    'shadowx=1',
    'shadowy=1',
    'x=w-tw-h/40',
    'y=h-th-h/40',
  ].join(':');
}
