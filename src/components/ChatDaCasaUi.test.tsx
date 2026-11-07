import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArrastaParaResponder, mencionou, termoDaMencao, SugestoesDeMencao, TextoComMencoes } from './ChatDaCasaUi';

describe('@menções da Casa', () => {
  it('acha o termo depois do último @ só no começo de palavra', () => {
    expect(termoDaMencao('oi @Pab')).toEqual({ inicio: 3, termo: 'Pab' });
    expect(termoDaMencao('@')).toEqual({ inicio: 0, termo: '' });
    expect(termoDaMencao('email@site')).toBeNull();
    expect(termoDaMencao('sem marcação')).toBeNull();
  });

  it('reconhece o nome com espaço e símbolo, sem diferenciar maiúscula', () => {
    expect(mencionou('chama a gente @pablo&nina', 'Pablo&Nina')).toBe(true);
    expect(mencionou('oi @Homem Casa 2 tudo bem?', 'Homem Casa 2')).toBe(true);
    expect(mencionou('oi Pablo&Nina', 'Pablo&Nina')).toBe(false);
  });

  it('sugere quem está aqui e completa o nome ao tocar', () => {
    let texto = 'oi @pa';
    render(<SugestoesDeMencao texto={texto} onEscolher={(t) => { texto = t; }}
      pessoas={[{ id: '1', nome: 'Pablo&Nina' }, { id: '2', nome: 'realizofantasiasce' }]} />);
    expect(screen.queryByText('@realizofantasiasce')).toBeNull();
    fireEvent.click(screen.getByText('@Pablo&Nina'));
    expect(texto).toBe('oi @Pablo&Nina ');
  });

  it('some depois que o nome já foi escrito e a frase continua', () => {
    const { container } = render(<SugestoesDeMencao texto="@Pablo&Nina bora pra cabine" onEscolher={() => {}} pessoas={[{ id: '1', nome: 'Pablo&Nina' }]} />);
    expect(container.textContent).toBe('');
  });

  it('destaca o @Nome de quem está na sala', () => {
    render(<p><TextoComMencoes texto="vem @Pablo&Nina!" nomes={['Pablo&Nina', 'Ju (22)']} meuNome="Pablo&Nina" /></p>);
    expect(screen.getByText('@Pablo&Nina').tagName).toBe('SPAN');
  });
});

describe('segurar a mensagem', () => {
  const montar = (onSegurar: () => void, onAbrir: () => void) => render(
    <ArrastaParaResponder ativo onResponder={() => {}} onSegurar={onSegurar}>
      <button type="button" onClick={onAbrir}>foto</button>
    </ArrastaParaResponder>,
  );

  it('segurar abre a reação e, ao soltar, não abre a foto', () => {
    vi.useFakeTimers();
    try {
      const onSegurar = vi.fn();
      const onAbrir = vi.fn();
      montar(onSegurar, onAbrir);
      const foto = screen.getByText('foto');
      fireEvent.touchStart(foto, { touches: [{ clientX: 10, clientY: 10 }] });
      vi.advanceTimersByTime(500);
      expect(onSegurar).toHaveBeenCalledTimes(1);
      fireEvent.touchEnd(foto);
      fireEvent.click(foto);
      expect(onAbrir).not.toHaveBeenCalled();
      fireEvent.click(foto);
      expect(onAbrir).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('toque rápido e rolagem não contam como segurar', () => {
    vi.useFakeTimers();
    try {
      const onSegurar = vi.fn();
      const onAbrir = vi.fn();
      montar(onSegurar, onAbrir);
      const foto = screen.getByText('foto');
      fireEvent.touchStart(foto, { touches: [{ clientX: 10, clientY: 10 }] });
      vi.advanceTimersByTime(100);
      fireEvent.touchEnd(foto);
      fireEvent.click(foto);
      expect(onAbrir).toHaveBeenCalledTimes(1);
      fireEvent.touchStart(foto, { touches: [{ clientX: 10, clientY: 10 }] });
      fireEvent.touchMove(foto, { touches: [{ clientX: 10, clientY: 60 }] });
      vi.advanceTimersByTime(600);
      expect(onSegurar).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
