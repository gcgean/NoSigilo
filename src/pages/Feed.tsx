import { useState } from 'react';
import { Image, Video, Send, Heart, MessageCircle, Share2, MoreHorizontal, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const mockPosts = [
  {
    id: '1',
    author: {
      name: 'Marina Santos',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100',
      verified: true,
    },
    content: 'Curtindo esse fim de tarde incrível! ☀️✨',
    image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
    likes: 127,
    comments: 23,
    createdAt: '2h atrás',
    liked: false,
  },
  {
    id: '2',
    author: {
      name: 'Carolina Lima',
      avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100',
      verified: true,
    },
    content: 'Novo ensaio fotográfico! O que acharam? 📸',
    image: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=800',
    likes: 89,
    comments: 15,
    createdAt: '4h atrás',
    liked: true,
  },
];

const recentPhotos = [
  'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=200',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200',
  'https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?w=200',
  'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=200',
];

export default function Feed() {
  const [postContent, setPostContent] = useState('');
  const [posts, setPosts] = useState(mockPosts);

  const handleLike = (postId: string) => {
    setPosts(posts.map(post => 
      post.id === postId 
        ? { ...post, liked: !post.liked, likes: post.liked ? post.likes - 1 : post.likes + 1 }
        : post
    ));
  };

  return (
    <div className="max-w-2xl mx-auto md:ml-64">
      {/* Composer */}
      <Card className="p-4 mb-6 glass">
        <div className="flex gap-4">
          <Avatar>
            <AvatarImage src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100" />
            <AvatarFallback>U</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <Textarea
              placeholder="O que está pensando?"
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
              className="resize-none border-0 bg-transparent focus-visible:ring-0 p-0 text-base"
              rows={2}
            />
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-primary">
                  <Image className="w-5 h-5" />
                  Foto
                </Button>
                <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-primary">
                  <Video className="w-5 h-5" />
                  Vídeo
                </Button>
              </div>
              <Button 
                size="sm" 
                className="bg-gradient-primary hover:opacity-90 gap-2"
                disabled={!postContent.trim()}
              >
                <Send className="w-4 h-4" />
                Publicar
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Posts Feed */}
        <div className="md:col-span-2 space-y-6">
          {posts.map((post) => (
            <Card key={post.id} className="overflow-hidden glass">
              {/* Post Header */}
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarImage src={post.author.avatar} />
                    <AvatarFallback>{post.author.name[0]}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{post.author.name}</span>
                      {post.author.verified && (
                        <Sparkles className="w-4 h-4 text-primary" />
                      )}
                    </div>
                    <span className="text-sm text-muted-foreground">{post.createdAt}</span>
                  </div>
                </div>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="w-5 h-5" />
                </Button>
              </div>

              {/* Post Content */}
              <div className="px-4 pb-3">
                <p>{post.content}</p>
              </div>

              {/* Post Image */}
              {post.image && (
                <div className="relative">
                  <img src={post.image} alt="" className="w-full aspect-video object-cover" />
                </div>
              )}

              {/* Post Actions */}
              <div className="p-4 flex items-center justify-between border-t">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => handleLike(post.id)}
                    className={cn(
                      "flex items-center gap-2 transition-colors",
                      post.liked ? "text-primary" : "text-muted-foreground hover:text-primary"
                    )}
                  >
                    <Heart className={cn("w-5 h-5", post.liked && "fill-current")} />
                    <span className="text-sm font-medium">{post.likes}</span>
                  </button>
                  <button className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
                    <MessageCircle className="w-5 h-5" />
                    <span className="text-sm font-medium">{post.comments}</span>
                  </button>
                </div>
                <button className="text-muted-foreground hover:text-foreground transition-colors">
                  <Share2 className="w-5 h-5" />
                </button>
              </div>
            </Card>
          ))}
        </div>

        {/* Sidebar */}
        <div className="hidden md:block space-y-6">
          {/* Recent Photos */}
          <Card className="p-4 glass">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Image className="w-4 h-4 text-primary" />
              Fotos Recentes
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {recentPhotos.map((photo, idx) => (
                <div key={idx} className="aspect-square rounded-lg overflow-hidden cursor-pointer hover:opacity-80 transition-opacity">
                  <img src={photo} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </Card>

          {/* Premium Banner */}
          <Card className="p-4 bg-gradient-to-br from-gold/20 to-primary/20 border-gold/30">
            <Badge className="bg-gold text-black mb-3">Premium</Badge>
            <h3 className="font-semibold mb-2">Destaque seu perfil</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Apareça mais e tenha acesso a recursos exclusivos.
            </p>
            <Button className="w-full bg-gold text-black hover:bg-gold/90">
              Ver Planos
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
