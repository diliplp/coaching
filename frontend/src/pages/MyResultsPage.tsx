import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../api/client";
import { RichText } from "../components/RichText";
import { getStoredSession } from "../auth";
import { liveExamState } from "../data/mockExamContext";

type SubmissionSummary = {
  id: string;
  examName: string;
  submittedAt: string;
  totalMarks: number;
  obtainedMarks: number;
  percentage: number;
  correctAnswers: number;
  incorrectAnswers: number;
  unattemptedAnswers: number;
};

type ReviewItem = {
  questionId: string;
  prompt: string;
  options: { id: string; label: string; value: string }[];
  selectedOptionIds: string[];
  correctOptionIds: string[];
  explanation: string;
  isCorrect: boolean;
};

type SubmissionDetail = SubmissionSummary & {
  examId: string;
  insights: { topicId: string; topicName: string; totalQuestions: number; correctAnswers: number; incorrectAnswers: number; unattemptedAnswers: number; accuracy: number }[];
  review: ReviewItem[];
};

export function MyResultsPage() {
  const studentName = getStoredSession()?.user?.name ?? "";
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState<SubmissionSummary[]>([]);
  const [selected, setSelected] = useState<SubmissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [practicingTopic, setPracticingTopic] = useState<string | null>(null);

  const generatePractice = async (topicId: string, topicName: string) => {
    setPracticingTopic(topicId);
    try {
      const payload = await apiClient.selfGenerateExam({ topicIds: [topicId], questionCount: 10 });
      liveExamState.generatedExam = payload;
      liveExamState.latestResult = null;
      navigate("/live-exam");
    } catch (e: any) {
      alert(e?.message || `Could not generate practice test for "${topicName}". Try again.`);
    } finally {
      setPracticingTopic(null);
    }
  };

  useEffect(() => {
    apiClient.getMySubmissions()
      .then(setSubmissions)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const openDetail = async (id: string) => {
    setLoadingDetail(true);
    setReviewIndex(0);
    try {
      const detail = await apiClient.getMySubmission(id);
      setSelected(detail);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDetail(false);
    }
  };

  const formatDate = (ts: string | undefined | null) => {
    if (!ts) return "—";
    const ms = parseInt(ts, 10);
    if (isNaN(ms)) return ts;
    return new Date(ms).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  };

  const pctColor = (pct: number) =>
    pct >= 75 ? "#15803d" : pct >= 50 ? "#b45309" : "#dc2626";

  if (loading) return <p style={{ padding: "2rem" }}>Loading your results...</p>;

  // ── Detail view ──────────────────────────────────────────────────────────
  if (selected) {
    const review = selected.review ?? [];
    const q = review[reviewIndex];
    const total = review.length;

    return (
      <>
        <style>{`
          @media print {
            .sidebar, .sidebar-toggle, header, nav { display: none !important; }
            .app-shell, .content { display: block !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }
            .page { display: none !important; }
            #bsa-report-card {
              display: block !important;
              padding: 30px !important;
              font-family: 'Times New Roman', Times, serif !important;
              color: black !important;
            }
          }
        `}</style>

        {/* Printable report card — hidden on screen, visible on print */}
        <div id="bsa-report-card" style={{ display: "none" }}>
          <div style={{ textAlign: "center", borderBottom: "2px solid black", paddingBottom: "14px", marginBottom: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "14px", marginBottom: "8px" }}>
              <img src="/logo.jpeg" alt="BSA Logo" style={{ width: "62px", height: "62px", objectFit: "contain" }} />
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: "20px", fontWeight: "bold" }}>Brainwave Science Academy</div>
                <div style={{ fontSize: "12px", color: "#555", marginTop: "2px" }}>Performance Report Card</div>
              </div>
            </div>
            {studentName && (
              <div style={{ fontSize: "15px", fontWeight: "bold", marginTop: "10px" }}>Student: {studentName}</div>
            )}
            <div style={{ fontSize: "14px", marginTop: "4px" }}>{selected.examName}</div>
            <div style={{ fontSize: "12px", color: "#555", marginTop: "4px" }}>Submitted: {formatDate(selected.submittedAt)}</div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "22px" }}>
            <tbody>
              <tr>
                {[
                  { label: "Marks Obtained", value: `${selected.obtainedMarks} / ${selected.totalMarks}` },
                  { label: "Percentage", value: `${selected.percentage}%` },
                  { label: "Correct", value: selected.correctAnswers },
                  { label: "Wrong", value: selected.incorrectAnswers },
                  { label: "Unattempted", value: selected.unattemptedAnswers },
                ].map((stat) => (
                  <td key={stat.label} style={{ border: "1px solid #bbb", padding: "10px 14px", textAlign: "center" }}>
                    <div style={{ fontSize: "20px", fontWeight: "bold" }}>{stat.value}</div>
                    <div style={{ fontSize: "11px", color: "#555", marginTop: "3px" }}>{stat.label}</div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>

          {selected.insights?.length > 0 && (
            <>
              <div style={{ fontWeight: "bold", fontSize: "13px", marginBottom: "8px", textDecoration: "underline" }}>Topic-wise Performance</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f0f0f0" }}>
                    {["Topic", "Total Qs", "Correct", "Wrong", "Skipped", "Accuracy"].map((h) => (
                      <th key={h} style={{ border: "1px solid #bbb", padding: "7px 10px", textAlign: "left" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selected.insights.map((ins, i) => (
                    <tr key={i}>
                      <td style={{ border: "1px solid #bbb", padding: "6px 10px" }}>{ins.topicName}</td>
                      <td style={{ border: "1px solid #bbb", padding: "6px 10px", textAlign: "center" }}>{ins.totalQuestions}</td>
                      <td style={{ border: "1px solid #bbb", padding: "6px 10px", textAlign: "center" }}>{ins.correctAnswers}</td>
                      <td style={{ border: "1px solid #bbb", padding: "6px 10px", textAlign: "center" }}>{ins.incorrectAnswers}</td>
                      <td style={{ border: "1px solid #bbb", padding: "6px 10px", textAlign: "center" }}>{ins.unattemptedAnswers}</td>
                      <td style={{ border: "1px solid #bbb", padding: "6px 10px", textAlign: "center", fontWeight: "bold" }}>{ins.accuracy.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {selected.insights?.length > 0 && (() => {
            const urgentPrint = selected.insights.filter(t => t.accuracy < 40).sort((a, b) => a.accuracy - b.accuracy);
            const practicePrint = selected.insights.filter(t => t.accuracy >= 40 && t.accuracy < 70).sort((a, b) => a.accuracy - b.accuracy);
            const masteredPrint = selected.insights.filter(t => t.accuracy >= 70);
            if (urgentPrint.length === 0 && practicePrint.length === 0) return null;
            return (
              <div style={{ marginTop: "18px", border: "1px solid #fcd34d", borderRadius: "6px", padding: "14px 16px", background: "#fffbeb" }}>
                <div style={{ fontWeight: "bold", fontSize: "13px", marginBottom: "10px" }}>📚 Study Priority Suggestions</div>
                <div style={{ display: "flex", gap: "16px" }}>
                  {urgentPrint.length > 0 && (
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "11px", fontWeight: "bold", color: "#dc2626", marginBottom: "6px" }}>🔴 WORK ON FIRST</div>
                      <ul style={{ margin: 0, paddingLeft: "14px", fontSize: "12px" }}>
                        {urgentPrint.map((t, i) => <li key={i}><strong>{t.topicName}</strong> — {t.correctAnswers}/{t.totalQuestions} correct ({t.accuracy.toFixed(0)}%)</li>)}
                      </ul>
                    </div>
                  )}
                  {practicePrint.length > 0 && (
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "11px", fontWeight: "bold", color: "#b45309", marginBottom: "6px" }}>🟡 NEEDS PRACTICE</div>
                      <ul style={{ margin: 0, paddingLeft: "14px", fontSize: "12px" }}>
                        {practicePrint.map((t, i) => <li key={i}><strong>{t.topicName}</strong> — {t.correctAnswers}/{t.totalQuestions} correct ({t.accuracy.toFixed(0)}%)</li>)}
                      </ul>
                    </div>
                  )}
                  {masteredPrint.length > 0 && (
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "11px", fontWeight: "bold", color: "#15803d", marginBottom: "6px" }}>✅ MASTERED</div>
                      <ul style={{ margin: 0, paddingLeft: "14px", fontSize: "12px" }}>
                        {masteredPrint.map((t, i) => <li key={i}><strong>{t.topicName}</strong> — {t.accuracy.toFixed(0)}%</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          <div style={{ marginTop: "30px", paddingTop: "10px", borderTop: "1px solid #ccc", textAlign: "center", fontSize: "11px", color: "#888" }}>
            Brainwave Science Academy · Generated on {new Date().toLocaleDateString("en-IN", { dateStyle: "long" })}
          </div>
        </div>

        <div className="page">
          <section className="section-heading">
            <p className="eyebrow">Exam Review</p>
            <h2>{selected.examName}</h2>
            <p style={{ margin: "2px 0 0 0", fontSize: "0.82rem", color: "var(--color-text-muted)" }}>
              Submitted: {formatDate(selected.submittedAt)}
            </p>
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
              <button className="secondary-button" onClick={() => setSelected(null)}>
                ← Back to All Results
              </button>
              <button className="secondary-button" onClick={() => window.print()}>
                🖨 Print Report Card
              </button>
            </div>
          </section>

        {/* Score summary */}
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "2rem" }}>
          {[
            { label: "Score", value: `${selected.obtainedMarks} / ${selected.totalMarks}`, color: pctColor(selected.percentage) },
            { label: "Percentage", value: `${selected.percentage}%`, color: pctColor(selected.percentage) },
            { label: "Correct", value: selected.correctAnswers, color: "#15803d" },
            { label: "Incorrect", value: selected.incorrectAnswers, color: "#dc2626" },
            { label: "Unattempted", value: selected.unattemptedAnswers, color: "#6b7280" },
          ].map((stat) => (
            <div key={stat.label} className="panel" style={{ textAlign: "center", minWidth: "110px", flex: 1, padding: "1rem" }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: "0.78rem", color: "var(--color-text-muted)", marginTop: "4px" }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Topic insights */}
        {selected.insights?.length > 0 && (
          <div className="panel" style={{ marginBottom: "2rem" }}>
            <h3 style={{ marginBottom: "1rem", fontSize: "1rem" }}>Topic-wise Performance</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--color-border)" }}>
                    {["Topic", "Total", "Correct", "Wrong", "Skipped", "Accuracy"].map((h) => (
                      <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selected.insights.map((ins, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td style={{ padding: "6px 10px" }}>{ins.topicName}</td>
                      <td style={{ padding: "6px 10px" }}>{ins.totalQuestions}</td>
                      <td style={{ padding: "6px 10px", color: "#15803d" }}>{ins.correctAnswers}</td>
                      <td style={{ padding: "6px 10px", color: "#dc2626" }}>{ins.incorrectAnswers}</td>
                      <td style={{ padding: "6px 10px", color: "#6b7280" }}>{ins.unattemptedAnswers}</td>
                      <td style={{ padding: "6px 10px", fontWeight: 600, color: pctColor(ins.accuracy) }}>{ins.accuracy.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Topic priority suggestions */}
        {selected.insights?.length > 0 && (() => {
          const urgentTopics = selected.insights.filter(t => t.accuracy < 40).sort((a, b) => a.accuracy - b.accuracy);
          const practiceTopics = selected.insights.filter(t => t.accuracy >= 40 && t.accuracy < 70).sort((a, b) => a.accuracy - b.accuracy);
          if (urgentTopics.length === 0 && practiceTopics.length === 0) return null;
          return (
            <div className="panel" style={{ marginBottom: "2rem", background: "#fffbeb", border: "1px solid #fcd34d" }}>
              <h3 style={{ marginBottom: "0.5rem", fontSize: "1rem", color: "#92400e" }}>📚 Study Priority Suggestions</h3>
              <p style={{ fontSize: "0.8rem", color: "#78350f", marginBottom: "1rem", marginTop: 0 }}>
                Topics to focus on based on your accuracy in this exam:
              </p>
              <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
                {urgentTopics.length > 0 && (
                  <div style={{ flex: 1, minWidth: "200px" }}>
                    <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#dc2626", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      🔴 Work on These First
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {urgentTopics.map((t, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                          <span style={{ fontSize: "0.85rem", color: "#991b1b" }}>
                            <strong>{t.topicName}</strong>
                            <span style={{ color: "#6b7280", fontSize: "0.78rem" }}> — {t.correctAnswers}/{t.totalQuestions} ({t.accuracy.toFixed(0)}%)</span>
                          </span>
                          <button
                            onClick={() => generatePractice(t.topicId, t.topicName)}
                            disabled={practicingTopic !== null}
                            style={{ fontSize: "0.72rem", padding: "3px 10px", borderRadius: "6px", border: "1px solid #dc2626", background: practicingTopic === t.topicId ? "#fee2e2" : "white", color: "#dc2626", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}
                          >
                            {practicingTopic === t.topicId ? "..." : "Practice"}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {practiceTopics.length > 0 && (
                  <div style={{ flex: 1, minWidth: "200px" }}>
                    <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#b45309", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      🟡 Needs More Practice
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {practiceTopics.map((t, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                          <span style={{ fontSize: "0.85rem", color: "#92400e" }}>
                            <strong>{t.topicName}</strong>
                            <span style={{ color: "#6b7280", fontSize: "0.78rem" }}> — {t.correctAnswers}/{t.totalQuestions} ({t.accuracy.toFixed(0)}%)</span>
                          </span>
                          <button
                            onClick={() => generatePractice(t.topicId, t.topicName)}
                            disabled={practicingTopic !== null}
                            style={{ fontSize: "0.72rem", padding: "3px 10px", borderRadius: "6px", border: "1px solid #b45309", background: practicingTopic === t.topicId ? "#fef3c7" : "white", color: "#b45309", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}
                          >
                            {practicingTopic === t.topicId ? "..." : "Practice"}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Question navigator */}
        {review.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <h3 style={{ margin: 0, fontSize: "1rem" }}>
                Question {reviewIndex + 1} of {total}
                <span style={{ marginLeft: "10px", fontWeight: 600, color: q?.isCorrect ? "#15803d" : (q?.selectedOptionIds?.length === 0 ? "#6b7280" : "#dc2626") }}>
                  {q?.selectedOptionIds?.length === 0 ? "— Skipped" : q?.isCorrect ? "✓ Correct" : "✗ Wrong"}
                </span>
              </h3>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {review.map((r, i) => {
                  const bg = r.selectedOptionIds.length === 0 ? "#e5e7eb" : r.isCorrect ? "#dcfce7" : "#fee2e2";
                  const border = i === reviewIndex ? "2px solid #2563eb" : "2px solid transparent";
                  return (
                    <button
                      key={i}
                      onClick={() => setReviewIndex(i)}
                      style={{ width: 32, height: 32, borderRadius: 6, background: bg, border, cursor: "pointer", fontSize: "0.75rem", fontWeight: 600 }}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
            </div>

            {q && (
              <div className="panel" style={{ border: `2px solid ${q.isCorrect ? "#86efac" : q.selectedOptionIds.length === 0 ? "#d1d5db" : "#fca5a5"}`, padding: "1.5rem" }}>
                <p style={{ marginBottom: "1rem", lineHeight: 1.7 }}>
                  <RichText content={q.prompt} />
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "1.25rem" }}>
                  {q.options.map((opt) => {
                    const isSelected = q.selectedOptionIds.includes(opt.id);
                    const isCorrect = q.correctOptionIds.includes(opt.id);
                    let bg = "var(--color-bg-secondary)";
                    let border = "1px solid var(--color-border)";
                    if (isCorrect) { bg = "#dcfce7"; border = "1.5px solid #16a34a"; }
                    else if (isSelected && !isCorrect) { bg = "#fee2e2"; border = "1.5px solid #dc2626"; }

                    return (
                      <div key={opt.id} style={{ padding: "10px 14px", borderRadius: 8, background: bg, border, display: "flex", alignItems: "flex-start", gap: "8px" }}>
                        <span style={{ fontWeight: 700, minWidth: 20, color: isCorrect ? "#15803d" : isSelected ? "#dc2626" : "inherit" }}>{opt.label}.</span>
                        <span style={{ flex: 1 }}><RichText content={opt.value} /></span>
                        {isCorrect && <span style={{ color: "#15803d", fontWeight: 700 }}>✓</span>}
                        {isSelected && !isCorrect && <span style={{ color: "#dc2626", fontWeight: 700 }}>✗</span>}
                      </div>
                    );
                  })}
                </div>

                {q.selectedOptionIds.length === 0 && (
                  <div style={{ marginBottom: "1rem", padding: "8px 12px", borderRadius: 6, background: "#f3f4f6", color: "#6b7280", fontSize: "0.85rem" }}>
                    You did not attempt this question.
                  </div>
                )}

                {q.explanation && (
                  <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "12px 16px" }}>
                    <strong style={{ fontSize: "0.85rem", color: "#1d4ed8" }}>Explanation</strong>
                    <div style={{ marginTop: "6px", fontSize: "0.9rem", lineHeight: 1.7 }}>
                      <RichText content={q.explanation} />
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1.25rem" }}>
                  <button className="secondary-button" disabled={reviewIndex === 0} onClick={() => setReviewIndex(i => i - 1)}>← Previous</button>
                  <button className="secondary-button" disabled={reviewIndex === total - 1} onClick={() => setReviewIndex(i => i + 1)}>Next →</button>
                </div>
              </div>
            )}
          </>
        )}
        </div>
      </>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <section className="section-heading">
        <p className="eyebrow">Student Portal</p>
        <h2>My Exam Results</h2>
        <p>Review every exam you have attempted — scores, topic insights, and question-by-question breakdown.</p>
      </section>

      {submissions.length === 0 ? (
        <div className="panel" style={{ textAlign: "center", padding: "3rem" }}>
          <p style={{ color: "var(--color-text-muted)" }}>You haven't attempted any exams yet.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {submissions.map((s) => (
            <div key={s.id} className="panel" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem", padding: "1.25rem 1.5rem" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 600, fontSize: "1rem", marginBottom: "4px" }}>{s.examName}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>{formatDate(s.submittedAt)}</div>
              </div>

              <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "1.25rem", fontWeight: 700, color: pctColor(s.percentage) }}>{s.percentage}%</div>
                  <div style={{ fontSize: "0.72rem", color: "var(--color-text-muted)" }}>Score</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontWeight: 600, color: "#15803d" }}>{s.correctAnswers}</div>
                  <div style={{ fontSize: "0.72rem", color: "var(--color-text-muted)" }}>Correct</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontWeight: 600, color: "#dc2626" }}>{s.incorrectAnswers}</div>
                  <div style={{ fontSize: "0.72rem", color: "var(--color-text-muted)" }}>Wrong</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontWeight: 600, color: "#6b7280" }}>{s.unattemptedAnswers}</div>
                  <div style={{ fontSize: "0.72rem", color: "var(--color-text-muted)" }}>Skipped</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>{s.obtainedMarks}/{s.totalMarks}</div>
                  <div style={{ fontSize: "0.72rem", color: "var(--color-text-muted)" }}>Marks</div>
                </div>
              </div>

              <button
                className="primary-button"
                style={{ padding: "8px 18px", fontSize: "0.85rem" }}
                disabled={loadingDetail}
                onClick={() => openDetail(s.id)}
              >
                {loadingDetail ? "Loading..." : "Review"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
