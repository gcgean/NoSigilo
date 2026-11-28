// GPS do aparelho (28/11/2026). Antes cada tela pedia só alta precisão, com 10–15 s e
// sem aceitar posição recente: dentro de casa o Android costuma estourar o tempo e a
// pessoa via "Permita o acesso à localização" mesmo já tendo permitido.
// Agora: tenta alta precisão; se faltar sinal ou demorar, tenta de novo com a
// localização por rede (aceita uma posição de até 10 min). A mensagem diz o motivo real.

type Pegar = (ok: PositionCallback, erro: PositionErrorCallback, opcoes: PositionOptions) => void;

const PRECISA: PositionOptions = { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 };
const POR_REDE: PositionOptions = { enableHighAccuracy: false, timeout: 15_000, maximumAge: 10 * 60_000 };

const pedir = (pegar: Pegar, opcoes: PositionOptions) =>
  new Promise<GeolocationPosition>((resolve, reject) => pegar(resolve, reject, opcoes));

export async function pegarPosicaoDoAparelho(
  pegar: Pegar | undefined = typeof navigator !== 'undefined' && navigator.geolocation
    ? navigator.geolocation.getCurrentPosition.bind(navigator.geolocation)
    : undefined,
): Promise<GeolocationPosition> {
  if (!pegar) throw { code: -1 };
  try {
    return await pedir(pegar, PRECISA);
  } catch (e: any) {
    if (Number(e?.code) === 1) throw e; // bloqueado: tentar de novo não adianta
    return pedir(pegar, POR_REDE);
  }
}

/** Título e texto do aviso conforme o motivo da falha (erro do GPS ou do envio). */
export function mensagemDeFalhaDoGps(erro: any): { title: string; description: string } {
  switch (Number(erro?.code)) {
    case -1:
      return { title: 'Localização indisponível', description: 'Este aparelho ou navegador não oferece localização.' };
    case 1:
      return {
        title: 'Localização bloqueada para o NoSigilo',
        description: 'Toque no cadeado ao lado do endereço do site (ou em Configurações › Apps › navegador) › Permissões › Localização › Permitir. Depois tente de novo.',
      };
    case 2:
      return { title: 'GPS desligado ou sem sinal', description: 'Ligue a Localização do celular (puxe a barra de cima da tela) e tente de novo.' };
    case 3:
      return { title: 'O GPS demorou para responder', description: 'Confira se a Localização do celular está ligada e tente de novo, de preferência perto de uma janela.' };
    default:
      return { title: 'Não conseguimos salvar sua localização', description: 'Verifique sua internet e tente de novo em instantes.' };
  }
}
