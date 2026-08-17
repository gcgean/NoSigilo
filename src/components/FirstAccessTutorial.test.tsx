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
  });

  it('reabre o mesmo tutorial pelo evento usado em Conheça a plataforma', async () => {
    localStorage.setItem(`nosigilo:welcome-tutorial-date:${mocks.userId}`, '2026-08-17');
    render(<FirstAccessTutorial />);

    expect(screen.queryByRole('dialog', { name: 'Boas-vindas à comunidade NoSigilo' })).toBeNull();

    act(() => {
      startFirstAccessTutorial();
    });

    expect(await screen.findByRole('dialog', { name: 'Boas-vindas à comunidade NoSigilo' })).toBeTruthy();
  });
});
