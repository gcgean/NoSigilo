export function getNotificationHref(notification: any): string {
  const type = String(notification?.type || '');
  const id = notification?.id ? String(notification.id) : '';
  const data = notification?.data && typeof notification.data === 'object' ? notification.data : {};

  const postId = data?.postId ? String(data.postId) : '';
  const ownerId = data?.ownerId ? String(data.ownerId) : '';
  const profileUserId = data?.profileUserId ? String(data.profileUserId) : '';

  if (type === 'post.liked' && postId) return `/feed?postId=${encodeURIComponent(postId)}`;
  if (type === 'post.commented' && postId) return `/feed?postId=${encodeURIComponent(postId)}&openComments=1`;

  if (type === 'profile.liked' && data.actorId) return `/users/${encodeURIComponent(String(data.actorId))}`;

  if (type === 'testimonial.pending') return `/profile#testimonials`;
  if (type === 'testimonial.approved' && profileUserId) return `/users/${encodeURIComponent(profileUserId)}?tab=testimonials#testimonials`;
  if (type === 'testimonial.rejected' && profileUserId) return `/users/${encodeURIComponent(profileUserId)}?tab=testimonials#testimonials`;

  if (type === 'private_photos.request') return id ? `/notifications?focus=${encodeURIComponent(id)}` : '/notifications';
  if (type === 'private_photos.approved' && ownerId) return `/users/${encodeURIComponent(ownerId)}?tab=private`;
  if (type === 'private_photos.denied' && ownerId) return `/users/${encodeURIComponent(ownerId)}`;

  return '/notifications';
}

