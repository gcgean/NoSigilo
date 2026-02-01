import { useState } from 'react';
import { Search, Send, Phone, Video, MoreVertical, ArrowLeft, Image, Smile } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

const mockConversations = [
  {
    id: '1',
    user: {
      name: 'Marina Santos',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100',
      online: true,
    },
    lastMessage: 'Oi! Tudo bem com você?',
    time: '2 min',
    unread: 2,
  },
  {
    id: '2',
    user: {
      name: 'Carolina Lima',
      avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100',
      online: false,
    },
    lastMessage: 'Adorei conhecer você! 😊',
    time: '1h',
    unread: 0,
  },
  {
    id: '3',
    user: {
      name: 'Julia Mendes',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100',
      online: true,
    },
    lastMessage: 'Vamos marcar algo?',
    time: '3h',
    unread: 0,
  },
];

const mockMessages = [
  { id: '1', content: 'Oi! Vi seu perfil e achei muito interessante 😊', fromMe: false, time: '10:30' },
  { id: '2', content: 'Olá! Obrigada, o seu também!', fromMe: true, time: '10:32' },
  { id: '3', content: 'Você gosta de viajar?', fromMe: false, time: '10:33' },
  { id: '4', content: 'Sim, amo! Qual seu destino favorito?', fromMe: true, time: '10:35' },
  { id: '5', content: 'Oi! Tudo bem com você?', fromMe: false, time: '10:40' },
];

export default function Chat() {
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');

  const selectedConversation = mockConversations.find(c => c.id === selectedChat);

  const handleSendMessage = () => {
    if (!message.trim()) return;
    // Would send message to API
    setMessage('');
  };

  return (
    <div className="h-[calc(100vh-8rem)] md:ml-64 flex">
      {/* Conversations List */}
      <div className={cn(
        "w-full md:w-80 border-r flex flex-col",
        selectedChat && "hidden md:flex"
      )}>
        <div className="p-4 border-b">
          <h1 className="text-xl font-bold mb-4">Mensagens</h1>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar conversas..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {mockConversations.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => setSelectedChat(conversation.id)}
              className={cn(
                "w-full p-4 flex items-center gap-3 hover:bg-secondary/50 transition-colors border-b",
                selectedChat === conversation.id && "bg-secondary"
              )}
            >
              <div className="relative">
                <Avatar>
                  <AvatarImage src={conversation.user.avatar} />
                  <AvatarFallback>{conversation.user.name[0]}</AvatarFallback>
                </Avatar>
                {conversation.user.online && (
                  <span className="absolute bottom-0 right-0 w-3 h-3 bg-success rounded-full ring-2 ring-background" />
                )}
              </div>
              <div className="flex-1 text-left">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{conversation.user.name}</span>
                  <span className="text-xs text-muted-foreground">{conversation.time}</span>
                </div>
                <p className="text-sm text-muted-foreground truncate">{conversation.lastMessage}</p>
              </div>
              {conversation.unread > 0 && (
                <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                  {conversation.unread}
                </span>
              )}
            </button>
          ))}
        </ScrollArea>
      </div>

      {/* Chat Area */}
      {selectedChat ? (
        <div className="flex-1 flex flex-col">
          {/* Chat Header */}
          <div className="p-4 border-b flex items-center justify-between glass">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setSelectedChat(null)}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <Avatar>
                <AvatarImage src={selectedConversation?.user.avatar} />
                <AvatarFallback>{selectedConversation?.user.name[0]}</AvatarFallback>
              </Avatar>
              <div>
                <h2 className="font-semibold">{selectedConversation?.user.name}</h2>
                <span className="text-xs text-success">Online</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon">
                <Phone className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon">
                <Video className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon">
                <MoreVertical className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {mockMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex",
                    msg.fromMe ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[70%] px-4 py-2 rounded-2xl",
                      msg.fromMe
                        ? "bg-gradient-primary text-primary-foreground rounded-br-sm"
                        : "bg-secondary rounded-bl-sm"
                    )}
                  >
                    <p>{msg.content}</p>
                    <span className={cn(
                      "text-xs mt-1 block",
                      msg.fromMe ? "text-primary-foreground/70" : "text-muted-foreground"
                    )}>
                      {msg.time}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Message Input */}
          <div className="p-4 border-t glass">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon">
                <Image className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon">
                <Smile className="w-5 h-5" />
              </Button>
              <Input
                placeholder="Digite sua mensagem..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                className="flex-1"
              />
              <Button
                size="icon"
                className="bg-gradient-primary hover:opacity-90"
                onClick={handleSendMessage}
                disabled={!message.trim()}
              >
                <Send className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center text-muted-foreground">
          <div className="text-center">
            <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
              <Send className="w-10 h-10 text-muted-foreground" />
            </div>
            <p className="text-lg">Selecione uma conversa para começar</p>
          </div>
        </div>
      )}
    </div>
  );
}
