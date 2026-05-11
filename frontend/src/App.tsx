import { BrowserRouter, Route, Routes } from "react-router-dom";
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

export default function App() {
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
