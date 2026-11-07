import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CasaAoVivoConvite from './CasaAoVivoConvite';
import LancamentoDaCasa from './LancamentoDaCasa';
import apiClient from '@/utils/apiClient';
import { concluirPrimeirosPassos, marcarNovoCadastro } from '@/utils/primeiroAcesso';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'novo' } }) }));
vi.mock('@/utils/apiClient', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/utils/pushNotifications', () => ({ enablePushNotifications: vi.fn() }));

const passar = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const abrir = (tela: JSX.Element) => render(<MemoryRouter initialEntries={['/feed']}>{tela}</MemoryRouter>);

describe('convite da Casa para quem acabou de se cadastrar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-07T12:00:00Z')); // sábado, Casa fechada
    vi.clearAllMocks();
    localStorage.clear();
    marcarNovoCadastro('novo');
    window.history.replaceState({}, '', '/feed');
  });
  afterEach(() => vi.useRealTimers());

  it('o convite de reserva espera os primeiros passos e abre no mesmo dia', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { salas: [], reservado: false, aberta: false, proximaAbertura: null, reservas: 0 } });
    abrir(<LancamentoDaCasa />);
    await passar(10_000);
    expect(apiClient.get).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();

    act(() => concluirPrimeirosPassos('novo'));
    await passar(5_000);
    expect(apiClient.get).toHaveBeenCalledWith('/casa');
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('não abre na página de planos e volta a tentar na próxima abertura do app', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { salas: [], reservado: false, aberta: false, proximaAbertura: null, reservas: 0 } });
    concluirPrimeirosPassos('novo');
    window.history.replaceState({}, '', '/subscriptions');
    const primeira = abrir(<LancamentoDaCasa />);
    await passar(5_000);
    expect(screen.queryByRole('dialog')).toBeNull();
    primeira.unmount();

    window.history.replaceState({}, '', '/feed');
    abrir(<LancamentoDaCasa />);
    await passar(5_000);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('não abre por cima de outra janela, como o bloqueio de assinatura', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { aberta: true, tema: null, pessoas: 12 } });
    concluirPrimeirosPassos('novo');
    render(<div role="dialog">bloqueio de assinatura</div>);
    abrir(<CasaAoVivoConvite />);
    await passar(3_000);
    expect(screen.queryByText(/A Casa está aberta/)).toBeNull();
  });

  it('com a Casa aberta, o convite ao vivo também espera e abre em seguida', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { aberta: true, tema: null, pessoas: 12 } });
    abrir(<CasaAoVivoConvite />);
    await passar(10_000);
    expect(apiClient.get).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();

    act(() => concluirPrimeirosPassos('novo'));
    await passar(3_000);
    expect(apiClient.get).toHaveBeenCalledWith('/casa/publico');
    expect(screen.getByText(/A Casa está aberta/)).toBeTruthy();
  });
});
