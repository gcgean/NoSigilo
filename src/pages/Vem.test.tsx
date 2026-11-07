import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Vem from './Vem';
import { marcarPassoCadastro } from '@/services/api';

const auth = vi.hoisted(() => ({ user: null as null | { id: string } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/services/api', () => ({ marcarPassoCadastro: vi.fn() }));

describe('página do Instagram', () => {
  beforeEach(() => { vi.clearAllMocks(); auth.user = null; });

  it('diz que é adulto, mede a abertura e leva ao cadastro com o perfil escolhido', () => {
    render(<MemoryRouter><Vem /></MemoryRouter>);
    expect(screen.getByText(/maiores de 18/)).toBeTruthy();
    expect(marcarPassoCadastro).toHaveBeenCalledWith('ig_abriu');
    const casal = screen.getByRole('link', { name: /Somos um casal/ });
    expect(casal.getAttribute('href')).toBe('/register?profile=Casal%20(Ele%2FEla)');
    expect(screen.getByRole('link', { name: /Sou mulher/ }).getAttribute('href')).toBe('/register?profile=Mulher');
    fireEvent.click(screen.getByRole('link', { name: /Sou homem/ }));
    expect(marcarPassoCadastro).toHaveBeenCalledWith('ig_homem');
  });

  it('quem já está logado não vê a página', () => {
    auth.user = { id: 'u' };
    render(<MemoryRouter><Vem /></MemoryRouter>);
    expect(screen.queryByText(/Quem vai entrar/)).toBeNull();
  });
});
