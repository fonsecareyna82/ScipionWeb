import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import SignIn from "./pages/AuthPages/SignIn";
import SignUp from "./pages/AuthPages/SignUp";
import NotFound from "./pages/OtherPage/NotFound";
import UserProfiles from "./pages/UserProfiles";
import Videos from "./pages/UiElements/Videos";
import Images from "./pages/UiElements/Images";
import Alerts from "./pages/UiElements/Alerts";
import Badges from "./pages/UiElements/Badges";
import Avatars from "./pages/UiElements/Avatars";
import Buttons from "./pages/UiElements/Buttons";
import LineChart from "./pages/Charts/LineChart";
import BarChart from "./pages/Charts/BarChart";
import Calendar from "./pages/Calendar";
import BasicTables from "./pages/Tables/BasicTables";
import FormElements from "./pages/Forms/FormElements";
import Blank from "./pages/Blank";
import AppLayout from "./layout/AppLayout";
import { ScrollToTop } from "./components/common/ScrollToTop";
import Home from "./pages/Dashboard/Home";
import Projects from "./pages/Dashboard/projects/Projects";
import ProjectPage from "./pages/Dashboard/projects/ProjectPage";
import Plugins from "./pages/Dashboard/plugins/Plugins";
import PluginPage from "./pages/Dashboard/plugins/PluginPage";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import VerifyEmailForm from "./components/auth/VerifyEmailForm";
import SessionManager from "./components/common/SessionManager";
import { Toaster } from "react-hot-toast";
import { DragProvider } from "./components/protocol/DragContext";

export default function App() {
  return (
    <DragProvider>
      <Router>
        <ScrollToTop />

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
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index path="/home" element={<Home />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/project/load/:projectName" element={<ProjectPage />} />
            <Route path="/plugins" element={<Plugins />} />
            <Route path="/plugins/:pipName" element={<PluginPage />} />
            <Route path="/profile" element={<UserProfiles />} />
            <Route path="/calendar" element={<Calendar />} />
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

        <Toaster
          position="top-right"
          containerStyle={{ zIndex: 999999 }}
        />
      </Router>
    </DragProvider>
  );
}
