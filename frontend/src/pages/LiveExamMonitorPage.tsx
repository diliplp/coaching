import { useEffect, useState } from "react";
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

  const fetchStatus = async () => {
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
  };

  useEffect(() => {
    fetchStatus();
  }, [examId]);

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
  }, [autoRefresh, examId]);

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

  // Calculate overall progress percentage
  const totalQuestions = data?.totalQuestions || 1;
  const totalAnsweredByAll = students.reduce((acc: number, curr: any) => acc + (curr.answeredCount || 0), 0);
  const maxPossibleAnswers = stats.totalRegistered * totalQuestions;
  const overallProgress = maxPossibleAnswers > 0 ? Math.round((totalAnsweredByAll / maxPossibleAnswers) * 100) : 0;

  return (
    <div className="page">
      {/* Header section with back navigation and real-time indicators */}
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
          <h2 style={{ margin: 0 }}>📊 Live Proctor: {data?.examName}</h2>
          <p className="muted-copy" style={{ fontSize: "0.9rem", marginTop: "4px" }}>
            Real-time candidate tracking, progress monitoring, and engagement statistics.
          </p>
        </div>

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
          <div style={{
            width: "1px",
            height: "20px",
            background: "var(--color-border)"
          }} />
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
      </section>

      {/* Slido-style Stats Bar */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", 
        gap: "16px", 
        marginBottom: "24px" 
      }}>
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
              <span className="live-ping" style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                background: "#22c55e",
                display: "inline-block"
              }} />
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
      </div>

      {/* Progress Bar overall */}
      <div className="panel" style={{ padding: "20px", marginBottom: "28px", background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)" }}>
        <div className="row-between" style={{ marginBottom: "8px" }}>
          <strong style={{ fontSize: "0.95rem" }}>Class Progress Overview</strong>
          <span style={{ fontSize: "0.95rem", fontWeight: "bold", color: "var(--color-primary)" }}>{overallProgress}% Answered</span>
        </div>
        <div style={{ width: "100%", height: "10px", background: "#cbd5e1", borderRadius: "5px", overflow: "hidden" }}>
          <div style={{ width: `${overallProgress}%`, height: "100%", background: "var(--color-primary)", borderRadius: "5px", transition: "width 0.4s ease" }}></div>
        </div>
      </div>

      {/* Two column layout: Live Candidate Statuses, and Question-wise responses */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "24px", alignItems: "start" }} className="responsive-grid">
        
        {/* Student Status Grid */}
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

                if (student.status === "active") {
                  badgeColor = "#15803d";
                  badgeBg = "#dcfce7";
                  label = "Taking Exam";
                } else if (student.status === "submitted") {
                  badgeColor = "#0369a1";
                  badgeBg = "#e0f2fe";
                  label = "Submitted";
                } else if (student.status === "not_started") {
                  badgeColor = "#475569";
                  badgeBg = "#f8fafc";
                  label = "Not Started";
                }

                const progress = student.totalQuestions > 0 ? Math.round((student.answeredCount / student.totalQuestions) * 100) : 0;

                return (
                  <div key={student.studentId} className="row-between" style={{
                    padding: "16px",
                    borderRadius: "14px",
                    border: "1px solid var(--color-border)",
                    background: "white"
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <strong style={{ fontSize: "1.05rem" }}>{student.studentName}</strong>
                        <span style={{ 
                          padding: "2px 8px", 
                          borderRadius: "20px", 
                          fontSize: "0.75rem", 
                          fontWeight: "bold", 
                          color: badgeColor, 
                          background: badgeBg 
                        }}>
                          {label}
                        </span>
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
                        <div style={{ 
                          width: `${progress}%`, 
                          height: "100%", 
                          background: student.status === "submitted" ? "#0284c7" : "#22c55e", 
                          transition: "width 0.3s ease" 
                        }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Slido-style Question Stats Board */}
        <section className="panel" style={{ padding: "24px" }}>
          <h3 style={{ margin: "0 0 8px 0" }}>Question Analytics</h3>
          <p className="muted-copy" style={{ fontSize: "0.85rem", marginBottom: "16px" }}>
            Real-time statistics on question answers to spot difficult items immediately.
          </p>

          <div className="stack" style={{ gap: "16px" }}>
            {Array.from({ length: totalQuestions }).map((_, index) => {
              // Calculate how many active/submitted students answered this question index
              const studentsAttempted = students.filter((s: any) => {
                // If they submitted, they completed all or most.
                if (s.status === "submitted") return true;
                // If they are active and they are past or on this index and answeredCount fits
                return s.status === "active" && s.answeredCount > index;
              }).length;

              const percentAttempted = stats.totalRegistered > 0 ? Math.round((studentsAttempted / stats.totalRegistered) * 100) : 0;

              return (
                <div key={index} style={{
                  padding: "12px",
                  borderRadius: "10px",
                  border: "1px solid var(--color-border)",
                  background: "#f8fafc"
                }}>
                  <div className="row-between" style={{ marginBottom: "6px" }}>
                    <strong style={{ fontSize: "0.9rem" }}>Question {index + 1}</strong>
                    <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                      {studentsAttempted} / {stats.totalRegistered} ({percentAttempted}%)
                    </span>
                  </div>
                  <div style={{ width: "100%", height: "8px", background: "#e2e8f0", borderRadius: "4px", overflow: "hidden" }}>
                    <div style={{
                      width: `${percentAttempted}%`,
                      height: "100%",
                      background: "linear-gradient(90deg, #6366f1 0%, #4f46e5 100%)",
                      borderRadius: "4px",
                      transition: "width 0.3s ease"
                    }} />
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
        .live-ping {
          animation: pulse-ping 2s infinite ease-in-out;
        }
        @media (max-width: 768px) {
          .responsive-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
