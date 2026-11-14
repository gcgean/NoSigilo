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
/** `c`: só sorteia para esses tipos de perfil (verdade/desafio/foto apontados para alguém). */
export type Item = { t: string; n: Nivel; c?: Array<'casal' | 'mulher' | 'homem'> };
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
  mq('Preferência da sala: só beijos e carícias com o outro casal, ou troca completa (transar com o outro)? Expliquem por quê 😏'),
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
  { t: 'Vocês preferem:', o: ['Só beijos e carícias com outro casal 💋', 'Trocar de casal e transar 🔄', 'Transar perto de outro casal, sem trocar 👀', 'Sexo a três 3️⃣'], n: 'muito_quente' },
  { t: 'Ménage dos sonhos:', o: ['Casal + mulher 👩', 'Casal + homem 👨', 'Duas mulheres e um homem', 'Dois casais 💑💑'], n: 'muito_quente' },
  { t: 'No Quarto Escuro você…', o: ['Fica no cantinho olhando 👀', 'Se deixa tocar 🤲', 'Toma a iniciativa 😈', 'Some com alguém 🚪'], n: 'muito_quente' },
  { t: 'Assistir o parceiro(a) com outra pessoa:', o: ['Me excita muito 🔥', 'Toparia uma vez 🤔', 'Só se eu participar 😈', 'Nunca 🚫'], n: 'muito_quente' },
  { t: 'Dominar ou ser dominado(a)?', o: ['Dominar 👑', 'Ser dominado(a) ⛓️', 'Revezar 🔄', 'Nenhum, gosto no carinho 💞'], n: 'muito_quente' },
  { t: 'Quantas pessoas no máximo numa cama?', o: ['2 💑', '3 🔥', '4 💑💑', 'Quanto mais melhor 🤤'], n: 'muito_quente' },
  { t: 'O mais quente numa festa liberal:', o: ['O beijo entre mulheres 👩‍❤️‍👩', 'Ver casais se pegando 👀', 'O convite inesperado 💌', 'O banheiro 🚿'], n: 'muito_quente' },
  { t: 'Barulho na hora H:', o: ['Silencioso(a) 🤫', 'Gemidos baixinhos 😮‍💨', 'Escandaloso(a) 📢', 'Depende de quem tá 😏'], n: 'muito_quente' },
  { t: 'Hoje à noite você toparia:', o: ['Chamada de vídeo quente 📱', 'Encontro amanhã 📍', 'Troca de fotos na cabine 📸', 'Só provocar aqui 😈'], n: 'muito_quente' },
  { t: 'Fetiche que mais desperta curiosidade:', o: ['Venda nos olhos 🙈', 'Algemas ⛓️', 'Ver a esposa com outro 🦌', 'Transar sendo olhado 👀'], n: 'muito_quente' },
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
].map((f) => `${f}
🔒 O que acontece na Casa fica na Casa: print e gravação são proibidos, e quem vazar é banido.`);

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
  q('{nome}, foto do seu ombro com a alça caindo 😏'),
  q('{nome}, foto da sua tatuagem mais escondida (ou de onde você faria uma) 🖋️'),
  q('{nome}, foto do seu pé na cama, do jeitinho mais charmoso 🦶'),
  q('{nome}, foto do seu pescoço pedindo um beijo 💋'),
  q('{nome}, foto do seu reflexo no espelho, sem rosto 🪞'),
  q('{nome}, foto do que você está bebendo e de quem está segurando o copo 🍷'),
  q('{nome}, foto da sua cama agora, do jeito que você deixaria alguém encontrar 🛏️'),
  q('{nome}, foto da sua cintura com a mão do seu par (ou a sua) 🔥'),
  mq('{nome}, foto da peça de roupa que você tiraria agora pra alguém da sala 🖤'),
  mq('{nome}, foto da sua marca de biquíni ou de sunga ☀️'),
  mq('{nome}, foto de você mordendo uma peça de roupa, sem rosto 😈'),
  mq('{nome}, vídeo de 5 segundos abrindo o zíper ou o botão bem devagar 🔥'),
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
  q('Melhor sorriso safado (só a boca) 💋'),
  q('Melhor foto no espelho, sem rosto 🪞'),
  q('Ombro mais beijável 😏'),
  q('Cama mais convidativa 🛏️'),
  q('Melhor costas 🔥'),
  mq('Marquinha mais gostosa ☀️'),
  mq('Melhor foto só de toalha 🚿'),
  mq('Quem provoca melhor só com a alça caindo 🖤'),
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
  { ...q('Primeira foto no espelho (sem rosto) ganha 10 tokens 🪞'), quem: 'todos' },
  { ...q('Primeira foto de salto alto ganha 10 tokens 👠'), quem: 'todos' },
  { ...q('Primeira foto da boca mordendo o lábio ganha 10 tokens 💋'), quem: 'todos' },
  { ...q('Primeiro casal que mandar foto de um beijo no pescoço ganha 10 tokens 😏'), quem: 'casal' },
  { ...mq('Primeira foto só de toalha ganha 10 tokens 🚿'), quem: 'todos' },
  { ...mq('Primeira foto de marquinha ganha 10 tokens ☀️'), quem: 'todos' },
  { ...mq('Primeiro casal que mandar foto dele abrindo o sutiã dela ganha 10 tokens 🖤'), quem: 'casal' },
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
    'Contem em detalhes como vocês chupariam uma buceta agora… devagar, com a língua 👅',
    'Descrevam como vocês chupariam uma pica bem gostoso, do jeitinho que vocês curtem 🍆',
    'Quem aqui prefere chupar buceta ou chupar pica? Respondam e expliquem por quê 😈',
  ],
  3: [
    'Agora sem roupa nenhuma: mandem a foto que vocês nunca mandaram pra ninguém 😈',
    'Vídeo de 15 segundos se tocando pensando em quem está na cabine.',
    'Casais: mostrem em vídeo a posição favorita de vocês, pra cabine inteira ver 🔥',
    'Escrevam em detalhes o que fariam com o outro na cama… e mostrem em vídeo como fariam.',
    'Um comanda, o outro obedece: o primeiro manda o que o segundo deve fazer na câmera.',
    'Mostrem como vocês gozam… em vídeo ou em palavras. Quem tem coragem? 💦',
    'Casais: transem pensando em quem está na cabine e mandem um vídeo de 10 segundos.',
    'Casais: ele chupa a buceta dela em vídeo de 10 segundos pra cabine ver 👅',
    'Casais: ela chupa a pica dele em vídeo de 10 segundos, olhando pra câmera 🍆',
    'Escrevam o que vocês fariam se tivessem uma buceta e uma pica na frente de vocês agora 😈',
  ],
};

/** Dado do prazer: ação + parte do corpo. */
export const DADO_ACOES = ['beijar', 'lamber', 'morder de leve', 'acariciar', 'apertar', 'soprar', 'tocar devagar', 'chupar'];
export const DADO_PARTES = ['o pescoço', 'a boca', 'as coxas', 'os seios/peito', 'a barriga', 'a nuca', 'o bumbum', 'onde você quiser 😈'];

// ─── Brincadeiras próprias de cada sala (31/10/2026) ──────────────────────────
// Nas salas temáticas a Lola puxa daqui na maior parte das vezes (o resto vem do
// banco geral). Salão Principal segue com o banco geral, subindo o tom à noite.
// 'glory' é a Suruba (o id ficou para não quebrar o histórico).

export type SalaTematica = 'casais' | 'cuckold' | 'glory';
export type PacoteDaSala = {
  euNunca: Item[];
  perguntas: Item[];
  verdades: Item[];
  desafios: Item[];
  enquetes: Enquete[];
  relampago: Array<Item & { quem: 'todos' | 'casal' }>;
  foto: Item[];
};

const so = (c: Item['c'], it: Item): Item => ({ ...it, c });

export const BRINCADEIRAS_DA_SALA: Record<SalaTematica, PacoteDaSala> = {
  // Casais: exibição, esposas se pegando, maridos desejando as esposas dos outros e troca na imaginação.
  casais: {
    euNunca: [
      mq('Eu nunca transei vendo outro casal transar do lado.'),
      mq('Eu nunca beijei a esposa de outro casal na frente do meu marido.'),
      mq('Eu nunca vi minha esposa beijando outra mulher.'),
      mq('Eu nunca fiz troca de casais no mesmo quarto.'),
      mq('Eu nunca transei sabendo que outro casal estava assistindo.'),
      mq('Eu nunca fantasiei com a esposa ou o marido de um casal amigo.'),
      mq('Eu nunca troquei de par no meio da transa.'),
      q('Eu nunca combinei com meu par um sinal secreto pra quando a gente gosta de outro casal.'),
      q('Eu nunca fui a uma casa de swing só pra olhar.'),
    ],
    perguntas: [
      mq('Casais: o que vocês fariam primeiro se outro casal desta sala estivesse no quarto com vocês agora? 🔥'),
      mq('Esposas: qual marido desta sala vocês deixariam assistir vocês? 👀'),
      mq('Maridos: o que mais excita vocês em ver a esposa beijando outra mulher?'),
      mq('Exibir transando pra outro casal ou assistir outro casal transar: o que vocês preferem?'),
      mq('Qual foi a troca mais gostosa que vocês já fizeram (ou que imaginam fazer)?'),
      mq('Maridos: com que esposa desta sala vocês trocariam hoje, se a de vocês deixasse? 😈'),
      q('Casais: quem toma a iniciativa numa troca, ele ou ela? 😏'),
    ],
    verdades: [
      mq('{nome}, qual casal desta sala vocês chamariam pra trocar hoje, e por quê?'),
      mq('{nome}, vocês já se imaginaram transando do lado de outro casal desta sala? Conta como seria.'),
      mq('{nome}, o que vocês deixariam o outro casal fazer com vocês, na frente um do outro?'),
      so(['casal'], q('{nome}, quem puxou o assunto da troca pela primeira vez: ele ou ela?')),
      so(['mulher'], mq('{nome}, qual esposa desta sala você pegaria na frente do marido dela?')),
    ],
    desafios: [
      mq('{nome}, descreva pra sala como seria a primeira troca de vocês com um casal daqui (sem citar nome, se preferir).'),
      mq('{nome}, provoque a esposa de outro casal com o elogio mais safado que vier na cabeça (o marido dela vai ler 😈).'),
      mq('{nome}, convide um casal desta sala pra cabine de vocês (vale recusar).'),
      mq('{nome}, conte qual parte do corpo da esposa de outro casal você beijaria primeiro.'),
      mq('{nome}, escreva o que faria se as esposas desta sala começassem a se pegar na sua frente.'),
      so(['casal'], mq('{nome}, descrevam pra sala como vocês transariam sabendo que outro casal está assistindo.')),
    ],
    enquetes: [
      { t: 'Numa troca, o que vocês curtem mais?', o: ['Mesmo quarto 🔥', 'Quartos separados', 'Só assistir', 'Só ser assistidos'], n: 'muito_quente' },
      { t: 'Esposas se pegando na frente dos maridos:', o: ['Já rolou 🔥', 'Doidas pra rolar', 'Só na imaginação', 'Não é a nossa'], n: 'muito_quente' },
      { t: 'Transar com outro casal assistindo:', o: ['Adoramos exibir', 'Preferimos assistir', 'Os dois 😈', 'Ainda falta coragem'], n: 'muito_quente' },
      { t: 'A primeira troca de vocês foi (ou vai ser):', o: ['Com casal amigo', 'Com casal daqui do NoSigilo', 'Em casa de swing', 'Ainda vai rolar 😈'], n: 'quente' },
    ],
    relampago: [
      { ...mq('Primeiro casal que mandar uma foto dos dois se pegando (sem rosto) ganha 10 tokens 🔥'), quem: 'casal' },
      { ...mq('Primeira esposa que mostrar a lingerie de hoje pra sala (sem rosto) ganha 10 tokens 😈'), quem: 'casal' },
      { ...mq('Primeiro marido que mandar a foto da mão dele na esposa, onde ela deixar, ganha 10 tokens'), quem: 'casal' },
    ],
    foto: [
      so(['casal'], mq('{nome}, mostrem pra sala como vocês estão agora no sofá ou na cama (sem rosto)')),
      so(['casal'], mq('{nome}, uma foto do seu par do jeito que você exibiria pra outro casal (com o ok dele ou dela)')),
      so(['mulher'], mq('{nome}, uma foto provocando as esposas da sala (sem rosto) 😈')),
    ],
  },

  // Cuckold: o marido exibe a esposa, os homens desejam e quem escolhe é sempre ela.
  cuckold: {
    euNunca: [
      mq('Eu nunca vi minha esposa sendo desejada por outro homem na minha frente.'),
      mq('Eu nunca mandei foto da minha esposa pra outro homem (com ela sabendo).'),
      mq('Eu nunca assisti minha esposa com outro.'),
      mq('Eu nunca escolhi o homem junto com meu marido.'),
      mq('Eu nunca fiquei com uma esposa na frente do marido dela 😈'),
      q('Eu nunca contei pro meu marido uma cantada que recebi só pra provocar ele.'),
    ],
    perguntas: [
      mq('Maridos: o que mais excita vocês em ver ela sendo desejada? 😈'),
      mq('Esposas: o que um homem precisa fazer pra ganhar vocês na frente do marido?'),
      mq('Homens: qual o elogio mais safado que vocês fariam pra uma esposa daqui? Ela escolhe o melhor 👑'),
      mq('Maridos: vocês preferem assistir de perto, de longe ou ouvir ela contar tudo depois?'),
      mq('Casais: qual foi a vez que ele mais gostou de ver você desejada?'),
      q('Esposas: de quem foi a ideia primeiro, de vocês ou do marido?'),
    ],
    verdades: [
      so(['casal'], mq('{nome}, contem pra sala o que mais excita vocês quando ela é desejada por outros homens.')),
      so(['casal'], mq('{nome}, qual homem desta sala ela escolheria agora? Deixa ela responder 😈')),
      so(['casal'], mq('{nome}, até onde o marido gosta de ver: olhar, tocar ou tudo?')),
      so(['homem'], mq('{nome}, o que você diria pro marido se a esposa dele te escolhesse?')),
      so(['homem'], mq('{nome}, como você conquistaria uma esposa com o marido olhando?')),
      so(['mulher'], mq('{nome}, o que te deixa com mais tesão: ser olhada ou ser escolhida?')),
    ],
    desafios: [
      so(['casal'], mq('{nome}, marido: descreva a esposa pra sala do jeito que você quer que os homens imaginem ela.')),
      so(['casal'], mq('{nome}, ela escolhe: qual homem desta sala ganha um elogio dela de volta? 👑')),
      so(['casal'], mq('{nome}, marido: conte pra sala a fantasia que você tem de ver ela com outro.')),
      so(['homem'], mq('{nome}, mande pra sala o elogio mais safado pra uma das esposas presentes. Quem decide se gostou é ela.')),
      so(['homem'], mq('{nome}, peça licença ao marido de um casal daqui e elogie a esposa dele (com classe 😏).')),
      so(['mulher'], mq('{nome}, escolha o homem desta sala que mais te provocou hoje e diga por quê.')),
    ],
    enquetes: [
      { t: 'Marido cuckold: como ele gosta mais?', o: ['Assistindo de perto', 'Escondido olhando', 'Ouvindo ela contar', 'Participando junto'], n: 'muito_quente' },
      { t: 'Quem escolhe o homem?', o: ['Ela, sempre 👑', 'Os dois juntos', 'O marido', 'Quem se garantir'], n: 'quente' },
      { t: 'O que mais conquista uma esposa na frente do marido?', o: ['Elogio safado', 'Respeito pelo casal', 'Atitude', 'Uma boa foto 😏'], n: 'quente' },
    ],
    relampago: [
      { ...mq('Primeiro marido que exibir a esposa numa foto agora (com o ok dela, sem rosto) ganha 10 tokens 😈'), quem: 'casal' },
      { ...mq('Primeira esposa que mostrar pra sala o que vai usar pro próximo homem (sem rosto) ganha 10 tokens'), quem: 'casal' },
    ],
    foto: [
      so(['casal'], mq('{nome}, o marido escolhe: uma foto dela pra sala inteira desejar (sem rosto, se preferir)')),
      so(['casal'], mq('{nome}, uma foto da lingerie que ela usaria pro próximo homem 😈 (sem rosto)')),
    ],
  },

  // Suruba: todo mundo se pega.
  glory: {
    euNunca: [
      mq('Eu nunca participei de uma suruba.'),
      mq('Eu nunca fiquei com mais de duas pessoas ao mesmo tempo.'),
      mq('Eu nunca perdi a conta de quem estava me pegando.'),
      mq('Eu nunca transei com um casal e mais uma mulher ao mesmo tempo.'),
      mq('Eu nunca entrei num quarto escuro sem saber quem estava lá dentro.'),
      q('Eu nunca beijei três pessoas diferentes na mesma noite.'),
    ],
    perguntas: [
      mq('Suruba dos sonhos: quantas pessoas, e quem desta sala estaria lá? 🔥'),
      mq('Numa suruba vocês preferem comandar, ser comandados ou só se deixar levar?'),
      mq('Qual a primeira coisa que vocês fariam se a luz apagasse agora nesta sala?'),
      mq('Combinado da suruba de vocês: vale tudo ou tem regra? Contem a regra mais safada.'),
    ],
    verdades: [
      mq('{nome}, quem desta sala você puxaria primeiro pro meio da suruba?'),
      mq('{nome}, conta a noite mais cheia de gente que você já viveu.'),
      mq('{nome}, numa suruba você vai pro meio ou fica na beirada olhando? 😏'),
    ],
    desafios: [
      mq('{nome}, escolha três pessoas desta sala e descreva a cena da suruba de vocês.'),
      mq('{nome}, chame duas pessoas da sala pra uma cabine a três (vale recusar).'),
      mq('{nome}, descreva pra sala o que faria se acordasse no meio desta suruba.'),
    ],
    enquetes: [
      { t: 'Suruba ideal:', o: ['Só casais', 'Casais e mulheres', 'Mistura geral 🔥', 'Só na imaginação 😅'], n: 'muito_quente' },
      { t: 'Na suruba você é:', o: ['Quem puxa todo mundo', 'Quem se deixa levar', 'Quem assiste', 'Quem vai de beijo em beijo'], n: 'muito_quente' },
    ],
    relampago: [
      { ...mq('Primeiro a mostrar com que roupa (ou sem) chegou na suruba, sem rosto, ganha 10 tokens 🔥'), quem: 'todos' },
      { ...mq('Primeiro casal que mandar uma foto chamando a sala pra cama ganha 10 tokens 😈'), quem: 'casal' },
    ],
    foto: [
      mq('{nome}, foto da roupa (ou da falta dela) que você usaria nesta suruba (sem rosto)'),
    ],
  },
};

/** Como a Lola deve puxar cada sala (vai no pedido para a IA). */
export const PERFIL_DA_SALA: Record<string, string> = {
  salao: 'Salão Principal: a pista de todo mundo. Brincadeiras quentes de quebra-gelo que vão subindo o tom ao longo da noite e puxam o pessoal pra cabine e para as salas mais quentes.',
  casais: 'Sala dos Casais (só casais e mulheres): provoque os casais a se exibirem transando para outros casais, as esposas a se pegarem, os maridos a desejarem as esposas dos outros e a troca de casais na imaginação.',
  quarto: 'Quarto Escuro: para quem veio brincar de verdade, sem filtro e com respeito.',
  cuckold: 'Quarto Cuckold: o marido gosta de exibir a esposa e ver outros homens desejando ela. Provoque o marido a exibir a esposa e os homens a desejá-la com elogios; quem escolhe é sempre ela.',
  glory: 'Suruba: a sala onde todo mundo se pega. Fale de sexo em grupo, de quem puxa quem, dos combinados da suruba e de várias pessoas ao mesmo tempo.',
};

/** Salão chamando para as salas mais quentes quando elas estão animadas. */
export const CHAMADAS_PARA_SALA: Record<SalaTematica, string[]> = {
  casais: ['💑 A Sala dos Casais tá animada agora… casais e mulheres, quem vai? 😈', '💑 Tem casal se exibindo na Sala dos Casais. Bora espiar? 🔥'],
  cuckold: ['😈 No Quarto Cuckold tem marido exibindo a esposa… homens, a vez é de vocês!', '😈 O Quarto Cuckold esquentou: quem escolhe é ela, quem se garante vai lá.'],
  glory: ['🔥 A Suruba começou! Casais e mulheres entram direto, e os solteiros que mais animaram a noite também 😏'],
};

// ─── Tema de cada noite de festa (31/10/2026) ─────────────────────────────────
// Um tema por noite, girando na ordem abaixo (sexta, sábado, sexta…), para a festa
// não ser sempre a mesma. O admin pode trocar o tema de uma data no painel.
// O tema soma com a sala: a Lola mistura as brincadeiras do tema com as da sala.

export type TemaDeFesta = {
  id: string;
  nome: string;
  descricao: string;
  /** Dress code sugerido (aparece no aviso e puxa os desafios de foto). */
  dress?: string;
  /** Como a Lola deve puxar a noite (vai no pedido para a IA). */
  perfil: string;
  boasVindas: string[];
  euNunca: Item[];
  perguntas: Item[];
  foto: Item[];
};

export const TEMAS_DE_FESTA: TemaDeFesta[] = [
  {
    id: 'troca',
    nome: 'Noite da Troca',
    descricao: 'Swing de verdade: casais trocando, na imaginação e na cabine 🔄',
    perfil: 'Tema da noite: troca de casais. Puxe conversas e provocações sobre trocar de par, casais se conhecendo e combinando a troca.',
    boasVindas: ['🔄 Hoje é Noite da Troca! Casais, olhem bem em volta: com quem vocês trocariam hoje? 😈', '🔄 Noite da Troca começou: quem chegou de par pode sair com outro (na imaginação… ou na cabine) 🔥'],
    euNunca: [mq('Eu nunca troquei de par numa festa.'), mq('Eu nunca combinei uma troca pelo chat antes de conhecer o casal.'), q('Eu nunca fiquei com ciúme numa troca e gostei disso.')],
    perguntas: [mq('Noite da Troca: qual o primeiro passo pra uma troca dar certo? Contem o segredo de vocês 🔄'), q('O que não pode faltar no combinado de uma troca?')],
    foto: [
      so(['casal'], mq('{nome}, foto de vocês dois prontos pra trocar hoje (sem rosto) 🔄')),
      so(['casal'], mq('{nome}, foto do seu par do jeito que vocês apresentariam pra outro casal 😈 (sem rosto)')),
      so(['casal'], mq('{nome}, foto das duas mãos de vocês segurando a mão de um terceiro… imaginário 🔄')),
      so(['casal'], q('{nome}, foto da cama de vocês arrumada pra receber visita hoje 🛏️')),
      mq('{nome}, foto do que você tiraria primeiro numa troca (sem rosto) 🖤'),
      q('{nome}, foto do seu sorriso safado de quem topa trocar (só a boca) 💋'),
    ],
  },
  {
    id: 'voyeur',
    nome: 'Noite Voyeur',
    descricao: 'Noite de exibir e espiar: cabines de porta aberta e desafios de foto 👀',
    perfil: 'Tema da noite: voyeurismo e exibicionismo. Provoque quem gosta de se exibir e quem gosta de espiar; incentive cabines de porta aberta.',
    boasVindas: ['👀 Hoje é Noite Voyeur: deixa a porta da cabine aberta que tem gente querendo espiar 😏', '👀 Noite Voyeur começou! Quem aqui gosta de olhar… e quem gosta de ser olhado?'],
    euNunca: [mq('Eu nunca transei sabendo que alguém estava espiando.'), mq('Eu nunca deixei a cortina aberta de propósito.'), q('Eu nunca fiquei olhando um casal se pegar numa festa.')],
    perguntas: [mq('Noite Voyeur: vocês preferem exibir ou espiar? Contem a melhor vez 👀'), mq('Onde foi o lugar mais arriscado em que vocês se exibiram?')],
    foto: [
      mq('{nome}, uma foto de como você ficaria se soubesse que a sala inteira está olhando (sem rosto) 👀'),
      mq('{nome}, foto pela fresta da porta ou pelo reflexo do espelho, sem rosto 🪞'),
      mq('{nome}, foto da janela ou da cortina meio aberta, com você na frente (sem rosto) 👀'),
      q('{nome}, foto só da sua sombra, na pose mais provocante 😏'),
      mq('{nome}, foto como se alguém tivesse te flagrado se trocando (sem rosto) 🙈'),
      so(['casal'], mq('{nome}, foto de vocês dois de um ângulo que um voyeur adoraria ver (sem rosto) 👀')),
    ],
  },
  {
    id: 'lingerie',
    nome: 'Noite da Lingerie',
    descricao: 'Dress code: vermelho ou preto. Quem vier a caráter ganha destaque 🔴🖤',
    dress: 'lingerie vermelha ou preta',
    perfil: 'Tema da noite: lingerie, com dress code vermelho ou preto. Elogie, provoque e puxe desafios de foto com lingerie (sempre sem rosto).',
    boasVindas: ['🔴 Hoje é Noite da Lingerie! Dress code: vermelho ou preto. Quem veio a caráter? 😈', '🖤 Noite da Lingerie começou: mostra (sem rosto) o que você escolheu pra hoje!'],
    euNunca: [mq('Eu nunca usei lingerie só pra ser vista por outro casal.'), q('Eu nunca comprei uma lingerie pensando em alguém daqui.'), mq('Eu nunca tirei a lingerie de alguém com os dentes.')],
    perguntas: [mq('Noite da Lingerie: renda, transparência ou couro? Qual deixa vocês loucos? 🔴'), q('Vermelho ou preto: qual é a cor do pecado pra vocês?')],
    foto: [
      mq('{nome}, mostra a lingerie de hoje, vermelha ou preta (sem rosto) 🔴🖤'),
      so(['casal'], mq('{nome}, foto dele tirando a lingerie dela (sem rosto) 😈')),
      q('{nome}, foto só da alcinha caindo do ombro 🔴'),
      q('{nome}, foto da renda de perto, sem mostrar mais nada 🖤'),
      mq('{nome}, foto da lingerie jogada no chão… e você fora do quadro 😈'),
      q('{nome}, foto da meia-calça ou da cinta-liga (ou da cueca, se for ele) 🦵'),
    ],
  },
  {
    id: 'esposas',
    nome: 'Noite das Esposas',
    descricao: 'Hotwife e cuckold: o marido exibe e quem escolhe é ela 👑',
    perfil: 'Tema da noite: hotwife e cuckold. Provoque os maridos a exibirem as esposas e os homens a desejarem; quem escolhe é sempre ela.',
    boasVindas: ['👑 Hoje é Noite das Esposas: maridos, exibam com orgulho. Homens, caprichem no elogio. Quem escolhe é ela 😈', '👑 Noite das Esposas começou! Esposas, a noite é de vocês.'],
    euNunca: [mq('Eu nunca fui exibida pelo meu marido pra outros homens.'), mq('Eu nunca escolhi um homem com meu marido do lado.'), q('Eu nunca contei pro meu marido que outro homem me olhou.')],
    perguntas: [mq('Noite das Esposas: maridos, o que mais orgulha vocês nela? Esposas, o que mais excita em ser exibida? 👑'), mq('Homens: que elogio conquistaria uma esposa com o marido olhando?')],
    foto: [
      so(['casal'], mq('{nome}, o marido escolhe uma foto dela pra exibir pra sala (sem rosto) 👑')),
      so(['casal'], mq('{nome}, foto da mão dele na cintura dela, mostrando quem é a rainha 👑')),
      so(['casal'], q('{nome}, foto do salto alto dela (com ou sem ela dentro) 👠')),
      so(['casal'], mq('{nome}, foto da roupa que ela usaria pra sair sozinha hoje 😈 (sem rosto)')),
      so(['mulher'], mq('{nome}, foto que você mandaria pro marido de outra pra provocar 👑 (sem rosto)')),
      so(['casal'], mq('{nome}, foto dela do jeito que o marido mais gosta de exibir (sem rosto) 🔥')),
    ],
  },
  {
    id: 'mascaras',
    nome: 'Baile de Máscaras',
    descricao: 'Mistério total: quem é quem? Revele só se quiser 🎭',
    perfil: 'Tema da noite: baile de máscaras. Clima de mistério, segredos e fantasias anônimas; provoque as pessoas a revelarem desejos sem revelar quem são.',
    boasVindas: ['🎭 Hoje é Baile de Máscaras: aqui ninguém sabe quem é quem… então pode confessar 😏', '🎭 O Baile de Máscaras começou! Qual segredo você conta hoje que não contaria de cara limpa?'],
    euNunca: [mq('Eu nunca fiquei com alguém sem saber o nome.'), q('Eu nunca usei máscara ou venda na cama.'), mq('Eu nunca realizei uma fantasia que ninguém do meu círculo imagina.')],
    perguntas: [mq('Baile de Máscaras: confessem uma fantasia que vocês nunca contaram pra ninguém 🎭'), q('Venda nos olhos: vocês preferem usar ou colocar em alguém?')],
    foto: [
      mq('{nome}, foto com algo cobrindo o rosto (máscara, mão, lençol) e o resto à mostra 🎭'),
      q('{nome}, foto de um detalhe seu que ninguém aqui adivinharia de quem é 🎭'),
      q('{nome}, foto na penumbra, só um pedaço iluminado 🕯️'),
      mq('{nome}, foto com uma peça de roupa servindo de máscara 😈'),
      q('{nome}, foto de uma pista sobre você (sem rosto) pra sala tentar adivinhar 🎭'),
      mq('{nome}, foto sua de costas, com um segredo escrito na pele ou num papel 🖋️'),
    ],
  },
  {
    id: 'elas',
    nome: 'Elas no Comando',
    descricao: 'Hoje quem manda são elas: mulheres e esposas escolhem, convidam e decidem 💋',
    perfil: 'Tema da noite: elas no comando. Dê protagonismo às mulheres e esposas: elas escolhem, convidam, julgam desafios e decidem quem ganha.',
    boasVindas: ['💋 Hoje é Elas no Comando: mulheres e esposas escolhem, convidam e decidem. Homens, caprichem 😈', '💋 Elas no Comando começou! Meninas, quem vocês vão chamar pra cabine hoje?'],
    euNunca: [mq('Eu nunca mandei na cama a noite inteira.'), q('Eu nunca chamei alguém pra sair primeiro.'), mq('Eu nunca escolhi o casal com quem a gente ia trocar.')],
    perguntas: [mq('Elas no Comando: meninas, o que vocês mandariam um homem desta sala fazer agora? 💋'), q('Esposas: quem toma a iniciativa em casa, vocês ou eles?')],
    foto: [
      so(['mulher', 'casal'], mq('{nome}, foto mostrando quem manda hoje (sem rosto) 💋')),
      so(['mulher', 'casal'], q('{nome}, foto do batom de hoje, só a boca 💄')),
      so(['mulher', 'casal'], mq('{nome}, foto do seu pé em cima de alguém (ou da cama), no comando 👠')),
      so(['mulher', 'casal'], q('{nome}, foto do seu olhar de quem escolhe, sem mostrar o rosto inteiro 👀')),
      so(['mulher', 'casal'], mq('{nome}, foto da sua pose de rainha da noite (sem rosto) 👑')),
      so(['mulher', 'casal'], mq('{nome}, foto que faria qualquer homem da sala pedir permissão 😈 (sem rosto)')),
    ],
  },
  {
    id: 'novatos',
    nome: 'Noite dos Novatos',
    descricao: 'Primeira vez na Casa? Hoje é noite de quebrar o gelo sem pressão 🥂',
    perfil: 'Tema da noite: novatos. Brincadeiras leves de quebra-gelo, acolha quem chegou agora e incentive os veteranos a receber bem.',
    boasVindas: ['🥂 Hoje é Noite dos Novatos: chegou agora? Fica à vontade, aqui ninguém é obrigado a nada 😉', '🥂 Noite dos Novatos começou! Veteranos, recebam bem quem está chegando.'],
    euNunca: [q('Eu nunca fui numa casa de swing.'), q('Eu nunca contei pra alguém que curto o meio liberal.'), q('Eu nunca demorei mais de um mês pra criar coragem de entrar aqui.')],
    perguntas: [q('Noite dos Novatos: como foi a primeira vez de vocês no meio liberal? 🥂'), q('Qual conselho vocês dariam pra quem está chegando hoje?')],
    foto: [
      q('{nome}, foto do seu drink de hoje pra brindar com os novatos 🥂'),
      q('{nome}, foto do cantinho onde você está pra receber os novatos 🏠'),
      q('{nome}, foto do look de hoje, do pescoço pra baixo 💃'),
      q('{nome}, foto da sua mão acenando pros novatos, com um detalhe sensual 👋'),
      q('{nome}, foto da música que está tocando aí agora 🎶'),
      mq('{nome}, foto de boas-vindas mais provocante que você tiver coragem (sem rosto) 😈'),
    ],
  },
  {
    id: 'suruba',
    nome: 'Noite da Suruba',
    descricao: 'A Suruba abre mais cedo e a noite é de todo mundo se pegar 🫦',
    perfil: 'Tema da noite: suruba. Puxe o clima de grupo, de várias pessoas ao mesmo tempo e de levar a turma pra Suruba.',
    boasVindas: ['🫦 Hoje é Noite da Suruba: a sala da Suruba abre mais cedo. Quem vai primeiro? 😈', '🫦 Noite da Suruba começou! Hoje ninguém fica só olhando.'],
    euNunca: [mq('Eu nunca fiquei com mais de três pessoas na mesma noite.'), mq('Eu nunca entrei numa suruba sem conhecer ninguém.'), q('Eu nunca fiquei com vontade de participar de uma e não tive coragem.')],
    perguntas: [mq('Noite da Suruba: qual o tamanho ideal de uma suruba pra vocês? 🫦'), mq('Numa suruba, quem vocês puxariam primeiro desta sala?')],
    foto: [
      mq('{nome}, foto chamando a sala pra Suruba (sem rosto) 🫦'),
      mq('{nome}, foto da cama que caberia a sala inteira 🛏️'),
      mq('{nome}, foto de várias mãos (ou travesseiros) em volta de você 🫦'),
      q('{nome}, foto do que você levaria pra suruba: drink, brinquedo, óleo… 🧴'),
      mq('{nome}, foto de você esperando, de costas, a próxima pessoa chegar (sem rosto) 😈'),
      so(['casal'], mq('{nome}, foto de vocês dois com espaço sobrando pra mais gente 🫦 (sem rosto)')),
    ],
  },
];

/** Sexta 06/11/2026, a primeira noite da rotação. */
const PRIMEIRA_NOITE_DOS_TEMAS = Date.UTC(2026, 10, 6);

/** Tema automático de uma noite: gira sexta, sábado, sexta… pela lista acima. */
export function temaAutomatico(data: string, dia: 'sexta' | 'sabado'): TemaDeFesta {
  const sexta = Date.parse(`${data}T00:00:00Z`) - (dia === 'sabado' ? 86_400_000 : 0);
  const semanas = Math.floor((sexta - PRIMEIRA_NOITE_DOS_TEMAS) / (7 * 86_400_000));
  const i = semanas * 2 + (dia === 'sabado' ? 1 : 0);
  const n = TEMAS_DE_FESTA.length;
  return TEMAS_DE_FESTA[((i % n) + n) % n];
}
