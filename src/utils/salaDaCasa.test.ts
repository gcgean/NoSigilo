import { describe, expect, it, vi } from 'vitest';
import { contaComoNovaNaCabine, enviarComNovaTentativa } from './salaDaCasa';

const recusa = (status: number, error?: string) => Object.assign(new Error('recusa'), { response: { status, data: { error } } });

describe('envio de mensagem na sala', () => {
  it('toque duplo: espera o limite do servidor e tenta de novo', async () => {
    const postar = vi.fn().mockRejectedValueOnce(recusa(429, 'devagar')).mockResolvedValueOnce('ok');
    const reentrar = vi.fn();
    const esperar = vi.fn().mockResolvedValue(undefined);
    await expect(enviarComNovaTentativa(postar, reentrar, esperar)).resolves.toBe('ok');
    expect(esperar).toHaveBeenCalledWith(1300);
    expect(reentrar).not.toHaveBeenCalled();
    expect(postar).toHaveBeenCalledTimes(2);
  });

  it('sala expirada: entra de novo e reenvia', async () => {
    const postar = vi.fn().mockRejectedValueOnce(recusa(404, 'fora_da_sala')).mockResolvedValueOnce('ok');
    const reentrar = vi.fn().mockResolvedValue(undefined);
    await expect(enviarComNovaTentativa(postar, reentrar)).resolves.toBe('ok');
    expect(reentrar).toHaveBeenCalledTimes(1);
  });

  it('recusa de verdade (moderação, sem assinatura) chega para a tela e não repete', async () => {
    for (const erro of [recusa(400, 'moderacao'), recusa(403, 'premium_required'), recusa(404, 'not_found'), new Error('sem rede')]) {
      const postar = vi.fn().mockRejectedValue(erro);
      await expect(enviarComNovaTentativa(postar, vi.fn())).rejects.toBe(erro);
      expect(postar).toHaveBeenCalledTimes(1);
    }
  });
});

describe('bolinha do ícone das cabines', () => {
  it('conta mensagem, mídia e ação de outra pessoa', () => {
    for (const tipo of ['pessoa', 'midia', 'acao']) expect(contaComoNovaNaCabine({ tipo, autor: { id: 'outro' } }, 'eu')).toBe(true);
  });
  it('não conta a minha, nem sistema, nem Lola', () => {
    expect(contaComoNovaNaCabine({ tipo: 'pessoa', autor: { id: 'eu' } }, 'eu')).toBe(false);
    expect(contaComoNovaNaCabine({ tipo: 'sistema' }, 'eu')).toBe(false);
    expect(contaComoNovaNaCabine({ tipo: 'lola' }, 'eu')).toBe(false);
  });
});
