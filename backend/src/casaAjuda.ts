// Ajuda d'A Casa (27/11/2026), a partir da leitura dos chats de 20 e 21/11:
// - muita gente chega perdida ("não entendi", "como funciona", "o que é cabine",
//   "quem convida casal?") e ninguém responde: a Lola responde na hora, curto;
// - uns poucos homens passam a noite cobrando foto/nude das mulheres e casais
//   ("manda foto da…", "mostra ela pra nós"): 1ª vez a Lola avisa em particular,
//   na 2ª a pessoa fica 5 minutos sem falar na sala.

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

type Duvida = { padrao: RegExp; resposta: string };
const DUVIDAS: Duvida[] = [
  {
    padrao: /\b(o que|oq|que) (e|eh|seria) (essa |a |uma )?cabine|como (funciona|vai|entra|chama|faz)( (a|na|pra|para))? cabine|cabine (e|eh) o que/,
    resposta: 'Cabine é um cantinho só de vocês 🚪 Toque na foto da pessoa lá em cima e escolha "Chamar pra cabine". Se ela aceitar, vocês saem do chat geral. Porta fechada = só vocês; porta aberta = outros podem espiar. Dica: pagar um drink 🍸 antes de chamar ajuda a pessoa topar 😉',
  },
  {
    padrao: /quem (convida|chama|puxa)|como (eu )?(convido|chamo|chamar|convidar) (alguem|o casal|um casal|ela|eles|voces)/,
    resposta: 'Qualquer um pode chamar 😉 Toque na foto da pessoa lá em cima: dá para pagar um drink 🍸, mandar um olhar 👀 ou chamar pra cabine 🚪. Se ela topar, vocês já vão.',
  },
  {
    padrao: /pulseira|que cor (eu )?(uso|escolho|coloco)/,
    resposta: 'A pulseira diz o que você topa hoje: 🟢 aberto(a) a tudo, 🟡 só soft, 🟣 single é bem-vindo, 🔴 só olhando. Troca a qualquer hora no ⚪ lá em cima.',
  },
  {
    padrao: /como (eu )?(mando|envio|mandar|enviar|posto|postar) (uma |a )?(foto|video|nude)/,
    resposta: 'Toque no 📷 do lado de onde você escreve. A foto ou vídeo abre uma vez só para cada pessoa e não dá para salvar 😉',
  },
  {
    padrao: /como (eu )?(vejo|ver|abro|abrir) (a |as )?(foto|video|midia)|como faco (pra|para) ver/,
    resposta: 'Toque na foto ou vídeo no chat para abrir. Cada uma abre uma vez só, então aproveita 😉',
  },
  {
    padrao: /como (a gente |nos |eu )?(brinca|brincar|participa|participar|interag)/,
    resposta: 'Toque em "Quero brincar" lá em cima: eu te chamo para as brincadeiras da noite (eu nunca, verdade ou desafio, duelos) 🔥 E pode pagar um drink pra quem te chamou atenção tocando na foto dela.',
  },
  {
    padrao: /perdid[oa]|nao sei .{0,10}funciona|nao (entendi|entendo|to entendendo|estou entendendo|sei como (funciona|usa|mexe)|sei (o que|oq) fazer|sei responder)|como (funciona|que funciona|usa|mexe)( isso| aqui| esse trem| a casa)?\b|tentando entender|igual cego|que nem cego|mais perdid|aprendendo a mexer|quem me (explica|apresenta)/,
    resposta: 'Relaxa, é fácil 😊 1) Conversa aqui no chat com a sala. 2) Toque na foto de alguém lá em cima para pagar um drink 🍸, mandar um olhar 👀 ou chamar pra cabine 🚪 (um cantinho só de vocês). 3) Toque em "Quero brincar" e eu te chamo pras brincadeiras. Qualquer dúvida, toque em "Responder à Lola" numa mensagem minha 😉',
  },
];

/** Resposta curta da Lola para quem escreveu que está perdido ou fez uma dúvida de uso. */
export function respostaDeAjuda(texto: string): string | null {
  const t = semAcento(texto);
  if (t.length > 160) return null;
  for (const d of DUVIDAS) if (d.padrao.test(t)) return d.resposta;
  return null;
}

// Cobrança de foto/nude na sala ("manda foto da…", "mostra ela pra nós", "bota a … pra jogo").
// Não pega quem conta que mandou ("mandei foto"), nem elogio a foto que já veio.
const COBRANCA = [
  /\b(manda|mande|mandem|mandes|mandar|envia|enviem|posta|postem|solta|soltem)\b.{0,25}\b(foto|fotos|video|videos|nude|nudes|pelad\w*|bucet\w*|xot\w*|xox\w*|xan\w*|bct\w*|peit\w*|bund\w*|cu|cuzinho)\b/,
  /\b(mostra|mostre|mostrem|bota|bote|botem|coloca|abre|abra)\b.{0,20}\b(ela|elas|esposa|esposas|bucet\w*|xot\w*|xox\w*|xan\w*|bct\w*|peit\w*|bund\w*|cu|cuzinho|pelad\w*|tudo)\b/,
  /\bquero ver (ela |voce |vc )?(pelada|peladinha|nua|a buceta|a bucetinha|a xota|a xotinha|os peitos|a bunda)\b/,
  /\btem que (mandar|mostrar|postar)\b/,
];
export function ehCobrancaDeNude(texto: string): boolean {
  const t = semAcento(texto);
  if (/\b(mandei|enviei|postei|mostrei)\b/.test(t)) return false;
  return COBRANCA.some((r) => r.test(t));
}

export const AVISO_COBRANCA = 'Ei 😉 Aqui na Casa foto é convite, não cobrança. Quem quiser mostrar, mostra. Se continuar pedindo, você fica uns minutos sem falar na sala.';
export const CALADO_POR_MS = 5 * 60_000;
export const MSG_CALADO = 'Você ficou 5 minutos sem falar na sala por cobrar foto das pessoas. Aqui foto é convite, não cobrança 😉';
