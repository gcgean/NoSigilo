import apiClient from '@/utils/apiClient';
import { compressImageFile } from '@/utils/mediaCompression';
import axios from 'axios';

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';

export const appService = {
  getSettings: async () => {
    const response = await apiClient.get('/app/settings');
    return response.data;
  },

  getStats: async (): Promise<{ totalUsers: number; onlineNow: number }> => {
    const response = await apiClient.get('/app/stats');
    return response.data;
  },

  trackVisit: async (payload: {
    path?: string;
    title?: string;
    referrer?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmTerm?: string;
    utmContent?: string;
    timezone?: string;
    language?: string;
    deviceType?: 'mobile' | 'tablet' | 'desktop';
    screenWidth?: number;
    screenHeight?: number;
  }) => {
    const response = await apiClient.post('/analytics/visit', payload);
    return response.data;
  },
};

// Auth Service
export const authService = {
  login: async (email: string, password: string) => {
    if (USE_MOCKS) {
      return { token: 'mock-token', user: { id: '1', email, name: 'Mock User' } };
    }
    const response = await apiClient.post('/auth/login', { email, password });
    return response.data;
  },

  register: async (data: any) => {
    if (USE_MOCKS) {
      return { token: 'mock-token', user: { id: '1', ...data } };
    }
    const response = await apiClient.post('/auth/register', data);
    return { ...response.data, httpStatus: response.status };
  },

  checkEmail: async (email: string) => {
    if (USE_MOCKS) {
      return { available: true };
    }
    const response = await apiClient.post('/auth/check-email', { email });
    return response.data;
  },

  getInviteInfo: async (token: string) => {
    const response = await apiClient.get(`/invites/public/${encodeURIComponent(token)}`);
    return response.data;
  },

  getPendingAccess: async (email: string) => {
    const response = await apiClient.get('/auth/pending-access', { params: { email } });
    return response.data;
  },

  getMe: async () => {
    const response = await apiClient.get('/auth/me');
    return response.data;
  },

  refreshSession: async () => {
    const response = await apiClient.post('/auth/refresh');
    return response.data;
  },

  requestPasswordResetCode: async (email: string) => {
    const response = await apiClient.post('/auth/forgot-password/request', { email });
    return response.data;
  },

  confirmPasswordReset: async (data: { email: string; code: string; newPassword: string }) => {
    const response = await apiClient.post('/auth/forgot-password/confirm', data);
    return response.data;
  },

  changePassword: async (data: { currentPassword: string; newPassword: string }) => {
    const response = await apiClient.put('/auth/change-password', data);
    return response.data;
  },
};

// Feed Service
export const videoSearchService = {
  search: async (params?: {
    page?: number;
    limit?: number;
    gender?: string;
    city?: string;
    maxDistanceKm?: number;
    sort?: string;
    all?: boolean;
  }): Promise<{
    videos: Array<{
      mediaId: string;
      postId: string;
      videoUrl: string;
      content: string;
      createdAt: string;
      likesCount: number;
      commentsCount: number;
      distanceKm: number | null;
      author: {
        id: string;
        name: string;
        avatar: string | null;
        gender: string | null;
        city: string | null;
        state: string | null;
      };
    }>;
    hasMore: boolean;
  }> => {
    const response = await apiClient.get('/videos/search', { params, timeout: 30000 });
    return response.data;
  },
};

export const discoveryService = {
  // Quantos perfis procuram alguém do gênero do usuário (+ prévias de avatar).
  getSeekingMe: async (): Promise<{ count: number; previews: string[] }> => {
    const response = await apiClient.get('/discovery/seeking-me');
    return response.data;
  },
};

export const feedService = {
  getFeed: async (params?: { page?: number; limit?: number; includeReelsOnly?: boolean; seenIds?: string; maxDistanceKm?: number; cityOnly?: boolean; filter?: string }) => {
    if (USE_MOCKS) {
      return { posts: [], hasMore: false, insights: null };
    }
    const response = await apiClient.get('/feed', { params });
    return response.data;
  },

  createPost: async (data: { content: string; mediaIds?: string[]; reelsOnly?: boolean }) => {
    const response = await apiClient.post('/posts', data);
    return response.data;
  },

  deletePost: async (postId: string) => {
    const response = await apiClient.delete(`/posts/${postId}`);
    return response.data;
  },

  getRecentPhotos: async () => {
    if (USE_MOCKS) {
      return [];
    }
    const response = await apiClient.get('/photos/recent');
    return response.data;
  },

  getSocialPulse: async () => {
    const response = await apiClient.get('/feed/social-pulse');
    return response.data as {
      likesToday: number;
      visitorsToday: number;
      mutualLikes: number;
      unreadNotifs: number;
      recentVisitors: Array<{ id: string; name: string; avatar: string | null }> | null;
      recentLikers: Array<{ id: string; name: string; avatar: string | null }> | null;
      isPremium: boolean;
    };
  },

  dailyCheckin: async () => {
    const response = await apiClient.post('/users/daily-checkin');
    return response.data as {
      streak: number;
      maxStreak: number;
      isNewDay: boolean;
      streakBroken: boolean;
      todayUtc: string;
    };
  },

  registerActivity: async (action: string) => {
    const timezoneOffsetMinutes = new Date().getTimezoneOffset(); // negative for UTC+
    const response = await apiClient.post('/users/register-activity', { action, timezoneOffsetMinutes });
    return response.data as {
      streak: number;
      maxStreak: number;
      streakRegistered: boolean;
      alreadyDoneToday: boolean;
      streakBroken: boolean;
      action: string;
      todayLocal: string;
    };
  },
};

export const experienceService = {
  getFeed: async (params?: { page?: number; limit?: number }) => {
    const response = await apiClient.get('/feed/experiences', { params });
    return response.data;
  },

  create: async (data: { title: string; description: string; mediaIds?: string[] }) => {
    const response = await apiClient.post('/experiences', data);
    return response.data;
  },

  delete: async (experienceId: string) => {
    const response = await apiClient.delete(`/experiences/${experienceId}`);
    return response.data;
  },

  getByUser: async (userId: string) => {
    const response = await apiClient.get(`/users/${userId}/experiences`);
    return response.data;
  },
};

// Profile Service
export const profileService = {
  getProfile: async () => {
    const response = await apiClient.get('/profile');
    return response.data;
  },

  updateProfile: async (data: any) => {
    const response = await apiClient.put('/profile', data);
    return response.data;
  },

  generateTelegramLink: async (): Promise<{ url: string }> => {
    const response = await apiClient.post('/profile/telegram/link');
    return response.data;
  },

  disconnectTelegram: async () => {
    const response = await apiClient.delete('/profile/telegram');
    return response.data;
  },

  getVisits: async () => {
    const response = await apiClient.get('/profile/visits');
    return response.data;
  },

  getStats: async () => {
    const response = await apiClient.get('/profile/stats');
    return response.data;
  },

  uploadMedia: async (
    file: File,
    options?: { isPrivate?: boolean; source?: 'post' | 'chat' | 'profile' },
    onProgress?: (percent: number) => void
  ) => {
    let uploadFile = file;
    if (file.type.startsWith('image/')) {
      uploadFile = await compressImageFile(file, { maxDimension: 1600, quality: 0.82 });
    }
    const formData = new FormData();
    formData.append('file', uploadFile);
    try {
      const response = await apiClient.post('/media/upload', formData, {
        params: { isPrivate: options?.isPrivate ? 1 : 0, source: options?.source || 'post' },
        headers: { 'Content-Type': 'multipart/form-data' },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 10 * 60 * 1000,
        onUploadProgress: (e) => {
          if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
        },
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 413) {
        throw new Error('A mídia excedeu o limite atual do servidor. Se o backend já foi atualizado, refaça o envio em instantes.');
      }
      throw error;
    }
  },

  setMainPhoto: async (mediaId: string) => {
    const response = await apiClient.patch(`/media/${mediaId}/main`);
    return response.data;
  },

  updateMediaVisibility: async (mediaId: string, isPrivate: boolean) => {
    const response = await apiClient.patch(`/media/${mediaId}/visibility`, { isPrivate });
    return response.data;
  },

  deleteMedia: async (mediaId: string) => {
    const response = await apiClient.delete(`/media/${mediaId}`);
    return response.data;
  },

  deactivateProfile: async () => {
    const response = await apiClient.put('/profile/deactivate');
    return response.data;
  },

  reactivateProfile: async () => {
    const response = await apiClient.put('/profile/reactivate');
    return response.data;
  },
};

// Match Service
export const matchService = {
  getCards: async (params?: { city?: string; ageRange?: string; genders?: string; radar?: string; search?: string }) => {
    if (USE_MOCKS) {
      return [];
    }
    const response = await apiClient.get('/match/cards', { params });
    return response.data;
  },

  like: async (userId: string) => {
    const response = await apiClient.post('/match/like', { userId });
    return response.data;
  },

  pass: async (userId: string) => {
    const response = await apiClient.post('/match/pass', { userId });
    return response.data;
  },

  getLikedProfiles: async () => {
    const response = await apiClient.get('/match/liked');
    return response.data;
  },

  getLikeStatus: async (userId: string): Promise<{ liked: boolean; isFriend: boolean }> => {
    const response = await apiClient.get('/match/like-status', { params: { userId } });
    return response.data;
  },

  getSuggestions: async () => {
    const response = await apiClient.get('/match/suggestions');
    return response.data;
  },
};

export type ActiveNowProfile = {
  id: string;
  name: string;
  avatar: string | null;
  gender: string | null;
  city: string | null;
  state: string | null;
  distanceKm: number | null;
  isOnline: boolean;
  lastActiveAt: string | null;
  reason: 'posted' | 'radar' | 'online';
};

export type TopDayPost = {
  id: string;
  rank: number;
  likeCount: number;
  createdAt: string;
  mediaUrl: string | null;
  mimeType: string | null;
  author: { id: string; name: string; avatar: string | null };
};

export const radarService = {
  getOverview: async () => {
    const response = await apiClient.get('/radar');
    return response.data;
  },

  getActiveNow: async (params?: { maxDistanceKm?: number; cityOnly?: boolean }): Promise<{ profiles: ActiveNowProfile[] }> => {
    const response = await apiClient.get('/feed/active-now', { params });
    return response.data;
  },

  getTopDay: async (): Promise<{ posts: TopDayPost[] }> => {
    const response = await apiClient.get('/feed/top-day');
    return response.data;
  },

  getHighlights: async () => {
    const response = await apiClient.get('/radar/highlights');
    return response.data;
  },

  createBroadcast: async (data: {
    city: string;
    state: string;
    message: string;
    targetGender: string[];
    radius: number;
    durationHours: number;
    isAnonymous?: boolean;
    showOnlyOnline?: boolean;
  }) => {
    const response = await apiClient.post('/radar', data);
    return response.data;
  },

  deactivateBroadcast: async (broadcastId: string) => {
    const response = await apiClient.post(`/radar/${broadcastId}/deactivate`);
    return response.data;
  },

  contactFromRadar: async (broadcastId: string) => {
    const response = await apiClient.post(`/radar/${broadcastId}/contact`);
    return response.data;
  },
};

// Chat Service
export const chatService = {
  getConversations: async () => {
    if (USE_MOCKS) {
      return [];
    }
    const response = await apiClient.get('/conversations');
    return response.data;
  },

  getUnreadCount: async () => {
    const response = await apiClient.get('/conversations/unread-count');
    return response.data;
  },

  createConversation: async (userId: string) => {
    const response = await apiClient.post('/conversations', { userId });
    return response.data;
  },

  getMessages: async (conversationId: string, params?: { page?: number }) => {
    const response = await apiClient.get(`/conversations/${conversationId}/messages`, { params });
    return response.data;
  },

  sendMessage: async (conversationId: string, data: { content?: string; mediaId?: string; clientId?: string; isViewOnce?: boolean; replyToMessageId?: string }) => {
    const response = await apiClient.post(`/conversations/${conversationId}/messages`, data);
    return response.data;
  },

  deleteConversation: async (conversationId: string) => {
    const response = await apiClient.delete(`/conversations/${conversationId}`);
    return response.data;
  },

  updateConversationHighlight: async (
    conversationId: string,
    data: { highlighted: boolean; note?: string | null; color?: 'rose' | 'amber' | 'violet' | 'sky' | null }
  ) => {
    const response = await apiClient.patch(`/conversations/${conversationId}/highlight`, data);
    return response.data;
  },

  markMessageAsViewed: async (messageId: string) => {
    const response = await apiClient.post(`/messages/${messageId}/view`);
    return response.data;
  },

  markAsRead: async (conversationId: string) => {
    const response = await apiClient.post(`/conversations/${conversationId}/read`);
    return response.data;
  },

  markAsUnread: async (conversationId: string) => {
    const response = await apiClient.post(`/conversations/${conversationId}/unread`);
    return response.data;
  },

  deleteMessage: async (messageId: string, forEveryone: boolean) => {
    const response = await apiClient.delete(`/messages/${messageId}`, { data: { forEveryone } });
    return response.data;
  },

  reactToMessage: async (
    messageId: string,
    reaction: 'heart' | 'love' | 'wow' | 'devil' | 'fire' | 'splash'
  ) => {
    const response = await apiClient.post(`/messages/${messageId}/reaction`, { reaction });
    return response.data as { reaction: string | null };
  },
};

// Likes & Comments Service
export const interactionsService = {
  like: async (
    targetType: 'post' | 'photo' | 'user' | 'experience',
    targetId: string,
    reaction?: 'heart' | 'fire' | 'love' | 'wow' | 'devil' | 'splash'
  ) => {
    const response = await apiClient.post('/likes', { targetType, targetId, reaction });
    return response.data;
  },

  unlike: async (targetType: 'post' | 'photo' | 'user' | 'experience', targetId: string) => {
    const response = await apiClient.delete('/likes', { data: { targetType, targetId } });
    return response.data;
  },

  getLikes: async (targetType: string, targetId: string) => {
    const response = await apiClient.get('/likes', { params: { targetType, targetId } });
    return response.data;
  },

  comment: async (targetType: string, targetId: string, content: string, parentCommentId?: string) => {
    const response = await apiClient.post('/comments', { targetType, targetId, content, ...(parentCommentId ? { parentCommentId } : {}) });
    return response.data;
  },

  getComments: async (targetType: string, targetId: string) => {
    const response = await apiClient.get('/comments', { params: { targetType, targetId } });
    return response.data;
  },

  updateComment: async (commentId: string, content: string) => {
    const response = await apiClient.put(`/comments/${commentId}`, { content });
    return response.data;
  },

  deleteComment: async (commentId: string) => {
    const response = await apiClient.delete(`/comments/${commentId}`);
    return response.data;
  },
};

// Friends Service
export const friendsService = {
  getFriends: async () => {
    const response = await apiClient.get('/friends');
    return response.data;
  },

  sendRequest: async (userId: string) => {
    const response = await apiClient.post('/friends', { userId });
    return response.data;
  },

  respondToRequest: async (requestId: string, accept: boolean) => {
    const response = await apiClient.post(`/friends/${requestId}/respond`, { accept });
    return response.data;
  },

  removeFriend: async (userId: string) => {
    const response = await apiClient.delete(`/friends/${encodeURIComponent(userId)}`);
    return response.data;
  },
};

// Notifications Service
export const notificationsService = {
  getNotifications: async () => {
    const response = await apiClient.get('/notifications');
    return response.data;
  },

  markAsRead: async (notificationId: string) => {
    const response = await apiClient.patch(`/notifications/${notificationId}/read`);
    return response.data;
  },

  markAllAsRead: async () => {
    const response = await apiClient.post('/notifications/read-all');
    return response.data;
  },
};

export const pushService = {
  getPublicKey: async () => {
    const response = await apiClient.get('/push/public-key');
    return response.data as { publicKey: string };
  },

  subscribe: async (subscription: {
    endpoint: string;
    expirationTime?: number | null;
    keys: { p256dh: string; auth: string };
  }) => {
    const response = await apiClient.post('/push/subscribe', subscription);
    return response.data;
  },

  unsubscribe: async (endpoint: string) => {
    const response = await apiClient.post('/push/unsubscribe', { endpoint });
    return response.data;
  },
};

export const usersService = {
  searchUsers: async (params: {
    page?: number;
    limit?: number;
    search?: string;
    city?: string;
    ageRange?: string;
    genders?: string;
    radar?: string;
    sort?: string;
    availableOnly?: boolean;
    intention?: string;
  }) => {
    const response = await apiClient.get('/users', { params });
    return response.data as { users: any[]; hasMore: boolean; page: number };
  },

  getUser: async (userId: string) => {
    const response = await apiClient.get(`/users/${userId}`);
    return response.data;
  },

  suggestUsers: async (q: string): Promise<{ users: Array<{ id: string; name: string; avatar: string | null; gender: string | null; city: string | null; state: string | null }> }> => {
    const response = await apiClient.get('/users/suggest', { params: { q } });
    return response.data;
  },

  getUserPhotos: async (userId: string, visibility: 'public' | 'private') => {
    const response = await apiClient.get(`/users/${userId}/photos`, { params: { visibility } });
    return response.data;
  },

  getPrivatePhotosAccess: async (userId: string) => {
    const response = await apiClient.get(`/users/${userId}/private-photos/access`);
    return response.data;
  },

  getTestimonials: async (userId: string, params?: { status?: 'all' | 'pending' | 'approved' | 'rejected' }) => {
    const response = await apiClient.get(`/users/${userId}/testimonials`, { params });
    return response.data;
  },

  getUserPosts: async (userId: string, params?: { page?: number; limit?: number; videosOnly?: boolean }) => {
    const response = await apiClient.get(`/users/${userId}/posts`, { params });
    return response.data as { posts: Array<{ id: string; content: string; createdAt: string; media: Array<{ id: string; url: string | null; mimeType: string | null }> }>; hasMore: boolean };
  },

  getSearchPreferences: async () => {
    const response = await apiClient.get('/users/search-preferences');
    return response.data as {
      profileTypes: string[];
      maxDistance: number | null;
      intentions: string[];
      availabilityFilter: 'any' | 'available' | null;
      updatedAt: string;
    } | null;
  },

  saveSearchPreferences: async (prefs: {
    profileTypes?: string[] | null;
    maxDistance?: number | null;
    intentions?: string[] | null;
    availabilityFilter?: 'any' | 'available' | null;
  }) => {
    const response = await apiClient.put('/users/search-preferences', prefs);
    return response.data as { success: boolean };
  },

  getBlockStatus: async (userId: string) => {
    const response = await apiClient.get(`/users/${userId}/block`);
    return response.data as { blocked: boolean; blockedByMe: boolean; blockedByThem: boolean };
  },

  blockUser: async (userId: string) => {
    const response = await apiClient.post(`/users/${userId}/block`);
    return response.data as { success: boolean; blocked: boolean };
  },

  unblockUser: async (userId: string) => {
    const response = await apiClient.delete(`/users/${userId}/block`);
    return response.data as { success: boolean; blocked: boolean };
  },
};

export const privatePhotosService = {
  requestAccess: async (userId: string) => {
    const response = await apiClient.post('/private-photos/requests', { userId });
    return response.data;
  },

  getRequests: async (params?: { status?: 'all' | 'pending' | 'approved' | 'denied' }) => {
    const response = await apiClient.get('/private-photos/requests', { params });
    return response.data;
  },

  approveRequest: async (requestId: string) => {
    const response = await apiClient.post(`/private-photos/requests/${requestId}/approve`);
    return response.data;
  },

  denyRequest: async (requestId: string) => {
    const response = await apiClient.post(`/private-photos/requests/${requestId}/deny`);
    return response.data;
  },

  revokeRequest: async (requestId: string) => {
    const response = await apiClient.post(`/private-photos/requests/${requestId}/revoke`);
    return response.data;
  },
};

export const invitesService = {
  listMine: async () => {
    const response = await apiClient.get('/invites');
    return response.data;
  },

  create: async () => {
    const response = await apiClient.post('/invites');
    return response.data;
  },

  revoke: async (inviteId: string) => {
    const response = await apiClient.post(`/invites/${inviteId}/revoke`);
    return response.data;
  },

  approve: async (inviteId: string) => {
    const response = await apiClient.post(`/invites/${inviteId}/approve`);
    return response.data;
  },

  deny: async (inviteId: string) => {
    const response = await apiClient.post(`/invites/${inviteId}/deny`);
    return response.data;
  },

  getRewardProgress: async (): Promise<{
    validatedCount: number;
    nextTier: { count: number; days: number; rewardType: string; label: string } | null;
    tiers: { count: number; days: number; rewardType: string; label: string; reached: boolean; granted: boolean }[];
    rewards: { rewardType: string; validInvitesCount: number; premiumDaysGranted: number; grantedAt: string }[];
    badges: { badgeType: string; earnedAt: string }[];
    recentEntries: {
      id: string;
      validationStatus: string;
      validatedAt: string | null;
      failedReason: string | null;
      actionsBitmask: number;
      validationDeadline: string | null;
      createdAt: string;
      inviteeName: string | null;
      inviteeAvatar: string | null;
    }[];
  }> => {
    const response = await apiClient.get('/invites/reward-progress');
    return response.data;
  },
};

// ── Programa de Indicação (Promotores) ──────────────────────────────────────
export type PromoterProfile = { id: string; fullName: string; pixKey: string; whatsapp: string | null; contactEmail: string | null; status: string; activatedAt: string };
export type PromoterCommission = { id: string; subscriptionAmount: number; commissionAmount: number; status: string; period: string | null; paidAt: string | null; createdAt: string };
export type PromoterStats = { invitesSent: number; totalSignups: number; totalSubscriptions: number; totalCommissionCents: number; pendingCents: number; approvedCents: number; paidCents: number };
export type PromoterReferredStatus = 'subscriber' | 'trial' | 'expired' | 'deactivated' | 'banned';
export type PromoterReferredUser = { id: string; name: string; avatar: string | null; status: PromoterReferredStatus; joinedAt: string; licenseEndAt: string | null };

export const promoterService = {
  activate: async (data: { fullName: string; pixKey: string; whatsapp?: string; contactEmail?: string; acceptTerms: true }) => {
    const response = await apiClient.post('/promoter/activate', data);
    return response.data;
  },
  getProfile: async (): Promise<{ promoter: PromoterProfile | null }> => {
    const response = await apiClient.get('/promoter/profile');
    return response.data;
  },
  getDashboard: async (): Promise<{ promoter: PromoterProfile; stats: PromoterStats; commissions: PromoterCommission[]; referredUsers: PromoterReferredUser[]; referredCounts: Record<string, number> }> => {
    const response = await apiClient.get('/promoter/dashboard');
    return response.data;
  },
};

export type SupportMessage = { id: string; senderType: 'promoter' | 'admin'; message: string; readAt: string | null; createdAt: string };

export const adminPromoterService = {
  listPromoters: async () => {
    const response = await apiClient.get('/admin/promoters');
    return response.data;
  },
  listCommissions: async (status?: string) => {
    const response = await apiClient.get('/admin/promoter-commissions', { params: status ? { status } : {} });
    return response.data;
  },
  updateCommissionStatus: async (id: string, status: 'pending' | 'approved' | 'paid' | 'cancelled') => {
    const response = await apiClient.patch(`/admin/promoter-commissions/${id}`, { status });
    return response.data;
  },
  batchApprove: async (period: string) => {
    const response = await apiClient.post('/admin/promoter-commissions/batch-approve', { period });
    return response.data;
  },
  batchPay: async (data: { period?: string; promoterUserId?: string }): Promise<{ ok: boolean; paid: number; promotersPaid: number; receiptsSent: number }> => {
    const response = await apiClient.post('/admin/promoter-commissions/batch-pay', data);
    return response.data;
  },
  listSupportChats: async (): Promise<{ chats: Array<{ userId: string; fullName: string; pixKey: string; isPromoter?: boolean; userEmail: string; userAvatar: string | null; lastMessage: string | null; lastMessageAt: string | null; unreadCount: number }> }> => {
    const response = await apiClient.get('/admin/promoter-support');
    return response.data;
  },
  getSupportMessages: async (userId: string): Promise<{ messages: SupportMessage[] }> => {
    const response = await apiClient.get(`/admin/promoter-support/${userId}`);
    return response.data;
  },
  sendSupportMessage: async (userId: string, message: string) => {
    const response = await apiClient.post(`/admin/promoter-support/${userId}`, { message });
    return response.data;
  },
  sendMonthlySummary: async (period: string): Promise<{ sent: number; errors: number; skipped: number; total: number; period: string; dueDate: string }> => {
    const response = await apiClient.post('/admin/promoters/send-monthly-summary', { period }, { timeout: 10 * 60 * 1000 });
    return response.data;
  },
  sendIncentive: async (): Promise<{ sent: number; errors: number; skipped: number; total: number }> => {
    const response = await apiClient.post('/admin/promoters/send-incentive', {}, { timeout: 10 * 60 * 1000 });
    return response.data;
  },
};

export const promoterSupportService = {
  getMessages: async (): Promise<{ messages: SupportMessage[] }> => {
    const response = await apiClient.get('/promoter/support');
    return response.data;
  },
  sendMessage: async (message: string) => {
    const response = await apiClient.post('/promoter/support', { message });
    return response.data;
  },
};

// Suporte geral (qualquer usuário) — mesmos endpoints, agora sem gate de promotor.
// Nome próprio para leitura clara fora do contexto de promotor (ex.: modal do PIX).
export const supportService = promoterSupportService;

export const testimonialsService = {
  create: async (profileUserId: string, content: string, mediaIds?: string[]) => {
    const response = await apiClient.post('/testimonials', { profileUserId, content, ...(mediaIds?.length ? { mediaIds } : {}) });
    return response.data;
  },
  respond: async (testimonialId: string, accept: boolean) => {
    const response = await apiClient.post(`/testimonials/${testimonialId}/respond`, { accept });
    return response.data;
  },
};

// Location Service
export const locationService = {
  getCities: async (query?: string, limit: number = 20) => {
    const response = await apiClient.get('/cities', { params: { q: query, limit } });
    return response.data;
  },

  getNearestCity: async (lat: number, lon: number) => {
    const response = await apiClient.get('/cities/nearest', { params: { lat, lon } });
    return response.data;
  },

  updateLocation: async (lat: number, lng: number) => {
    const response = await apiClient.put('/location', { lat, lng });
    return response.data;
  },

  registerVisit: async (targetUserId: string) => {
    const response = await apiClient.post(`/users/${targetUserId}/visit`);
    return response.data;
  },
};

export const onboardingService = {
  getSuggestions: async (params: { lookingFor: string[]; city?: string; state?: string }) => {
    const response = await apiClient.get('/onboarding/suggestions', {
      params: {
        lookingFor: params.lookingFor.join(','),
        city: params.city,
        state: params.state,
      },
    });
    return response.data;
  },
};

// Subscriptions Service
export const subscriptionsService = {
  getPlans: async () => {
    const response = await apiClient.get('/subscriptions/plans');
    return response.data;
  },

  getDiscount: async () => {
    const response = await apiClient.get('/subscriptions/discount');
    return response.data;
  },

  getStatus: async () => {
    const response = await apiClient.get('/subscriptions/status');
    return response.data;
  },

  checkout: async (
    planId: string,
    billingType: 'PIX' | 'BOLETO' | 'CREDIT_CARD' = 'PIX',
    billingData?: {
      billingLegalName?: string;
      billingDocument?: string;
      billingPersonType?: 'PF' | 'PJ';
    }
  ) => {
    const response = await apiClient.post('/subscriptions/checkout', {
      planId,
      billingType,
      ...billingData,
    });
    return response.data;
  },
};

// Events Service
export const eventsService = {
  createEvent: async (data: any) => {
    const response = await apiClient.post('/events', data);
    return response.data;
  },

  getEvents: async (params?: { myEvents?: boolean; upcoming?: boolean; city?: string }) => {
    const response = await apiClient.get('/events', { params });
    return response.data;
  },
};

// Admin Service
export const reportsService = {
  submit: async (data: {
    targetType: 'user' | 'post' | 'photo' | 'message';
    targetId: string;
    targetName?: string;
    reason: string;
    details?: string;
  }) => {
    const response = await apiClient.post('/reports', data);
    return response.data;
  },
};

export type ConversionFunnel = {
  funnel: Array<{ stage: string; count: number }>;
  overallConversionPct: number;
  nonConverters: { total: number; neverEngaged: number; engagedNoPix: number; generatedPixNoPay: number };
  conversionByEngagement: {
    engaged: { total: number; converted: number; ratePct: number };
    notEngaged: { total: number; converted: number; ratePct: number };
  };
};

export type PixAbandoner = {
  id: string;
  name: string;
  email: string;
  city: string;
  state: string;
  attempts: number;
  lastGeneratedAt: string | null;
};

export type MissingStateUser = {
  id: string;
  name: string;
  email: string;
  city: string;
  suggestedState: string | null;
  ambiguous: boolean;
};

export type SubscriptionAnalytics = {
  product: { id: string; code: string; name: string };
  currency: string;
  generatedAt: string;
  summary: {
    activeSubscribers: number;
    payingCustomersAllTime: number;
    newLast12mo: number;
    churnedLast12mo: number;
    revenueLast12moCents: number;
    mrrCents: number;
    arpuCents: number;
    churnRatePct: number;
    retentionRatePct: number;
    projectedNext12moCents: number;
    netMonthlyGrowthPct: number;
  };
  monthly: Array<{ month: string; revenueCents: number; newCustomers: number; renewals: number; churned: number }>;
  projection: Array<{ month: string; projectedRevenueCents: number }>;
};

export const adminService = {
  getPendingPhotos: async () => {
    const response = await apiClient.get('/admin/photos');
    return response.data;
  },

  approvePhoto: async (photoId: string) => {
    const response = await apiClient.put(`/admin/photos/${photoId}/approve`);
    return response.data;
  },

  rejectPhoto: async (photoId: string) => {
    const response = await apiClient.put(`/admin/photos/${photoId}/reject`);
    return response.data;
  },

  deletePhoto: async (photoId: string) => {
    const response = await apiClient.delete(`/admin/photos/${photoId}`);
    return response.data;
  },

  getUsers: async (params?: { page?: number; limit?: number; search?: string }) => {
    const response = await apiClient.get('/admin/users', { params });
    return response.data;
  },

  banUser: async (userId: string) => {
    const response = await apiClient.put(`/admin/users/${userId}/ban`);
    return response.data;
  },

  unbanUser: async (userId: string) => {
    const response = await apiClient.put(`/admin/users/${userId}/unban`);
    return response.data;
  },

  deactivateUser: async (userId: string) => {
    const response = await apiClient.put(`/admin/users/${userId}/deactivate`);
    return response.data;
  },

  reactivateUser: async (userId: string) => {
    const response = await apiClient.put(`/admin/users/${userId}/reactivate`);
    return response.data;
  },

  getLogs: async () => {
    const response = await apiClient.get('/admin/logs');
    return response.data;
  },

  getFinanceSummary: async () => {
    const response = await apiClient.get('/admin/finance/summary');
    return response.data;
  },

  getSubscriptionAnalytics: async (): Promise<SubscriptionAnalytics> => {
    const response = await apiClient.get('/admin/finance/subscription-analytics');
    return response.data;
  },

  getPixAbandoners: async (): Promise<{ users: PixAbandoner[]; total: number }> => {
    const response = await apiClient.get('/admin/finance/pix-abandoners');
    return response.data;
  },

  getConversionFunnel: async (periodDays?: number): Promise<ConversionFunnel> => {
    const response = await apiClient.get('/admin/finance/conversion-funnel', {
      params: periodDays ? { periodDays } : {},
    });
    return response.data;
  },

  getUsersMissingState: async (): Promise<{
    users: MissingStateUser[];
    total: number;
    withSuggestion: number;
    ambiguous: number;
  }> => {
    const response = await apiClient.get('/admin/users/missing-state');
    return response.data;
  },

  autofillUserStates: async (): Promise<{ updated: number; remaining: number }> => {
    const response = await apiClient.post('/admin/users/autofill-states');
    return response.data;
  },

  applyUserStates: async (updates: Array<{ userId: string; state: string }>): Promise<{ updated: number; skipped: number }> => {
    const response = await apiClient.post('/admin/users/apply-states', { updates });
    return response.data;
  },

  getPixAbandonment: async (): Promise<{
    eligibleUsers: number;
    convertedUsers: number;
    abandonedUsers: number;
    abandonmentRate: number;
    totalGenerations: number;
    graceHours: number;
  }> => {
    const response = await apiClient.get('/admin/finance/pix-abandonment');
    return response.data;
  },

  getRevenueReport: async (): Promise<{
    currency: string;
    planPriceCents: number;
    payingUsers: number;
    currentMrrCents: number;
    arrCents: number;
    growthRate: number;
    projected12mCents: number;
    history: Array<{ month: string; mrrCents: number; payingUsers: number; estimated: boolean }>;
    projection: Array<{ month: string; mrrCents: number }>;
    historyIsEstimated: boolean;
  }> => {
    const response = await apiClient.get('/admin/finance/revenue-report');
    return response.data;
  },

  getSuggestions: async (status?: string) => {
    const response = await apiClient.get('/admin/suggestions', { params: status && status !== 'all' ? { status } : {} });
    return response.data;
  },

  replySuggestion: async (id: string, reply: string, status?: string) => {
    const response = await apiClient.put(`/admin/suggestions/${id}/reply`, { reply, ...(status ? { status } : {}) });
    return response.data;
  },

  getVisitAnalytics: async (limit = 120, cityUsersPeriodDays?: number, accessPeriodDays?: number) => {
    const response = await apiClient.get('/admin/analytics/visits', {
      params: {
        limit,
        ...(cityUsersPeriodDays ? { cityUsersPeriodDays } : {}),
        ...(accessPeriodDays ? { accessPeriodDays } : {}),
      },
    });
    return response.data;
  },

  getSettings: async () => {
    const response = await apiClient.get('/admin/settings');
    return response.data;
  },

  getResourcesStatus: async () => {
    const response = await apiClient.get('/admin/resources-status');
    return response.data;
  },

  setSubscriptionsEnabled: async (enabled: boolean) => {
    const response = await apiClient.put('/admin/settings/subscriptions', { enabled });
    return response.data;
  },

  getReports: async (status: 'pending' | 'resolved' = 'pending') => {
    const response = await apiClient.get('/admin/reports', { params: { status } });
    return response.data;
  },

  resolveReport: async (reportId: string, action: 'ban' | 'warn' | 'remove_content' | 'dismiss' = 'dismiss', note?: string) => {
    const response = await apiClient.put(`/admin/reports/${reportId}/resolve`, { action, note });
    return response.data;
  },

  getReferralStats: async (): Promise<{
    statusCounts: Record<string, number>;
    tierStats: { rewardType: string; count: number; totalDays: number }[];
    topInviters: { userId: string; name: string; avatar: string | null; validatedCount: number }[];
    recentRewards: { id: string; inviterUserId: string; inviterName: string; inviterAvatar: string | null; rewardType: string; validInvitesCount: number; premiumDaysGranted: number; grantedAt: string }[];
    badgeCounts: Record<string, number>;
  }> => {
    const response = await apiClient.get('/admin/referral-stats');
    return response.data;
  },

  getReengagementUsers: async (params: { dateFrom?: string; dateTo?: string; search?: string; withPhoto?: boolean; emailSent?: boolean; page?: number }): Promise<{
    total: number;
    page: number;
    pages: number;
    users: Array<{
      id: string;
      name: string;
      email: string;
      avatar: string | null;
      createdAt: string | null;
      lastSeenAt: string | null;
      lastEmailSentAt: string | null;
      lastEmailStatus: string | null;
      emailSendCount: number;
      stats: { visits: number; likes: number; messages: number; matches: number };
    }>;
  }> => {
    const response = await apiClient.get('/admin/reengagement/users', { params });
    return response.data;
  },

  getReengagementMetrics: async (): Promise<{
    totalEmailed: number;
    totalSends: number;
    successfulSends: number;
    failedSends: number;
    returnedCount: number;
    returnRate: number;
    recentBatches: Array<{ batchAt: string; total: number; sent: number; errors: number }>;
    byPeriod: {
      last7d:  { sent: number; errors: number };
      last30d: { sent: number; errors: number };
      last90d: { sent: number; errors: number };
    };
    byDay: Array<{ date: string; sent: number; errors: number }>;
  }> => {
    const response = await apiClient.get('/admin/reengagement/metrics');
    return response.data;
  },

  sendReengagementEmails: async (userIds: string[]): Promise<{
    sent: number;
    errors: number;
    skipped: number;
    results: Array<{ userId: string; email: string; status: 'sent' | 'skipped' | 'error'; error?: string }>;
  }> => {
    const response = await apiClient.post('/admin/reengagement/send', { userIds });
    return response.data;
  },

  sendReengagementEmailsAll: async (filters: {
    dateFrom?: string; dateTo?: string; search?: string; withPhoto?: boolean; emailSent?: boolean;
  }): Promise<{ started: boolean; total: number }> => {
    // O backend responde imediatamente e processa o envio em segundo plano.
    const response = await apiClient.post('/admin/reengagement/send-all', filters);
    return response.data;
  },

  sendWinbackCampaign: async (params: {
    inactiveDays?: number;
    limit?: number;
    resend?: boolean;
    dryRun?: boolean;
    nonSubscribersOnly?: boolean;
  }): Promise<{ sent: number; errors: number; skipped: number; total: number; dryRun?: boolean }> => {
    const response = await apiClient.post('/admin/winback/send-all', params, { timeout: 10 * 60 * 1000 });
    return response.data;
  },

  sendPromoterCampaign: async (params?: {
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    withPhoto?: boolean;
    emailSent?: boolean;
    userIds?: string[];
  }): Promise<{ sent?: number; errors?: number; skipped?: number; total: number; started?: boolean }> => {
    // "Todos" (sem userIds) processa em segundo plano e responde { started, total };
    // selecionados respondem síncrono com { sent, errors, skipped, total }.
    const response = await apiClient.post('/admin/reengagement/send-promoter-campaign', params ?? {});
    return response.data;
  },

  getMetrics: async (filters?: { city?: string; state?: string; gender?: string }) => {
    const response = await apiClient.get('/admin/metrics', { params: filters });
    return response.data as {
      filters: { city: string; state: string; gender: string };
      acquisition: {
        total: number; today: number; last7days: number; last30days: number;
        byDay: { date: string; count: number }[];
        byGender: { gender: string; count: number }[];
        byCity: { city: string; uf?: string; count: number }[];
        byState: { state: string; count: number }[];
        byOrigin: { origin: string; count: number }[];
      };
      activation: {
        addedPhoto: number; addedVideo: number; likedProfile: number;
        receivedLike: number; sentFirstMessage: number; visitedProfile: number; total: number;
      };
      retention: {
        activeToday: number; active7days: number; active30days: number;
        active2plusWeek: number; neverReturned: number;
        inactiveSince3days: number; inactiveSince7days: number;
        inactiveSince15days: number; inactiveSince30days: number;
      };
      revenue: {
        totalPaying: number; payingMen: number; trialCount: number;
        trialConverted: number; trialConversionRate: number;
      };
    };
  },
};

export const missionsService = {
  getToday: async (): Promise<{
    missions: Array<{
      id: string;
      title: string;
      description: string;
      icon: string;
      target: number;
      progress: number;
      completed: boolean;
      reward: string;
      rewardIcon: string;
    }>;
    completedCount: number;
    totalCount: number;
    date: string;
  }> => {
    const response = await apiClient.get('/missions/today');
    return response.data;
  },
};

export const suggestionsService = {
  submit: async (data: { category: string; content: string }) => {
    const response = await apiClient.post('/suggestions', data);
    return response.data;
  },
  getMine: async () => {
    const response = await apiClient.get('/suggestions/mine');
    return response.data;
  },
};


export type StoryMine = {
  id: string; mediaUrl: string | null; mimeType: string;
  text?: string | null; background?: string | null;
  createdAt: string; expiresAt: string;
  viewCount: number; commentCount: number; likeCount: number;
};

export type StoryFeedItem = {
  id: string; mediaUrl: string | null; mimeType: string;
  text?: string | null; background?: string | null;
  createdAt: string; expiresAt: string; viewed: boolean;
  likeCount: number; likedByMe: boolean; myReaction?: string | null;
  reactions?: Array<{ type: string; count: number }>;
  author: {
    id: string; name: string; gender: string | null; avatar: string | null;
    age: number | null; partnerAge: number | null;
    city: string | null; state: string | null; bio: string | null;
    fetiches: string[]; intentions: string[];
    distanceKm: number | null;
  };
};

export const storiesService = {
  getMyStory: async () => {
    const res = await apiClient.get('/stories/me');
    return res.data as {
      story: null | StoryMine;
      stories?: StoryMine[];
    };
  },
  getFeed: async () => {
    const res = await apiClient.get('/stories');
    return res.data as { stories: StoryFeedItem[] };
  },
  create: async (mediaId: string, opts?: { text?: string; textOverlay?: { x: number; y: number; color: string; size: string } }) => {
    const res = await apiClient.post('/stories', {
      mediaId,
      ...(opts?.text ? { text: opts.text } : {}),
      ...(opts?.text && opts?.textOverlay ? { textOverlay: opts.textOverlay } : {}),
    });
    return res.data as { id: string; expiresAt: string };
  },
  createText: async (text: string, background: string) => {
    const res = await apiClient.post('/stories', { text, background });
    return res.data as { id: string; expiresAt: string };
  },
  remove: async (id: string) => {
    const res = await apiClient.delete(`/stories/${id}`);
    return res.data;
  },
  view: async (id: string) => {
    const res = await apiClient.post(`/stories/${id}/view`, {});
    return res.data;
  },
  getViewers: async (id: string) => {
    const res = await apiClient.get(`/stories/${id}/viewers`);
    return res.data as { viewers: Array<{ id: string; name: string; avatar: string | null; viewedAt: string; reaction: string | null; comment: string | null }> };
  },
  addComment: async (id: string, text: string) => {
    const res = await apiClient.post(`/stories/${id}/comments`, { text });
    return res.data;
  },
  getComments: async (id: string) => {
    const res = await apiClient.get(`/stories/${id}/comments`);
    return res.data as { comments: Array<{ id: string; text: string; createdAt: string; commenter: { id: string; name: string; avatar: string | null } }> };
  },
  like: async (id: string, reaction?: 'heart' | 'love' | 'wow' | 'devil' | 'fire' | 'splash' | 'hot') => {
    const res = await apiClient.post(`/stories/${id}/like`, reaction ? { reaction } : {});
    return res.data as { liked: boolean; likeCount: number; myReaction: string | null; reactions: Array<{ type: string; count: number }> };
  },
};

export interface TokenSummary {
  points: number;
  total: number;
  freeDays: number;
  pointsPerDay: number;
  nextDayProgress: number;
  boostUntil?: string | null;
  boostCost?: number;
  boostHours?: number;
  history: Array<{ action: string; points: number; createdAt: string }>;
}

export interface TokenRankingEntry {
  position: number;
  id: string;
  name: string;
  avatar: string | null;
  gender: string | null;
  total: number;
  isMe: boolean;
}

export const tokenService = {
  me: async (): Promise<TokenSummary> => {
    const res = await apiClient.get('/tokens/me');
    return res.data as TokenSummary;
  },
  ranking: async (type: 'homem' | 'mulher' | 'casal'): Promise<{ type: string; ranking: TokenRankingEntry[] }> => {
    const res = await apiClient.get('/tokens/ranking', { params: { type } });
    return res.data;
  },
  gift: async (toUserId: string, amount: number, message?: string): Promise<{ ok: boolean; balance: number; recipientName: string }> => {
    const res = await apiClient.post('/tokens/gift', { toUserId, amount, message: message?.trim() || undefined });
    return res.data;
  },
  boost: async (): Promise<{ ok: boolean; balance: number; boostUntil: string; boostHours: number }> => {
    const res = await apiClient.post('/tokens/boost', {});
    return res.data;
  },
};

export interface NearbyRadar {
  id: string;
  message: string;
  senderName: string;
  senderAvatar: string | null;
  city: string | null;
  state: string | null;
  distanceKm: number | null;
  createdAt: string;
  expiresAt: string;
}
export interface NearbyEvent {
  id: string;
  title: string;
  location: string;
  date: string;
  coverImage: string | null;
  createdBy: string;
  creatorAvatar: string | null;
}
export const nearbyActivityService = {
  get: async (): Promise<{ radars: NearbyRadar[]; events: NearbyEvent[] }> => {
    const res = await apiClient.get('/feed/nearby-activity');
    return res.data;
  },
};
