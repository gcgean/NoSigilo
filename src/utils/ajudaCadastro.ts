// Ajudas do cadastro: menos digitação e menos e-mail errado no celular.

const DOMINIOS = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'yahoo.com.br', 'icloud.com', 'live.com', 'uol.com.br', 'bol.com.br', 'terra.com.br'];

function distancia(a: string, b: string) {
  const linha = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let anterior = linha[0];
    linha[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const guardado = linha[j];
      linha[j] = a[i - 1] === b[j - 1] ? anterior : 1 + Math.min(anterior, linha[j], linha[j - 1]);
      anterior = guardado;
    }
  }
  return linha[b.length];
}

/** "ana@gmial.com" vira "ana@gmail.com". Devolve null se o e-mail parece certo ou se não há palpite seguro. */
export function sugestaoDeEmail(email: string): string | null {
  const limpo = email.trim().toLowerCase();
  const arroba = limpo.lastIndexOf('@');
  if (arroba < 1) return null;
  const dominio = limpo.slice(arroba + 1);
  if (dominio.length < 3 || DOMINIOS.includes(dominio)) return null;
  let melhor: string | null = null;
  let menor = 3;
  for (const certo of DOMINIOS) {
    const d = distancia(dominio, certo);
    if (d < menor) { menor = d; melhor = certo; }
  }
  return melhor ? `${limpo.slice(0, arroba)}@${melhor}` : null;
}

const PALAVRAS: Record<'casal' | 'mulher' | 'homem' | 'outro', string[]> = {
  casal: ['CasalDiscreto', 'CasalLiberal', 'CasalCurioso', 'CasalSigilo'],
  mulher: ['Misteriosa', 'Curiosa', 'Discreta', 'Liberal'],
  homem: ['Discreto', 'Curioso', 'Mascarado', 'Sigilo'],
  outro: ['Liberal', 'Sigilo', 'Curiose', 'Mascarade'],
};

/** Apelido pronto para a pessoa não travar pensando em um (ela pode trocar). */
export function apelidoSugerido(perfil: string, aleatorio: () => number = Math.random): string {
  const p = perfil.toLowerCase();
  const grupo = p.startsWith('casal') ? 'casal' : p.startsWith('mulher') ? 'mulher' : p.startsWith('homem') ? 'homem' : 'outro';
  const lista = PALAVRAS[grupo];
  const palavra = lista[Math.floor(aleatorio() * lista.length) % lista.length];
  return `${palavra}${100 + Math.floor(aleatorio() * 9900)}`;
}
