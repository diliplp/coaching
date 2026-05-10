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
          <Route path="/question-bank" element={<QuestionBankPage />} />
          <Route path="/exam-builder" element={<ExamBuilderPage />} />
          <Route path="/subject-books" element={<SubjectBooksPage />} />
          <Route path="/live-exam" element={<LiveExamPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/exams" element={<ExamsListPage />} />
          <Route path="/curriculum" element={<CurriculumPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
