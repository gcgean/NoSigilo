import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PrimeirosPassos from './PrimeirosPassos';
import { feedService, marcarPassoCadastro, profileService } from '@/services/api';
import { concluirPrimeirosPassos, marcarNovoCadastro, outrasJanelasEsperam, primeirosPassosAtivos } from '@/utils/primeiroAcesso';

const auth = vi.hoisted(() => ({ user: null as any, updateUser: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/services/api', () => ({
  marcarPassoCadastro: vi.fn(),
  feedService: { createPost: vi.fn().mockResolvedValue({}) },
  profileService: { updateProfile: vi.fn().mockResolvedValue({}), uploadMedia: vi.fn(), setMainPhoto: vi.fn().mockResolvedValue({}) },
}));
vi.mock('@/components/CitySearch', () => ({
  CitySearch: ({ value, onChange }: any) => <input aria-label="cidade" value={value} onChange={(e) => onChange(e.target.value)} />,
}));

describe('primeiros passos depois do cadastro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    auth.user = { id: 'novo', city: '', state: '', lookingFor: ['Mulher'] };
    marcarNovoCadastro('novo');
  });

  it('não aparece para quem não acabou de se cadastrar', () => {
    auth.user = { id: 'antigo', city: 'Fortaleza' };
    const { container } = render(<PrimeirosPassos />);
    expect(container.firstChild).toBeNull();
  });

  it('cidade é obrigatória; depois quem curte; a foto pode ficar para depois', async () => {
    render(<PrimeirosPassos />);
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByRole('alert').textContent).toMatch(/cidade/);
    expect(profileService.updateProfile).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('cidade'), { target: { value: 'Fortaleza' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await screen.findByText('Quem você curte?');
    expect(profileService.updateProfile).toHaveBeenCalledWith({ city: 'Fortaleza', state: undefined });

    // Vem marcado o que o cadastro já sugeriu; sem nada marcado não avança.
    fireEvent.click(screen.getByRole('button', { name: /Mulher/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByRole('alert').textContent).toMatch(/pelo menos uma/);
    fireEvent.click(screen.getByRole('button', { name: /Casal Ele\/Ela/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await screen.findByText('Coloque sua foto de perfil');
    expect(profileService.updateProfile).toHaveBeenLastCalledWith({ lookingFor: ['Casal (Ele/Ela)'] });

    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }));
    expect(marcarPassoCadastro).toHaveBeenCalledWith('pp_pulou_foto');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(primeirosPassosAtivos('novo')).toBe(false);
  });

  it('quem já tem cidade começa em "quem curte", e a foto vira a foto principal', async () => {
    auth.user = { id: 'novo', city: 'Fortaleza', lookingFor: ['Mulher'] };
    vi.mocked(profileService.uploadMedia).mockResolvedValue({ id: 'm1', url: '/uploads/m1.jpg' } as any);
    const { container } = render(<PrimeirosPassos />);
    expect(screen.getByText('Quem você curte?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await screen.findByText('Coloque sua foto de perfil');
    const entrada = container.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(entrada, { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } });
    await screen.findByRole('button', { name: 'Entrar no NoSigilo' });
    expect(profileService.setMainPhoto).toHaveBeenCalledWith('m1');
    expect(feedService.createPost).toHaveBeenCalled();
    expect(auth.updateUser).toHaveBeenCalledWith({ avatar: '/uploads/m1.jpg' });
  });

  it('as outras janelas esperam o dia do cadastro; em outro dia voltam', () => {
    expect(outrasJanelasEsperam('novo')).toBe(true);
    expect(outrasJanelasEsperam('antigo')).toBe(false);
    concluirPrimeirosPassos('novo');
    expect(primeirosPassosAtivos('novo')).toBe(false);
    expect(outrasJanelasEsperam('novo')).toBe(true);
    localStorage.setItem('nosigilo:primeiros-passos:novo', JSON.stringify({ dia: 'Mon Jan 01 2001', ativo: false }));
    expect(outrasJanelasEsperam('novo')).toBe(false);
    // Passos pendentes de outro dia ainda seguram as janelas e voltam a aparecer.
    localStorage.setItem('nosigilo:primeiros-passos:novo', JSON.stringify({ dia: 'Mon Jan 01 2001', ativo: true }));
    expect(outrasJanelasEsperam('novo')).toBe(true);
  });
});
