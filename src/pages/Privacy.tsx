import { Link } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';

// Versão gravada junto com o aceite de cada pessoa (users.termos_versao).
// Mudou o texto de forma relevante? Atualize a data aqui.
export const VERSAO_POLITICA = '2026-10-12';

// Quem responde pelos dados e como falar com o encarregado (LGPD, art. 41).
// Preencha a razão social/CNPJ e um e-mail que receba mensagens quando houver.
const CONTROLADOR = 'NoSigilo';
const CONTATO_PRIVACIDADE = 'pelo chat de Suporte do app (botão de ajuda, em qualquer tela)';

// Corpo do documento isolado da página — ver TermsBody.
export function PrivacyBody() {
  return (
    <div
      className={
        // O plugin de tipografia (prose) não está instalado: títulos e listas
        // ficavam como texto corrido. Estilo do documento definido aqui.
        'glass max-w-none rounded-2xl p-4 text-sm leading-relaxed text-muted-foreground sm:p-8 sm:text-base ' +
        '[&_h2]:mb-2 [&_h2]:mt-7 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground sm:[&_h2]:text-lg ' +
        '[&>p]:my-2 [&>ul]:my-2 [&>ul]:list-disc [&>ul]:space-y-1.5 [&>ul]:pl-5 [&_strong]:text-foreground'
      }
    >
      <p className="text-muted-foreground">Última atualização: 12 de outubro de 2026</p>

      <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm leading-relaxed">
        <p className="mb-2 font-semibold text-foreground">Resumo rápido</p>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li><strong className="text-foreground">Não vendemos seus dados</strong> e não usamos rastreadores de publicidade.</li>
          <li>Seu e-mail, sua senha e sua localização exata <strong className="text-foreground">nunca aparecem</strong> para outras pessoas.</li>
          <li>Suas fotos privadas só abrem para quem <strong className="text-foreground">você</strong> liberar.</li>
          <li>Você pode <strong className="text-foreground">baixar uma cópia</strong> dos seus dados ou <strong className="text-foreground">apagar sua conta</strong> a qualquer momento, em Configurações.</li>
        </ul>
      </div>

      <h2>1. Quem cuida dos seus dados</h2>
      <p>
        O {CONTROLADOR} é o responsável (controlador) pelos dados pessoais tratados na plataforma. Para qualquer assunto
        sobre privacidade, inclusive para falar com o nosso encarregado de proteção de dados, entre em contato{' '}
        {CONTATO_PRIVACIDADE}.
      </p>

      <h2>2. Quais dados usamos</h2>
      <ul>
        <li><strong>Cadastro:</strong> apelido, e-mail, senha (guardada criptografada), data de nascimento, tipo de perfil e cidade.</li>
        <li><strong>Perfil:</strong> fotos, vídeos, bio e as características que você escolher mostrar, como estado civil, orientação, aparência, interesses e preferências. No perfil de casal, também os dados do(a) parceiro(a) que vocês informarem.</li>
        <li><strong>Localização:</strong> sua cidade e, se você permitir, a localização do aparelho, usada para calcular distâncias. Outras pessoas veem só a cidade e a distância aproximada, nunca o ponto exato.</li>
        <li><strong>O que você publica e conversa:</strong> posts, stories, contos, comentários, curtidas e mensagens.</li>
        <li><strong>Uso da plataforma:</strong> páginas visitadas, tipo de aparelho e navegador, e registros técnicos de acesso (como endereço IP, data e hora), usados para segurança e estatísticas. Nas nossas estatísticas, o IP é guardado de forma embaralhada (hash), sem identificar você.</li>
        <li><strong>Pagamentos:</strong> quando você assina ou compra, o CPF/CNPJ e os dados que o meio de pagamento exigir. Não guardamos número de cartão.</li>
        <li><strong>Verificação de perfil (opcional):</strong> a selfie com o código que você envia para ganhar o selo de verificado.</li>
        <li><strong>Programa de promotores (opcional):</strong> nome completo, chave Pix e contato, para pagar suas comissões.</li>
      </ul>

      <h2>3. Dados sensíveis</h2>
      <p>
        Por ser uma rede de relacionamentos adultos, algumas informações do seu perfil, como orientação sexual,
        preferências e interesses, são consideradas <strong>dados sensíveis</strong> pela LGPD. Usamos esses dados
        somente com o seu consentimento, dado no cadastro, e somente para o que você espera: montar seu perfil e
        mostrar pessoas compatíveis com você. Você escolhe o que preencher, pode mudar ou apagar essas informações
        quando quiser em Editar perfil e pode retirar o consentimento excluindo a conta.
      </p>

      <h2>4. Para que usamos</h2>
      <ul>
        <li>Criar e manter sua conta e seu perfil, e fazer a plataforma funcionar (base: execução do contrato com você).</li>
        <li>Mostrar pessoas compatíveis e próximas, no feed, na busca e no match (base: seu consentimento, para os dados sensíveis).</li>
        <li>Enviar avisos sobre sua conta, mensagens e assinatura, por e-mail, notificação no aparelho ou Telegram, se você ativar (base: execução do contrato).</li>
        <li>Processar pagamentos e cumprir obrigações fiscais (base: execução do contrato e obrigação legal).</li>
        <li>Proteger você e a comunidade: prevenir golpes, perfis falsos, abuso e conteúdo proibido, e analisar denúncias (base: legítimo interesse e proteção da vida e da segurança).</li>
        <li>Entender como a plataforma é usada para melhorá-la, com estatísticas próprias (base: legítimo interesse).</li>
      </ul>

      <h2>5. Com quem compartilhamos</h2>
      <p>
        <strong>Não vendemos nem alugamos seus dados.</strong> Compartilhamos apenas o necessário com empresas que nos
        ajudam a operar o serviço, e que só podem usar os dados para isso:
      </p>
      <ul>
        <li><strong>Hospedagem e segurança:</strong> Contabo (servidores) e Cloudflare (proteção e velocidade do site).</li>
        <li><strong>E-mails:</strong> Resend, para enviar e-mails como confirmação e recuperação de senha.</li>
        <li><strong>Pagamentos:</strong> nossa central de pagamentos e os intermediadores (como Asaas, LivePix e Mercado Pago).</li>
        <li><strong>Inteligência artificial:</strong> DeepSeek, que ajuda a responder dúvidas no chat de Suporte e a organizar as denúncias para a equipe analisar. Enviamos só o necessário para cada caso. A IA não aplica punições: banir, advertir ou remover conteúdo é sempre decisão de uma pessoa da nossa equipe.</li>
        <li><strong>Mapa:</strong> OpenStreetMap, para descobrir sua cidade a partir da localização, no cadastro.</li>
        <li><strong>Avisos opcionais:</strong> Google (se você entrar com Google), Telegram (se você conectar) e os serviços de notificação do seu navegador ou celular.</li>
        <li><strong>Autoridades:</strong> quando a lei ou uma ordem judicial exigir, ou para proteger alguém em risco.</li>
      </ul>
      <p>
        Parte desses serviços fica fora do Brasil (Estados Unidos e China). Nesses casos, a transferência é feita para
        prestar o serviço que você contratou, com fornecedores que adotam medidas de segurança, como permite a LGPD.
      </p>

      <h2>6. O que outras pessoas veem</h2>
      <p>
        Outros membros veem o que você coloca no perfil público: apelido, fotos públicas, bio, cidade, distância
        aproximada e as características que você preencher. Fotos privadas só aparecem para quem você liberar. E-mail,
        senha, telefone, documentos e localização exata nunca aparecem.
      </p>

      <h2>7. Por quanto tempo guardamos</h2>
      <ul>
        <li><strong>Conta e conteúdo:</strong> enquanto sua conta existir. Ao excluir a conta, apagamos de vez perfil, fotos, vídeos, posts, stories, mensagens enviadas, comentários, curtidas e localização.</li>
        <li><strong>Selfie de verificação:</strong> apagada logo depois da análise, aprovada ou não.</li>
        <li><strong>Stories:</strong> ficam visíveis por 24 horas.</li>
        <li><strong>Estatísticas de visitas:</strong> o detalhe é apagado em 90 dias; depois ficam só números totais.</li>
        <li><strong>Pagamentos e comissões:</strong> pelo prazo exigido pela legislação fiscal, mesmo após a exclusão da conta.</li>
        <li><strong>Registros de acesso e denúncias:</strong> pelo prazo previsto em lei (Marco Civil da Internet) e enquanto forem necessários para a segurança da comunidade ou para defesa em processos.</li>
      </ul>

      <h2>8. Como protegemos</h2>
      <ul>
        <li>Conexão sempre criptografada (HTTPS).</li>
        <li>Senhas guardadas com criptografia própria para senhas; nem a equipe consegue lê-las.</li>
        <li>Fotos privadas abertas só por links temporários.</li>
        <li>Verificação em duas etapas por e-mail, para quem ativar.</li>
        <li>Acesso da equipe restrito ao necessário.</li>
      </ul>
      <p>
        Nenhum sistema é 100% imune a falhas. Se acontecer um incidente que possa trazer risco a você, avisaremos você
        e a Autoridade Nacional de Proteção de Dados (ANPD), como manda a lei. E vale sempre a dica: compartilhe
        conteúdo íntimo só com quem você confia.
      </p>

      <h2>9. Seus direitos</h2>
      <p>Pela LGPD, você pode, a qualquer momento:</p>
      <ul>
        <li>Saber quais dados temos e <strong>baixar uma cópia</strong> deles: Configurações › Seus dados › Baixar meus dados.</li>
        <li><strong>Corrigir</strong> seus dados: em Editar perfil.</li>
        <li><strong>Apagar</strong> sua conta e seus dados: Configurações › Zona de Perigo › Excluir conta.</li>
        <li>Retirar o consentimento, pedir informações sobre com quem compartilhamos e se opor a algum uso.</li>
        <li>Reclamar à ANPD (gov.br/anpd), se achar que seus direitos não foram respeitados.</li>
      </ul>
      <p>Para o que não estiver nas Configurações, fale com a gente {CONTATO_PRIVACIDADE}.</p>

      <h2>10. Cookies e armazenamento</h2>
      <p>
        Não usamos cookies de publicidade nem rastreadores de outras empresas. Usamos o armazenamento do seu navegador
        para manter você conectado e lembrar suas preferências, e estatísticas próprias de visitas para melhorar o site.
      </p>

      <h2>11. Menores de idade</h2>
      <p>
        O NoSigilo é só para maiores de 18 anos. Se identificarmos uma conta de menor, ela é removida.
      </p>

      <h2>12. Mudanças nesta política</h2>
      <p>
        Se mudarmos algo importante, avisaremos pelo app antes de a mudança valer. A data no topo mostra a versão atual.
      </p>
    </div>
  );
}

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background py-12">
      <div className="container max-w-3xl mx-auto px-4">
        <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
            <Shield className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold">Política de Privacidade</h1>
        </div>

        <PrivacyBody />
      </div>
    </div>
  );
}
