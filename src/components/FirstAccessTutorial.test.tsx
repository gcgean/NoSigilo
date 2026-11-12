// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FirstAccessTutorial from '@/components/FirstAccessTutorial';
import { startFirstAccessTutorial } from '@/components/firstAccessTutorialEvents';

const mocks = vi.hoisted(() => ({
  userId: 'tutorial-test-user',
  navigate: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: mocks.userId } }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  useLocation: () => ({ pathname: '/feed' }),
}));

describe('FirstAccessTutorial', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.navigate.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('abre automaticamente no primeiro acesso do usuário', async () => {
    render(<FirstAccessTutorial />);

    expect(await screen.findByRole('dialog', { name: 'Boas-vindas à comunidade NoSigilo' })).toBeTruthy();
    expect(localStorage.getItem(`nosigilo:welcome-tutorial-date:${mocks.userId}`)).toBeTruthy();
    // Primeira entrada: uma tela só, sem contador de etapas.
    expect(screen.getByRole('button', { name: /Começar a explorar/ })).toBeTruthy();
    expect(screen.queryByText(/de 6/)).toBeNull();
  });

  it('reabre o mesmo tutorial pelo evento usado em Conheça a plataforma', async () => {
    localStorage.setItem(`nosigilo:welcome-tutorial-date:${mocks.userId}`, '2026-08-17');
    render(<FirstAccessTutorial />);

    expect(screen.queryByRole('dialog', { name: 'Boas-vindas à comunidade NoSigilo' })).toBeNull();

    act(() => {
      startFirstAccessTutorial();
    });

    expect(await screen.findByRole('dialog', { name: 'Boas-vindas à comunidade NoSigilo' })).toBeTruthy();
    // "Conheça a plataforma" abre o tour completo.
    expect(screen.getByText('1 de 6')).toBeTruthy();
  });
});
