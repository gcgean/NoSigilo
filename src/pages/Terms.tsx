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
          <p className="text-muted-foreground">Última atualização: Janeiro de 2025</p>

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

          <h2>3. Conta do Usuário</h2>
          <p>
            Você é responsável por manter a confidencialidade de sua conta e senha.
            Você concorda em aceitar responsabilidade por todas as atividades que ocorram em sua conta.
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
          </ul>

          <h2>5. Privacidade</h2>
          <p>
            Sua privacidade é importante para nós. Consulte nossa Política de Privacidade
            para informações sobre como coletamos e usamos seus dados.
          </p>

          <h2>6. Modificações</h2>
          <p>
            Reservamos o direito de modificar estes termos a qualquer momento.
            Notificaremos os usuários sobre alterações significativas.
          </p>
        </div>
      </div>
    </div>
  );
}
