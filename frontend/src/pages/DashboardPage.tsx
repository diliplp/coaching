import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../api/client";
import { getStoredSession } from "../auth";
import { liveExamState } from "../data/mockExamContext";
import type { AdaptivePlan, BatchAdaptivePlan, OverviewResponse, QuestionBankResponse } from "../types";

export function DashboardPage() {
  const navigate = useNavigate();
  const session = getStoredSession();
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [questionBank, setQuestionBank] = useState<QuestionBankResponse | null>(null);
  const [adaptivePlan, setAdaptivePlan] = useState<AdaptivePlan | null>(null);
  const [batchPlans, setBatchPlans] = useState<BatchAdaptivePlan[]>([]);
  const [adaptiveStatus, setAdaptiveStatus] = useState("");
  const [teacherAdaptiveStatus, setTeacherAdaptiveStatus] = useState("");

  // Self-generation state
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [allowedSources, setAllowedSources] = useState<string[]>(["pyq", "reference", "ai_generated", "custom"]);
  const [qCount, setQCount] = useState(10);

  useEffect(() => {
    apiClient.getOverview().then(setData).catch(console.error);
    if (session?.user.role === "student") {
      apiClient.getQuestionBank().then(setQuestionBank).catch(console.error);
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
    try {
      const payload = await apiClient.getExam(examId);
      liveExamState.generatedExam = payload;
      liveExamState.latestResult = null;
      navigate("/live-exam");
    } catch (e) {
      alert("Failed to load exam");
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

  return (
    <div className="page">
      <section className="hero-card">
        <div>
          <p className="eyebrow">{session?.user.role === "student" ? "Student Dashboard" : "Institute Control Panel"}</p>
          <h2>{session?.user.role === "student" ? `Welcome back, ${session.user.name}` : "Smart exam operations for tuition classes"}</h2>
          <p className="hero-copy">
            {session?.user.role === "student"
              ? "Access your scheduled exams, create custom practice tests, and review your performance insights."
              : "This MVP already models classes, streams, batches, question banks, dynamic exam creation, and automated weak-topic analytics."}
          </p>
        </div>
      </section>

      {session?.user.role === "student" && (
        <div className="grid-two" style={{ marginTop: "30px", gap: "30px" }}>
          {/* Left Column: Scheduled Exams */}
          <section className="panel" style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ marginBottom: "20px" }}>
              <span className="tag" style={{ background: "rgba(0,112,243,0.1)", color: "#0070f3", border: "none" }}>BATCH UPDATES</span>
              <h3 style={{ marginTop: "10px", fontSize: "1.5rem" }}>Scheduled Exams</h3>
              <p className="muted-copy">Official tests assigned to your batch</p>
            </div>

            {data.scheduledExams.length === 0 ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px", background: "rgba(0,0,0,0.02)", borderRadius: "12px", border: "1px dashed var(--color-border)" }}>
                <p className="muted-copy">No active scheduled exams right now.</p>
              </div>
            ) : (
              <div className="stack" style={{ gap: "12px" }}>
                {data.scheduledExams.map(exam => {
                  const now = new Date();
                  const startTime = exam.scheduledStartTime ? new Date(exam.scheduledStartTime) : null;
                  const endTime = exam.scheduledEndTime ? new Date(exam.scheduledEndTime) : null;

                  const hasStarted = !startTime || startTime <= now;
                  const hasEnded = endTime && endTime < now;
                  const isAvailable = hasStarted && !hasEnded;

                  return (
                    <article key={exam.id} className="row-between" style={{
                      padding: "16px",
                      background: "white",
                      borderRadius: "12px",
                      border: "1px solid var(--color-border)",
                      opacity: isAvailable ? 1 : 0.7,
                      transition: "all 0.2s"
                    }}>
                      <div style={{ display: "flex", gap: "15px", alignItems: "center" }}>
                        <div style={{
                          width: "40px",
                          height: "40px",
                          borderRadius: "8px",
                          background: isAvailable ? "var(--color-bg-secondary)" : "#f0f0f0",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "1.2rem"
                        }}>
                          {hasEnded ? "🏁" : hasStarted ? "📝" : "⏳"}
                        </div>
                        <div>
                          <strong style={{ fontSize: "1.1rem" }}>{exam.name}</strong>
                          <div className="muted-copy" style={{ fontSize: "0.85rem" }}>
                            ⏱️ {exam.durationMinutes} minutes
                            {!hasStarted && startTime && ` • Starts: ${startTime.toLocaleString()}`}
                            {hasEnded && ` • Ended`}
                          </div>
                        </div>
                      </div>
                      <button
                        className={isAvailable ? "primary-button" : "secondary-button"}
                        onClick={() => isAvailable && startExam(exam.id)}
                        disabled={!isAvailable}
                        style={{ padding: "8px 20px" }}
                      >
                        {hasEnded ? "Completed" : hasStarted ? "Start Exam" : "Upcoming"}
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
              <span className="tag" style={{ background: "rgba(0,112,243,0.1)", color: "#0070f3", border: "none" }}>AI GENERATOR</span>
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
                    { id: "ai_generated", label: "AI Generated" },
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
