import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiClient } from "../api/client";

export function LiveExamMonitorPage() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(5);

  const [leaderboard, setLeaderboard] = useState<any[] | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [forceSubmitting, setForceSubmitting] = useState(false);
  const [forceSubmitMsg, setForceSubmitMsg] = useState<string | null>(null);
  const [expandedViolations, setExpandedViolations] = useState<Set<string>>(new Set());
  const toggleViolations = (studentId: string) =>
    setExpandedViolations(prev => {
      const next = new Set(prev);
      next.has(studentId) ? next.delete(studentId) : next.add(studentId);
      return next;
    });

  const fetchStatus = useCallback(async () => {
    if (!examId) return;
    try {
      const res = await apiClient.getLiveExamStatus(examId);
      setData(res);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Failed to fetch live exam status");
    } finally {
      setLoading(false);
    }
  }, [examId]);

  const fetchLeaderboard = useCallback(async () => {
    if (!examId) return;
    setLeaderboardLoading(true);
    try {
      const res = await apiClient.getExamLeaderboard(examId);
      setLeaderboard(res.leaderboard);
    } catch (err: any) {
      console.error("Leaderboard fetch error:", err);
    } finally {
      setLeaderboardLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (!autoRefresh) return;
    setCountdown(5);

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchStatus();
          return 5;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [autoRefresh, fetchStatus]);

  // Determine if exam has ended
  const examEnded = data?.scheduledEndTime
    ? new Date(data.scheduledEndTime).getTime() < Date.now()
    : false;

  // Auto-load leaderboard once exam ends
  useEffect(() => {
    if (examEnded && leaderboard === null && !leaderboardLoading) {
      fetchLeaderboard();
    }
  }, [examEnded, leaderboard, leaderboardLoading, fetchLeaderboard]);

  const handleForceSubmit = async () => {
    if (!examId) return;
    if (!window.confirm("Force-submit all students who are still taking the exam? This will auto-evaluate their current answers.")) return;
    setForceSubmitting(true);
    setForceSubmitMsg(null);
    try {
      const res = await apiClient.forceSubmitAllExam(examId);
      setForceSubmitMsg(res.message);
      await fetchStatus();
      await fetchLeaderboard();
    } catch (err: any) {
      setForceSubmitMsg(`Error: ${err?.message || "Force submit failed"}`);
    } finally {
      setForceSubmitting(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="page" style={{ display: "grid", placeItems: "center", height: "60vh" }}>
        <div style={{ textAlign: "center" }}>
          <div className="spinner" style={{ margin: "0 auto 15px auto" }}></div>
          <p className="muted-copy">Initializing live tracking board...</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="page">
        <div className="panel error-box" style={{ textAlign: "center", padding: "40px" }}>
          <span style={{ fontSize: "3rem" }}>⚠️</span>
          <h3 style={{ marginTop: "10px" }}>Unable to Load Monitor</h3>
          <p className="muted-copy" style={{ margin: "10px 0 20px" }}>{error}</p>
          <button className="primary-button" onClick={() => void fetchStatus()}>Retry Connection</button>
        </div>
      </div>
    );
  }

  const stats = data?.statistics || { totalRegistered: 0, activeCount: 0, submittedCount: 0, offlineCount: 0, notStartedCount: 0 };
  const students = data?.students || [];

  const totalQuestions = data?.totalQuestions || 1;
  const totalAnsweredByAll = students.reduce((acc: number, curr: any) => acc + (curr.answeredCount || 0), 0);
  const maxPossibleAnswers = stats.totalRegistered * totalQuestions;
  const overallProgress = maxPossibleAnswers > 0 ? Math.round((totalAnsweredByAll / maxPossibleAnswers) * 100) : 0;

  const scheduledEnd = data?.scheduledEndTime ? new Date(data.scheduledEndTime) : null;
  const scheduledStart = data?.scheduledStartTime ? new Date(data.scheduledStartTime) : null;

  return (
    <div className="page">
      {/* Header */}
      <section className="row-between" style={{ marginBottom: "24px", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <button
            type="button"
            className="secondary-button"
            style={{ padding: "6px 12px", fontSize: "0.85rem", marginBottom: "8px" }}
            onClick={() => navigate("/exams")}
          >
            ← Back to Exams
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>📊 Live Proctor: {data?.examName}</h2>
            {examEnded && (
              <span style={{ padding: "4px 12px", background: "#fef2f2", color: "#dc2626", borderRadius: "20px", fontSize: "0.8rem", fontWeight: 700, border: "1px solid #fca5a5" }}>
                EXAM ENDED
              </span>
            )}
          </div>
          {(scheduledStart || scheduledEnd) && (
            <p className="muted-copy" style={{ fontSize: "0.85rem", marginTop: "4px" }}>
              {scheduledStart && `Start: ${scheduledStart.toLocaleString()}`}
              {scheduledStart && scheduledEnd && " · "}
              {scheduledEnd && `End: ${scheduledEnd.toLocaleString()}`}
            </p>
          )}
          <p className="muted-copy" style={{ fontSize: "0.9rem", marginTop: "4px" }}>
            Real-time candidate tracking, progress monitoring, and engagement statistics.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-end" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "white", padding: "10px 16px", borderRadius: "14px", border: "1px solid var(--color-border)" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "0.9rem", fontWeight: 500 }}>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                style={{ width: "16px", height: "16px", accentColor: "var(--color-primary)" }}
              />
              Auto-sync
            </label>
            <div style={{ width: "1px", height: "20px", background: "var(--color-border)" }} />
            <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
              {autoRefresh ? `Syncing in ${countdown}s...` : "Sync paused"}
            </span>
            <button
              type="button"
              className="icon-button"
              onClick={() => void fetchStatus()}
              title="Force refresh"
              style={{ background: "#f1f5f9", padding: "6px 10px", borderRadius: "8px" }}
            >
              🔄
            </button>
          </div>

          {/* Force-submit button */}
          {stats.activeCount > 0 && (
            <button
              type="button"
              onClick={() => void handleForceSubmit()}
              disabled={forceSubmitting}
              style={{
                padding: "8px 16px", borderRadius: "10px", border: "none", cursor: "pointer",
                background: "#dc2626", color: "white", fontWeight: 600, fontSize: "0.85rem",
                opacity: forceSubmitting ? 0.6 : 1
              }}
            >
              {forceSubmitting ? "Submitting..." : `⏹ Force Submit ${stats.activeCount} Active`}
            </button>
          )}
          {forceSubmitMsg && (
            <p style={{ fontSize: "0.8rem", color: "#0369a1", margin: 0 }}>{forceSubmitMsg}</p>
          )}
        </div>
      </section>

      {/* Stats Bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px", marginBottom: "24px" }}>
        <div style={{ background: "white", padding: "20px", borderRadius: "18px", border: "1px solid var(--color-border)", textAlign: "center" }}>
          <div className="muted-copy" style={{ fontSize: "0.85rem", fontWeight: 600 }}>REGISTERED</div>
          <div style={{ fontSize: "2rem", fontWeight: "800", color: "#1e293b", margin: "8px 0" }}>{stats.totalRegistered}</div>
          <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>Students in Batch</div>
        </div>

        <div style={{ background: "white", padding: "20px", borderRadius: "18px", border: "1px solid var(--color-border)", textAlign: "center", position: "relative" }}>
          <div className="muted-copy" style={{ fontSize: "0.85rem", fontWeight: 600 }}>🟢 ACTIVE NOW</div>
          <div style={{ fontSize: "2rem", fontWeight: "800", color: "#22c55e", margin: "8px 0" }}>
            {stats.activeCount}
            {stats.activeCount > 0 && (
              <span className="live-ping" style={{ position: "absolute", top: "16px", right: "16px", width: "10px", height: "10px", borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
            )}
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>Taking test right now</div>
        </div>

        <div style={{ background: "white", padding: "20px", borderRadius: "18px", border: "1px solid var(--color-border)", textAlign: "center" }}>
          <div className="muted-copy" style={{ fontSize: "0.85rem", fontWeight: 600 }}>🏁 SUBMITTED</div>
          <div style={{ fontSize: "2rem", fontWeight: "800", color: "var(--color-primary)", margin: "8px 0" }}>{stats.submittedCount}</div>
          <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>Completed exam</div>
        </div>

        <div style={{ background: "white", padding: "20px", borderRadius: "18px", border: "1px solid var(--color-border)", textAlign: "center" }}>
          <div className="muted-copy" style={{ fontSize: "0.85rem", fontWeight: 600 }}>💤 OFFLINE / ABSENT</div>
          <div style={{ fontSize: "2rem", fontWeight: "800", color: "#64748b", margin: "8px 0" }}>{stats.offlineCount + stats.notStartedCount}</div>
          <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>Not currently in exam</div>
        </div>

        <div style={{ background: students.some((s: any) => (s.violations?.length ?? 0) > 0) ? "#fff5f5" : "white", padding: "20px", borderRadius: "18px", border: `1px solid ${students.some((s: any) => (s.violations?.length ?? 0) > 0) ? "#fca5a5" : "var(--color-border)"}`, textAlign: "center" }}>
          <div className="muted-copy" style={{ fontSize: "0.85rem", fontWeight: 600 }}>🚨 INTEGRITY FLAGS</div>
          <div style={{ fontSize: "2rem", fontWeight: "800", color: "#dc2626", margin: "8px 0" }}>
            {students.filter((s: any) => (s.violations?.length ?? 0) > 0).length}
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>Students with violations</div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="panel" style={{ padding: "20px", marginBottom: "28px", background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)" }}>
        <div className="row-between" style={{ marginBottom: "8px" }}>
          <strong style={{ fontSize: "0.95rem" }}>Class Progress Overview</strong>
          <span style={{ fontSize: "0.95rem", fontWeight: "bold", color: "var(--color-primary)" }}>{overallProgress}% Answered</span>
        </div>
        <div style={{ width: "100%", height: "10px", background: "#cbd5e1", borderRadius: "5px", overflow: "hidden" }}>
          <div style={{ width: `${overallProgress}%`, height: "100%", background: "var(--color-primary)", borderRadius: "5px", transition: "width 0.4s ease" }}></div>
        </div>
      </div>

      {/* Leaderboard — shown when exam ended or manually triggered */}
      {(examEnded || leaderboard !== null) && (
        <div className="panel" style={{ padding: "24px", marginBottom: "28px", background: "linear-gradient(135deg, #fffbeb 0%, #fef9c3 100%)", border: "1px solid #fde047" }}>
          <div className="row-between" style={{ marginBottom: "16px", flexWrap: "wrap", gap: "8px" }}>
            <div>
              <h3 style={{ margin: 0 }}>🏆 Leaderboard</h3>
              {examEnded && <p className="muted-copy" style={{ fontSize: "0.85rem", margin: "4px 0 0" }}>Exam ended · Final rankings based on submitted scores</p>}
            </div>
            <button
              type="button"
              className="secondary-button"
              style={{ fontSize: "0.85rem" }}
              onClick={() => void fetchLeaderboard()}
              disabled={leaderboardLoading}
            >
              {leaderboardLoading ? "Refreshing..." : "↻ Refresh"}
            </button>
          </div>

          {leaderboardLoading && !leaderboard && (
            <p className="muted-copy">Loading leaderboard...</p>
          )}

          {leaderboard && leaderboard.length === 0 && (
            <p className="muted-copy">No submissions yet.</p>
          )}

          {leaderboard && leaderboard.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                <thead>
                  <tr style={{ background: "#fef08a" }}>
                    <th style={{ padding: "10px 12px", textAlign: "center", borderBottom: "2px solid #fde047", width: "50px" }}>Rank</th>
                    <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "2px solid #fde047" }}>Student</th>
                    <th style={{ padding: "10px 12px", textAlign: "center", borderBottom: "2px solid #fde047" }}>Marks</th>
                    <th style={{ padding: "10px 12px", textAlign: "center", borderBottom: "2px solid #fde047" }}>%</th>
                    <th style={{ padding: "10px 12px", textAlign: "center", borderBottom: "2px solid #fde047" }}>✓</th>
                    <th style={{ padding: "10px 12px", textAlign: "center", borderBottom: "2px solid #fde047" }}>✗</th>
                    <th style={{ padding: "10px 12px", textAlign: "center", borderBottom: "2px solid #fde047" }}>–</th>
                    <th style={{ padding: "10px 12px", textAlign: "center", borderBottom: "2px solid #fde047" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry, idx) => {
                    const isTop3 = entry.rank !== null && entry.rank <= 3;
                    const medal = entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : null;
                    return (
                      <tr
                        key={entry.studentId}
                        style={{
                          background: idx % 2 === 0 ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.3)",
                          fontWeight: isTop3 ? 700 : 400
                        }}
                      >
                        <td style={{ padding: "10px 12px", textAlign: "center", fontSize: medal ? "1.2rem" : "0.9rem" }}>
                          {medal || (entry.rank ?? "—")}
                        </td>
                        <td style={{ padding: "10px 12px" }}>{entry.studentName}</td>
                        <td style={{ padding: "10px 12px", textAlign: "center" }}>
                          {entry.submitted ? `${entry.obtainedMarks} / ${entry.totalMarks}` : "—"}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "center", color: entry.percentage !== null && entry.percentage >= 60 ? "#15803d" : "#dc2626", fontWeight: 600 }}>
                          {entry.percentage !== null ? `${entry.percentage}%` : "—"}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "center", color: "#15803d" }}>
                          {entry.correctAnswers ?? "—"}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "center", color: "#dc2626" }}>
                          {entry.incorrectAnswers ?? "—"}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "center", color: "#64748b" }}>
                          {entry.unattemptedAnswers ?? "—"}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "center" }}>
                          {entry.submitted ? (
                            <span style={{ padding: "2px 8px", borderRadius: "20px", fontSize: "0.75rem", fontWeight: 700, color: "#0369a1", background: "#e0f2fe" }}>Submitted</span>
                          ) : (
                            <span style={{ padding: "2px 8px", borderRadius: "20px", fontSize: "0.75rem", fontWeight: 700, color: "#64748b", background: "#f1f5f9" }}>Pending</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Manual leaderboard trigger when exam not ended yet */}
      {!examEnded && leaderboard === null && stats.submittedCount > 0 && (
        <div style={{ marginBottom: "20px", textAlign: "center" }}>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void fetchLeaderboard()}
            disabled={leaderboardLoading}
          >
            {leaderboardLoading ? "Loading..." : "📋 Show Current Leaderboard"}
          </button>
        </div>
      )}

      {/* Student Statuses + Question Analytics */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "24px", alignItems: "start" }} className="responsive-grid">

        <section className="panel" style={{ padding: "24px" }}>
          <h3 style={{ margin: "0 0 16px 0" }}>Candidates Directory ({students.length})</h3>

          {students.length === 0 ? (
            <p className="muted-copy">No students assigned to this exam's batch.</p>
          ) : (
            <div className="stack" style={{ gap: "14px" }}>
              {students.map((student: any) => {
                let badgeColor = "#64748b";
                let badgeBg = "#f1f5f9";
                let label = "Offline";

                if (student.status === "active") { badgeColor = "#15803d"; badgeBg = "#dcfce7"; label = "Taking Exam"; }
                else if (student.status === "submitted") { badgeColor = "#0369a1"; badgeBg = "#e0f2fe"; label = "Submitted"; }
                else if (student.status === "not_started") { badgeColor = "#475569"; badgeBg = "#f8fafc"; label = "Not Started"; }

                const progress = student.totalQuestions > 0 ? Math.round((student.answeredCount / student.totalQuestions) * 100) : 0;

                const violations: { type: string; timestamp: string }[] = student.violations ?? [];
                const violationCount = violations.length;
                const isExpanded = expandedViolations.has(student.studentId);

                const violationLabel = (type: string) => {
                  if (type === "tab_switch") return "Tab Switch";
                  if (type === "window_blur") return "Window Switch";
                  return type.replace(/_/g, " ");
                };

                return (
                  <div key={student.studentId} style={{ borderRadius: "14px", border: `1px solid ${violationCount > 0 ? "#fca5a5" : "var(--color-border)"}`, background: violationCount >= 3 ? "#fff5f5" : "white", overflow: "hidden" }}>
                    <div className="row-between" style={{ padding: "16px" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                          <strong style={{ fontSize: "1.05rem" }}>{student.studentName}</strong>
                          <span style={{ padding: "2px 8px", borderRadius: "20px", fontSize: "0.75rem", fontWeight: "bold", color: badgeColor, background: badgeBg }}>
                            {label}
                          </span>
                          {violationCount > 0 && (
                            <button
                              onClick={() => toggleViolations(student.studentId)}
                              style={{ display: "flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "20px", fontSize: "0.75rem", fontWeight: 700, color: violationCount >= 3 ? "#fff" : "#b91c1c", background: violationCount >= 3 ? "#dc2626" : "#fee2e2", border: "none", cursor: "pointer" }}
                            >
                              🚨 {violationCount} Violation{violationCount !== 1 ? "s" : ""} {isExpanded ? "▲" : "▼"}
                            </button>
                          )}
                        </div>
                        <div className="muted-copy" style={{ fontSize: "0.85rem", marginTop: "6px" }}>
                          {student.status === "active" && `Currently on Question ${student.currentQuestionIndex + 1}`}
                          {student.status === "submitted" && "Completed and submitted answers"}
                          {student.status === "offline" && `Left / Disconnected (last active: ${student.lastActive ? new Date(student.lastActive).toLocaleTimeString() : "N/A"})`}
                          {student.status === "not_started" && "Has not opened the exam link yet"}
                        </div>
                      </div>

                      <div style={{ textAlign: "right", minWidth: "140px", marginLeft: "16px" }}>
                        <div style={{ fontSize: "0.85rem", fontWeight: "600", marginBottom: "4px" }}>
                          {student.answeredCount} / {student.totalQuestions} Questions
                        </div>
                        <div style={{ width: "100%", height: "6px", background: "#f1f5f9", borderRadius: "3px", overflow: "hidden" }}>
                          <div style={{ width: `${progress}%`, height: "100%", background: student.status === "submitted" ? "#0284c7" : "#22c55e", transition: "width 0.3s ease" }} />
                        </div>
                      </div>
                    </div>

                    {/* Violation log — expanded on click */}
                    {isExpanded && violationCount > 0 && (
                      <div style={{ borderTop: "1px solid #fca5a5", background: "#fff1f2", padding: "12px 16px" }}>
                        <p style={{ margin: "0 0 8px", fontSize: "0.78rem", fontWeight: 700, color: "#b91c1c", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Integrity Violation Log
                        </p>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          {violations.map((v, idx) => (
                            <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", color: "#7f1d1d" }}>
                              <span>#{idx + 1} — {violationLabel(v.type)}</span>
                              <span style={{ color: "#b91c1c" }}>{new Date(v.timestamp).toLocaleTimeString()}</span>
                            </div>
                          ))}
                        </div>
                        {violationCount >= 3 && (
                          <p style={{ margin: "8px 0 0", fontSize: "0.8rem", fontWeight: 700, color: "#dc2626" }}>
                            ⚠️ Exam was auto-submitted due to repeated violations.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="panel" style={{ padding: "24px" }}>
          <h3 style={{ margin: "0 0 8px 0" }}>Question Analytics</h3>
          <p className="muted-copy" style={{ fontSize: "0.85rem", marginBottom: "16px" }}>
            Real-time statistics on question answers to spot difficult items immediately.
          </p>

          <div className="stack" style={{ gap: "16px" }}>
            {Array.from({ length: totalQuestions }).map((_, index) => {
              const studentsAttempted = students.filter((s: any) => {
                if (s.status === "submitted") return true;
                return s.status === "active" && s.answeredCount > index;
              }).length;

              const percentAttempted = stats.totalRegistered > 0 ? Math.round((studentsAttempted / stats.totalRegistered) * 100) : 0;

              return (
                <div key={index} style={{ padding: "12px", borderRadius: "10px", border: "1px solid var(--color-border)", background: "#f8fafc" }}>
                  <div className="row-between" style={{ marginBottom: "6px" }}>
                    <strong style={{ fontSize: "0.9rem" }}>Question {index + 1}</strong>
                    <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                      {studentsAttempted} / {stats.totalRegistered} ({percentAttempted}%)
                    </span>
                  </div>
                  <div style={{ width: "100%", height: "8px", background: "#e2e8f0", borderRadius: "4px", overflow: "hidden" }}>
                    <div style={{ width: `${percentAttempted}%`, height: "100%", background: "linear-gradient(90deg, #6366f1 0%, #4f46e5 100%)", borderRadius: "4px", transition: "width 0.3s ease" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <style>{`
        @keyframes pulse-ping {
          0% { transform: scale(0.95); opacity: 0.5; }
          50% { transform: scale(1.1); opacity: 0.8; }
          100% { transform: scale(0.95); opacity: 0.5; }
        }
        .live-ping { animation: pulse-ping 2s infinite ease-in-out; }
        @media (max-width: 768px) {
          .responsive-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
