import apiClient from '@/utils/apiClient';

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';

export interface RadarBroadcast {
  id: string;
  userId: string;
  city: string;
  state: string;
  message: string;
  targetGender: string[];
  radius: number;
  duration: number;
  expiresAt: Date;
  createdAt: Date;
  isActive: boolean;
  viewsCount: number;
  responsesCount: number;
}

export interface RadarNotification {
  id: string;
  broadcastId: string;
  senderId: string;
  senderName?: string;
  senderAvatar?: string;
  senderAge?: number;
  city: string;
  state: string;
  message: string;
  isAnonymous: boolean;
  receivedAt: Date;
  isRead: boolean;
}

export interface CreateBroadcastData {
  city: string;
  state: string;
  message: string;
  targetGender: string[];
  radius: number;
  duration: number;
  isAnonymous: boolean;
  onlyOnline: boolean;
}

// Mock data for demo mode
const mockBroadcasts: RadarBroadcast[] = [
  {
    id: '1',
    userId: 'user-1',
    city: 'Fortaleza',
    state: 'CE',
    message: 'Estou de passagem pela cidade e adoraria conhecer pessoas interessantes! 😊',
    targetGender: ['female'],
    radius: 25,
    duration: 24,
    expiresAt: new Date(Date.now() + 86400000),
    createdAt: new Date(Date.now() - 3600000),
    isActive: true,
    viewsCount: 47,
    responsesCount: 12,
  }
];

const mockNotifications: RadarNotification[] = [
  {
    id: '1',
    broadcastId: 'b1',
    senderId: 'user-2',
    senderName: 'Carlos',
    senderAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200',
    senderAge: 32,
    city: 'São Paulo',
    state: 'SP',
    message: 'Viajando a trabalho e com tempo livre para drinks e boas conversas 🍷',
    isAnonymous: false,
    receivedAt: new Date(Date.now() - 1800000),
    isRead: false,
  },
  {
    id: '2',
    broadcastId: 'b2',
    senderId: 'user-3',
    city: 'São Paulo',
    state: 'SP',
    message: 'Chegando na cidade esse fim de semana! Quem topa um rolê? 🎉',
    isAnonymous: true,
    receivedAt: new Date(Date.now() - 7200000),
    isRead: false,
  }
];

export const radarService = {
  // Create a new broadcast
  createBroadcast: async (data: CreateBroadcastData): Promise<RadarBroadcast> => {
    if (USE_MOCKS) {
      const newBroadcast: RadarBroadcast = {
        id: Date.now().toString(),
        userId: 'user-1',
        ...data,
        expiresAt: new Date(Date.now() + data.duration * 3600000),
        createdAt: new Date(),
        isActive: true,
        viewsCount: 0,
        responsesCount: 0,
      };
      mockBroadcasts.push(newBroadcast);
      return newBroadcast;
    }
    const response = await apiClient.post('/radar/broadcast', data);
    return response.data;
  },

  // Get user's active broadcasts
  getMyBroadcasts: async (): Promise<RadarBroadcast[]> => {
    if (USE_MOCKS) {
      return mockBroadcasts;
    }
    const response = await apiClient.get('/radar/broadcasts');
    return response.data;
  },

  // Deactivate a broadcast
  deactivateBroadcast: async (broadcastId: string): Promise<void> => {
    if (USE_MOCKS) {
      const broadcast = mockBroadcasts.find(b => b.id === broadcastId);
      if (broadcast) broadcast.isActive = false;
      return;
    }
    await apiClient.delete(`/radar/broadcast/${broadcastId}`);
  },

  // Get radar notifications (broadcasts targeting the user)
  getNotifications: async (): Promise<RadarNotification[]> => {
    if (USE_MOCKS) {
      return mockNotifications;
    }
    const response = await apiClient.get('/radar/notifications');
    return response.data;
  },

  // Mark notification as read
  markAsRead: async (notificationId: string): Promise<void> => {
    if (USE_MOCKS) {
      const notification = mockNotifications.find(n => n.id === notificationId);
      if (notification) notification.isRead = true;
      return;
    }
    await apiClient.patch(`/radar/notifications/${notificationId}/read`);
  },

  // Respond to a broadcast (starts a conversation)
  respondToBroadcast: async (broadcastId: string, message: string): Promise<{ conversationId: string }> => {
    if (USE_MOCKS) {
      return { conversationId: `conv-${Date.now()}` };
    }
    const response = await apiClient.post(`/radar/broadcast/${broadcastId}/respond`, { message });
    return response.data;
  },

  // Dismiss a notification (won't show again)
  dismissNotification: async (notificationId: string): Promise<void> => {
    if (USE_MOCKS) {
      const index = mockNotifications.findIndex(n => n.id === notificationId);
      if (index > -1) mockNotifications.splice(index, 1);
      return;
    }
    await apiClient.delete(`/radar/notifications/${notificationId}`);
  },

  // Get cities with active travelers (for discovery)
  getActiveCities: async (): Promise<{ city: string; state: string; count: number }[]> => {
    if (USE_MOCKS) {
      return [
        { city: 'São Paulo', state: 'SP', count: 24 },
        { city: 'Rio de Janeiro', state: 'RJ', count: 18 },
        { city: 'Fortaleza', state: 'CE', count: 12 },
        { city: 'Salvador', state: 'BA', count: 9 },
        { city: 'Florianópolis', state: 'SC', count: 7 },
      ];
    }
    const response = await apiClient.get('/radar/cities/active');
    return response.data;
  },

  // Get broadcast statistics
  getBroadcastStats: async (broadcastId: string): Promise<{
    views: number;
    responses: number;
    uniqueViewers: number;
    responseRate: number;
  }> => {
    if (USE_MOCKS) {
      return {
        views: 47,
        responses: 12,
        uniqueViewers: 42,
        responseRate: 0.286,
      };
    }
    const response = await apiClient.get(`/radar/broadcast/${broadcastId}/stats`);
    return response.data;
  },
};
