import { getUserProfileHref } from '@/utils/userProfileNavigation';

export function getNotificationHref(notification: any): string {
  const type = String(notification?.type || '');
  const id = notification?.id ? String(notification.id) : '';
  const data = notification?.data && typeof notification.data === 'object' ? notification.data : {};

  const postId = data?.postId ? String(data.postId) : '';
  const ownerId = data?.ownerId ? String(data.ownerId) : '';
  const profileUserId = data?.profileUserId ? String(data.profileUserId) : '';

  if (type === 'post.liked' && postId) return `/feed?postId=${encodeURIComponent(postId)}`;
  if (type === 'post.commented' && postId) return `/feed?postId=${encodeURIComponent(postId)}&openComments=1`;

  // Top da Semana — leva ao próprio post em destaque
  if (type === 'feed.top_week') return postId ? `/feed?postId=${encodeURIComponent(postId)}` : '/feed';

  // Stories — leva à área de stories (o dono vê reações/comentários do seu story)
  if (type === 'story.liked' || type === 'story.hot' || type === 'story.comment') {
    const storyId = data?.storyId ? String(data.storyId) : '';
    return storyId ? `/stories?storyId=${encodeURIComponent(storyId)}` : '/stories';
  }

  if (type === 'profile.liked' && data.actorId) return getUserProfileHref(data.actorId, undefined, '/notifications');
  if (type === 'profile.favorited' && data.actorId) return getUserProfileHref(data.actorId, undefined, '/notifications');
  if (type === 'profile.visited' && data.actorId) return getUserProfileHref(data.actorId, undefined, '/notifications');

  if (type === 'testimonial.pending') return `/profile#testimonials`;
  if (type === 'testimonial.approved' && profileUserId) return `${getUserProfileHref(profileUserId, undefined, '/notifications')}?tab=testimonials#testimonials`;
  if (type === 'testimonial.rejected' && profileUserId) return `${getUserProfileHref(profileUserId, undefined, '/notifications')}?tab=testimonials#testimonials`;

  if (type === 'private_photos.request') return id ? `/notifications?focus=${encodeURIComponent(id)}` : '/notifications';
  if (type === 'private_photos.approved' && ownerId) return `${getUserProfileHref(ownerId, undefined, '/notifications')}?tab=private`;
  if (type === 'private_photos.denied' && ownerId) return getUserProfileHref(ownerId, undefined, '/notifications');
  if (type === 'radar.received' && data.conversationId) return `/chat?conversationId=${encodeURIComponent(String(data.conversationId))}`;
  if (type === 'radar.contacted' && data.conversationId) return `/chat?conversationId=${encodeURIComponent(String(data.conversationId))}`;
  if (type === 'message.reaction' && data.conversationId) return `/chat?conversationId=${encodeURIComponent(String(data.conversationId))}`;

  if (type === 'referral.reward') return '/invites';

  return '/notifications';
}
