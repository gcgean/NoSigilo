// Endereços do próprio NoSigilo viram link no chat de suporte (a Lola manda a
// página de instalar, por exemplo). Só o nosso domínio: link de outro site, ali
// dentro, seria um convite a golpe. E-mail como contato@nosigilo.net não conta.
export type ParteDoTexto = { texto: string; href?: string };

export function separarLinks(mensagem: string): ParteDoTexto[] {
  const achar = /(^|[^@\w./-])((?:https?:\/\/)?(?:www\.)?nosigilo\.net(?![\w-]|\.\w)(?:\/[^\s)]*)?)/gi;
  const partes: ParteDoTexto[] = [];
  let ate = 0;
  let achado: RegExpExecArray | null;
  while ((achado = achar.exec(mensagem))) {
    const inicio = achado.index + achado[1].length;
    // Pontuação colada no fim da frase não faz parte do endereço.
    const endereco = achado[2].replace(/[.,;:!?]+$/, '');
    if (inicio > ate) partes.push({ texto: mensagem.slice(ate, inicio) });
    const caminho = endereco.replace(/^(?:https?:\/\/)?(?:www\.)?nosigilo\.net/i, '');
    partes.push({ texto: endereco, href: `https://nosigilo.net${caminho}` });
    ate = inicio + endereco.length;
    achar.lastIndex = ate;
  }
  if (ate < mensagem.length) partes.push({ texto: mensagem.slice(ate) });
  return partes;
}
