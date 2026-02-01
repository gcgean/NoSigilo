import apiClient from '@/utils/apiClient';

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

  uploadMedia: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post('/media/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
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
  getCards: async (params?: { page?: number }) => {
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

  createConversation: async (userId: string) => {
    const response = await apiClient.post('/conversations', { userId });
    return response.data;
  },

  getMessages: async (conversationId: string, params?: { page?: number }) => {
    const response = await apiClient.get(`/conversations/${conversationId}/messages`, { params });
    return response.data;
  },

  sendMessage: async (conversationId: string, content: string) => {
    const response = await apiClient.post(`/conversations/${conversationId}/messages`, { content });
    return response.data;
  },
};

// Likes & Comments Service
export const interactionsService = {
  like: async (targetType: 'post' | 'photo', targetId: string) => {
    const response = await apiClient.post('/likes', { targetType, targetId });
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
};

// Location Service
export const locationService = {
  getCities: async (query?: string) => {
    const response = await apiClient.get('/cities', { params: { q: query } });
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
