// src/App.tsx
import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import NotFound from "./pages/OtherPage/NotFound";
import AppLayout from "./layout/AppLayout";
import { ScrollToTop } from "./components/common/ScrollToTop";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import SessionManager from "./components/common/SessionManager";
import { Toaster } from "react-hot-toast";
import { DragProvider } from "./components/protocol/DragContext";
import { ProjectService } from "./services/ProjectService";
import { ProjectServiceProvider } from "./ProjectServiceContext";

interface AppProps {
  service?: ProjectService;
}

// lazyRouteImports
const SignIn = lazy(() => import("./pages/AuthPages/SignIn"));
const SignUp = lazy(() => import("./pages/AuthPages/SignUp"));
const UserProfiles = lazy(() => import("./pages/UserProfiles"));
const Videos = lazy(() => import("./pages/UiElements/Videos"));
const Images = lazy(() => import("./pages/UiElements/Images"));
const Alerts = lazy(() => import("./pages/UiElements/Alerts"));
const Badges = lazy(() => import("./pages/UiElements/Badges"));
const Avatars = lazy(() => import("./pages/UiElements/Avatars"));
const Buttons = lazy(() => import("./pages/UiElements/Buttons"));
const LineChart = lazy(() => import("./pages/Charts/LineChart"));
const BarChart = lazy(() => import("./pages/Charts/BarChart"));
const Calendar = lazy(() => import("./pages/Calendar"));
const BasicTables = lazy(() => import("./pages/Tables/BasicTables"));
const FormElements = lazy(() => import("./pages/Forms/FormElements"));
const Blank = lazy(() => import("./pages/Blank"));
const Home = lazy(() => import("./pages/Dashboard/Home"));
const Projects = lazy(() => import("./pages/Dashboard/projects/Projects"));
const ProjectPage = lazy(() => import("./pages/Dashboard/projects/ProjectPage"));
const Plugins = lazy(() => import("./pages/Dashboard/plugins/Plugins"));
const PluginPage = lazy(() => import("./pages/Dashboard/plugins/PluginPage"));
const WorkflowsPage = lazy(() => import("./pages/Dashboard/workflows/WorkflowsPage"));
const SettingsPage = lazy(() => import("./pages/Settings/settingspage"));
const VerifyEmailForm = lazy(() => import("./components/auth/VerifyEmailForm"));

function RouteFallback() {
  // suspenseFallback
  return <div className="p-4 text-sm text-gray-500">Loading...</div>;
}

export default function App({ service }: AppProps) {
  return (
    // NOTE: BrowserRouter is provided in src/main.tsx. Do NOT mount another Router here.
    <DragProvider>
      <ProjectServiceProvider service={service}>
        {/* Top-level height wrapper: makes the whole app use real viewport height */}
        <div className="h-app min-h-0 flex flex-col">
          {/* Needs to be inside a Router (provided by main.tsx) */}
          <ScrollToTop />

          {/* Content area must be able to shrink: min-h-0 avoids flex children forcing overflow */}
          <div className="flex-1 min-h-0 flex flex-col">
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                {/* Public routes */}
                <Route path="/" element={<SignIn />} />
                <Route path="/signin" element={<SignIn />} />
                <Route path="/signup" element={<SignUp />} />

                {/* Protected routes inside layout */}
                <Route
                  element={
                    <ProtectedRoute>
                      <SessionManager />
                      {/* App shell: ensure it can expand and shrink */}
                      <div className="flex-1 min-h-0 flex">
                        <AppLayout />
                      </div>
                    </ProtectedRoute>
                  }
                >
                  <Route path="/home" element={<Home />} />
                  <Route path="/projects" element={<Projects />} />
                  <Route path="/project/load/:projectName" element={<ProjectPage />} />
                  <Route path="/plugins" element={<Plugins />} />
                  <Route path="/workflows" element={<WorkflowsPage />} />
                  <Route path="/plugins/:pipName" element={<PluginPage />} />
                  <Route path="/profile" element={<UserProfiles />} />
                  <Route path="/calendar" element={<Calendar />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/blank" element={<Blank />} />
                  <Route path="/form-elements" element={<FormElements />} />
                  <Route path="/basic-tables" element={<BasicTables />} />
                  <Route path="/alerts" element={<Alerts />} />
                  <Route path="/avatars" element={<Avatars />} />
                  <Route path="/badge" element={<Badges />} />
                  <Route path="/buttons" element={<Buttons />} />
                  <Route path="/images" element={<Images />} />
                  <Route path="/videos" element={<Videos />} />
                  <Route path="/line-chart" element={<LineChart />} />
                  <Route path="/bar-chart" element={<BarChart />} />
                  <Route path="/verify-email" element={<VerifyEmailForm />} />
                </Route>

                {/* Page not found */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </div>

          <Toaster
            position="bottom-left"
            containerStyle={{ zIndex: 999999 }}
            toastOptions={{
              style: { width: "420px", maxWidth: "420px", whiteSpace: "normal", background: "#f5f0eeff" },
              duration: 5000,
            }}
          />
        </div>
      </ProjectServiceProvider>
    </DragProvider>
  );
}
