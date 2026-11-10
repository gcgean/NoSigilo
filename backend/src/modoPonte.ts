// Modo "ponte" do deploy sem queda (10/11/2026).
//
// No deploy, um contêiner temporário com o código novo sobe na porta 3336 e o
// nginx manda as requisições para ele enquanto o backend principal reinicia
// (antes eram ~30 s de 502 a cada deploy). Esse contêiner só atende
// requisições: nenhuma tarefa de fundo pode rodar nele, senão push, e-mails,
// relógio d'A Casa etc. sairiam em dobro com o principal.
//
// Este módulo precisa ser o PRIMEIRO import do index.ts: alguns setInterval
// são criados quando app.ts/casa.ts carregam.
export const MODO_PONTE = process.env.MODO_PONTE === '1';

if (MODO_PONTE) {
  const original = globalThis.setInterval;
  // Devolve um timer de verdade (clearInterval continua funcionando), mas que
  // nunca dispara a tarefa. unref: não segura o processo vivo.
  (globalThis as any).setInterval = (..._args: unknown[]) => {
    const t = original(() => {}, 24 * 60 * 60 * 1000);
    (t as any).unref?.();
    return t;
  };
  console.log('[ponte] modo ponte: tarefas de fundo desligadas, só atende requisições');
}
