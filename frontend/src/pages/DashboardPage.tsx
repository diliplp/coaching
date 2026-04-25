import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../api/client";
import { getStoredSession } from "../auth";
import { liveExamState } from "../data/mockExamContext";
import type { AdaptivePlan, BatchAdaptivePlan, OverviewResponse } from "../types";

export function DashboardPage() {
  const navigate = useNavigate();
  const session = getStoredSession();
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [adaptivePlan, setAdaptivePlan] = useState<AdaptivePlan | null>(null);
  const [batchPlans, setBatchPlans] = useState<BatchAdaptivePlan[]>([]);
  const [adaptiveStatus, setAdaptiveStatus] = useState("");
  const [teacherAdaptiveStatus, setTeacherAdaptiveStatus] = useState("");

  useEffect(() => {
    apiClient.getOverview().then(setData).catch(console.error);
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

  return (
    <div className="page">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Institute Control Panel</p>
          <h2>Smart exam operations for Gujarat tuition classes</h2>
          <p className="hero-copy">
            This MVP already models classes, streams, batches, question banks, dynamic exam creation, and automated weak-topic analytics.
          </p>
        </div>
      </section>

      <section className="stats-grid">
        {Object.entries(data.stats).map(([label, value]) => (
          <article className="stat-card" key={label}>
            <span>{label.replace(/([A-Z])/g, " $1")}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>

      {session?.user.role === "student" && (
        <section className="panel">
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
        <section className="panel">
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

      <section className="grid-two">
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
                <li key={`${submission.examId}-${submission.studentId}`}>
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
