import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { dominioDoLink, primeiroLink, separarLinksDoTexto } from './linksNoTexto';
import { textoComAtalhos } from './textoDoChat';

const links = (t: string) => separarLinksDoTexto(t).filter((p) => p.href);

describe('links no texto', () => {
  it('acha endereço com e sem https, e tira a pontuação do fim', () => {
    const r = links('Instagram https://www.instagram.com/casa_ldoceara?igsh=YmFr. Me chama em linktr.ee/casal ou www.site.com.br!');
    expect(r.map((p) => p.texto)).toEqual(['https://www.instagram.com/casa_ldoceara?igsh=YmFr', 'linktr.ee/casal', 'www.site.com.br']);
    expect(r[1].href).toBe('https://linktr.ee/casal');
    expect(r.every((p) => !p.interno)).toBe(true);
  });

  it('e-mail, @menção, javascript: e texto comum não viram link', () => {
    expect(links('fale com contato@site.com, @casal.ce ou javascript:alert(1). Oi, tudo bem?')).toEqual([]);
  });

  it('só o domínio do NoSigilo é interno; imitação não é', () => {
    expect(links('nosigilo.net/casa')[0].interno).toBe(true);
    expect(links('https://nosigilo.net.golpe.com/x')[0].interno).toBe(false);
    expect(dominioDoLink('https://www.instagram.com/x')).toBe('instagram.com');
    expect(primeiroLink('sem link aqui')).toBeNull();
  });

  it('no chat, link de fora só clica em conversa aceita e passa pelo aviso de saída', () => {
    const abrir = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { unmount } = render(<p>{textoComAtalhos('meu insta instagram.com/casal', vi.fn())}</p>);
    expect(screen.queryByRole('link')).toBeNull();
    unmount();

    render(<p>{textoComAtalhos('meu insta instagram.com/casal', vi.fn(), { externos: true })}</p>);
    fireEvent.click(screen.getByRole('link', { name: 'instagram.com/casal' }));
    expect(abrir).not.toHaveBeenCalled();
    expect(screen.getByText('Você vai sair do NoSigilo')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Abrir link/ }));
    expect(abrir).toHaveBeenCalledWith('https://instagram.com/casal', '_blank', 'noopener,noreferrer');
    abrir.mockRestore();
  });
});
