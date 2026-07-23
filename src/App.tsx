import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AgeGateProvider } from "@/contexts/AgeGateContext";
import { SocketProvider } from "@/contexts/SocketContext";
import { FavoritesProvider } from "@/contexts/FavoritesContext";
import { FriendsProvider } from "@/contexts/FriendsContext";
import { ActivityTrackerProvider } from "@/contexts/ActivityTrackerContext";
import { ProfileGateProvider } from "@/contexts/ProfileGateContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Layout from "@/components/Layout";
import SiteVisitTracker from "@/components/SiteVisitTracker";

// Páginas do funil de entrada ficam no bundle inicial (carregam na hora, sem flash).
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import NotFound from "./pages/NotFound";

// Demais páginas são carregadas sob demanda (code-splitting por rota) para deixar
// o bundle inicial pequeno — especialmente a Landing pública (página de vendas).
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const PendingApproval = lazy(() => import("./pages/PendingApproval"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const Subscriptions = lazy(() => import("./pages/Subscriptions"));
const Welcome = lazy(() => import("./pages/Welcome"));
const Terms = lazy(() => import("./pages/Terms"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Guidelines = lazy(() => import("./pages/Guidelines"));
const DevTest = lazy(() => import("./pages/DevTest"));
const InviteLanding = lazy(() => import("./pages/InviteLanding"));
const Feed = lazy(() => import("./pages/Feed"));
const Match = lazy(() => import("./pages/Match"));
const Radar = lazy(() => import("./pages/Radar"));
const Stories = lazy(() => import("./pages/Stories"));
const Profile = lazy(() => import("./pages/Profile"));
const ProfileVisitors = lazy(() => import("./pages/ProfileVisitors"));
const Chat = lazy(() => import("./pages/Chat"));
const Search = lazy(() => import("./pages/Search"));
const Reels = lazy(() => import("./pages/Reels"));
const SearchVideos = lazy(() => import("./pages/SearchVideos"));
const Notifications = lazy(() => import("./pages/Notifications"));
const FriendRequests = lazy(() => import("./pages/FriendRequests"));
const Friends = lazy(() => import("./pages/Friends"));
const Favorites = lazy(() => import("./pages/Favorites"));
const Events = lazy(() => import("./pages/Events"));
const Invites = lazy(() => import("./pages/Invites"));
const Promoter = lazy(() => import("./pages/Promoter"));
const PromoterLanding = lazy(() => import("./pages/PromoterLanding"));
const Tokens = lazy(() => import("./pages/Tokens"));
const Settings = lazy(() => import("./pages/Settings"));
const Admin = lazy(() => import("./pages/Admin"));
const UserProfile = lazy(() => import("./pages/UserProfile"));

const queryClient = new QueryClient();

// Fallback leve enquanto o chunk da rota carrega.
function PageFallback() {
  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
    </div>
  );
}

const App = () => (
  <ThemeProvider>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AgeGateProvider>
        <AuthProvider>
          <ProfileGateProvider>
          <SocketProvider>
            <FavoritesProvider>
              <FriendsProvider>
                <ActivityTrackerProvider>
                <Toaster />
                <Sonner />
                <BrowserRouter>
                  <SiteVisitTracker />
                  <Suspense fallback={<PageFallback />}>
                  <Routes>
                    {/* Public Routes */}
                    <Route path="/" element={<Landing />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/pending-approval" element={<PendingApproval />} />
                    <Route path="/auth/callback" element={<AuthCallback />} />
                    <Route path="/plans" element={<Navigate to="/subscriptions" replace />} />
                    <Route path="/convites" element={<Navigate to="/invites" replace />} />
                    <Route path="/invite/:token" element={<InviteLanding />} />
                    <Route path="/terms" element={<Terms />} />
                    <Route path="/privacy" element={<Privacy />} />
                    <Route path="/guidelines" element={<Guidelines />} />
                    <Route path="/dev-test" element={<DevTest />} />

                    {/* Protected Routes */}
                    <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                      <Route path="/feed" element={<Feed />} />
                      <Route path="/match" element={<Match />} />
                      <Route path="/radar" element={<Radar />} />
                      <Route path="/stories" element={<Stories />} />
                      <Route path="/profile" element={<Profile />} />
                      <Route path="/profile/visitors" element={<ProfileVisitors />} />
                      <Route path="/users/:userId" element={<UserProfile />} />
                      <Route path="/chat" element={<Chat />} />
                      <Route path="/search" element={<Search />} />
                      <Route path="/reels" element={<Reels />} />
                      <Route path="/videos" element={<SearchVideos />} />
                      <Route path="/notifications" element={<Notifications />} />
                      <Route path="/friend-requests" element={<FriendRequests />} />
                      <Route path="/friends" element={<Friends />} />
                      <Route path="/events" element={<Events />} />
                      <Route path="/invites" element={<Invites />} />
                      <Route path="/promoter" element={<Promoter />} />
                      <Route path="/ganhe" element={<PromoterLanding />} />
                      <Route path="/tokens" element={<Tokens />} />
                      <Route path="/ambassador" element={<Navigate to="/invites?tab=ambassador" replace />} />
                      <Route path="/rap" element={<Navigate to="/reels" replace />} />
                      <Route path="/favorites" element={<Favorites />} />
                      <Route path="/likes" element={<Navigate to="/favorites" replace />} />
                      <Route path="/subscriptions" element={<Subscriptions />} />
                      <Route path="/settings" element={<Settings />} />
                      <Route path="/admin" element={<Admin />} />
                    </Route>

                    {/* Boas-vindas pós-pagamento (full-screen, requer login) */}
                    <Route path="/bem-vindo" element={<ProtectedRoute><Welcome /></ProtectedRoute>} />

                    {/* Catch-all */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                  </Suspense>
                </BrowserRouter>
                </ActivityTrackerProvider>
              </FriendsProvider>
            </FavoritesProvider>
          </SocketProvider>
          </ProfileGateProvider>
        </AuthProvider>
      </AgeGateProvider>
    </TooltipProvider>
  </QueryClientProvider>
  </ThemeProvider>
);

export default App;
