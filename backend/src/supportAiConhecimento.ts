// ─── O que o suporte sabe sobre o NoSigilo ──────────────────────────────────
//
// Levantado lendo o código (rotas, regras e telas) em 17/09/2026. Não é gerado
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
- Mulher: 30 dias de Premium grátis. Casal: 15 dias. Outros perfis (trans, CD etc.): 7 dias.
- Homem: não tem período grátis; vê uma amostra do app e precisa assinar para usar os recursos Premium.

Premium
- Assinatura mensal de R$ 9,90 por mês (não é cobrança por mensagem).
- Pagamento: cartão (renova automaticamente todo mês e pode ser cancelado quando quiser na tela de assinatura), PIX ou boleto. PIX e cartão não pedem CPF; boleto pede.
- PIX costuma confirmar em poucos minutos.
- Precisa de Premium (ou período grátis/dias ganhos ativos): iniciar conversas e mandar mensagens no chat, reagir e abrir mídias de mensagens, curtir e passar perfis no Match, ver quem visitou o perfil, ver quem viu seus stories e quem fixou você, usar o Radar, criar eventos e confirmar presença, mandar mensagens em grupos.
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
- Filtros para ver todos, só os fixados ou só de perfis curtidos.
- Dá para postar story só para Favoritos (estrela verde), escolhendo quem são os favoritos na hora.
- Dá para fixar um perfil como fã, para os stories dele aparecerem primeiro. O dono vê quem visualizou e quem fixou o perfil dele (Premium).

Perfil, fotos e postagens
- Fotos: abrir a foto no perfil e tocar em "Excluir" (no celular, ícone de lixeira).
- Fotos privadas: outras pessoas pedem acesso; o dono aprova, nega ou revoga depois.
- Postagens: no perfil, aba Postagens, menu "⋯" para editar o texto ou remover.
- Quem visitou o perfil fica em Perfil > Visitantes (Premium).
- Selo de verificado aparece em perfis verificados.

Chat, grupos e eventos
- Conversas privadas no Chat (Premium para iniciar e enviar). Mensagens podem ser apagadas.
- Grupos: lista em Grupos; mandar mensagem exige Premium.
- Eventos: lista de eventos por perto; criar e confirmar presença exigem Premium.

Segurança
- Bloquear: no perfil da pessoa. Quem é bloqueado não consegue mais contato.
- Denunciar: perfis, postagens, fotos e mensagens têm opção de denúncia; a moderação analisa.

Conta
- Configurações: dados do perfil, senha, notificações (inclusive ligar avisos pelo Telegram).
- Desativar perfil (Configurações, fim da página): deixa o perfil oculto, guarda fotos e conversas; para voltar, basta entrar de novo. A assinatura no cartão continua; quem não quer mais ser cobrado precisa cancelar na tela de assinatura.
- Excluir conta (Configurações, fim da página): apaga nome, e-mail, foto e bio, não tem volta e cancela a assinatura.
- Esqueceu a senha: na tela de login, "Esqueceu a senha?", recebe um código por e-mail que vale 15 minutos.

Programa de promotores (menu Ganhe dinheiro)
- O promotor divulga o link de convite e ganha 20% de cada pagamento dos assinantes que entraram pelo link, no primeiro pagamento e em cada renovação mensal. Só existe comissão quando o assinante paga de fato.
- Situação da comissão: em análise → aprovada → paga.
- O Pix sai quando o saldo aprovado chega a R$ 10,00 (PROMOTER_MIN_PAYOUT_CENTS). Abaixo disso, acumula entre os meses, nada se perde.
- A chave Pix é cadastrada na área do promotor e precisa estar correta para receber.`;
