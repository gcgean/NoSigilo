import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';


// Corpo do documento isolado da página, para poder ser exibido também dentro
// do cadastro (bottom sheet) sem tirar o usuário do fluxo.
export function TermsBody() {
  return (
    <div className="prose prose-invert max-w-none glass rounded-2xl p-8">
      <p className="text-muted-foreground">Última atualização: 18 de outubro de 2026</p>

      <h2>1. Aceitação dos Termos</h2>
      <p>
        Ao acessar e usar o NoSigilo, você concorda em cumprir estes Termos de Uso.
        Se você não concordar com qualquer parte destes termos, não poderá acessar o serviço.
      </p>

      <h2>2. Requisitos de Idade</h2>
      <p>
        Você deve ter pelo menos 18 anos de idade para usar este serviço.
        Ao criar uma conta, você confirma que tem 18 anos ou mais.
      </p>
      <p>
        O NoSigilo é uma plataforma adulta voltada principalmente para casais e singles femininos e masculinos.
        É proibido usar o serviço em nome de menores, intermediar conteúdo envolvendo menores ou simular idade falsa.
      </p>

      <h2>3. Conta do Usuário</h2>
      <p>
        Você é responsável por manter a confidencialidade de sua conta e senha.
        Você concorda em aceitar responsabilidade por todas as atividades que ocorram em sua conta.
      </p>
      <p>
        Você deve fornecer informações verdadeiras, manter seu perfil atualizado e responder por todo conteúdo, mídia e interação realizada a partir da sua conta.
      </p>

      <h2>4. Conteúdo do Usuário</h2>
      <p>
        Você é responsável pelo conteúdo que publica. Não é permitido:
      </p>
      <ul>
        <li>Publicar conteúdo ilegal ou que viole direitos de terceiros</li>
        <li>Assediar, ameaçar ou intimidar outros usuários</li>
        <li>Criar perfis falsos ou enganosos</li>
        <li>Compartilhar conteúdo de menores de idade</li>
        <li>Divulgar imagens, vídeos, prints ou dados privados de terceiros sem autorização expressa</li>
        <li>Utilizar a plataforma para fraude, golpe, extorsão, chantagem ou exploração sexual</li>
      </ul>

      <h2>5. Consentimento e Conduta</h2>
      <p>
        Toda interação deve ser consensual. Recusas, limites pessoais, bloqueios e silencios devem ser respeitados imediatamente.
        O uso da plataforma pressupõe abordagem respeitosa, sem pressão, coação ou perseguição.
      </p>

      <h2>6. Privacidade</h2>
      <p>
        Sua privacidade é importante para nós. Consulte nossa Política de Privacidade
        para informações sobre como coletamos e usamos seus dados.
      </p>
      <p>
        Recursos como fotos privadas, permissões de acesso e controles de visibilidade existem para reforçar a discrição,
        mas o usuário continua sendo responsável por agir com cautela ao compartilhar conteúdo e dados pessoais.
      </p>

      <h2>7. Moderação e Medidas</h2>
      <p>
        Podemos remover conteúdo, limitar funcionalidades, suspender ou encerrar contas que violem estes Termos,
        as Diretrizes da Comunidade ou a legislação aplicável. Em casos graves, poderemos preservar registros para cooperação com autoridades.
      </p>

      <h2>8. A Casa (boate virtual)</h2>
      <p>
        A Casa é um espaço ao vivo do NoSigilo, aberto em dias e horários definidos, com salas, cabines, brincadeiras conduzidas pela
        Lola (assistente de inteligência artificial) e envio de fotos e vídeos. Além do restante destes Termos, valem estas regras:
      </p>
      <ul>
        <li>Somente maiores de 18 anos. Qualquer menção, insinuação ou conteúdo envolvendo menor de idade leva à remoção imediata e ao banimento da conta, com preservação dos registros para as autoridades.</li>
        <li>Consentimento sempre: participar de brincadeiras e desafios é opcional, "passo" e "não" devem ser respeitados, e cabines e convites só acontecem com o aceite de todos os envolvidos.</li>
        <li>Você só pode enviar fotos e vídeos de si mesmo(a) e de quem está com você e consentiu, de forma livre e atual, em aparecer. É proibido enviar mídia de terceiros sem autorização, de pessoas dormindo, embriagadas a ponto de não consentir ou que não saibam que estão sendo gravadas.</li>
        <li>Fotos e vídeos da Casa são de visualização única, mas isso não impede capturas de tela ou gravações por terceiros. Envie apenas o que se sentir à vontade, de preferência sem mostrar o rosto. Gravar, salvar ou divulgar fora da Casa o conteúdo de outras pessoas é proibido e pode configurar crime.</li>
        <li>É proibido tirar print, gravar a tela ou registrar de qualquer forma as conversas, os perfis, as fotos e os vídeos da Casa. A tela da Casa mostra uma marca d'água com a identificação de quem está vendo; quem vazar conteúdo da Casa tem a conta banida, sem direito a reembolso, e responde pelos danos causados.</li>
        <li>No Glory Hole, os participantes aparecem de forma anônima para os demais, mas a equipe do NoSigilo identifica todos os autores para fins de segurança e cumprimento da lei.</li>
        <li>Não é permitido pedir ou oferecer dinheiro, Pix ou programa, nem passar contato externo (telefone, WhatsApp, redes) nas salas.</li>
        <li>Tokens usados na Casa (drinks, revelações e desafios sugeridos) passam de um usuário para outro conforme as regras exibidas na tela; tokens de desafios não cumpridos voltam para quem ofereceu.</li>
        <li>A Lola modera as conversas de forma automática e pode remover mensagens e retirar participantes da noite. A equipe acompanha os alertas, as denúncias e o histórico da Casa, que guarda mensagens e mídias por até 90 dias para segurança e é apagado junto com a conta, quando excluída.</li>
      </ul>

      <h2>9. Modificações</h2>
      <p>
        Reservamos o direito de modificar estes termos a qualquer momento.
        Notificaremos os usuários sobre alterações significativas.
      </p>
    </div>
  );
}

export default function Terms() {
  return (
    <div className="min-h-screen bg-background py-12">
      <div className="container max-w-3xl mx-auto px-4">
        <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <BrandLogo size="md" showText={false} />
          <h1 className="text-3xl font-bold">Termos de Uso</h1>
        </div>

        <TermsBody />
      </div>
    </div>
  );
}
