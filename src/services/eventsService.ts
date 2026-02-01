import apiClient from '@/utils/apiClient';

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';

export interface Event {
  id: string;
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  eventType: string;
  image?: string;
  maxAttendees: number;
  attendeesCount: number;
  isPrivate: boolean;
  isPremium: boolean;
  createdBy: string;
  createdAt: Date;
}

export interface EventNotificationSettings {
  enabled: boolean;
  targetCities: string[];
  targetGender: string[];
  radius: number;
  ageRange: [number, number];
  onlyVerified: boolean;
  onlyPremium: boolean;
  customMessage?: string;
}

export interface CreateEventData {
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  eventType: string;
  maxAttendees: number;
  isPrivate: boolean;
  notificationSettings: EventNotificationSettings;
}

export interface EventInvite {
  id: string;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  eventLocation: string;
  eventType: string;
  hostName: string;
  hostAvatar?: string;
  customMessage?: string;
  receivedAt: Date;
  isRead: boolean;
}

export const eventsService = {
  // Create a new event
  createEvent: async (data: CreateEventData): Promise<{ event: Event; notificationsSent: number }> => {
    if (USE_MOCKS) {
      const event: Event = {
        id: Date.now().toString(),
        title: data.title,
        description: data.description,
        date: data.date,
        time: data.time,
        location: data.location,
        eventType: data.eventType,
        maxAttendees: data.maxAttendees,
        attendeesCount: 1,
        isPrivate: data.isPrivate,
        isPremium: false,
        createdBy: 'user-1',
        createdAt: new Date(),
      };
      
      // Simulate notification count based on settings
      const notificationsSent = data.notificationSettings.enabled 
        ? Math.floor(Math.random() * 500) + 100 
        : 0;
      
      return { event, notificationsSent };
    }
    const response = await apiClient.post('/events', data);
    return response.data;
  },

  // Get all events
  getEvents: async (params?: { 
    city?: string; 
    upcoming?: boolean;
    myEvents?: boolean;
  }): Promise<Event[]> => {
    if (USE_MOCKS) {
      return [];
    }
    const response = await apiClient.get('/events', { params });
    return response.data;
  },

  // Get event by ID
  getEvent: async (eventId: string): Promise<Event> => {
    if (USE_MOCKS) {
      throw new Error('Event not found');
    }
    const response = await apiClient.get(`/events/${eventId}`);
    return response.data;
  },

  // Attend event
  attendEvent: async (eventId: string): Promise<void> => {
    if (USE_MOCKS) return;
    await apiClient.post(`/events/${eventId}/attend`);
  },

  // Leave event
  leaveEvent: async (eventId: string): Promise<void> => {
    if (USE_MOCKS) return;
    await apiClient.delete(`/events/${eventId}/attend`);
  },

  // Get event invites (notifications received)
  getInvites: async (): Promise<EventInvite[]> => {
    if (USE_MOCKS) {
      return [
        {
          id: '1',
          eventId: 'e1',
          eventTitle: 'Festa de Carnaval',
          eventDate: '2025-03-01',
          eventLocation: 'Rio de Janeiro, RJ',
          eventType: 'party',
          hostName: 'Carlos',
          hostAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200',
          customMessage: 'Venha curtir o melhor carnaval da cidade!',
          receivedAt: new Date(Date.now() - 3600000),
          isRead: false,
        }
      ];
    }
    const response = await apiClient.get('/events/invites');
    return response.data;
  },

  // Mark invite as read
  markInviteAsRead: async (inviteId: string): Promise<void> => {
    if (USE_MOCKS) return;
    await apiClient.patch(`/events/invites/${inviteId}/read`);
  },

  // Send additional invites to an existing event
  sendInvites: async (
    eventId: string, 
    settings: EventNotificationSettings
  ): Promise<{ sent: number }> => {
    if (USE_MOCKS) {
      return { sent: Math.floor(Math.random() * 200) + 50 };
    }
    const response = await apiClient.post(`/events/${eventId}/invites`, settings);
    return response.data;
  },

  // Get attendees of an event
  getAttendees: async (eventId: string): Promise<{
    id: string;
    name: string;
    avatar?: string;
    isVerified: boolean;
  }[]> => {
    if (USE_MOCKS) {
      return [];
    }
    const response = await apiClient.get(`/events/${eventId}/attendees`);
    return response.data;
  },

  // Delete event
  deleteEvent: async (eventId: string): Promise<void> => {
    if (USE_MOCKS) return;
    await apiClient.delete(`/events/${eventId}`);
  },

  // Update event
  updateEvent: async (eventId: string, data: Partial<CreateEventData>): Promise<Event> => {
    if (USE_MOCKS) {
      throw new Error('Event not found');
    }
    const response = await apiClient.put(`/events/${eventId}`, data);
    return response.data;
  },
};
