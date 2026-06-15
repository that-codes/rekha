import { createBrowserRouter, Navigate } from "react-router-dom";
import { Capabilities } from "@rekha/shared";
import { Layout } from "./components/Layout.js";
import { Login } from "./features/auth/Login.js";
import { Dashboard } from "./features/dashboard/Dashboard.js";
import { Processes } from "./features/processes/Processes.js";
import { ProcessDetail } from "./features/processes/ProcessDetail.js";
import { Users } from "./features/users/Users.js";
import { Audit } from "./features/audit/Audit.js";
import { useAuth } from "./store/auth.js";

/** The dashboard is the landing page only for users who can view it; others go to Processes. */
function IndexRoute() {
  const canViewDashboard = useAuth((s) => s.user?.capabilities.includes(Capabilities.VIEW_DASHBOARD) ?? false);
  return canViewDashboard ? <Dashboard /> : <Navigate to="/processes" replace />;
}

export const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <IndexRoute /> },
      { path: "processes", element: <Processes /> },
      { path: "processes/:name", element: <ProcessDetail /> },
      { path: "users", element: <Users /> },
      { path: "audit", element: <Audit /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
