/**
 * Banco de brincadeiras de "A Casa" (boate virtual de sexta e sábado).
 *
 * Dois níveis: 'quente' (Salão Principal) e 'muito_quente' (Sala dos Casais e
 * Quarto Escuro, que também usam as quentes). Tudo é consensual: verdade ou
 * desafio só sorteia quem marcou "quero brincar", e qualquer um pode dizer
 * "passo". Desafios são feitos no chat da sala ou na cabine (a dois, com
 * aceite) — nada de expor ninguém nem mandar mídia sem pedir.
 *
 * {nome} é trocado pelo nome de quem foi sorteado.
 */

export type Nivel = 'quente' | 'muito_quente';
export type Item = { t: string; n: Nivel };
export type Enquete = { t: string; o: string[]; n: Nivel };
export type Quiz = { t: string; o: string[]; c: number };

const q = (t: string): Item => ({ t, n: 'quente' });
const mq = (t: string): Item => ({ t, n: 'muito_quente' });

export const EU_NUNCA: Item[] = [
  q('Eu nunca beijei alguém na frente do meu parceiro(a).'),
  q('Eu nunca fui a uma casa de swing.'),
  q('Eu nunca troquei nudes com alguém que conheci aqui.'),
  q('Eu nunca fiz sexo em lugar público.'),
  q('Eu nunca transei no carro.'),
  q('Eu nunca fiquei excitado(a) vendo outro casal se pegar.'),
  q('Eu nunca mandei mensagem picante pra pessoa errada.'),
  q('Eu nunca usei fantasia na cama.'),
  q('Eu nunca fiz chamada de vídeo quente.'),
  q('Eu nunca fui pra cama com alguém no primeiro encontro.'),
  q('Eu nunca usei brinquedinho a dois.'),
  q('Eu nunca gravei um vídeo nosso (só pra nós).'),
  q('Eu nunca beijei duas pessoas na mesma noite.'),
  q('Eu nunca fiz strip-tease pra alguém.'),
  q('Eu nunca deixei alguém me vendar.'),
  q('Eu nunca fui pra praia de nudismo.'),
  q('Eu nunca fiz sexo no banho de mar ou piscina.'),
  q('Eu nunca fingi que não estava olhando… mas estava.'),
  q('Eu nunca entrei no NoSigilo só pra espiar.'),
  q('Eu nunca fiquei com alguém do mesmo sexo.'),
  q('Eu nunca fiz massagem que terminou em outra coisa.'),
  q('Eu nunca transei ouvindo os vizinhos.'),
  q('Eu nunca mandei foto de lingerie pra alguém.'),
  q('Eu nunca combinei encontro e desisti na porta.'),
  q('Eu nunca fui a um motel com espelho no teto.'),
  mq('Eu nunca fiz ménage.'),
  mq('Eu nunca fiz troca de casais completa.'),
  mq('Eu nunca assisti meu parceiro(a) com outra pessoa.'),
  mq('Eu nunca fui assistido(a) transando.'),
  mq('Eu nunca participei de uma suruba.'),
  mq('Eu nunca fiz sexo no mesmo quarto que outro casal.'),
  mq('Eu nunca fiz sexo a três com duas mulheres.'),
  mq('Eu nunca fiz sexo a três com dois homens.'),
  mq('Eu nunca fui dominado(a) e adorei.'),
  mq('Eu nunca usei algemas ou amarras.'),
  mq('Eu nunca fiz cuckold (ou fui o corno feliz 😈).'),
  mq('Eu nunca gozei só de ouvir alguém gemendo.'),
  mq('Eu nunca fiz sexo anal.'),
  mq('Eu nunca fiz sexo com um desconhecido de casa de swing.'),
  mq('Eu nunca fiz oral em público (mesmo que escondido).'),
  mq('Eu nunca beijei a mulher de outro casal com meu parceiro olhando.'),
  mq('Eu nunca transei num glory hole ou cabine.'),
  mq('Eu nunca fui a uma festa de nudez total.'),
  mq('Eu nunca dividi meu parceiro(a) com uma amiga ou amigo.'),
  mq('Eu nunca fiz sexo com mais de 3 pessoas no mesmo ambiente.'),
  mq('Eu nunca brinquei com cera quente ou gelo.'),
  mq('Eu nunca fiz dupla penetração.'),
  mq('Eu nunca fiz sexo virtual com alguém daqui.'),
  mq('Eu nunca fiz um bate-volta só pra transar com um casal.'),
  mq('Eu nunca fiquei de quatro pra alguém que conheci na mesma noite.'),
];

export const VERDADES: Item[] = [
  q('{nome}, qual é a sua fantasia que ninguém nesta sala imagina?'),
  q('{nome}, onde foi o lugar mais ousado em que você já transou?'),
  q('{nome}, o que te deixa com tesão em menos de 10 segundos?'),
  q('{nome}, qual parte do corpo você mais gosta de provocar?'),
  q('{nome}, qual perfil desta sala te chamou atenção primeiro? 👀'),
  q('{nome}, você prefere olhar ou ser olhado(a)?'),
  q('{nome}, qual foi o elogio mais safado que você já recebeu?'),
  q('{nome}, qual música não pode faltar na hora H?'),
  q('{nome}, você já se tocou pensando em alguém daqui?'),
  q('{nome}, qual é a sua posição favorita e por quê?'),
  q('{nome}, o que você nunca fez mas tem muita vontade de fazer?'),
  q('{nome}, qual foi a sua melhor transa? Conte o cenário, sem nomes.'),
  q('{nome}, de 0 a 10, quanto você está com tesão agora?'),
  q('{nome}, você gosta mais de preliminar longa ou de ir direto ao ponto?'),
  q('{nome}, qual roupa (ou lingerie) te deixa irresistível?'),
  q('{nome}, beijo no pescoço ou mordida na orelha?'),
  q('{nome}, qual seu maior fetiche ainda não realizado?'),
  q('{nome}, se pudesse levar alguém desta sala pra cabine agora, quem seria?'),
  q('{nome}, qual foi a vez que você quase foi pego(a) no flagra?'),
  q('{nome}, o que te faz perder o controle na cama?'),
  mq('{nome}, como foi (ou como seria) o seu primeiro ménage?'),
  mq('{nome}, você toparia ver seu parceiro(a) com outra pessoa hoje? Com quem desta sala?'),
  mq('{nome}, qual foi a coisa mais safada que você já fez numa casa de swing?'),
  mq('{nome}, prefere ser dominado(a) ou dominar? Dê um exemplo.'),
  mq('{nome}, quantas pessoas no máximo você toparia na mesma cama?'),
  mq('{nome}, descreva o que faria primeiro se estivesse a sós com alguém desta sala.'),
  mq('{nome}, qual é o som que você faz quando está quase lá?'),
  mq('{nome}, já gozou mais de uma vez na mesma noite? Quantas?'),
  mq('{nome}, o que mais te excita: o proibido, o perigo ou o público?'),
  mq('{nome}, qual foi a transa mais longa que você já teve?'),
  mq('{nome}, onde você gosta de ser beijado(a) que ninguém imagina?'),
  mq('{nome}, você já fez troca completa? Conte como começou.'),
  mq('{nome}, qual é o seu limite que ainda não foi testado?'),
  mq('{nome}, qual foi a vez que você mais gemeu alto?'),
  mq('{nome}, se fosse para realizar UMA fantasia hoje, qual seria, com detalhes?'),
  mq('{nome}, oral: dar ou receber? E por quanto tempo?'),
  mq('{nome}, qual é o seu brinquedinho favorito?'),
  mq('{nome}, você prefere com a luz acesa ou apagada? Por quê?'),
  mq('{nome}, já foi assistido(a) por mais de uma pessoa? Como foi?'),
  mq('{nome}, qual palavra suja te deixa louco(a) na hora?'),
];

export const DESAFIOS: Item[] = [
  q('{nome}, descreva no chat, em uma frase, o que está vestindo agora 😏'),
  q('{nome}, mande um elogio bem safado para o último que falou na sala.'),
  q('{nome}, escolha alguém da sala e convide pra cabine agora (vale recusar).'),
  q('{nome}, escreva a sua cantada mais safada pra sala toda.'),
  q('{nome}, conte qual parte do seu corpo merece um beijo hoje.'),
  q('{nome}, poste um story com o tema da noite nos próximos 15 minutos.'),
  q('{nome}, diga qual perfil desta sala você daria match sem pensar.'),
  q('{nome}, descreva seu beijo perfeito em 3 palavras.'),
  q('{nome}, mande o emoji que resume o que você quer hoje 🍑🍆💦🔥'),
  q('{nome}, finja que está numa casa de swing: o que pede no bar e com quem senta?'),
  q('{nome}, troque a foto principal por uma mais ousada até o fim da noite.'),
  q('{nome}, escreva um "bom dia" safado para alguém daqui (mandar amanhã é opcional 😜).'),
  q('{nome}, conte um segredo picante que nunca contou aqui.'),
  q('{nome}, faça um elogio para o casal mais bonito da sala.'),
  q('{nome}, escreva o roteiro do seu encontro perfeito em 2 linhas.'),
  mq('{nome}, descreva com detalhes como você começaria uma preliminar com alguém desta sala.'),
  mq('{nome}, escreva no chat o que faria se estivesse vendado(a) agora.'),
  mq('{nome}, chame alguém para a cabine e conte lá a sua maior fantasia.'),
  mq('{nome}, descreva o gemido que você daria se alguém te tocasse agora.'),
  mq('{nome}, conte qual foi a sua transa mais louca, com detalhes (sem nomes).'),
  mq('{nome}, escolha dois perfis da sala e diga o que faria com os dois juntos.'),
  mq('{nome}, mande uma mensagem só com o que faria com a boca, sem usar a palavra "beijo".'),
  mq('{nome}, descreva sua lingerie ou cueca de hoje com um adjetivo bem safado.'),
  mq('{nome}, diga em voz alta (no chat) o que seu parceiro(a) faz que te enlouquece.'),
  mq('{nome}, escreva um conto erótico de 3 frases envolvendo esta sala.'),
  mq('{nome}, poste um story provocante com a legenda "A Casa me deixou assim" 🔥'),
  mq('{nome}, diga qual casal desta sala você toparia pra uma troca hoje.'),
  mq('{nome}, descreva onde você gostaria de ser amarrado(a) e por quem.'),
  mq('{nome}, conte como seria seu ménage dos sonhos: quem, onde e como começa.'),
  mq('{nome}, mande pra sala a frase mais suja que você já falou na cama.'),
  mq('{nome}, convide alguém para a cabine e só saia de lá com um encontro marcado.'),
  mq('{nome}, descreva o que faria em 5 minutos sozinho(a) com a última pessoa que entrou na sala.'),
  mq('{nome}, diga o que você faria se estivesse no Quarto Escuro de verdade, sem luz nenhuma.'),
  mq('{nome}, escreva um pedido safado pro seu parceiro(a) e mande pra ele(a) agora.'),
  mq('{nome}, revele qual foi o lugar mais inusitado onde você já gozou.'),
];

export const PERGUNTAS_QUENTES: Item[] = [
  q('Pergunta pra sala toda: qual foi o lugar mais ousado onde vocês já transaram? 🔥'),
  q('Sala, contem: o que um perfil precisa ter pra vocês chamarem na hora?'),
  q('Quem aqui está sem calcinha ou sem cueca agora? Só responda quem tem coragem 😈'),
  q('Qual é o primeiro lugar que vocês beijam no corpo de alguém?'),
  q('Casais, contem: quem de vocês dois é o mais safado?'),
  q('Qual a melhor desculpa que vocês já deram pra sumir e transar?'),
  q('O que é mais excitante: a conversa antes ou o encontro em si?'),
  q('Qual a fantasia mais comum entre vocês? Vamos descobrir se a sala combina.'),
  q('Lingerie vermelha ou preta? Defendam no chat 🔴⚫'),
  q('Qual é o cheiro que deixa vocês com tesão?'),
  q('Qual foi a cantada mais ousada que já funcionou com vocês?'),
  q('Se A Casa fosse de verdade, em qual canto vocês estariam agora?'),
  mq('Sala toda: qual foi a sua primeira experiência liberal e como começou?'),
  mq('Quem aqui já foi pra cama com um casal que conheceu online? Contem como foi.'),
  mq('Preferência da sala: soft swap ou troca completa? Expliquem por quê 😏'),
  mq('Qual é o limite que vocês nunca vão passar… e qual já passaram e adoraram?'),
  mq('Quem aqui curte ser assistido? E quem curte assistir? 👀'),
  mq('Qual foi a noite mais louca de vocês numa casa de swing ou festa liberal?'),
  mq('Mulheres e casais: o que um single precisa fazer pra ser convidado pra cama?'),
  mq('Qual posição vocês fariam com outro casal ao lado?'),
  mq('Contem uma fantasia de grupo que vocês ainda querem realizar.'),
  mq('Quem aqui já fez algo no Quarto Escuro de verdade? Desembucha 🖤'),
  mq('O que é mais quente: o beijo entre as mulheres ou o olhar do parceiro assistindo?'),
  mq('Qual foi o lugar mais arriscado onde vocês fizeram oral?'),
  mq('Quantos orgasmos foi o recorde de vocês numa noite só?'),
  mq('Se pudessem escolher alguém desta sala pra um ménage hoje, que tipo de perfil seria?'),
];

export const ENQUETES: Enquete[] = [
  { t: 'O que mais te excita numa casa de swing?', o: ['Olhar 👀', 'Ser olhado(a) 🔥', 'Participar 😈', 'Tudo junto 🤤'], n: 'quente' },
  { t: 'Hoje você está mais pra…', o: ['Só espiar 👀', 'Conversar e provocar 💬', 'Marcar encontro 📍', 'Ir pra cabine agora 🚪'], n: 'quente' },
  { t: 'Preliminar ideal tem quanto tempo?', o: ['5 min ⚡', '15 min 🔥', '30 min 😍', 'A noite toda 🌙'], n: 'quente' },
  { t: 'Melhor lugar para um encontro liberal?', o: ['Casa de swing 🏠', 'Motel 🛏️', 'Casa de alguém 🔑', 'Viagem/praia 🏖️'], n: 'quente' },
  { t: 'Qual lingerie ganha a noite?', o: ['Vermelha 🔴', 'Preta ⚫', 'Branca ⚪', 'Nenhuma 😈'], n: 'quente' },
  { t: 'No primeiro encontro com um casal, vocês…', o: ['Só bebem e conversam 🍸', 'Rola um beijo 💋', 'Vai até o fim 🔥', 'Depende da química ✨'], n: 'quente' },
  { t: 'O que te faz chamar alguém no chat?', o: ['Foto 📸', 'Bio safada 📝', 'Story 🎥', 'Estar perto 📍'], n: 'quente' },
  { t: 'Qual o melhor dia pra transar?', o: ['Sexta 🍻', 'Sábado 🔥', 'Domingo de manhã ☀️', 'Qualquer dia 😏'], n: 'quente' },
  { t: 'Luz na hora H:', o: ['Acesa 💡', 'Meia-luz 🕯️', 'Apagada 🌑', 'Luz vermelha 🔴'], n: 'quente' },
  { t: 'Beijo em público:', o: ['Adoro 😍', 'Só escondido 🤫', 'Com plateia 👀', 'Nunca 🙈'], n: 'quente' },
  { t: 'Vocês preferem:', o: ['Soft swap 💋', 'Troca completa 🔄', 'Mesmo ambiente sem troca 👀', 'Ménage 3️⃣'], n: 'muito_quente' },
  { t: 'Ménage dos sonhos:', o: ['Casal + mulher 👩', 'Casal + homem 👨', 'Duas mulheres e um homem', 'Dois casais 💑💑'], n: 'muito_quente' },
  { t: 'No Quarto Escuro você…', o: ['Fica no cantinho olhando 👀', 'Se deixa tocar 🤲', 'Toma a iniciativa 😈', 'Some com alguém 🚪'], n: 'muito_quente' },
  { t: 'Assistir o parceiro(a) com outra pessoa:', o: ['Me excita muito 🔥', 'Toparia uma vez 🤔', 'Só se eu participar 😈', 'Nunca 🚫'], n: 'muito_quente' },
  { t: 'Dominar ou ser dominado(a)?', o: ['Dominar 👑', 'Ser dominado(a) ⛓️', 'Revezar 🔄', 'Nenhum, gosto no carinho 💞'], n: 'muito_quente' },
  { t: 'Quantas pessoas no máximo numa cama?', o: ['2 💑', '3 🔥', '4 💑💑', 'Quanto mais melhor 🤤'], n: 'muito_quente' },
  { t: 'O mais quente numa festa liberal:', o: ['O beijo entre mulheres 👩‍❤️‍👩', 'Ver casais se pegando 👀', 'O convite inesperado 💌', 'O banheiro 🚿'], n: 'muito_quente' },
  { t: 'Barulho na hora H:', o: ['Silencioso(a) 🤫', 'Gemidos baixinhos 😮‍💨', 'Escandaloso(a) 📢', 'Depende de quem tá 😏'], n: 'muito_quente' },
  { t: 'Hoje à noite você toparia:', o: ['Chamada de vídeo quente 📱', 'Encontro amanhã 📍', 'Troca de fotos na cabine 📸', 'Só provocar aqui 😈'], n: 'muito_quente' },
  { t: 'Fetiche que mais desperta curiosidade:', o: ['Venda nos olhos 🙈', 'Algemas ⛓️', 'Cuckold 🦌', 'Exibicionismo 👀'], n: 'muito_quente' },
];

export const QUIZ: Quiz[] = [
  { t: 'No swing, o que significa "soft"?', o: ['Só beijos e carícias com outros', 'Troca completa', 'Só assistir', 'Sexo a três'], c: 0 },
  { t: 'O que é "troca completa"?', o: ['Trocar de lugar na mesa', 'Cada um transa com o parceiro do outro casal', 'Só beijo', 'Assistir sem tocar'], c: 1 },
  { t: 'Numa casa de swing, "não" significa…', o: ['Talvez', 'Insista mais um pouco', 'Não. Ponto final.', 'Depende do horário'], c: 2 },
  { t: 'O que é "mesmo ambiente"?', o: ['Casais transam no mesmo quarto, cada um com o seu', 'Troca completa', 'Ménage', 'Ficar no bar'], c: 0 },
  { t: 'O que é um "single" no meio liberal?', o: ['Quem está solteiro(a) e vai sozinho(a)', 'Um tipo de bebida', 'Casal iniciante', 'Quem só assiste'], c: 0 },
  { t: 'O que é "cuckold"?', o: ['Excitar-se vendo o parceiro(a) com outra pessoa', 'Uma posição', 'Um tipo de festa', 'Troca de casais'], c: 0 },
  { t: 'Qual é a regra de ouro do meio liberal?', o: ['Quanto mais melhor', 'Consentimento sempre', 'Nunca repetir casal', 'Só à noite'], c: 1 },
  { t: 'O que é "voyeur"?', o: ['Quem gosta de olhar', 'Quem gosta de ser olhado', 'Quem domina', 'Quem é iniciante'], c: 0 },
  { t: 'E "exibicionista"?', o: ['Quem gosta de olhar', 'Quem gosta de ser olhado(a)', 'Quem não tira a roupa', 'Quem organiza festa'], c: 1 },
  { t: 'Antes de um encontro com casal, o ideal é…', o: ['Combinar os limites antes', 'Improvisar tudo', 'Não conversar', 'Levar mais gente sem avisar'], c: 0 },
  { t: 'O que é "ménage"?', o: ['Sexo a três', 'Sexo a quatro', 'Só beijo', 'Festa à fantasia'], c: 0 },
  { t: 'Na cabine de uma casa de swing, a porta fechada significa…', o: ['Pode entrar', 'Privacidade, não entre', 'Está vazia', 'Fila de espera'], c: 1 },
  { t: 'O que é "glory hole"?', o: ['Um furo na parede para prazer anônimo', 'Um drink', 'Uma posição', 'Um tipo de cama'], c: 0 },
  { t: 'Preservativo em encontro liberal é…', o: ['Opcional', 'Obrigatório e sexy 😉', 'Só no ménage', 'Coisa de iniciante'], c: 1 },
  { t: 'O que significa "unicórnio" no meio liberal?', o: ['Mulher single que sai com casais', 'Homem single', 'Casal iniciante', 'Festa temática'], c: 0 },
  { t: 'Qual é a melhor forma de abordar um casal?', o: ['Educação e falar com os dois', 'Falar só com a mulher', 'Mandar foto íntima primeiro', 'Insistir até responderem'], c: 0 },
];

/** Frases da anfitriã para abrir a noite e animar a sala. */
export const BOAS_VINDAS: string[] = [
  'Boa noite, gente bonita! 🍸 Eu sou a Lola, anfitriã IA d\'A Casa. Marquem "Quero brincar" pra entrar nas brincadeiras. Aqui vale tudo que for combinado 😈',
  'A Casa está aberta! 🔥 Regra única: consentimento sempre. O resto é diversão. Quem marcar "Quero brincar" pode ser sorteado(a) 😏',
  'Luzes baixas, música alta e muita gente com vontade 🖤 Sou a Lola, IA da Casa. Toquem num perfil pra chamar pra cabine.',
];

export const COMENTARIOS_RESULTADO: string[] = [
  'Essa sala não me engana 😏',
  'Anotado! Já sei quem eu vou sortear depois 😈',
  'Uau… a noite promete 🔥',
  'Tô vendo muita gente safada por aqui 👀',
  'Quem não votou também tem segredo, eu sei 🤫',
  'Essa resposta merecia uma cabine 🚪',
];

export const FUGIU: string[] = [
  '{nome} fugiu da brincadeira 🙈 Fica pra próxima!',
  '{nome} não respondeu… o silêncio também é uma resposta 😏',
  '{nome} ficou tímido(a)! Alguém anima essa pessoa no chat 🔥',
];

export const TEMAS_DA_NOITE: Record<'sexta' | 'sabado', { nome: string; descricao: string }> = {
  sexta: { nome: 'Sexta Liberal', descricao: 'Começo de fim de semana: provocar, conhecer e marcar o sábado 🍸' },
  sabado: { nome: 'Noite Voyeur', descricao: 'Sábado de exibir e espiar: desafios de story e cabine liberada 👀' },
};

// ─── Desafios com foto e vídeo (câmera ao vivo, visualização única, SEM ROSTO) ──

/** Desafio da foto: a Lola sorteia alguém e pede uma foto com o tema. */
export const TEMAS_FOTO: Item[] = [
  q('{nome}, foto da sua lingerie (ou cueca) de hoje, sem rosto 😈'),
  q('{nome}, foto do seu decote ou do seu peito agora, sem rosto 🔥'),
  q('{nome}, foto da parte do seu corpo que você mais gosta, sem rosto'),
  q('{nome}, foto da sua boca mordendo o lábio 💋'),
  q('{nome}, foto das suas pernas agora 🦵'),
  q('{nome}, foto do lugar onde você está, do jeito mais provocante possível'),
  q('{nome}, vídeo de 5 segundos de você se ajeitando na cama 🛏️'),
  q('{nome}, foto da sua mão descendo pelo seu corpo, sem rosto'),
  q('{nome}, foto do seu bumbum (pode ser com roupa) 🍑'),
  q('{nome}, foto do casal se abraçando bem colado, sem rosto 💑'),
  mq('{nome}, foto de topless ou sem camisa, sem rosto 🔥'),
  mq('{nome}, foto da lingerie mais ousada que você tem 😈'),
  mq('{nome}, vídeo de 10 segundos de uma dança provocante, sem rosto 💃'),
  mq('{nome}, foto do casal se pegando, sem rosto 💋'),
  mq('{nome}, foto de você só de toalha (ou menos) 🚿'),
  mq('{nome}, vídeo de 10 segundos tirando uma peça de roupa, sem rosto'),
  mq('{nome}, foto da mão do seu par em você, no lugar que você escolher 🔥'),
  mq('{nome}, foto de você de quatro na cama, de costas, sem rosto 🍑'),
  mq('{nome}, foto do que você está vestindo por baixo agora 🖤'),
  mq('{nome}, vídeo de 5 segundos de um beijo no pescoço do seu par 💋'),
  q('{nome}, vídeo de 10 segundos dançando sensual, sem rosto 💃'),
  q('{nome}, vídeo descendo até o chão, sem rosto 🔥'),
  q('{nome}, foto na sua pose mais sensual, sem rosto 😈'),
  mq('{nome}, vídeo de 10 segundos rebolando de lingerie (ou cueca) 🍑'),
  mq('{nome}, foto espanhola, sem rosto 🔥'),
  mq('{nome}, vídeo de 10 segundos do casal na posição favorita, sem rosto 😈'),
  mq('{nome}, vídeo de 10 segundos de um oral no seu par, sem rosto 💦'),
  mq('{nome}, vídeo de 10 segundos mostrando como vocês metem gostoso, sem rosto 🔥'),
  mq('{nome}, foto tirando a última peça de roupa, sem rosto 🖤'),
  mq('{nome}, vídeo de 10 segundos de uma sentada caprichada, sem rosto 🍑'),
  mq('{nome}, foto do casal de quatro, de costas, sem rosto 😈'),
  mq('{nome}, vídeo de 10 segundos de você se tocando, sem rosto 💦'),
];

/** Duelo: dois perfis mandam foto com o mesmo tema e a sala vota. */
export const TEMAS_DUELO: Item[] = [
  q('Melhor decote 🔥'),
  q('Melhor pegada do casal 💑'),
  q('Lingerie mais bonita 🖤'),
  q('Melhor bumbum (pode ser com roupa) 🍑'),
  q('Olhar mais safado (só os olhos) 👀'),
  q('Melhores pernas 🦵'),
  q('Look mais provocante de sexta 💃'),
  mq('Topless mais ousado (sem rosto) 🔥'),
  mq('Beijo mais quente do casal 💋'),
  mq('Lingerie mais ousada 😈'),
  mq('Foto mais quente na cama 🛏️'),
  mq('Melhor "antes da festa" no espelho, sem rosto 🪞'),
  q('Quem dança mais sensual 💃 (vídeo de 10s)'),
  q('Quem desce melhor até o chão 🔥 (vídeo)'),
  q('Pose mais sensual 😈'),
  q('Lingerie mais bonita da noite 🖤'),
  mq('Quem rebola melhor 🍑 (vídeo de 10s)'),
  mq('Melhor foto espanhola 🔥'),
  mq('Melhor boquete 💦 (vídeo de 10s, sem rosto)'),
  mq('Quem mete melhor 😈 (vídeo de 10s, sem rosto)'),
  mq('Melhor performance do casal 🔥 (vídeo de 10s)'),
  mq('Melhor sentada 🍑 (vídeo de 10s, sem rosto)'),
  mq('Melhor de quatro 😈'),
  mq('Strip mais provocante 🖤 (vídeo de 10s)'),
];

/** Relâmpago: a sala toda pode cumprir; o primeiro ganha os tokens. */
export const TEMAS_RELAMPAGO: Array<Item & { quem: 'todos' | 'casal' }> = [
  { ...q('Primeiro casal que mandar um vídeo de 10 segundos de um beijo ganha 10 tokens 💋'), quem: 'casal' },
  { ...q('Primeira foto de lingerie vermelha ganha 10 tokens 🔴'), quem: 'todos' },
  { ...q('Primeiro a mandar uma foto do drink de hoje à noite ganha 10 tokens 🍸'), quem: 'todos' },
  { ...q('Primeira foto de pernas cruzadas ganha 10 tokens 🦵'), quem: 'todos' },
  { ...q('Primeiro casal que mandar foto de mãos dadas na cama ganha 10 tokens 🛏️'), quem: 'casal' },
  { ...mq('Primeiro casal que mandar um vídeo de 10 segundos de pegação ganha 10 tokens 🔥'), quem: 'casal' },
  { ...mq('Primeira foto sem sutiã (sem rosto) ganha 10 tokens 😈'), quem: 'todos' },
  { ...mq('Primeiro vídeo de 5 segundos rebolando ganha 10 tokens 🍑'), quem: 'todos' },
  { ...mq('Primeira foto do casal na posição favorita (com roupa ou sem) ganha 10 tokens 💑'), quem: 'casal' },
  { ...mq('Primeira foto só de calcinha ou cueca ganha 10 tokens 🖤'), quem: 'todos' },
  { ...q('Primeiro vídeo descendo até o chão ganha 10 tokens 🔥'), quem: 'todos' },
  { ...q('Primeiro casal que mandar uma dança colada de 10 segundos ganha 10 tokens 💃'), quem: 'casal' },
  { ...mq('Primeira foto espanhola ganha 10 tokens 🔥'), quem: 'todos' },
  { ...mq('Primeiro casal que mandar um vídeo de oral de 10 segundos (sem rosto) ganha 10 tokens 💦'), quem: 'casal' },
  { ...mq('Primeiro casal que mandar um vídeo de 10 segundos metendo (sem rosto) ganha 10 tokens 😈'), quem: 'casal' },
  { ...mq('Primeiro vídeo tirando a lingerie ganha 10 tokens 🖤'), quem: 'todos' },
];

/** Sugestões prontas para quem quer propor um desafio a outro perfil (valendo tokens). */
export const SUGESTOES_DE_DESAFIO: Item[] = [
  q('Foto da sua lingerie (ou cueca) agora, sem rosto'),
  q('Vídeo de 10 segundos dançando sensual'),
  q('Vídeo descendo até o chão'),
  q('Foto na pose mais sensual que você tiver'),
  q('Foto do casal se beijando, sem rosto'),
  q('Tira uma peça de roupa e manda a foto'),
  mq('Tira mais uma peça e manda a foto 😈'),
  mq('Vídeo de 10 segundos rebolando'),
  mq('Foto espanhola, sem rosto'),
  mq('Foto de topless, sem rosto'),
  mq('Foto de quatro, de costas'),
  mq('Vídeo de 10 segundos de oral no seu par, sem rosto'),
  mq('Vídeo de 10 segundos do casal metendo, sem rosto'),
  mq('Vídeo de 10 segundos de uma sentada, sem rosto'),
  mq('Vídeo de 10 segundos se tocando, sem rosto'),
  mq('Foto totalmente sem roupa, sem rosto'),
];

// ─── Cabine esquentada (todos de dentro aceitaram) ───────────────────────────
// Provocações da Lola que sobem de nível com o tempo: 1 = flerte, 2 = nudez e
// toque, 3 = sexo virtual explícito. Tudo por texto, foto e vídeo de
// visualização única, só entre quem está na cabine (e quem espia, se a porta
// estiver aberta).
export const PROVOCACOES_CABINE: Record<1 | 2 | 3, string[]> = {
  1: [
    'Contem um pro outro o que cada um está vestindo agora… com detalhes 😏',
    'Cada um diz a primeira coisa que faria se estivesse aí pessoalmente.',
    'Mandem uma foto de um detalhe do corpo que vocês acham irresistível (sem rosto).',
    'Escrevam, devagar, como seria o primeiro beijo de vocês.',
    'Qual parte do corpo do outro você quer ver primeiro? Peça com jeitinho 😈',
    'Uma confissão: o que vocês estão sentindo agora, só de estar nessa cabine?',
  ],
  2: [
    'Tirem uma peça de roupa agora e mandem a foto. Quem demorar paga um drink 🔥',
    'Vídeo de 10 segundos passando a mão devagar pelo próprio corpo, sem rosto.',
    'Descrevam onde vocês estão tocando agora… e mandem a prova em foto.',
    'Casais: mostrem o beijo mais quente de vocês em vídeo para quem está na cabine 💋',
    'Foto de lingerie (ou só de cueca) na pose que mais provoca.',
    'Cada um pede ao outro uma foto específica. O outro tem 1 minuto pra cumprir.',
    'Strip lento: mandem um vídeo tirando a próxima peça, bem devagar 🖤',
  ],
  3: [
    'Agora sem roupa nenhuma: mandem a foto que vocês nunca mandaram pra ninguém 😈',
    'Vídeo de 15 segundos se tocando pensando em quem está na cabine.',
    'Casais: mostrem em vídeo a posição favorita de vocês, pra cabine inteira ver 🔥',
    'Escrevam em detalhes o que fariam com o outro na cama… e mostrem em vídeo como fariam.',
    'Um comanda, o outro obedece: o primeiro manda o que o segundo deve fazer na câmera.',
    'Mostrem como vocês gozam… em vídeo ou em palavras. Quem tem coragem? 💦',
    'Casais: transem pensando em quem está na cabine e mandem um vídeo de 10 segundos.',
  ],
};

/** Dado do prazer: ação + parte do corpo. */
export const DADO_ACOES = ['beijar', 'lamber', 'morder de leve', 'acariciar', 'apertar', 'soprar', 'tocar devagar', 'chupar'];
export const DADO_PARTES = ['o pescoço', 'a boca', 'as coxas', 'os seios/peito', 'a barriga', 'a nuca', 'o bumbum', 'onde você quiser 😈'];
