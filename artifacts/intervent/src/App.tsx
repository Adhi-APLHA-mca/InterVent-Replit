import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Register from "@/pages/register";
import DashboardLayout from "@/pages/dashboard/layout";
import StudentLayout from "@/pages/student/layout";
import InterviewScheduler from "@/pages/dashboard/interview-scheduler";
import InterviewManager from "@/pages/dashboard/interview-manager";
import LeaderboardPage from "@/pages/dashboard/leaderboard";
import JobOpenings from "@/pages/student/job-openings";
import InterviewCalls from "@/pages/student/interview-calls";
import AssessmentPage from "@/pages/student/assessment";
import AssessmentResults from "@/pages/student/assessment-results";
import AptitudePage from "@/pages/student/aptitude";
import AptitudeResults from "@/pages/student/aptitude-results";
import DSAPage from "@/pages/student/dsa";
import DSAResults from "@/pages/student/dsa-results";
import MeetInterviewPage from "@/pages/student/meet-interview";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/register" component={Register} />

      {/* HR Dashboard */}
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
      <Route path="/dashboard/leaderboard">
        <DashboardLayout>
          <LeaderboardPage />
        </DashboardLayout>
      </Route>

      {/* Student Portal */}
      <Route path="/student">
        <Redirect to="/student/calls" />
      </Route>
      <Route path="/student/jobs">
        <StudentLayout>
          <JobOpenings />
        </StudentLayout>
      </Route>
      <Route path="/student/calls">
        <StudentLayout>
          <InterviewCalls />
        </StudentLayout>
      </Route>

      {/* Stage 1 — Technical MCQ Assessment (standalone fullscreen) */}
      <Route path="/student/assessment/results">
        <AssessmentResults />
      </Route>
      <Route path="/student/assessment">
        <AssessmentPage />
      </Route>

      {/* Stage 2 — Aptitude Test (standalone fullscreen) */}
      <Route path="/student/aptitude/results">
        <AptitudeResults />
      </Route>
      <Route path="/student/aptitude">
        <AptitudePage />
      </Route>

      {/* Stage 3 — DSA Coding Round (standalone fullscreen) */}
      <Route path="/student/dsa/results">
        <DSAResults />
      </Route>
      <Route path="/student/dsa">
        <DSAPage />
      </Route>

      {/* Stage 4 — AI Voice Interview (Meet Agent) */}
      <Route path="/student/meet">
        <MeetInterviewPage />
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
