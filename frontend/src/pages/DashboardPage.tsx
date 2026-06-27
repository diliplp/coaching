import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../api/client";
import { getStoredSession } from "../auth";
import { liveExamState } from "../data/mockExamContext";
import type { AdaptivePlan, BatchAdaptivePlan, OverviewResponse, QuestionBankResponse } from "../types";
import { getSubjectByKey, chapterKey } from "../data/ncert-syllabus";
import type { ChapterStatus } from "../data/ncert-syllabus";
import { chapterPriority } from "../data/cbse-weightage";

export function DashboardPage() {
  const navigate = useNavigate();
  const session = getStoredSession();
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [questionBank, setQuestionBank] = useState<QuestionBankResponse | null>(null);
  const [adaptivePlan, setAdaptivePlan] = useState<AdaptivePlan | null>(null);
  const [batchPlans, setBatchPlans] = useState<BatchAdaptivePlan[]>([]);
  const [adaptiveStatus, setAdaptiveStatus] = useState("");
  const [teacherAdaptiveStatus, setTeacherAdaptiveStatus] = useState("");
  const [syllabusProfile, setSyllabusProfile] = useState<{ classLevel: string; subjectKeys: string[]; setupDone: boolean } | null>(null);
  const [syllabusProgress, setSyllabusProgress] = useState<Record<string, ChapterStatus>>({});
  const [startingExamId, setStartingExamId] = useState<string | null>(null);
  const [examStartError, setExamStartError] = useState<string | null>(null);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const formatCountdown = (target: Date) => {
    const diff = Math.max(0, target.getTime() - now.getTime());
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    const s = Math.floor((diff % 60_000) / 1000);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  // Self-generation state
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [allowedSources, setAllowedSources] = useState<string[]>(["pyq", "reference", "textbook", "ai_generated", "custom"]);
  const [qCount, setQCount] = useState(10);

  useEffect(() => {
    apiClient.getOverview().then(setData).catch(console.error);
    if (session?.user.role === "student") {
      apiClient.getQuestionBank().then(setQuestionBank).catch(console.error);
      Promise.all([apiClient.getSyllabusProfile(), apiClient.getSyllabusProgress()])
        .then(([p, prog]) => {
          setSyllabusProfile(p);
          setSyllabusProgress((prog ?? {}) as Record<string, ChapterStatus>);
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (session?.user.role !== "student") {
      return;
    }

    apiClient
      .getMyAdaptiveSuggestion()
      .then((plan) => {
        setAdaptivePlan(plan);
        setAdaptiveStatus("Adaptive practice suggestion ready.");
      })
      .catch(() => {
        setAdaptivePlan(null);
        setAdaptiveStatus("Take at least one exam to unlock adaptive suggestions.");
      });
  }, [session?.user.role]);

  useEffect(() => {
    if (session?.user.role !== "teacher" && session?.user.role !== "super_admin") {
      return;
    }

    apiClient
      .getBatchAdaptivePlans()
      .then((plans) => {
        setBatchPlans(plans);
        setTeacherAdaptiveStatus(
          plans.length > 0
            ? "Batch-wise adaptive recommendations are ready."
            : "No batch-level adaptive recommendations yet."
        );
      })
      .catch(() => {
        setBatchPlans([]);
        setTeacherAdaptiveStatus("Batch-wise adaptive recommendations are not available yet.");
      });
  }, [session?.user.role]);

  if (!data) {
    return <p>Loading dashboard...</p>;
  }

  const startExam = async (examId: string) => {
    setStartingExamId(examId);
    setExamStartError(null);
    try {
      const payload = await apiClient.getExam(examId);
      liveExamState.generatedExam = payload;
      liveExamState.latestResult = null;
      navigate("/live-exam");
    } catch (e: any) {
      setExamStartError(e?.message || "Failed to load exam. Please try again.");
    } finally {
      setStartingExamId(null);
    }
  };

  const generateAdaptiveExam = async () => {
    setAdaptiveStatus("Generating your adaptive test...");
    try {
      const payload = await apiClient.generateMyAdaptiveExam();
      liveExamState.generatedExam = payload;
      liveExamState.latestResult = null;
      navigate("/live-exam");
    } catch (error) {
      console.error(error);
      setAdaptiveStatus("Unable to generate adaptive test right now.");
    }
  };

  const handleSelfGenerate = async () => {
    if (selectedTopicIds.length === 0) return;
    try {
      const payload = await apiClient.selfGenerateExam({
        topicIds: selectedTopicIds,
        questionCount: qCount,
        allowedSourceTypes: allowedSources as any
      });
      liveExamState.generatedExam = payload;
      liveExamState.latestResult = null;
      navigate("/live-exam");
    } catch (e: any) {
      alert(e.message || "Failed to generate practice test");
    }
  };

  const todayFocus = useMemo(() => {
    if (!syllabusProfile?.setupDone) return null;
    let best: { subjectKey: string; subjectName: string; chapterName: string; priority: number } | null = null;
    for (const key of syllabusProfile.subjectKeys) {
      const sub = getSubjectByKey(key);
      if (!sub) continue;
      sub.chapters.forEach((ch, i) => {
        const status = (syllabusProgress[chapterKey(key, i)] ?? "not_started") as ChapterStatus;
        if (status === "studied") return;
        const score = chapterPriority(key, i, status);
        if (score > 0 && (!best || score > best.priority)) {
          best = { subjectKey: key, subjectName: sub.shortName, chapterName: ch.name, priority: score };
        }
      });
    }
    if (!best) {
      // Fall back to first in_progress or not_started chapter (no CBSE marks, e.g. Class XI)
      for (const key of syllabusProfile.subjectKeys) {
        const sub = getSubjectByKey(key);
        if (!sub) continue;
        for (let i = 0; i < sub.chapters.length; i++) {
          const status = (syllabusProgress[chapterKey(key, i)] ?? "not_started") as ChapterStatus;
          if (status !== "studied") {
            return { subjectKey: key, subjectName: sub.shortName, chapterName: sub.chapters[i].name, priority: 0 };
          }
        }
      }
    }
    return best;
  }, [syllabusProfile, syllabusProgress]);

  return (
    <div className="page">
      <section className="hero-card">
        <div>
          <p className="eyebrow" style={{ margin: 0 }}>{session?.user.role === "student" ? "Student Dashboard" : "Institute Control Panel"}</p>
          <h2 style={{ margin: "4px 0 2px", fontSize: "1.4rem" }}>{session?.user.role === "student" ? `Welcome back, ${session.user.name}` : "Smart exam operations for tuition classes"}</h2>
          <p className="hero-copy" style={{ margin: 0, fontSize: "0.85rem", opacity: 0.8 }}>
            {session?.user.role === "student"
              ? "Access your scheduled exams, create custom practice tests, and review your performance insights."
              : "Manage classes, streams, batches, question banks, dynamic exam creation, and automated analytics."}
          </p>
        </div>
      </section>

      {/* ── Syllabus Progress Widget (students) ───────────────────────── */}
      {session?.user.role === "student" && (
        <section className="panel" style={{ marginTop: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
            <div>
              <p className="eyebrow" style={{ margin: 0 }}>Syllabus Tracker</p>
              <h3 style={{ margin: "4px 0 0", fontSize: "1.1rem" }}>
                {syllabusProfile?.setupDone ? `Class ${syllabusProfile.classLevel} Progress` : "Track Your NCERT Syllabus"}
              </h3>
            </div>
            <button
              className="secondary-button"
              style={{ fontSize: "0.82rem", padding: "6px 14px" }}
              onClick={() => navigate("/syllabus-tracker")}
            >
              {syllabusProfile?.setupDone ? "View Full Tracker" : "Set Up Tracker"}
            </button>
          </div>

          {syllabusProfile?.setupDone ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "10px" }}>
              {(syllabusProfile.subjectKeys ?? []).map((key) => {
                const sub = getSubjectByKey(key);
                if (!sub) return null;
                const total = sub.chapters.length;
                const studied = sub.chapters.filter(
                  (_, i) => syllabusProgress[chapterKey(key, i)] === "studied"
                ).length;
                const pct = total ? Math.round((studied / total) * 100) : 0;
                const color = pct === 100 ? "#16a34a" : pct >= 50 ? "#0070f3" : "#64748b";
                return (
                  <div
                    key={key}
                    style={{ padding: "12px", background: "var(--color-bg-secondary)", borderRadius: "10px", border: "1px solid var(--color-border)" }}
                  >
                    <div style={{ fontSize: "0.82rem", fontWeight: 600, marginBottom: "6px", color }}>{sub.shortName}</div>
                    <div style={{ height: "5px", borderRadius: "3px", background: "#e5e7eb", overflow: "hidden", marginBottom: "5px" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: "3px", transition: "width 0.3s" }} />
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>{studied}/{total} · {pct}%</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ color: "var(--color-text-muted)", margin: 0, fontSize: "0.9rem" }}>
              Set up your syllabus tracker to monitor chapter-wise NCERT 2024 progress and board exam priorities.
            </p>
          )}
        </section>
      )}

      {/* ── Today's Focus (students with tracker set up) ───────────────── */}
      {session?.user.role === "student" && todayFocus && (
        <section style={{ marginTop: "12px", padding: "14px 18px", borderRadius: "10px", background: "linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)", border: "1px solid #bbf7d0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ fontSize: "1.6rem", lineHeight: 1 }}>🎯</div>
            <div>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#15803d", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "2px" }}>Today's Focus</div>
              <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#064e3b" }}>{todayFocus.chapterName}</div>
              <div style={{ fontSize: "0.78rem", color: "#047857", marginTop: "1px" }}>{todayFocus.subjectName}{todayFocus.priority > 0 ? ` · ~${todayFocus.priority} CBSE marks` : ""}</div>
            </div>
          </div>
          <button
            className="secondary-button"
            style={{ fontSize: "0.8rem", padding: "6px 14px", flexShrink: 0 }}
            onClick={() => navigate("/syllabus-tracker")}
          >
            Mark as Studied
          </button>
        </section>
      )}

      {session?.user.role === "student" && (
        <div className="grid-two" style={{ marginTop: "20px", gap: "30px" }}>
          {/* Left Column: Scheduled Exams */}
          <section className="panel" style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ marginBottom: "20px" }}>
              <span className="tag" style={{ background: "rgba(0,112,243,0.1)", color: "#0070f3", border: "none" }}>BATCH UPDATES</span>
              <h3 style={{ marginTop: "10px", fontSize: "1.5rem" }}>Scheduled Exams</h3>
              <p className="muted-copy">Official tests assigned to your batch</p>
            </div>

            {examStartError && (
              <div style={{ padding: "12px 16px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", color: "#dc2626", fontSize: "0.9rem", marginBottom: "12px" }}>
                {examStartError}
              </div>
            )}
            {data.scheduledExams.length === 0 ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px", background: "rgba(0,0,0,0.02)", borderRadius: "12px", border: "1px dashed var(--color-border)" }}>
                <p className="muted-copy">No active scheduled exams right now.</p>
              </div>
            ) : (
              <div className="stack" style={{ gap: "12px" }}>
                {data.scheduledExams.map(exam => {
                  const startTime = exam.scheduledStartTime ? new Date(exam.scheduledStartTime) : null;
                  const endTime = exam.scheduledEndTime ? new Date(exam.scheduledEndTime) : null;
                  const hasStarted = !startTime || startTime <= now;
                  const hasEnded = !!(endTime && endTime < now);
                  const isAvailable = hasStarted && !hasEnded;
                  const startsSoon = !hasStarted && startTime && (startTime.getTime() - now.getTime()) < 3_600_000;

                  return (
                    <article key={exam.id} className="row-between" style={{
                      padding: "16px", background: "white", borderRadius: "12px",
                      border: `1px solid ${isAvailable ? "var(--color-primary)" : startsSoon ? "#f59e0b" : "var(--color-border)"}`,
                      opacity: hasEnded ? 0.6 : 1, transition: "all 0.2s"
                    }}>
                      <div style={{ display: "flex", gap: "15px", alignItems: "center" }}>
                        <div style={{
                          width: "40px", height: "40px", borderRadius: "8px",
                          background: isAvailable ? "#eff6ff" : startsSoon ? "#fffbeb" : "#f8fafc",
                          display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem"
                        }}>
                          {hasEnded ? "🏁" : isAvailable ? "📝" : "⏳"}
                        </div>
                        <div>
                          <strong style={{ fontSize: "1.05rem" }}>{exam.name}</strong>
                          <div className="muted-copy" style={{ fontSize: "0.82rem", marginTop: "2px" }}>
                            ⏱️ {exam.durationMinutes} min
                            {isAvailable && endTime && ` • Ends in ${formatCountdown(endTime)}`}
                            {!hasStarted && startTime && (
                              <span style={{ color: startsSoon ? "#d97706" : "#64748b", fontWeight: startsSoon ? 600 : 400 }}>
                                {" "}• Starts in <strong>{formatCountdown(startTime)}</strong>
                              </span>
                            )}
                            {hasEnded && " • Ended"}
                          </div>
                        </div>
                      </div>
                      <button
                        className={isAvailable ? "primary-button" : "secondary-button"}
                        onClick={() => { if (isAvailable && !startingExamId) void startExam(exam.id); }}
                        disabled={!isAvailable || !!startingExamId}
                        style={{ padding: "8px 20px", minWidth: "110px" }}
                      >
                        {startingExamId === exam.id ? "Loading..." : hasEnded ? "Ended" : isAvailable ? "Start Exam" : "Upcoming"}
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* Right Column: Practice Builder */}
          <section className="panel" style={{ border: "2px solid rgba(0,112,243,0.1)", background: "white" }}>
            <div style={{ marginBottom: "20px" }}>
              <span className="tag" style={{ background: "rgba(34,197,94,0.1)", color: "#16a34a", border: "none" }}>QUESTION BANK</span>
              <h3 style={{ marginTop: "10px", fontSize: "1.5rem" }}>Self-Practice Builder</h3>
              <p className="muted-copy">Pick any topic to generate a quick practice test</p>
            </div>

            <div className="stack" style={{ gap: "20px" }}>
              <label className="field">
                <span style={{ fontWeight: "600", fontSize: "0.85rem", color: "var(--color-text-muted)" }}>SUBJECT</span>
                <select
                  value={selectedSubjectId}
                  onChange={e => { setSelectedSubjectId(e.target.value); setSelectedTopicIds([]); }}
                  style={{ borderRadius: "10px", padding: "12px", border: "1px solid var(--color-border)", background: "var(--color-bg-secondary)" }}
                >
                  <option value="">Select Subject</option>
                  {questionBank?.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>

              <div className="field">
                <span style={{ fontWeight: "600", fontSize: "0.85rem", color: "var(--color-text-muted)" }}>SELECT TOPICS</span>
                <div style={{
                  background: "var(--color-bg-secondary)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "10px",
                  padding: "8px",
                  maxHeight: "180px",
                  overflowY: "auto",
                  marginTop: "8px"
                }}>
                  {questionBank?.topics.filter(t => t.subjectId === selectedSubjectId).map(t => (
                    <label key={t.id} style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "10px 12px",
                      marginBottom: "4px",
                      fontSize: "0.95rem",
                      borderRadius: "8px",
                      cursor: "pointer",
                      transition: "background 0.2s",
                      backgroundColor: selectedTopicIds.includes(t.id) ? "white" : "transparent",
                      boxShadow: selectedTopicIds.includes(t.id) ? "0 2px 4px rgba(0,0,0,0.05)" : "none",
                      border: selectedTopicIds.includes(t.id) ? "1px solid var(--color-primary-light)" : "1px solid transparent"
                    }}>
                      <input
                        type="checkbox"
                        checked={selectedTopicIds.includes(t.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedTopicIds([...selectedTopicIds, t.id]);
                          else setSelectedTopicIds(selectedTopicIds.filter(id => id !== t.id));
                        }}
                        style={{ width: "18px", height: "18px" }}
                      />
                      <span style={{ fontWeight: selectedTopicIds.includes(t.id) ? "600" : "400" }}>{t.name}</span>
                    </label>
                  ))}
                  {(!selectedSubjectId || questionBank?.topics.filter(t => t.subjectId === selectedSubjectId).length === 0) && (
                    <div style={{ textAlign: "center", padding: "30px" }}>
                      <p className="muted-copy" style={{ fontSize: "0.9rem" }}>Select a subject to see topics</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="field">
                <span style={{ fontWeight: "600", fontSize: "0.85rem", color: "var(--color-text-muted)" }}>QUESTION SOURCES</span>
                <div style={{ display: "flex", gap: "15px", marginTop: "10px", flexWrap: "wrap" }}>
                  {[
                    { id: "pyq", label: "PYQs" },
                    { id: "reference", label: "Reference Books" },
                    { id: "textbook", label: "Textbooks" },
                    { id: "ai_generated", label: "AI-Saved" },
                    { id: "custom", label: "Custom Bank" }
                  ].map(source => (
                    <label key={source.id} style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      cursor: "pointer",
                      fontSize: "0.9rem",
                      background: allowedSources.includes(source.id) ? "rgba(0,112,243,0.05)" : "var(--color-bg-secondary)",
                      padding: "10px 16px",
                      borderRadius: "12px",
                      border: allowedSources.includes(source.id) ? "1px solid var(--color-primary)" : "1px solid var(--color-border)",
                      transition: "all 0.2s"
                    }}>
                      <input
                        type="checkbox"
                        checked={allowedSources.includes(source.id)}
                        onChange={(e) => {
                          if (e.target.checked) setAllowedSources([...allowedSources, source.id]);
                          else if (allowedSources.length > 1) setAllowedSources(allowedSources.filter(s => s !== source.id));
                        }}
                      />
                      <span style={{ fontWeight: "500" }}>{source.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid-two" style={{ alignItems: "flex-end", gap: "20px" }}>
                <label className="field" style={{ flex: 1 }}>
                  <span style={{ fontWeight: "600", fontSize: "0.85rem", color: "var(--color-text-muted)" }}>QUESTIONS</span>
                  <input
                    type="number"
                    value={qCount}
                    onChange={e => setQCount(Number(e.target.value))}
                    min={1} max={50}
                    style={{ borderRadius: "10px", padding: "12px", border: "1px solid var(--color-border)", background: "var(--color-bg-secondary)" }}
                  />
                </label>
                <button
                  className="primary-button"
                  disabled={selectedTopicIds.length === 0}
                  onClick={handleSelfGenerate}
                  style={{ height: "48px", borderRadius: "10px", flex: 1, fontSize: "1rem", fontWeight: "600" }}
                >
                  Generate Practice Test
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {session?.user.role === "student" && (
        <section className="panel" style={{ marginTop: "20px" }}>
          <p className="eyebrow">Adaptive Suggestion</p>
          <h3>Recommended next test for you</h3>
          <p>{adaptiveStatus || "Review your latest performance to get a tailored practice paper."}</p>
          {adaptivePlan ? (
            <div className="adaptive-plan-card">
              <h4>{adaptivePlan.subjectName} improvement plan</h4>
              <p className="muted-copy">{adaptivePlan.summary}</p>
              <ul className="plain-list compact">
                {adaptivePlan.topics.map((topic) => (
                  <li key={topic.topicId}>
                    <strong>{topic.topicName}</strong>
                    <span>
                      {topic.reason} • {topic.questionCount} questions • accuracy {topic.averageAccuracy}%
                    </span>
                  </li>
                ))}
              </ul>
              <button className="primary-button" onClick={() => void generateAdaptiveExam()}>
                Start My Adaptive Test
              </button>
            </div>
          ) : null}
        </section>
      )}

      {(session?.user.role === "teacher" || session?.user.role === "super_admin") && (
        <section className="stats-grid">
          {Object.entries(data.stats)
            .filter(([label]) => label !== "subjectBooks" || session?.user.role === "super_admin")
            .map(([label, value]) => {
            const statConfig: Record<string, { label: string, icon: string, route: string, color: string }> = {
              classes: { label: "Classes", icon: "🏫", route: "/curriculum", color: "#eef2ff" },
              streams: { label: "Streams", icon: "🛤️", route: "/curriculum", color: "#f0fdf4" },
              batches: { label: "Batches", icon: "👥", route: "/curriculum", color: "#fdf4ff" },
              students: { label: "Students", icon: "🎓", route: "/analytics", color: "#fffbeb" },
              subjects: { label: "Subjects", icon: "📘", route: "/curriculum", color: "#f0f9ff" },
              questions: { label: "Questions", icon: "📝", route: "/question-bank", color: "#fef2f2" },
              liveExams: { label: "Active Exams", icon: "⚡", route: "/exams", color: "#fff1f2" },
              submissions: { label: "Submissions", icon: "✅", route: "/analytics", color: "#ecfdf5" },
              subjectBooks: { label: "Books", icon: "📚", route: "/subject-books", color: "#f8fafc" }
            };
            
            const config = statConfig[label] || { label: label.replace(/([A-Z])/g, " $1"), icon: "📈", route: "/", color: "#f3f4f6" };
            
            return (
              <div 
                key={label} 
                className="stat-card-interactive" 
                onClick={() => navigate(config.route)}
              >
                <div className="stat-icon-wrapper" style={{ background: config.color }}>
                  {config.icon}
                </div>
                <span className="muted-copy" style={{ textTransform: "capitalize", fontSize: "0.9rem", fontWeight: "600" }}>{config.label}</span>
                <strong style={{ fontSize: "2rem", lineHeight: "1", color: "var(--color-primary-dark)" }}>{value as React.ReactNode}</strong>
              </div>
            );
          })}
        </section>
      )}

      {(session?.user.role === "teacher" || session?.user.role === "super_admin") && (
        <section className="panel" style={{ marginTop: "20px" }}>
          <p className="eyebrow">Teacher Adaptive Suggestions</p>
          <h3>Batch-wise improvement recommendations</h3>
          <p>{teacherAdaptiveStatus || "Review batch-level weak topics and target the next remedial tests accordingly."}</p>
          {batchPlans.length > 0 ? (
            <div className="question-grid">
              {batchPlans.map((plan) => (
                <article key={plan.batchId} className="panel question-card">
                  <div className="row-between">
                    <span className="tag">{plan.batchName}</span>
                    <span className="tag muted">{plan.subjectName}</span>
                  </div>
                  <h3>{plan.summary}</h3>
                  <p className="muted-copy">
                    {plan.studentsConsidered} students • {plan.basedOnSubmissionCount} submissions • {plan.durationMinutes} min
                  </p>
                  <ul className="plain-list compact">
                    {plan.topics.map((topic) => (
                      <li key={topic.topicId}>
                        <strong>{topic.topicName}</strong>
                        <span>
                          {topic.reason} • {topic.questionCount} questions • accuracy {topic.averageAccuracy}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      )}

      <section className="grid-two" style={{ marginTop: "20px" }}>
        <article className="panel">
          <h3>Academic Structure</h3>
          <ul className="plain-list">
            {data.batches.map((batch) => (
              <li key={batch.id}>
                <strong>{batch.name}</strong>
                <span>{data.students.filter((student) => student.batchId === batch.id).length} students</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <h3>Recent Results</h3>
          {data.recentSubmissions.length === 0 ? (
            <p>No submissions yet. Generate an exam and submit it from the live exam page.</p>
          ) : (
            <ul className="plain-list">
              {data.recentSubmissions.map((submission) => (
                <li key={submission.id || `${submission.examId}-${submission.studentId}`}>
                  <strong>{submission.obtainedMarks} / {submission.totalMarks}</strong>
                  <span>{submission.percentage}% score</span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>
    </div>
  );
}
