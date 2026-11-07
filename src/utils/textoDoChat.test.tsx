import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { textoComAtalhos } from './textoDoChat';

const convite = '💋 Lola, da Casa: 🔥 O Salão Principal está pegando fogo agora! Vem pra Casa: https://nosigilo.net/casa?sala=salao Não quer esses convites? Responda PARAR.';

describe('texto das mensagens do chat', () => {
  it('o convite da Lola abre a Casa dentro do app, na sala certa', () => {
    const navigate = vi.fn();
    render(<p>{textoComAtalhos(convite, navigate)}</p>);
    fireEvent.click(screen.getByRole('link', { name: 'https://nosigilo.net/casa?sala=salao' }));
    expect(navigate).toHaveBeenCalledWith('/casa?sala=salao');
  });

  it('endereço de outro site continua sendo só texto', () => {
    render(<p>{textoComAtalhos('olha https://golpe.com/nosigilo.net e https://nosigilo.net.golpe.com/x', vi.fn())}</p>);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('texto comum não muda e os atalhos continuam como botão', () => {
    expect(textoComAtalhos('oi, tudo bem?', vi.fn())).toBe('oi, tudo bem?');
    const navigate = vi.fn();
    render(<p>{textoComAtalhos('Veja [[Seus tokens|/tokens]] e nosigilo.net/instalar', navigate)}</p>);
    fireEvent.click(screen.getByRole('button', { name: 'Seus tokens' }));
    expect(navigate).toHaveBeenCalledWith('/tokens');
    fireEvent.click(screen.getByRole('link', { name: 'nosigilo.net/instalar' }));
    expect(navigate).toHaveBeenCalledWith('/instalar');
  });
});
