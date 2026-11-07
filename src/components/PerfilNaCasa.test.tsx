import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PerfilNaCasa from './PerfilNaCasa';
import apiClient from '@/utils/apiClient';

vi.mock('@/utils/apiClient', () => ({ default: { get: vi.fn(), post: vi.fn() } }));

const perfil = { id: 'ana', name: 'Ana', avatar: null, bio: null, status: null, city: null, state: null, gender: 'Mulher', birthDate: null, partnerBirthDate: null, distanceKm: null, publicPhotosCount: 0 };
const story = (id: string, autor: string, extra: object) => ({ id, mimeType: 'image/jpeg', mediaUrl: `/uploads/${id}.jpg`, createdAt: `2026-11-06T22:0${id.length}:00.000Z`, author: { id: autor }, ...extra });

function preparar(stories: object[]) {
  vi.mocked(apiClient.post).mockResolvedValue({ data: {} });
  vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
    if (url === '/stories') return { data: { stories } };
    if (url.endsWith('/photos')) return { data: [] };
    return { data: perfil };
  });
}

describe('perfil dentro d\'A Casa', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mostra só os stories da pessoa, passa de um para o outro e volta ao perfil', async () => {
    preparar([story('a', 'ana', {}), story('bb', 'ana', { mediaUrl: null, text: 'Bora?' }), story('x', 'outra', {})]);
    render(<PerfilNaCasa userId="ana" onFechar={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver stories (2)'.replace(/^/, '▶ ') }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/stories/a/view', {}));
    fireEvent.click(screen.getByRole('button', { name: 'Próximo story' }));
    expect(await screen.findByText('Bora?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Próximo story' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Próximo story' })).toBeNull());
  });

  it('sem stories não mostra o botão; sem assinatura não registra visualização', async () => {
    preparar([]);
    const { unmount } = render(<PerfilNaCasa userId="ana" onFechar={() => {}} />);
    await screen.findAllByText('Ana');
    expect(screen.queryByText(/Ver stories/)).toBeNull();
    unmount();
    preparar([story('a', 'ana', { mediaUrl: null })]);
    render(<PerfilNaCasa userId="ana" onFechar={() => {}} />);
    fireEvent.click(await screen.findByText(/Ver stories/));
    expect(await screen.findByText(/Assine para ver os stories/)).toBeTruthy();
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});
