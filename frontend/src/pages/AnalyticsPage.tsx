import { useEffect, useState } from "react";
import { apiClient } from "../api/client";

export function AnalyticsPage() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    apiClient.getAnalytics().then(setData).catch(console.error);
  }, []);

  if (!data) {
    return <p>Loading analytics...</p>;
  }

  const { submissions, exams, students, batches } = data;

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
    </div>
  );
}
