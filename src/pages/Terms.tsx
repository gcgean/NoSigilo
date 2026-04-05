import { Link } from 'react-router-dom';
import { Sparkles, ArrowLeft } from 'lucide-react';

export default function Terms() {
  return (
    <div className="min-h-screen bg-background py-12">
      <div className="container max-w-3xl mx-auto px-4">
        <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
            <Sparkles className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold">Termos de Uso</h1>
        </div>

        <div className="prose prose-invert max-w-none glass rounded-2xl p-8">
          <p className="text-muted-foreground">Última atualização: Abril de 2026</p>

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

          <h2>8. Modificações</h2>
          <p>
            Reservamos o direito de modificar estes termos a qualquer momento.
            Notificaremos os usuários sobre alterações significativas.
          </p>
        </div>
      </div>
    </div>
  );
}
