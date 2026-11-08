import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NearbyActivityStrip from './NearbyActivityStrip';

vi.mock('@/services/api', () => ({
  chatService: { sendMessage: vi.fn() },
  radarService: { contactFromRadar: vi.fn() },
  nearbyActivityService: {
    get: vi.fn().mockResolvedValue({
      radars: [{ id: 'r1', message: 'Casal discreto na cidade hoje', senderName: 'Casal Teste', senderAvatar: '/uploads/a.jpg', city: 'Fortaleza', state: 'CE', distanceKm: 3, createdAt: '', expiresAt: '' }],
      events: [],
    }),
  },
}));

describe('radar em "Perto de você"', () => {
  it('mostra só a foto com o selo; a mensagem aparece ao tocar', async () => {
    render(<MemoryRouter><NearbyActivityStrip /></MemoryRouter>);
    const bolha = await screen.findByRole('button', { name: /Casal Teste está procurando alguém como você/ });
    expect(screen.queryByText('Casal discreto na cidade hoje')).toBeNull();
    fireEvent.click(bolha);
    expect(await screen.findByText('Casal discreto na cidade hoje')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Sua resposta ao radar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Ativar meu radar também/ })).toBeTruthy();
  });
});
