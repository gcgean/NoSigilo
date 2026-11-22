import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Youtube from './Youtube';
import { marcarPassoCadastro } from '@/services/api';

const auth = vi.hoisted(() => ({ user: null as null | { id: string } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/services/api', () => ({ marcarPassoCadastro: vi.fn() }));

describe('página do YouTube', () => {
  beforeEach(() => { vi.clearAllMocks(); auth.user = null; });

  it('é limpa (sem imagem), diz que é adulto, mede a abertura e leva ao cadastro com o perfil', () => {
    const { container } = render(<MemoryRouter><Youtube /></MemoryRouter>);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText(/maiores de 18/)).toBeTruthy();
    expect(marcarPassoCadastro).toHaveBeenCalledWith('yt_abriu');
    expect(screen.getByRole('link', { name: /Somos um casal/ }).getAttribute('href')).toBe('/register?profile=Casal%20(Ele%2FEla)');
    fireEvent.click(screen.getByRole('link', { name: /Sou mulher/ }));
    expect(marcarPassoCadastro).toHaveBeenCalledWith('yt_mulher');
  });

  it('quem já está logado não vê a página', () => {
    auth.user = { id: 'u' };
    render(<MemoryRouter><Youtube /></MemoryRouter>);
    expect(screen.queryByText(/Quem vai entrar/)).toBeNull();
  });
});
