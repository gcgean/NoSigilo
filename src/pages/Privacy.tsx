import { Link } from 'react-router-dom';
import { Sparkles, ArrowLeft, Shield } from 'lucide-react';

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

        <div className="prose prose-invert max-w-none glass rounded-2xl p-8">
          <p className="text-muted-foreground">Última atualização: Janeiro de 2025</p>

          <h2>1. Informações que Coletamos</h2>
          <p>Coletamos informações que você nos fornece diretamente, incluindo:</p>
          <ul>
            <li>Informações de registro (nome, email, data de nascimento)</li>
            <li>Informações de perfil (fotos, biografia, preferências)</li>
            <li>Comunicações e interações com outros usuários</li>
            <li>Informações de localização (quando autorizado)</li>
          </ul>

          <h2>2. Como Usamos suas Informações</h2>
          <p>Utilizamos suas informações para:</p>
          <ul>
            <li>Fornecer, manter e melhorar nossos serviços</li>
            <li>Conectá-lo com outros usuários compatíveis</li>
            <li>Enviar notificações e atualizações importantes</li>
            <li>Garantir a segurança da plataforma</li>
          </ul>

          <h2>3. Compartilhamento de Informações</h2>
          <p>
            Não vendemos suas informações pessoais. Compartilhamos dados apenas:
          </p>
          <ul>
            <li>Com seu consentimento explícito</li>
            <li>Para cumprimento de obrigações legais</li>
            <li>Com prestadores de serviços que nos auxiliam</li>
          </ul>

          <h2>4. Segurança</h2>
          <p>
            Implementamos medidas de segurança técnicas e organizacionais para
            proteger suas informações contra acesso não autorizado.
          </p>

          <h2>5. Seus Direitos</h2>
          <p>Você tem direito a:</p>
          <ul>
            <li>Acessar e corrigir seus dados pessoais</li>
            <li>Solicitar a exclusão de sua conta</li>
            <li>Exportar seus dados</li>
            <li>Retirar seu consentimento a qualquer momento</li>
          </ul>

          <h2>6. Contato</h2>
          <p>
            Para dúvidas sobre esta política, entre em contato através do nosso
            suporte ou envie um email para privacidade@nosigilo.com.br
          </p>
        </div>
      </div>
    </div>
  );
}
