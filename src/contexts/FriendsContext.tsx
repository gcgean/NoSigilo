import React, { createContext, useContext, useState, ReactNode } from 'react';

interface Friend {
  id: string;
  name: string;
  avatar?: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

interface FriendRequest {
  id: string;
  fromUser: {
    id: string;
    name: string;
    avatar?: string;
  };
  createdAt: string;
}

interface FriendsContextType {
  friends: Friend[];
  friendRequests: FriendRequest[];
  sendFriendRequest: (userId: string) => Promise<void>;
  acceptFriendRequest: (requestId: string) => Promise<void>;
  rejectFriendRequest: (requestId: string) => Promise<void>;
  removeFriend: (friendId: string) => void;
  isFriend: (userId: string) => boolean;
  hasPendingRequest: (userId: string) => boolean;
}

const FriendsContext = createContext<FriendsContextType | undefined>(undefined);

export function FriendsProvider({ children }: { children: ReactNode }) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);

  const sendFriendRequest = async (userId: string) => {
    // In demo mode, simulate sending request
    console.log('Sending friend request to:', userId);
  };

  const acceptFriendRequest = async (requestId: string) => {
    const request = friendRequests.find(r => r.id === requestId);
    if (request) {
      setFriends(prev => [...prev, {
        id: request.fromUser.id,
        name: request.fromUser.name,
        avatar: request.fromUser.avatar,
        status: 'accepted',
        createdAt: new Date().toISOString(),
      }]);
      setFriendRequests(prev => prev.filter(r => r.id !== requestId));
    }
  };

  const rejectFriendRequest = async (requestId: string) => {
    setFriendRequests(prev => prev.filter(r => r.id !== requestId));
  };

  const removeFriend = (friendId: string) => {
    setFriends(prev => prev.filter(f => f.id !== friendId));
  };

  const isFriend = (userId: string) => {
    return friends.some(f => f.id === userId && f.status === 'accepted');
  };

  const hasPendingRequest = (userId: string) => {
    return friendRequests.some(r => r.fromUser.id === userId);
  };

  return (
    <FriendsContext.Provider
      value={{
        friends,
        friendRequests,
        sendFriendRequest,
        acceptFriendRequest,
        rejectFriendRequest,
        removeFriend,
        isFriend,
        hasPendingRequest,
      }}
    >
      {children}
    </FriendsContext.Provider>
  );
}

export function useFriends() {
  const context = useContext(FriendsContext);
  if (context === undefined) {
    throw new Error('useFriends must be used within a FriendsProvider');
  }
  return context;
}
