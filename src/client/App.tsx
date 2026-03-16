import "@/public/index.css";
import "@/client/lib/i18n";
import { HashRouter, Route, Routes } from "react-router";
import { ProtectedRoute, ToastProvider } from "@/client/components";
import { AuthProvider } from "@/client/contexts/AuthContext";
import { AdminPage } from "@/client/pages/AdminPage";
import { HomePage } from "@/client/pages/HomePage";
import { LoginPage } from "@/client/pages/LoginPage";
import { SignupPage } from "@/client/pages/SignupPage";

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <HashRouter>
          <Routes>
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <HomePage />
                </ProtectedRoute>
              }
            />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute requireAdmin>
                  <AdminPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </HashRouter>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
