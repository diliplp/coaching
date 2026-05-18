import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { DashboardPage } from "./pages/DashboardPage";
import { ExamBuilderPage } from "./pages/ExamBuilderPage";
import { LiveExamPage } from "./pages/LiveExamPage";
import { LoginPage } from "./pages/LoginPage";
import { QuestionBankPage } from "./pages/QuestionBankPage";
import { SubjectBooksPage } from "./pages/SubjectBooksPage";
import { AdminPage } from "./pages/AdminPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { ExamsListPage } from "./pages/ExamsListPage";
import { CurriculumPage } from "./pages/CurriculumPage";
import { OfflineExamBuilderPage } from "./pages/OfflineExamBuilderPage";
import { getStoredSession, clearSession } from "./auth";
import { apiClient } from "./api/client";

export default function App() {
  const [isVerifying, setIsVerifying] = useState(true);

  useEffect(() => {
    const session = getStoredSession();
    if (session) {
      // Verify session with backend on boot
      apiClient.getMe()
        .then(() => setIsVerifying(false))
        .catch((error) => {
          if (error.status === 401) {
            // Clear session on unauthorized and force reload to trigger login redirect
            if (typeof window !== "undefined") {
              sessionStorage.removeItem("coaching-auth-session");
              window.location.href = "/login";
            }
          }
          clearSession();
          setIsVerifying(false);
        });
    } else {
      setIsVerifying(false);
    }
  }, []);

  if (isVerifying) {
    return (
      <div style={{ 
        height: "100vh", 
        display: "grid", 
        placeItems: "center", 
        background: "linear-gradient(135deg, #f8fbff 0%, #eef5ff 100%)",
        fontFamily: "Poppins, sans-serif"
      }}>
        <div style={{ textAlign: "center", animation: "pulse 2s infinite ease-in-out" }}>
          <div className="tag" style={{ padding: "10px 24px", fontSize: "1rem", boxShadow: "0 10px 25px rgba(0,0,0,0.05)" }}>
            ✨ Authenticating Portal...
          </div>
          <p style={{ marginTop: "20px", color: "var(--color-text-muted)", fontSize: "0.9rem" }}>Preparing your personalized dashboard</p>
        </div>
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.8; transform: scale(0.98); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true
      }}
    >
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<DashboardPage />} />
          <Route 
            path="/question-bank" 
            element={<ProtectedRoute roles={["super_admin", "teacher"]}><QuestionBankPage /></ProtectedRoute>} 
          />
          <Route 
            path="/exam-builder" 
            element={<ProtectedRoute roles={["super_admin", "teacher"]}><ExamBuilderPage /></ProtectedRoute>} 
          />
          <Route 
            path="/subject-books" 
            element={<ProtectedRoute roles={["super_admin", "teacher"]}><SubjectBooksPage /></ProtectedRoute>} 
          />
          <Route path="/live-exam" element={<LiveExamPage />} />
          <Route 
            path="/analytics" 
            element={<ProtectedRoute roles={["super_admin", "teacher"]}><AnalyticsPage /></ProtectedRoute>} 
          />
          <Route 
            path="/offline-board-paper" 
            element={<ProtectedRoute roles={["super_admin", "teacher"]}><OfflineExamBuilderPage /></ProtectedRoute>} 
          />
          <Route 
            path="/exams" 
            element={<ProtectedRoute roles={["super_admin", "teacher"]}><ExamsListPage /></ProtectedRoute>} 
          />
          <Route 
            path="/curriculum" 
            element={<ProtectedRoute roles={["super_admin", "teacher"]}><CurriculumPage /></ProtectedRoute>} 
          />
          <Route 
            path="/admin" 
            element={<ProtectedRoute roles={["super_admin"]}><AdminPage /></ProtectedRoute>} 
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
