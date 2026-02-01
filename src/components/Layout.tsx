import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Home, 
  Heart, 
  MessageCircle, 
  User, 
  Bell, 
  Search,
  Sparkles,
  LogOut,
  Settings,
  Calendar,
  Shield,
  Star,
  Radio
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const navItems = [
  { path: '/feed', icon: Home, label: 'Feed' },
  { path: '/match', icon: Heart, label: 'Match' },
  { path: '/radar', icon: Radio, label: 'Radar' },
  { path: '/chat', icon: MessageCircle, label: 'Chat' },
  { path: '/profile', icon: User, label: 'Perfil' },
];

const extraNavItems = [
  { path: '/search', icon: Search, label: 'Buscar' },
  { path: '/events', icon: Calendar, label: 'Eventos' },
  { path: '/favorites', icon: Star, label: 'Favoritos' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 glass-strong border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <NavLink to="/feed" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
              <Sparkles className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-gradient hidden sm:block">QCQ</span>
          </NavLink>

          <div className="flex items-center gap-2">
            <NavLink to="/notifications">
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="w-5 h-5" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full" />
              </Button>
            </NavLink>

            <NavLink to="/profile" className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-secondary overflow-hidden">
                {user?.avatar ? (
                  <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <User className="w-5 h-5" />
                  </div>
                )}
              </div>
            </NavLink>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-6">
        <Outlet />
      </main>

      {/* Bottom Navigation (Mobile) */}
      <nav className="sticky bottom-0 z-40 glass-strong border-t md:hidden">
        <div className="flex items-center justify-around h-16">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  "flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <item.icon className={cn("w-5 h-5", isActive && "animate-scale-in")} />
                <span className="text-xs">{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex fixed left-0 top-16 bottom-0 w-64 border-r glass flex-col p-4">
        <nav className="flex-1 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg transition-all",
                  isActive 
                    ? "bg-primary/10 text-primary" 
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </NavLink>
            );
          })}

          <div className="border-t my-3" />

          {extraNavItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg transition-all",
                  isActive 
                    ? "bg-primary/10 text-primary" 
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t pt-4 space-y-1">
          {user?.isAdmin && (
            <NavLink
              to="/admin"
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                location.pathname === '/admin'
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              <Shield className="w-5 h-5" />
              <span className="font-medium">Admin</span>
              <Badge className="ml-auto bg-destructive text-xs">Admin</Badge>
            </NavLink>
          )}

          <NavLink
            to="/settings"
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
              location.pathname === '/settings'
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}
          >
            <Settings className="w-5 h-5" />
            <span className="font-medium">Configurações</span>
          </NavLink>
          
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Sair</span>
          </button>
        </div>
      </aside>
    </div>
  );
}
