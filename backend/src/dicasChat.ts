/**
 * Dicas da conta oficial do NoSigilo no Chat.
 *
 * Cada pessoa recebe uma sequência: boas-vindas (com o combinado de segurança e
 * privacidade) e, nos dias seguintes, uma dica por vez: perfil, match e busca,
 * stories, radar, eventos, conversa e encontro seguro. Tom leve e provocante,
 * mas sem palavrão, e escrito para quem nunca usou um app desses.
 *
 * Casal é tratado por "vocês"; os demais por "você".
 */

export type ContextoDaDica = {
  nome: string;
  casal: boolean;
  mulher: boolean;
  veterano: boolean;
  temFoto: boolean;
  temBio: boolean;
  verificado: boolean;
};

// Dias de espera ANTES de cada etapa (a 0 sai logo após o cadastro).
export const ESPERA_EM_DIAS = [0, 1, 1, 1, 1, 2, 2, 2];
export const TOTAL_DE_DICAS = ESPERA_EM_DIAS.length;

export function textoDaDica(etapa: number, c: ContextoDaDica): string | null {
  const voce = c.casal ? 'vocês' : 'você';
  const Voce = c.casal ? 'Vocês' : 'Você';
  const seu = c.casal ? 'de vocês' : 'seu';
  // Nomes aqui são apelidos ("D e C", "Casal Fortal"): usa o apelido inteiro;
  // só corta quando é longo demais para uma saudação.
  const apelido = c.nome.trim().replace(/\s+/g, ' ');
  const nome = (apelido.length <= 24 ? apelido : apelido.split(' ')[0]) || (c.casal ? 'casal' : 'tudo bem');

  switch (etapa) {
    case 0: {
      const abertura = c.veterano
        ? `Oi, ${nome}! 🔥 Aqui é a equipe do NoSigilo, na nossa conta oficial. A partir de agora a gente manda por aqui umas dicas quentes pra ${voce} aproveitar ainda mais a comunidade liberal que mais cresce no Brasil 😈`
        : `Oi, ${nome}! 🔥 Aqui é a equipe do NoSigilo, na nossa conta oficial. Que bom ter ${voce} aqui na comunidade liberal que mais cresce no Brasil 😈\n\nAqui tem casais, mulheres e homens de mente aberta, procurando a mesma coisa que ${voce}: conhecer gente nova com muita discrição. Nos próximos dias eu mando por aqui umas dicas pra ${voce} encontrar quem combina com ${c.casal ? 'vocês' : 'você'} rapidinho.`;
      return `${abertura}

Antes de tudo, o combinado que vale ouro:
🔒 E-mail, senha e localização exata ${c.casal ? 'de vocês' : 'sua'} nunca aparecem pra ninguém.
📸 Fotos privadas só abrem pra quem ${voce} liberar.
🚫 A equipe do NoSigilo nunca pede Pix, dinheiro ou senha. Se alguém pedir, é golpe: bloqueie e denuncie.
🗑️ ${Voce} pode baixar ${c.casal ? 'os dados de vocês' : 'seus dados'} ou apagar a conta quando quiser, em Configurações.

Amanhã eu volto com o segredo pra um perfil que chama atenção 😉
(Não quer receber dicas? Responda PARAR.)`;
    }
    case 1: {
      const alerta = !c.temFoto
        ? `\n\n⚠️ O perfil ${seu} ainda está sem foto, e é a primeira coisa que as pessoas olham. Perfil sem foto quase não recebe mensagem!`
        : !c.temBio
          ? `\n\n⚠️ Falta a bio! Duas linhas contando o que ${voce} ${c.casal ? 'curtem' : 'curte'} já fazem muita diferença.`
          : '';
      return `💋 Dica 1: perfil que chama atenção${alerta}

O que funciona por aqui:
• Foto principal: pode ser sensual sem mostrar o rosto. Um decote, uma silhueta, um tanquinho... mistério também excita 😏
• Bio: conte o que ${voce} ${c.casal ? 'curtem' : 'curte'} e o que ${c.casal ? 'procuram' : 'procura'} (troca de casais, ménage, só conversa, voyeur...). Quem é direto atrai quem combina.
• Fotos privadas: guarde as mais ousadas no álbum privado e libere só pra quem merecer 🔥

Pra caprichar: menu Perfil › Editar perfil.`;
    }
    case 2:
      return `😈 Dica 2: ache quem tem a ${c.casal ? 'vibe de vocês' : 'sua vibe'}

• Match: passe os perfis e curta quem te deu vontade. Curtiu e foi curtido de volta? A conversa abre na hora.
• Buscar: filtre por tipo de perfil (casal, mulher, homem...), idade e distância e veja quem está perto agora.

Dica de ouro: curta bastante. Quem curte aparece mais e recebe mais curtidas de volta 😉`;
    case 3:
      return `📸 Dica 3: hora de se exibir

Quem posta aparece no topo do feed de quem está por perto.
• Stories: aquela foto provocante que some em 24 horas. Ótimo pra provocar sem compromisso 🔥
• Publicação no feed: fica no perfil ${seu} e atrai visitas, curtidas e mensagens.

Pode postar sem mostrar o rosto. Só não vale foto de outra pessoa sem autorização, combinado?`;
    case 4:
      return `📡 Dica 4: ative o Radar

Bateu a vontade hoje? Ligue o Radar e avise a galera da região que ${voce} ${c.casal ? 'estão disponíveis' : 'está disponível'} agora. Quem combina recebe o aviso e pode chamar na hora.

É o jeito mais rápido de transformar vontade em encontro 😈 Fica no menu: Radar.`;
    case 5:
      return `🎉 Dica 5: festas e encontros

Em Eventos ${voce} ${c.casal ? 'encontram' : 'encontra'} festas, encontros e viagens liberais perto ${c.casal ? 'de vocês' : 'de você'}, e ${c.casal ? 'podem' : 'pode'} criar o ${c.casal ? 'de vocês' : 'seu'}: dá pra escolher quem pode participar (só casais, só mulheres...) e o limite de pessoas.

Confirmou presença? ${Voce} ${c.casal ? 'entram' : 'entra'} no grupo do evento pra já ir conhecendo a galera antes 🔥`;
    case 6: {
      const selo = c.verificado
        ? `• O perfil ${seu} já tem o selo ✔️ de verificado. Isso passa muita confiança!`
        : `• Verifique o perfil (tem a opção no seu Perfil e em Configurações): o selo ✔️ mostra que ${voce} ${c.casal ? 'são reais' : 'é real'} e passa muito mais confiança.${c.mulher ? ' Pra mulheres, a verificação ainda libera acesso grátis pra sempre 💖' : ''}`;
      return `💬 Dica 6: puxe papo do jeito certo

• Comente algo do perfil da pessoa. "Oi, tudo bem?" quase nunca funciona 😅
• Seja direto sobre o que ${c.casal ? 'procuram' : 'procura'}, mas com educação: aqui, respeito é o que mais excita.
${selo}`;
    }
    case 7:
      return `🛡️ Dica 7: encontro seguro é encontro gostoso

• Antes de sair, converse bastante e, se der, faça uma chamada de vídeo.
• Primeiro encontro em lugar público, e avise alguém de confiança.
• Combinem os limites antes e usem preservativo. Consentimento sempre.
• Nunca envie dinheiro nem dados pessoais pra quem acabou de conhecer.
• Algo estranho? Bloqueie e denuncie pelo perfil da pessoa. A gente analisa tudo.

Era isso! Aproveite muito o NoSigilo 🔥 Qualquer dúvida, toque no botão de ajuda e fale com o Suporte.`;
    default:
      return null;
  }
}

// Respostas da conta oficial quando a pessoa escreve para ela.
export const RESPOSTA_PARAR = 'Pronto, não mando mais dicas por aqui 😉 Se precisar de qualquer coisa, toque no botão de ajuda e fale com o Suporte.';
export const RESPOSTA_AUTOMATICA = 'Oi! 😊 Esta conversa é só para as dicas da equipe do NoSigilo e ninguém lê as respostas por aqui. Para falar com a gente, toque no botão de ajuda (o ponto de interrogação) e escreva no Suporte. Não quer mais dicas? Responda PARAR.';

export function pediuParaParar(texto: string) {
  const t = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  return /^(parar|pare|para|stop|sair|cancelar)[.! ]*$/.test(t) || t.includes('nao quero mais dicas');
}
