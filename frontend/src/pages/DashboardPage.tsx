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
  const [selectedTopicId, setSelectedTopicId] = useState("");
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
    if (!selectedTopicId) return;
    try {
      const payload = await apiClient.selfGenerateExam({ topicId: selectedTopicId, questionCount: qCount });
      liveExamState.generatedExam = payload;
      liveExamState.latestResult = null;
      navigate("/live-exam");
    } catch (e) {
      alert("Failed to generate practice test");
    }
  };

  return (
    <div className="page">
      <section className="hero-card">
        <div>
          <p className="eyebrow">{session?.user.role === "student" ? "Student Dashboard" : "Institute Control Panel"}</p>
          <h2>{session?.user.role === "student" ? `Welcome back, ${session.user.name}` : "Smart exam operations for Gujarat tuition classes"}</h2>
          <p className="hero-copy">
            {session?.user.role === "student" 
              ? "Access your scheduled exams, create custom practice tests, and review your performance insights."
              : "This MVP already models classes, streams, batches, question banks, dynamic exam creation, and automated weak-topic analytics."}
          </p>
        </div>
      </section>

      {session?.user.role === "student" && (
        <div className="grid-two" style={{ marginTop: "20px" }}>
          <section className="panel">
            <h3>Scheduled Exams</h3>
            <p className="muted-copy">Official tests assigned to your batch</p>
            {data.scheduledExams.length === 0 ? (
              <p style={{ marginTop: "15px" }}>No active scheduled exams.</p>
            ) : (
              <div className="stack" style={{ marginTop: "15px" }}>
                {data.scheduledExams.map(exam => (
                  <article key={exam.id} className="row-between" style={{ padding: "10px", background: "var(--color-bg-secondary)", borderRadius: "8px" }}>
                    <div>
                      <strong>{exam.name}</strong>
                      <div className="muted-copy">{exam.durationMinutes} mins</div>
                    </div>
                    <button className="primary-button" onClick={() => startExam(exam.id)}>Start</button>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <h3>Self-Practice Builder</h3>
            <p className="muted-copy">Pick any topic to generate a quick practice test</p>
            <div className="stack" style={{ marginTop: "15px" }}>
              <label className="field">
                <span>Subject</span>
                <select value={selectedSubjectId} onChange={e => { setSelectedSubjectId(e.target.value); setSelectedTopicId(""); }}>
                  <option value="">Select Subject</option>
                  {questionBank?.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Topic</span>
                <select value={selectedTopicId} onChange={e => setSelectedTopicId(e.target.value)}>
                  <option value="">Select Topic</option>
                  {questionBank?.topics.filter(t => t.subjectId === selectedSubjectId).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Questions</span>
                <input type="number" value={qCount} onChange={e => setQCount(Number(e.target.value))} min={1} max={50} />
              </label>
              <button className="primary-button" disabled={!selectedTopicId} onClick={handleSelfGenerate}>Generate Test</button>
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
          {Object.entries(data.stats).map(([label, value]) => (
            <article className="stat-card" key={label}>
              <span>{label.replace(/([A-Z])/g, " $1")}</span>
              <strong>{value}</strong>
            </article>
          ))}
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
