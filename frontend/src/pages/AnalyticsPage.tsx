import { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { getStoredSession } from "../auth";

export function AnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [studentSearchQuery, setStudentSearchQuery] = useState<string>("");
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    apiClient.getAnalytics().then(setData).catch(console.error);
  }, []);

  const downloadParentReport = async (studentId: string, studentName: string) => {
    try {
      setIsDownloading(true);
      const session = getStoredSession();
      const headers: Record<string, string> = {};
      if (session?.token) {
        headers["Authorization"] = `Bearer ${session.token}`;
      }
      
      const response = await fetch(`/api/students/${studentId}/report-pdf`, {
        headers
      });

      if (!response.ok) {
        let errText = "Failed to generate report";
        try {
          const errData = await response.json();
          if (errData.message) errText = errData.message;
        } catch { /* ignore */ }
        throw new Error(errText);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${studentName.replace(/\s+/g, "_")}_Academic_Report.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      alert(error.message || "An error occurred while downloading the PDF");
    } finally {
      setIsDownloading(false);
    }
  };

  if (!data) {
    return <p>Loading analytics...</p>;
  }

  const { submissions, exams, students, batches } = data;
  const studentsWithSubmissions = students.filter((s: any) => submissions.some((sub: any) => sub.studentId === s.id));

  const filteredStudents = studentsWithSubmissions.filter((s: any) => {
    const matchesBatch = selectedBatchId ? s.batchId === selectedBatchId : true;
    const matchesSearch = studentSearchQuery 
      ? (s.name?.toLowerCase() || "").includes(studentSearchQuery.toLowerCase()) || (s.email?.toLowerCase() || "").includes(studentSearchQuery.toLowerCase())
      : true;
    return matchesBatch && matchesSearch;
  });

  // Compute basic stats
  const totalSubmissions = submissions.length;
  const averagePercentage = totalSubmissions > 0 
    ? submissions.reduce((acc: number, sub: any) => acc + sub.percentage, 0) / totalSubmissions 
    : 0;

  return (
    <div className="page">
      <section className="section-heading">
        <p className="eyebrow">Teacher Analytics</p>
        <h2>Review Result Analytics for Students and Batches</h2>
      </section>

      <section className="grid-two">
        <article className="panel">
          <h3>Overall Performance</h3>
          <p className="muted-copy">Institute-wide metrics</p>
          <div style={{ display: "flex", gap: "20px", marginTop: "15px" }}>
            <div style={{ flex: 1, padding: "20px", background: "var(--color-bg-secondary)", borderRadius: "8px", textAlign: "center" }}>
              <div style={{ fontSize: "2rem", fontWeight: "bold" }}>{totalSubmissions}</div>
              <div className="muted-copy">Total Submissions</div>
            </div>
            <div style={{ flex: 1, padding: "20px", background: "var(--color-bg-secondary)", borderRadius: "8px", textAlign: "center" }}>
              <div style={{ fontSize: "2rem", fontWeight: "bold" }}>{averagePercentage.toFixed(1)}%</div>
              <div className="muted-copy">Average Score</div>
            </div>
          </div>
        </article>

        <article className="panel">
          <h3>Recent Submissions</h3>
          {submissions.length === 0 ? (
            <p>No exams have been submitted yet.</p>
          ) : (
            <ul className="plain-list compact">
              {submissions.slice(0, 5).map((sub: any) => {
                const student = students.find((s: any) => s.id === sub.studentId);
                const exam = exams.find((e: any) => e.id === sub.examId);
                return (
                  <li key={sub.id}>
                    <strong>{student?.name || sub.studentId}</strong>
                    <div className="muted-copy">
                      {exam?.name || sub.examId} • {sub.percentage.toFixed(1)}% ({sub.obtainedMarks}/{sub.totalMarks})
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </article>
      </section>

      <section className="panel" style={{ marginTop: "20px" }}>
        <h3>Batch Performance</h3>
        <table style={{ width: "100%", textAlign: "left", marginTop: "15px", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
              <th style={{ padding: "10px" }}>Batch</th>
              <th style={{ padding: "10px" }}>Total Students</th>
              <th style={{ padding: "10px" }}>Exams Taken</th>
              <th style={{ padding: "10px" }}>Avg Score</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((batch: any) => {
              const batchStudents = students.filter((s: any) => s.batchId === batch.id);
              const batchStudentIds = batchStudents.map((s: any) => s.id);
              const batchSubmissions = submissions.filter((sub: any) => batchStudentIds.includes(sub.studentId));
              const batchAvg = batchSubmissions.length > 0
                ? batchSubmissions.reduce((acc: number, sub: any) => acc + sub.percentage, 0) / batchSubmissions.length
                : 0;

              return (
                <tr key={batch.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "10px" }}><strong>{batch.name}</strong></td>
                  <td style={{ padding: "10px" }}>{batchStudents.length}</td>
                  <td style={{ padding: "10px" }}>{batchSubmissions.length}</td>
                  <td style={{ padding: "10px" }}>{batchAvg.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="panel" style={{ marginTop: "20px" }}>
        <h3>Detailed Student Analysis</h3>
        <p className="muted-copy">Select a student to view their topic-level performance strengths and weaknesses.</p>
        
        <div style={{ display: "flex", gap: "15px", marginTop: "15px", marginBottom: "20px", flexWrap: "wrap" }}>
          <label className="field" style={{ flex: 1, minWidth: "200px" }}>
            <span style={{ fontWeight: "600", fontSize: "0.85rem", color: "var(--color-text-muted)" }}>FILTER BY BATCH</span>
            <select 
              value={selectedBatchId} 
              onChange={(e) => {
                setSelectedBatchId(e.target.value);
                setSelectedStudentId("");
              }}
              style={{ borderRadius: "10px", padding: "12px", border: "1px solid var(--color-border)", background: "var(--color-bg-secondary)" }}
            >
              <option value="">All Batches</option>
              {batches.map((b: any) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>

          <label className="field" style={{ flex: 1, minWidth: "200px" }}>
            <span style={{ fontWeight: "600", fontSize: "0.85rem", color: "var(--color-text-muted)" }}>SEARCH NAME</span>
            <input 
              type="text" 
              placeholder="Type to filter..."
              value={studentSearchQuery}
              onChange={(e) => {
                setStudentSearchQuery(e.target.value);
                setSelectedStudentId("");
              }}
              style={{ borderRadius: "10px", padding: "12px", border: "1px solid var(--color-border)", background: "var(--color-bg-secondary)" }}
            />
          </label>

          <label className="field" style={{ flex: 2, minWidth: "250px" }}>
            <span style={{ fontWeight: "600", fontSize: "0.85rem", color: "var(--color-text-muted)" }}>SELECT STUDENT</span>
            <select 
              value={selectedStudentId} 
              onChange={(e) => setSelectedStudentId(e.target.value)}
              style={{ borderRadius: "10px", padding: "12px", border: "1px solid var(--color-border)", background: "var(--color-bg-secondary)" }}
            >
              <option value="">-- Select a Student --</option>
              {filteredStudents.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name} ({s.email})</option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {selectedStudentId ? studentsWithSubmissions.filter((s: any) => s.id === selectedStudentId).map((student: any) => {
            const studentSubmissions = submissions.filter((sub: any) => sub.studentId === student.id);
            if (studentSubmissions.length === 0) return null;

            // Aggregate insights
            const topicStats: Record<string, { name: string; correct: number; total: number }> = {};
            let studentTotalScore = 0;
            let studentMaxScore = 0;

            studentSubmissions.forEach((sub: any) => {
              studentTotalScore += sub.obtainedMarks;
              studentMaxScore += sub.totalMarks;
              if (sub.insights) {
                sub.insights.forEach((insight: any) => {
                  if (!topicStats[insight.topicId]) {
                    topicStats[insight.topicId] = { name: insight.topicName, correct: 0, total: 0 };
                  }
                  topicStats[insight.topicId].correct += insight.correctAnswers;
                  topicStats[insight.topicId].total += insight.totalQuestions;
                });
              }
            });

            const overallPercentage = studentMaxScore > 0 ? (studentTotalScore / studentMaxScore) * 100 : 0;
            
            const aggregatedInsights = Object.values(topicStats).map(stat => ({
              ...stat,
              accuracy: stat.total > 0 ? (stat.correct / stat.total) * 100 : 0
            }));

            const strongTopics = aggregatedInsights.filter(t => t.accuracy >= 70).sort((a, b) => b.accuracy - a.accuracy);
            const weakTopics = aggregatedInsights.filter(t => t.accuracy < 70).sort((a, b) => a.accuracy - b.accuracy);

            return (
              <div key={student.id} style={{ border: "1px solid var(--color-border)", borderRadius: "8px", padding: "15px", background: "white" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px", borderBottom: "1px solid var(--color-bg-secondary)", paddingBottom: "10px" }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: "1.1rem" }}>{student.name}</h4>
                    <span className="muted-copy" style={{ fontSize: "0.85rem" }}>{student.email} • {studentSubmissions.length} Exams</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
                    <button 
                      onClick={() => downloadParentReport(student.id, student.name)}
                      disabled={isDownloading}
                      style={{
                        padding: "8px 16px",
                        background: "#0f172a",
                        color: "white",
                        border: "none",
                        borderRadius: "8px",
                        fontSize: "0.85rem",
                        fontWeight: "600",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        opacity: isDownloading ? 0.7 : 1,
                        transition: "background 0.2s"
                      }}
                    >
                      {isDownloading ? "⏳ Compiling Report..." : "🖨️ Download Parent Report"}
                    </button>
                    <div style={{ fontSize: "1.2rem", fontWeight: "bold", color: overallPercentage >= 70 ? "green" : (overallPercentage >= 40 ? "orange" : "red") }}>
                      {overallPercentage.toFixed(1)}% Overall
                    </div>
                  </div>
                </div>


                <div className="grid-two" style={{ gap: "15px" }}>
                  <div style={{ background: "#f0fdf4", padding: "12px", borderRadius: "8px", border: "1px solid #bbf7d0" }}>
                    <strong style={{ color: "#166534", display: "block", marginBottom: "8px" }}>Strong Areas (≥70%)</strong>
                    {strongTopics.length > 0 ? (
                      <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "0.85rem", color: "#166534" }}>
                        {strongTopics.map((t, idx) => (
                          <li key={idx}><strong>{t.name}</strong> - {t.accuracy.toFixed(0)}% ({t.correct}/{t.total})</li>
                        ))}
                      </ul>
                    ) : (
                      <span style={{ fontSize: "0.85rem", color: "#166534", opacity: 0.7 }}>No strong areas yet.</span>
                    )}
                  </div>
                  <div style={{ background: "#fef2f2", padding: "12px", borderRadius: "8px", border: "1px solid #fecaca" }}>
                    <strong style={{ color: "#991b1b", display: "block", marginBottom: "8px" }}>Needs Improvement (&lt;70%)</strong>
                    {weakTopics.length > 0 ? (
                      <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "0.85rem", color: "#991b1b" }}>
                        {weakTopics.map((t, idx) => (
                          <li key={idx}><strong>{t.name}</strong> - {t.accuracy.toFixed(0)}% ({t.correct}/{t.total})</li>
                        ))}
                      </ul>
                    ) : (
                      <span style={{ fontSize: "0.85rem", color: "#991b1b", opacity: 0.7 }}>No weak areas!</span>
                    )}
                  </div>
                </div>
              </div>
            );
          }) : (
            <div style={{ padding: "30px", textAlign: "center", border: "1px dashed var(--color-border)", borderRadius: "8px", background: "var(--color-bg-secondary)" }}>
              {studentsWithSubmissions.length === 0 ? "No student data available yet." : "Please select a student from the dropdown above to view their details."}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
