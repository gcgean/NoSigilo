import apiClient from '@/utils/apiClient';
import { compressImageFile } from '@/utils/mediaCompression';
import axios from 'axios';

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';

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
    return response.data;
  },

  checkEmail: async (email: string) => {
    if (USE_MOCKS) {
      return { available: true };
    }
    const response = await apiClient.post('/auth/check-email', { email });
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
};

// Feed Service
export const feedService = {
  getFeed: async (params?: { page?: number; limit?: number }) => {
    if (USE_MOCKS) {
      return { posts: [], hasMore: false };
    }
    const response = await apiClient.get('/feed', { params });
    return response.data;
  },

  createPost: async (data: { content: string; mediaIds?: string[] }) => {
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

  getVisits: async () => {
    const response = await apiClient.get('/profile/visits');
    return response.data;
  },

  getStats: async () => {
    const response = await apiClient.get('/profile/stats');
    return response.data;
  },

  uploadMedia: async (file: File, options?: { isPrivate?: boolean }) => {
    let uploadFile = file;
    if (file.type.startsWith('image/')) {
      uploadFile = await compressImageFile(file, { maxDimension: 1600, quality: 0.82, maxBytes: 1800 * 1024 });
    }
    if (file.type.startsWith('video/') && file.size > 50 * 1024 * 1024) {
      throw new Error('Arquivo de vídeo muito grande (máximo 50MB)');
    }
    if (file.type.startsWith('image/') && uploadFile.size > 4 * 1024 * 1024) {
      throw new Error('A foto ainda ficou grande demais para envio pelo celular. Tente uma imagem menor.');
    }
    const formData = new FormData();
    formData.append('file', uploadFile);
    try {
      const response = await apiClient.post('/media/upload', formData, {
        params: { isPrivate: options?.isPrivate ? 1 : 0 },
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 413) {
        throw new Error('A foto ficou maior do que o limite aceito pelo servidor. Tente uma imagem menor.');
      }
      throw error;
    }
  },

  setMainPhoto: async (mediaId: string) => {
    const response = await apiClient.patch(`/media/${mediaId}/main`);
    return response.data;
  },

  deleteMedia: async (mediaId: string) => {
    const response = await apiClient.delete(`/media/${mediaId}`);
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

  getSuggestions: async () => {
    const response = await apiClient.get('/match/suggestions');
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

  sendMessage: async (conversationId: string, data: { content?: string; mediaId?: string; clientId?: string; isViewOnce?: boolean }) => {
    const response = await apiClient.post(`/conversations/${conversationId}/messages`, data);
    return response.data;
  },

  deleteConversation: async (conversationId: string) => {
    const response = await apiClient.delete(`/conversations/${conversationId}`);
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
};

// Likes & Comments Service
export const interactionsService = {
  like: async (targetType: 'post' | 'photo', targetId: string) => {
    const response = await apiClient.post('/likes', { targetType, targetId });
    return response.data;
  },

  unlike: async (targetType: 'post' | 'photo', targetId: string) => {
    const response = await apiClient.delete('/likes', { data: { targetType, targetId } });
    return response.data;
  },

  getLikes: async (targetType: string, targetId: string) => {
    const response = await apiClient.get('/likes', { params: { targetType, targetId } });
    return response.data;
  },

  comment: async (targetType: string, targetId: string, content: string) => {
    const response = await apiClient.post('/comments', { targetType, targetId, content });
    return response.data;
  },

  getComments: async (targetType: string, targetId: string) => {
    const response = await apiClient.get('/comments', { params: { targetType, targetId } });
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

export const usersService = {
  getUser: async (userId: string) => {
    const response = await apiClient.get(`/users/${userId}`);
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
};

export const privatePhotosService = {
  requestAccess: async (userId: string) => {
    const response = await apiClient.post('/private-photos/requests', { userId });
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
};

export const testimonialsService = {
  create: async (profileUserId: string, content: string) => {
    const response = await apiClient.post('/testimonials', { profileUserId, content });
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

  checkout: async (planId: string) => {
    const response = await apiClient.post('/subscriptions/checkout', { planId });
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

  getUsers: async () => {
    const response = await apiClient.get('/admin/users');
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

  getLogs: async () => {
    const response = await apiClient.get('/admin/logs');
    return response.data;
  },

  getFinanceSummary: async () => {
    const response = await apiClient.get('/admin/finance/summary');
    return response.data;
  },
};
