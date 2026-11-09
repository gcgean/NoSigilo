// Prévia isolada de desenvolvimento. Não faz chamadas ao servidor nem altera contas.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import { AuthContext } from './contexts/AuthContext';
import { Toaster } from './components/ui/toaster';
import Promoter from './pages/Promoter';
import PromoterAssets from './components/PromoterAssets';
import { promoterService, invitesService, promoterSupportService } from './services/api';
import apiClient from './utils/apiClient';
import './index.css';

if (!import.meta.env.DEV) throw new Error('Prévia disponível apenas no desenvolvimento');
apiClient.defaults.adapter = async (config) => ({ data: {}, status: 200, statusText: 'Prévia sem servidor', headers: {}, config });
const profile = { id: 'preview', fullName: 'Promotor de demonstração', pixKey: 'exemplo@pix.com', whatsapp: null, contactEmail: null, status: 'active', activatedAt: '2026-01-01' };
const history = Array.from({ length: 12 }, (_, i) => {
  const month = new Date(); month.setDate(1); month.setMonth(month.getMonth() - 11 + i);
  return { month: `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`, commissionCents: [0, 0, 198, 792, 1188, 1782, 2376, 1980, 3168, 3960, 4554, 6534][i], signups: i * 8, subscriptions: i * 3 };
});
promoterService.getProfile = async () => ({ promoter: profile });
promoterService.minhaPosicao = async () => ({ posicao: 8, total: 45, periodo: history[11].month });
promoterService.getDashboard = async () => ({ promoter: profile, history, stats: { invitesSent: 23, totalSignups: 88, totalSubscriptions: 33, totalCommissionCents: 6534, pendingCents: 792, approvedCents: 594, paidCents: 5148, minPayoutCents: 1000 }, commissions: [], referredUsers: [], referredCounts: {} });
promoterSupportService.getMessages = async () => ({ messages: [] });
invitesService.listMine = async () => [{ status: 'created', token: 'exemplo-demonstrativo' }];
let previewSeen = false;
promoterService.markAssetsSeen = async () => { previewSeen = true; return { ok: true }; };
promoterService.assets = async () => ({ newCount: previewSeen ? 0 : 1, assets: [{ id: 'preview', title: 'Exemplo de arte publicada', caption: 'Sua próxima conexão começa aqui. Conheça a comunidade pelo meu convite.', destination: 'community', createdAt: new Date().toISOString(), url: window.location.origin + '/icon-512.svg', mimeType: 'image/svg+xml', processing: false, isNew: !previewSeen }] });
createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={[window.location.search.includes('admin') ? '/admin/promotores' : '/promoter']}><AuthContext.Provider value={{ user: null, isLoading: false, isAuthenticated: false, login: async () => { throw new Error("Prévia"); }, confirmarLoginDoisFatores: async () => { throw new Error("Prévia"); }, register: async () => ({}), logout: () => {}, updateUser: () => {} }}><div className="min-h-screen bg-background text-foreground"><header className="border-b p-4"><div className="max-w-4xl mx-auto flex items-center gap-3"><img src="/icon-96.png" alt="" className="w-10 h-10" /><strong className="text-xl text-primary">NoSigilo.net</strong></div></header><main className="max-w-4xl mx-auto p-4 space-y-5"><p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">Prévia demonstrativa · valores, Pix, ranking e arte são exemplos. Nenhuma ação nesta prévia altera sua conta.</p><nav className="flex flex-wrap gap-4 text-sm text-primary"><Link to="/promoter">Painel do promotor</Link><Link to="/promoter/artes">Central de divulgação</Link><Link to="/admin/promotores">Admin · prévia</Link></nav><Routes><Route path="/admin/promotores" element={<PromoterAssets admin />} /><Route path="/promoter" element={<Promoter />} /><Route path="/promoter/artes" element={<PromoterAssets />} /></Routes></main></div><Toaster /></AuthContext.Provider></MemoryRouter>);
