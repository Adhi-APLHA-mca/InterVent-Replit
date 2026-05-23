import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Register from "@/pages/register";
import DashboardLayout from "@/pages/dashboard/layout";
import InterviewScheduler from "@/pages/dashboard/interview-scheduler";
import InterviewManager from "@/pages/dashboard/interview-manager";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/register" component={Register} />

      <Route path="/dashboard">
        <Redirect to="/dashboard/scheduler" />
      </Route>
      <Route path="/dashboard/scheduler">
        <DashboardLayout>
          <InterviewScheduler />
        </DashboardLayout>
      </Route>
      <Route path="/dashboard/manager">
        <DashboardLayout>
          <InterviewManager />
        </DashboardLayout>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
