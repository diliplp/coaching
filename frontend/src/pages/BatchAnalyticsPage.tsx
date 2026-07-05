import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiClient } from "../api/client";

export function BatchAnalyticsPage() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"questions" | "topics" | "students">("questions");
  const [reattemptLoading, setReattemptLoading] = useState<Record<string, boolean>>({});
  const [reattemptDone, setReattemptDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!examId) return;
    apiClient.getBatchAnalytics(examId)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [examId]);

  if (loading) return <p style={{ padding: "2rem" }}>Loading analytics...</p>;
  if (!data) return <p style={{ padding: "2rem" }}>Failed to load analytics.</p>;

  const { examName, totalStudents, avgPercentage, maxPercentage, minPercentage, stdDev, questionStats, topicStats, studentRankings } = data;

  const tabStyle = (tab: string): React.CSSProperties => ({
    padding: "8px 18px",
    borderRadius: "8px",
    border: "1px solid",
    cursor: "pointer",
    fontSize: "0.85rem",
    fontWeight: 600,
    background: activeTab === tab ? "var(--color-primary, #2563eb)" : "transparent",
    color: activeTab === tab ? "#fff" : "var(--color-text)",
    borderColor: activeTab === tab ? "var(--color-primary, #2563eb)" : "var(--color-border)",
    transition: "all 0.15s",
  });

  return (
    <div className="page">
      <section className="section-heading">
        <button
          className="secondary-button"
          style={{ fontSize: "0.8rem", marginBottom: "12px" }}
          onClick={() => navigate("/exams")}
        >
          ← Back to Exams
        </button>
        <p className="eyebrow">Batch Analytics</p>
        <h2>{examName}</h2>
      </section>

      {/* Summary cards */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "24px" }}>
        {[
          { label: "Students Attempted", value: totalStudents },
          { label: "Class Average", value: `${avgPercentage}%` },
          { label: "Highest Score", value: `${maxPercentage}%` },
          { label: "Lowest Score", value: `${minPercentage}%` },
          { label: "Std Deviation", value: `${stdDev}%` },
        ].map(card => (
          <div key={card.label} style={{
            flex: "1 1 140px",
            background: "var(--color-bg-secondary)",
            border: "1px solid var(--color-border)",
            borderRadius: "12px",
            padding: "16px 20px",
            textAlign: "center"
          }}>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--color-primary, #2563eb)" }}>{card.value}</div>
            <div style={{ fontSize: "0.78rem", color: "var(--color-text-muted)", marginTop: "4px" }}>{card.label}</div>
          </div>
        ))}
      </div>

      {totalStudents === 0 ? (
        <div className="panel" style={{ textAlign: "center", padding: "2rem", color: "var(--color-text-muted)" }}>
          No submissions yet for this exam.
        </div>
      ) : (
        <>
          {/* Tab bar */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
            <button style={tabStyle("questions")} onClick={() => setActiveTab("questions")}>Question Difficulty</button>
            <button style={tabStyle("topics")} onClick={() => setActiveTab("topics")}>Topic Weak Spots</button>
            <button style={tabStyle("students")} onClick={() => setActiveTab("students")}>Student Rankings</button>
          </div>

          {/* Questions tab */}
          {activeTab === "questions" && (
            <div>
              <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginBottom: "12px" }}>
                Sorted by fail rate (highest first). Questions where most students answered wrong.
              </p>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ background: "var(--color-bg-secondary)", borderBottom: "2px solid var(--color-border)" }}>
                      <th style={thStyle}>#</th>
                      <th style={thStyle}>Question</th>
                      <th style={thStyle}>Topic</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>Correct</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>Wrong</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>Skipped</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>Fail Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {questionStats.map((q: any, i: number) => (
                      <tr key={q.questionId} style={{ borderBottom: "1px solid var(--color-border)", background: i % 2 === 0 ? "transparent" : "var(--color-bg-secondary)" }}>
                        <td style={tdStyle}>{i + 1}</td>
                        <td style={{ ...tdStyle, maxWidth: "280px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={q.prompt}>
                          {q.prompt}
                        </td>
                        <td style={tdStyle}><span className="tag">{q.topicName}</span></td>
                        <td style={{ ...tdStyle, textAlign: "center", color: "#16a34a", fontWeight: 600 }}>{q.correctCount}</td>
                        <td style={{ ...tdStyle, textAlign: "center", color: "#dc2626", fontWeight: 600 }}>{q.incorrectCount}</td>
                        <td style={{ ...tdStyle, textAlign: "center", color: "#9ca3af" }}>{q.unattemptedCount}</td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          <FailBar pct={q.failRate} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Topics tab */}
          {activeTab === "topics" && (
            <div>
              <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginBottom: "12px" }}>
                Sorted by average accuracy (weakest first). Topics where the batch struggles most.
              </p>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ background: "var(--color-bg-secondary)", borderBottom: "2px solid var(--color-border)" }}>
                      <th style={thStyle}>Topic</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>Avg Accuracy</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>Students Below 50%</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>Strength</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topicStats.map((t: any, i: number) => (
                      <tr key={t.topicId} style={{ borderBottom: "1px solid var(--color-border)", background: i % 2 === 0 ? "transparent" : "var(--color-bg-secondary)" }}>
                        <td style={tdStyle}><strong>{t.topicName}</strong></td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          <span style={{ fontWeight: 700, color: t.avgAccuracy < 40 ? "#dc2626" : t.avgAccuracy < 65 ? "#d97706" : "#16a34a" }}>
                            {t.avgAccuracy}%
                          </span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          {t.weakStudentCount > 0 ? (
                            <span style={{ color: "#dc2626", fontWeight: 600 }}>{t.weakStudentCount} / {t.totalStudents}</span>
                          ) : (
                            <span style={{ color: "#16a34a" }}>0</span>
                          )}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          <StrengthBar pct={t.avgAccuracy} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Students tab */}
          {activeTab === "students" && (
            <div>
              <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginBottom: "12px" }}>
                Outlier highlights: <span style={{ color: "#15803d" }}>★ High</span> = more than 1.5σ above average; <span style={{ color: "#b91c1c" }}>▼ Low</span> = more than 1.5σ below.
                Use <strong>Allow Re-attempt</strong> to let a student retake the exam from scratch (their previous result is kept).
              </p>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ background: "var(--color-bg-secondary)", borderBottom: "2px solid var(--color-border)" }}>
                      <th style={thStyle}>Rank</th>
                      <th style={thStyle}>Student</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>Score</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>Percentage</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>Status</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>Re-attempt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentRankings.map((s: any) => {
                      const done = reattemptDone[s.studentId];
                      const busy = reattemptLoading[s.studentId];
                      return (
                        <tr key={s.studentId} style={{
                          borderBottom: "1px solid var(--color-border)",
                          background: s.isOutlierHigh ? "#f0fdf4" : s.isOutlierLow ? "#fef2f2" : "transparent"
                        }}>
                          <td style={{ ...tdStyle, fontWeight: 700, color: s.rank <= 3 ? "#d97706" : undefined }}>{s.rank}</td>
                          <td style={tdStyle}><strong>{s.studentName}</strong></td>
                          <td style={{ ...tdStyle, textAlign: "center" }}>{s.obtainedMarks} / {s.totalMarks}</td>
                          <td style={{ ...tdStyle, textAlign: "center" }}>
                            <span style={{ fontWeight: 700, color: s.percentage >= 70 ? "#16a34a" : s.percentage >= 40 ? "#d97706" : "#dc2626" }}>
                              {s.percentage}%
                            </span>
                          </td>
                          <td style={{ ...tdStyle, textAlign: "center" }}>
                            {s.isOutlierHigh && <span style={{ color: "#15803d", fontWeight: 700 }}>★ High</span>}
                            {s.isOutlierLow && <span style={{ color: "#b91c1c", fontWeight: 700 }}>▼ Low</span>}
                            {!s.isOutlierHigh && !s.isOutlierLow && <span style={{ color: "#9ca3af" }}>Normal</span>}
                          </td>
                          <td style={{ ...tdStyle, textAlign: "center" }}>
                            {done ? (
                              <span style={{ color: "#16a34a", fontWeight: 600, fontSize: "0.78rem" }}>✓ Allowed</span>
                            ) : (
                              <button
                                disabled={busy}
                                style={{
                                  padding: "4px 10px",
                                  fontSize: "0.75rem",
                                  borderRadius: "6px",
                                  border: "1px solid #d97706",
                                  background: busy ? "#fef3c7" : "white",
                                  color: "#92400e",
                                  cursor: busy ? "default" : "pointer",
                                  fontWeight: 600,
                                  whiteSpace: "nowrap",
                                }}
                                onClick={async () => {
                                  if (!examId || !window.confirm(`Allow ${s.studentName} to re-attempt this exam? Their current result will be kept on record.`)) return;
                                  setReattemptLoading(prev => ({ ...prev, [s.studentId]: true }));
                                  try {
                                    await apiClient.allowReattempt(examId, s.studentId);
                                    setReattemptDone(prev => ({ ...prev, [s.studentId]: true }));
                                  } catch (err: any) {
                                    alert(err?.message || "Failed to allow re-attempt.");
                                  } finally {
                                    setReattemptLoading(prev => ({ ...prev, [s.studentId]: false }));
                                  }
                                }}
                              >
                                {busy ? "..." : "Allow Re-attempt"}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 14px",
  textAlign: "left",
  fontWeight: 600,
  fontSize: "0.8rem",
  color: "var(--color-text-muted)",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 14px",
  verticalAlign: "middle",
};

function FailBar({ pct }: { pct: number }) {
  const color = pct >= 70 ? "#dc2626" : pct >= 40 ? "#d97706" : "#16a34a";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", justifyContent: "center" }}>
      <div style={{ width: "60px", height: "8px", borderRadius: "4px", background: "#e5e7eb", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: "4px" }} />
      </div>
      <span style={{ fontWeight: 700, color, minWidth: "32px" }}>{pct}%</span>
    </div>
  );
}

function StrengthBar({ pct }: { pct: number }) {
  const color = pct < 40 ? "#dc2626" : pct < 65 ? "#d97706" : "#16a34a";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", justifyContent: "center" }}>
      <div style={{ width: "80px", height: "8px", borderRadius: "4px", background: "#e5e7eb", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: "4px" }} />
      </div>
    </div>
  );
}
