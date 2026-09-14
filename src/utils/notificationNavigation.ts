import { getUserProfileHref } from '@/utils/userProfileNavigation';

/**
 * Para onde leva o toque em cada notificação.
 *
 * Revisão de 14/09/2026. Dois problemas faziam o toque "não funcionar":
 *
 *  1. Notificação de post levava a /feed?postId=, e o feed tentava ACHAR o post
 *     rolando a lista. O post da própria pessoa muitas vezes nem entra no feed
 *     dela, e sem achar o app parava no topo sem avisar. Agora vai para
 *     /post/:id, que abre a publicação direto.
 *  2. Vários tipos não tinham destino e caíam em '/notifications' — a própria
 *     tela, ou seja, nada acontecia: match.mutual, comment.replied,
 *     event_invitation, radar.viewed, private_photos.revoked, invite.approved,
 *     name_change.*, promoter.rules_notice, daily.streak.milestone,
 *     experience.*.
 *
 * Retorna null quando a notificação não tem para onde levar (o card então não
 * mostra a seta de navegação).
 */
export function getNotificationHref(notification: any): string | null {
  const type = String(notification?.type || '');
  const id = notification?.id ? String(notification.id) : '';
  const data = notification?.data && typeof notification.data === 'object' ? notification.data : {};

  const postId = data?.postId ? String(data.postId) : '';
  const storyId = data?.storyId ? String(data.storyId) : '';
  const ownerId = data?.ownerId ? String(data.ownerId) : '';
  const actorId = data?.actorId ? String(data.actorId) : '';
  const profileUserId = data?.profileUserId ? String(data.profileUserId) : '';
  const conversationId = data?.conversationId ? String(data.conversationId) : '';
  const perfil = (uid: string) => getUserProfileHref(uid, undefined, '/notifications');
  const post = (pid: string, comentarios = false) => `/post/${encodeURIComponent(pid)}${comentarios ? '?comments=1' : ''}`;

  // ── Publicações ──────────────────────────────────────────────────────────
  if (postId) {
    if (type === 'post.liked' || type === 'post.mentioned' || type === 'feed.top_day' || type === 'feed.top_week') return post(postId);
    if (type === 'post.commented' || type === 'comment.mentioned' || type === 'comment.replied' || type === 'comment.liked') return post(postId, true);
  }
  if (type === 'feed.top_day' || type === 'feed.top_week') return '/feed';

  // Experiências vivem no feed; não há tela própria por experiência.
  if (type === 'experience.liked' || type === 'experience.commented') return '/feed';

  // ── Stories ──────────────────────────────────────────────────────────────
  if (type === 'story.liked' || type === 'story.hot' || type === 'story.comment' || type === 'story.mentioned') {
    return storyId ? `/stories?storyId=${encodeURIComponent(storyId)}` : '/stories';
  }

  // ── Pessoas ──────────────────────────────────────────────────────────────
  // Curtida no perfil vai ao perfil de quem curtiu, de onde dá para chamar.
  // Sem actorId é o não-assinante, para quem o backend esconde quem curtiu:
  // leva aos planos, que é o que revela o nome.
  if (type === 'profile.liked') return actorId ? perfil(actorId) : '/subscriptions';
  if (type === 'profile.favorited' || type === 'profile.visited') return actorId ? perfil(actorId) : '/subscriptions';
  if (type === 'match.mutual') {
    if (conversationId) return `/chat?conversationId=${encodeURIComponent(conversationId)}`;
    return actorId ? perfil(actorId) : '/chat';
  }
  if (type === 'invite.approved') return data?.inviteeUserId ? perfil(String(data.inviteeUserId)) : '/invites';

  // ── Depoimentos ──────────────────────────────────────────────────────────
  if (type === 'testimonial.pending') return '/profile#testimonials';
  if ((type === 'testimonial.approved' || type === 'testimonial.rejected') && profileUserId) {
    return `${perfil(profileUserId)}?tab=testimonials#testimonials`;
  }

  // ── Fotos privadas ───────────────────────────────────────────────────────
  if (type === 'private_photos.request') return id ? `/notifications?focus=${encodeURIComponent(id)}` : null;
  if (type === 'private_photos.approved' && ownerId) return `${perfil(ownerId)}?tab=private`;
  if ((type === 'private_photos.denied' || type === 'private_photos.revoked') && ownerId) return perfil(ownerId);

  // ── Radar, chat, eventos ─────────────────────────────────────────────────
  if ((type === 'radar.received' || type === 'radar.contacted' || type === 'message.reaction') && conversationId) {
    return `/chat?conversationId=${encodeURIComponent(conversationId)}`;
  }
  if (type.startsWith('radar.')) return '/radar';
  if (type === 'event_invitation') return '/events';

  // ── Conta, indicação, tokens ─────────────────────────────────────────────
  if (type === 'referral.reward') return '/invites';
  if (type.startsWith('promoter.')) return '/promoter';
  if (type.startsWith('tokens.') || type === 'daily.streak.milestone') return '/tokens';
  if (type.startsWith('name_change.')) return '/settings';

  return null;
}

/**
 * Motivo para NÃO navegar, quando o destino sabidamente não existe mais.
 * Usa a miniatura que o backend manda junto (preview.removed / expired).
 * Sem isso, tocar numa curtida de story vencido abria uma tela de stories
 * vazia, e parecia bug.
 */
export function notificationUnavailableReason(notification: any): string | null {
  const preview = notification?.preview;
  if (!preview) return null;
  if (preview.removed) {
    return notification?.data?.storyId
      ? 'Esse story não está mais disponível'
      : 'Essa publicação não está mais disponível';
  }
  if (preview.expired) return 'Esse story já expirou (stories ficam 24h no ar)';
  return null;
}
