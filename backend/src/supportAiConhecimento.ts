// ─── O que o suporte sabe sobre o NoSigilo ──────────────────────────────────
//
// Levantado lendo o código (rotas, regras e telas) em 17/09/2026 e revisado em
// 14/10/2026 (stories, eventos, conta oficial, LGPD, localização). Não é gerado
// automaticamente: quando uma regra mudar no código, mude aqui também. Números
// que vêm de constantes têm a referência ao lado para facilitar achar.
//
// Por que um manual e não "a IA lê o backend e o banco": o código tem ~17 mil
// linhas (caro e confuso por mensagem), e acesso livre ao banco colocaria dados
// de TODOS os usuários de um site adulto ao alcance de um pedido esperto no chat
// ("me diga o e-mail do perfil X") e dentro de um provedor externo. Dados da
// pessoa em atendimento vêm só pelas consultas de supportAiFerramentas.ts, que
// o código limita à conta dela.

export const MANUAL_DO_SISTEMA = `MANUAL DO NOSIGILO (use para responder; não invente além disto)

Público e regras da comunidade
- Só maiores de 18 anos. Qualquer conteúdo envolvendo menores é proibido e é caso grave.
- Toda interação precisa ser consensual e respeitosa. "Não", silêncio ou bloqueio encerram a tentativa de contato.
- Discrição: não se compartilha foto ou dado de outra pessoa sem permissão.
- A moderação pode remover conteúdo, restringir recursos, suspender ou encerrar contas.

Tipos de perfil e período grátis ao se cadastrar (trialEndForGender)
- Mulher: 30 dias grátis e, ao VERIFICAR o perfil, Premium grátis para sempre + selo de Verificada. Para verificar: Configurações › Perfil (ou o aviso rosa no topo do app) › "Quero verificar meu perfil": o app mostra um código de 4 números; ela escreve num papel, tira uma selfie segurando o papel e envia. A equipe compara com as fotos do perfil e responde nas notificações (você, IA, não aprova nem promete aprovação). Mulher sem verificar, depois dos 30 dias, continua lendo e respondendo quem mandou mensagem. Casal: 15 dias grátis; depois disso, sem assinar, o casal continua lendo e respondendo as mensagens que recebe — o que é pago é puxar conversa nova, ver quem visitou, filtros e destaque. Outros perfis (trans, CD etc.): 7 dias.
- Homem: não tem período grátis; vê uma amostra do app e precisa assinar para usar os recursos Premium.

Premium
- Assinatura mensal de R$ 9,90 por mês (não é cobrança por mensagem).
- Pagamento: cartão (renova automaticamente todo mês e pode ser cancelado quando quiser na tela de assinatura), PIX ou boleto. PIX e cartão não pedem CPF; boleto pede.
- PIX costuma confirmar em poucos minutos.
- Precisa de Premium (ou período grátis/dias ganhos ativos): iniciar conversas e mandar mensagens no chat, reagir e abrir mídias de mensagens, curtir e passar perfis no Match, ver quem visitou o perfil, ver quem curtiu suas fotos, ver quem viu seus stories e quem fixou você, usar o Radar, criar eventos e confirmar presença, mandar mensagens em grupos.
- Dias grátis ganhos (tokens, convites) valem mesmo depois que a assinatura paga vence.

Tokens (menu Tokens)
- Ganha pontos usando o app: curtir (1, até 20 por dia), comentar (3, até 10 por dia), foto nova (10, até 3 por dia), story (8, até 3 por dia), postagem (5, até 3 por dia; pontos por postagem só para perfis de mulher e casal) e check-in diário (5, 1 por dia).
- A cada 100 pontos, vira automaticamente 1 dia de Premium grátis.
- Destaque de perfil: custa 30 tokens e deixa o perfil em destaque por 24 horas.
- Dá para presentear tokens a outro usuário. Existe ranking por tipo de perfil.

Convites (menu Gerar/Gerenciar convites)
- Cada pessoa tem link de convite. O convite só conta quando o convidado, em até 7 dias do cadastro, faz pelo menos 2 destas 3 coisas: completar pelo menos metade do perfil, mandar uma mensagem, curtir um perfil. Convites que não cumprem isso expiram.
- Recompensas por convites validados: 1º e 2º convite dão 10 dias de Premium cada; no 3º a pessoa vira Embaixador(a) e ganha mais 10 dias; com 10 vira Embaixador(a) Gold (100 dias); com 30, Embaixador(a) Elite (300 dias).

Match
- Mostra perfis por proximidade; dentro da mesma distância, primeiro quem está online, depois ativos nas últimas 24 horas, nos últimos 7 dias e o resto. Perfis desativados não aparecem.
- Curtir e passar exigem Premium. Há filtros e a lista de Curtidos.

Radar (Premium)
- Avisa quem está numa cidade que você vai estar ou está: escolhe cidade, mensagem (até 200 caracteres), para quais perfis (mulheres, homens, casais ou todos), raio de 5 a 100 km e duração de 1 a 72 horas. Pode ser anônimo.
- Tem limite de uso por dia e por semana. Quem recebe pode entrar em contato pelo próprio Radar.

Stories
- Assistir: os stories vêm separados por perfil (as barrinhas do topo são só da pessoa atual). Tocar no lado direito avança, no esquerdo volta; deslizar para o lado pula para o próximo perfil; deslizar para baixo fecha; segurar o dedo pausa. Começa sempre no primeiro story que a pessoa ainda não viu. No computador: setas, espaço pausa e Esc fecha.
- Toque duplo no meio da tela curte o story (coração grande). Ao tocar em "Responder", aparecem reações rápidas (🔥😍😈💦👏😮) que vão direto para o chat; o story pausa enquanto a pessoa digita.
- Quem não assina vê uma amostra com os 3 stories mais curtidos do momento (só fotos; vídeo de story é Premium) e depois é convidado a assinar.
- Avisos: quando alguém que a pessoa curtiu ou fixou posta um story, ela recebe uma notificação no celular (no máximo 2 desse tipo por dia). Quem posta recebe aviso quando o story chega a 25, 50, 100, 200 e 500 visualizações.
- Filtros para ver todos, só os fixados ou só de perfis curtidos.
- Dá para postar story só para Favoritos (estrela verde), escolhendo quem são os favoritos na hora.
- Dá para fixar um perfil como fã, para os stories dele aparecerem primeiro. O dono vê quem visualizou e quem fixou o perfil dele (Premium).

Perfil, fotos e postagens
- Fotos: abrir a foto no perfil e tocar em "Excluir" (no celular, ícone de lixeira).
- Fotos privadas: outras pessoas pedem acesso; o dono aprova, nega ou revoga depois.
- Postagens: no perfil, aba Postagens, menu "⋯" para editar o texto ou remover.
- Quem visitou o perfil fica em Perfil > Visitantes (Premium).
- Quem curtiu as fotos e publicações: Perfil > botão "Ver quem curtiu suas fotos" (Premium). Mostra todas as curtidas numa lista só, com a foto curtida e, no topo, quem mais curtiu.
- Selo de verificado aparece em perfis verificados.

Chat, grupos e eventos
- Conversas privadas no Chat (Premium para iniciar e enviar). Mensagens podem ser apagadas.
- Grupos: lista em Grupos; mandar mensagem exige Premium.
- Eventos: lista de eventos por perto; criar e confirmar presença exigem Premium. Quem cria escolhe QUEM pode participar (casais, mulheres, homens, trans e travestis, crossdressers, ou todos) e o LIMITE de participantes. Quem não está entre os perfis escolhidos nem vê o evento. Quando lota, aparece "Evento lotado" e ninguém mais confirma. Confirmou presença, entra no grupo do evento. Eventos que já passaram vão para a aba Encerrados (o grupo fica só leitura por alguns dias e depois some).
- Mensagem que não vai: se o app diz "Mensagem não enviada" com um motivo (ex.: "Este perfil só recebe mensagens de quem deu match", "só de amigos", "só de mulheres e casais", "não está recebendo mensagens"), não é defeito: é escolha de quem recebe, em Configurações › Privacidade dela. Oriente a curtir o perfil (se a curtida voltar, libera) ou procurar outros perfis.

Segurança
- Bloquear: no perfil da pessoa. Quem é bloqueado não consegue mais contato.
- Denunciar: perfis, postagens, fotos e mensagens têm opção de denúncia; a moderação analisa.

Conta
- Configurações: dados do perfil, senha, notificações (inclusive ligar avisos pelo Telegram).
- Desativar perfil (Configurações, fim da página): deixa o perfil oculto, guarda fotos e conversas; para voltar, basta entrar de novo. A assinatura no cartão continua; quem não quer mais ser cobrado precisa cancelar na tela de assinatura.
- Excluir conta: no Perfil tem o botão "Excluir minha conta" (também em Configurações > Segurança > Zona de Perigo). Apaga de vez o perfil, fotos e vídeos, posts, stories, mensagens enviadas, comentários, curtidas e localização (ficam só registros de pagamento exigidos por lei), não tem volta e cancela a assinatura. Antes, a pessoa pode baixar uma cópia em Configurações > Segurança > "Baixar meus dados".
- Verificação em duas etapas (opcional): em Configurações › Segurança. Ligada, entrar com senha num aparelho novo pede também um código de 6 números enviado ao e-mail (vale 10 minutos; "Reenviar código" na própria tela). Marcando "Confiar neste aparelho", o código não é pedido de novo nele. Os aparelhos de confiança aparecem na mesma tela e podem ser esquecidos. Quem entra pelo Google não usa esse código. Código não chegou: conferir spam e tocar em "Reenviar código".
- Esqueceu a senha: na tela de login, "Esqueceu a senha?", recebe um código por e-mail que vale 15 minutos.
- Baixar meus dados: Configurações › Segurança › "Seus dados" › "Baixar meus dados" gera um arquivo com perfil, fotos (com links), posts, stories, contos, comentários, curtidas, mensagens enviadas, compras e comissões. Dá para baixar 1 vez por minuto.
- Privacidade (LGPD): a Política de Privacidade completa fica no link do rodapé e no cadastro. O NoSigilo não vende dados; e-mail, senha e localização exata nunca aparecem para ninguém. A selfie de verificação é privada (só a equipe vê) e é apagada logo depois da análise. Para assuntos de privacidade, a pessoa fala com a equipe por este chat de Suporte.
- Distância e localização: a distância é aproximada (o GPS é guardado com precisão de mais ou menos 1 km, para proteger quem mora perto). Aparece em km inteiros; bem perto aparece "menos de 2 km". "Em Fortaleza" (ou outra cidade) quer dizer que a pessoa é da mesma cidade mas não ativou a localização do aparelho, então não dá para calcular a distância exata.
- Conta oficial "NoSigilo" no Chat: é a equipe mandando boas-vindas e dicas (perfil, match, stories, radar, eventos, segurança). Ninguém lê as respostas nessa conversa; para falar com a equipe é aqui no Suporte. Responder PARAR naquela conversa encerra as dicas.
- Nome no cadastro: se o apelido já estiver em uso, o cadastro sugere variações livres para escolher com um toque. Em qualquer tela, tocar no nome de alguém abre o perfil da pessoa.
- Trocar o nome do perfil: Configurações › Perfil › "Mudar nome". Vale na hora, sem aprovação; só não aceita nome que outra pessoa já usa ou nome proibido.
- Trocar o tipo de perfil (Mulher, Homem, Casal, Trans...): Configurações › Perfil › "Pedir mudança de tipo de perfil". Escolhe o novo tipo e escreve o motivo; a equipe analisa e a resposta chega nas notificações. Você (IA) não aprova nem promete aprovação.
- Trocar o e-mail da conta: Configurações › Segurança › "Trocar e-mail". Digita o e-mail novo e a senha atual, recebe um código de 6 números NO E-MAIL NOVO e confirma. Quem entra pelo Google não tem senha: precisa falar com a equipe.

Proteção do conteúdo e publicações
- Fotos e vídeos publicados levam marca d'água discreta com o @ do perfil e a data; o player não oferece botão de baixar.
- Publicar vários arquivos: até 10 fotos/vídeos por publicação, escolhendo vários de uma vez.
- Vídeo: depois de enviar, ele é preparado em segundo plano; a pessoa pode continuar usando o app e recebe aviso quando o post estiver no ar.
- Apagar: a publicação inteira pode ser excluída (menu do post). Não dá para tirar só uma foto de dentro de uma publicação já feita.
- Feed: filtros por distância (Minha região, 10 km, 25 km...). Filtrar o feed por tipo de perfil ainda não existe.
- Mensagens: em Configurações › Privacidade dá para escolher quem pode mandar mensagem (todos, só curtidas mútuas, só amigos ou ninguém).
- Pedidos de contato: mensagem de quem a pessoa ainda não conhece cai na aba "Pedidos de contato" do Chat, e não em Conversas, até ela aceitar (ou responder). Vem ligado para mulheres e casais; qualquer um liga/desliga em Configurações › Privacidade e escolhe quais tipos de perfil vão direto. Quem foi curtido ou é amigo vai sempre direto. Excluir um pedido não avisa quem mandou. Quem mandou pode destacar o pedido por 20 tokens (vai para o topo da lista de pedidos). Enquanto o pedido não é aceito, quem mandou não vê se a pessoa está online.

Programa de promotores (menu Ganhe dinheiro)
- O promotor divulga o link de convite e ganha 20% de cada pagamento dos assinantes que entraram pelo link, no primeiro pagamento e em cada renovação mensal. Só existe comissão quando o assinante paga de fato.
- Situação da comissão: em análise → aprovada → paga.
- O Pix sai quando o saldo aprovado chega a R$ 10,00 (PROMOTER_MIN_PAYOUT_CENTS). Abaixo disso, acumula entre os meses, nada se perde.
- A chave Pix é cadastrada na área do promotor e precisa estar correta para receber. Para TROCAR: menu "Ganhe dinheiro" (painel do promotor), ao lado de "Pix cadastrado" toque em "Trocar", digite a nova chave e a senha da conta. Quem entra pelo Google (sem senha) precisa pedir a troca à equipe.`;
