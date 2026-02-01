import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AgeGateProvider } from "@/contexts/AgeGateContext";
import { SocketProvider } from "@/contexts/SocketContext";
import { FavoritesProvider } from "@/contexts/FavoritesContext";
import { FriendsProvider } from "@/contexts/FriendsContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Layout from "@/components/Layout";

// Public Pages
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import AuthCallback from "./pages/AuthCallback";
import Plans from "./pages/Plans";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import DevTest from "./pages/DevTest";

// Protected Pages
import Feed from "./pages/Feed";
import Match from "./pages/Match";
import Radar from "./pages/Radar";
import Profile from "./pages/Profile";
import Chat from "./pages/Chat";
import Search from "./pages/Search";
import Notifications from "./pages/Notifications";
import FriendRequests from "./pages/FriendRequests";
import Favorites from "./pages/Favorites";
import Events from "./pages/Events";
import Settings from "./pages/Settings";
import Admin from "./pages/Admin";

import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AgeGateProvider>
        <AuthProvider>
          <SocketProvider>
            <FavoritesProvider>
              <FriendsProvider>
                <Toaster />
                <Sonner />
                <BrowserRouter>
                  <Routes>
                    {/* Public Routes */}
                    <Route path="/" element={<Landing />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/auth/callback" element={<AuthCallback />} />
                    <Route path="/plans" element={<Plans />} />
                    <Route path="/terms" element={<Terms />} />
                    <Route path="/privacy" element={<Privacy />} />
                    <Route path="/dev-test" element={<DevTest />} />
                    <Route path="/favorites" element={<Favorites />} />

                    {/* Protected Routes */}
                    <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                      <Route path="/feed" element={<Feed />} />
                      <Route path="/match" element={<Match />} />
                      <Route path="/radar" element={<Radar />} />
                      <Route path="/profile" element={<Profile />} />
                      <Route path="/chat" element={<Chat />} />
                      <Route path="/search" element={<Search />} />
                      <Route path="/notifications" element={<Notifications />} />
                      <Route path="/friend-requests" element={<FriendRequests />} />
                      <Route path="/events" element={<Events />} />
                      <Route path="/settings" element={<Settings />} />
                      <Route path="/admin" element={<Admin />} />
                    </Route>

                    {/* Catch-all */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </BrowserRouter>
              </FriendsProvider>
            </FavoritesProvider>
          </SocketProvider>
        </AuthProvider>
      </AgeGateProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
