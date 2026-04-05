import { Switch, Route } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { AudioProvider } from "@/hooks/use-audio.tsx";
import NotFound from "@/pages/not-found";

// Pages
import Home from "@/pages/Home";
import GameRoom from "@/pages/GameRoom";
import Kicked from "@/pages/Kicked";
import Dashboard from "@/pages/Dashboard";
import Leaderboard from "@/pages/Leaderboard";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/kicked" component={Kicked} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/leaderboard" component={Leaderboard} />
      <Route path="/room/:code" component={GameRoom} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <AudioProvider>
      <Toaster />
      <Router />
    </AudioProvider>
  );
}

export default App;
