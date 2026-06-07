import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiClient } from "../api/client";
import { getStoredSession } from "../auth";
import { liveExamState } from "../data/mockExamContext";
import { RichText } from "../components/RichText";

export function LiveExamPage() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const session = getStoredSession();
  
  const [activeExam, setActiveExam] = useState<any | null>(() => liveExamState.generatedExam);
  const [scheduledExams, setScheduledExams] = useState<any[]>([]);
  const [loadingOverview, setLoadingOverview] = useState(false);

  useEffect(() => {
    setActiveExam(liveExamState.generatedExam);
  }, [liveExamState.generatedExam]);

  useEffect(() => {
    if (!activeExam) {
      setLoadingOverview(true);
      apiClient.getOverview()
        .then((res) => {
          setScheduledExams(res.scheduledExams || []);
        })
        .catch(console.error)
        .finally(() => setLoadingOverview(false));
    }
  }, [activeExam]);

  const startScheduledExam = async (id: string) => {
    try {
      const payload = await apiClient.getExam(id);
      liveExamState.generatedExam = payload;
      liveExamState.latestResult = null;
      setActiveExam(payload);
    } catch (e) {
      alert("Failed to load exam");
    }
  };

  const generatedExam = activeExam;
  const [timeLeft, setTimeLeft] = useState<number | null>(generatedExam ? generatedExam.exam.durationMinutes * 60 : null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [resultVersion, setResultVersion] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!generatedExam) {
      return;
    }

    setTimeLeft(generatedExam.exam.durationMinutes * 60);
    setCurrentIndex(0);
    setAnswers({});
    setIsReviewMode(false);
  }, [generatedExam]);

  useEffect(() => {
    if (!generatedExam || isReviewMode || timeLeft === null) {
      return;
    }

    if (timeLeft <= 0) {
      void submitExam();
      return;
    }

    const timer = window.setTimeout(() => {
      setTimeLeft((current) => (current !== null ? current - 1 : null));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [timeLeft, generatedExam, isReviewMode]);

  useEffect(() => {
    if (!generatedExam || isReviewMode) {
      return;
    }

    const answeredCount = Object.values(answers).filter(val => val && val.length > 0).length;
    const totalQuestions = generatedExam.questions.length;

    const sendHeartbeat = () => {
      apiClient.sendExamHeartbeat(generatedExam.exam.id, {
        answeredCount,
        totalQuestions,
        currentQuestionIndex: currentIndex,
        status: "taking"
      }).catch((err) => console.error("Heartbeat error:", err));
    };

    sendHeartbeat();

    const interval = setInterval(sendHeartbeat, 5000);
    return () => clearInterval(interval);
  }, [generatedExam, isReviewMode, answers, currentIndex]);

  const formattedTime = useMemo(() => {
    if (timeLeft === null) return "00:00";
    const minutes = Math.floor(timeLeft / 60).toString().padStart(2, "0");
    const seconds = (timeLeft % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  }, [timeLeft]);

  if (!generatedExam) {
    return (
      <div className="page">
        <section className="section-heading">
          <p className="eyebrow">Live Exam</p>
          <h2>Active Scheduled Exams</h2>
          <p>Select an exam from your scheduled list to begin the test.</p>
        </section>

        {loadingOverview ? (
          <p>Loading scheduled exams...</p>
        ) : scheduledExams.length === 0 ? (
          <div style={{ padding: "40px", background: "white", borderRadius: "12px", border: "1px dashed var(--color-border)", textAlign: "center", marginTop: "20px" }}>
            <p className="muted-copy" style={{ fontSize: "1.1rem" }}>No active scheduled exams right now.</p>
            <p className="muted-copy" style={{ fontSize: "0.9rem", marginTop: "5px" }}>If an exam was recently scheduled, please check that your account is assigned to the correct batch.</p>
          </div>
        ) : (
          <div className="stack" style={{ gap: "16px", marginTop: "20px" }}>
            {scheduledExams.map(exam => {
              const now = new Date();
              const startTime = exam.scheduledStartTime ? new Date(exam.scheduledStartTime) : null;
              const endTime = exam.scheduledEndTime ? new Date(exam.scheduledEndTime) : null;

              const hasStarted = !startTime || startTime <= now;
              const hasEnded = endTime && endTime < now;
              const isAvailable = hasStarted && !hasEnded;

              return (
                <article key={exam.id} className="row-between panel" style={{
                  padding: "20px",
                  background: "white",
                  opacity: isAvailable ? 1 : 0.7,
                  transition: "all 0.2s"
                }}>
                  <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
                    <div style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "10px",
                      background: isAvailable ? "var(--color-bg-secondary)" : "#f0f0f0",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.5rem"
                    }}>
                      {hasEnded ? "🏁" : hasStarted ? "📝" : "⏳"}
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: "1.2rem" }}>{exam.name}</h3>
                      <div className="muted-copy" style={{ fontSize: "0.9rem", marginTop: "4px" }}>
                        ⏱️ {exam.durationMinutes} minutes
                        {!hasStarted && startTime && ` • Starts: ${startTime.toLocaleString()}`}
                        {hasStarted && !hasEnded && ` • Available until: ${endTime ? endTime.toLocaleString() : "No end time"}`}
                        {hasEnded && ` • Ended`}
                      </div>
                    </div>
                  </div>
                  <button
                    className={isAvailable ? "primary-button" : "secondary-button"}
                    onClick={() => isAvailable && startScheduledExam(exam.id)}
                    disabled={!isAvailable}
                    style={{ padding: "10px 24px" }}
                  >
                    {hasEnded ? "Completed" : hasStarted ? "Start Exam" : "Upcoming"}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (!generatedExam.questions || generatedExam.questions.length === 0) {
    return (
      <div className="page">
        <section className="section-heading">
          <p className="eyebrow">Live Exam</p>
          <h2>No Questions Found</h2>
          <p>This exam does not have any questions. Please ask your administrator to verify the configuration.</p>
        </section>
        <div style={{ marginTop: "20px" }}>
          <button className="primary-button" onClick={() => {
            liveExamState.generatedExam = null;
            setActiveExam(null);
          }}>
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const currentQuestion = generatedExam.questions[currentIndex];

  const toggleOption = (questionId: string, optionId: string, multiCorrect: boolean) => {
    if (isReviewMode) return;
    setAnswers((current) => {
      const existing = current[questionId] ?? [];
      const hasOption = existing.includes(optionId);
      let nextValues: string[];

      if (multiCorrect) {
        nextValues = hasOption ? existing.filter((id) => id !== optionId) : [...existing, optionId];
      } else {
        nextValues = hasOption ? [] : [optionId];
      }

      return {
        ...current,
        [questionId]: nextValues
      };
    });
  };



  const submitExam = async () => {
    if (!liveExamState.generatedExam || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    const payload = {
      studentId: session?.user.studentId ?? undefined,
      answers: liveExamState.generatedExam.questions.map((question) => ({
        questionId: question.id,
        selectedOptionIds: answers[question.id] ?? []
      }))
    };

    try {
      const result = await apiClient.submitExam(liveExamState.generatedExam.exam.id, payload);
      liveExamState.latestResult = result;
      setResultVersion((value) => value + 1);
      setIsReviewMode(true);
      setCurrentIndex(0);
    } catch (error: any) {
      console.error(error);
      alert(error.message || "Failed to submit exam. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const latestResult = liveExamState.latestResult;
  const reviewData = latestResult?.review?.[currentIndex];

  return (
    <div className="page">
      <section className="exam-layout">
        <article className="panel exam-main">
          <div className="row-between">
            <div>
              <p className="eyebrow">{isReviewMode ? "Exam Review" : "Live Exam"}</p>
              <h2>{generatedExam.exam.name}</h2>
              {generatedExam.exam.adaptiveSummary ? (
                <p className="muted-copy">{generatedExam.exam.adaptiveSummary}</p>
              ) : null}
            </div>
            {!isReviewMode && <div className="timer-box">{formattedTime}</div>}
          </div>

          <div className="question-shell" style={{ border: isReviewMode ? `2px solid ${reviewData?.isCorrect ? "green" : "red"}` : "none", padding: isReviewMode ? "20px" : "0", borderRadius: "8px" }}>
            <div className="row-between" style={{ alignItems: "center", marginBottom: "8px" }}>
              <p className="question-meta" style={{ margin: 0 }}>
                Question {currentIndex + 1} of {generatedExam.questions.length}
                {isReviewMode && (
                  <span style={{ marginLeft: "10px", fontWeight: "bold", color: reviewData?.isCorrect ? "green" : "red" }}>
                    {reviewData?.isCorrect ? "✓ Correct" : "✗ Incorrect"}
                  </span>
                )}
              </p>
              {currentQuestion.sourceType && (
                <span 
                  className="tag" 
                  style={{ 
                    fontSize: "0.7rem", 
                    background: currentQuestion.sourceType === "pyq" ? "#fff3cd" : "#d1ecf1",
                    color: currentQuestion.sourceType === "pyq" ? "#856404" : "#0c5460",
                    border: "none",
                    fontWeight: "bold"
                  }}
                >
                  {currentQuestion.sourceType === "pyq" ? "PREVIOUS YEAR" : (currentQuestion.sourceType === "reference" ? "REFERENCE BOOK" : currentQuestion.sourceType.toUpperCase())}
                </span>
              )}
            </div>
            <h3><RichText content={currentQuestion.prompt} /></h3>

            <div className="options-grid">
              {currentQuestion.options.map((option: any) => {
                const isSelected = (isReviewMode ? (reviewData?.selectedOptionIds ?? []) : (answers[currentQuestion.id] ?? [])).includes(option.id);
                const isCorrect = isReviewMode && reviewData?.correctOptionIds.includes(option.id);
                
                let btnClass = "option-button";
                if (isSelected) btnClass += " selected";
                if (isReviewMode && isCorrect) btnClass += " correct-review";
                if (isReviewMode && isSelected && !isCorrect) btnClass += " incorrect-review";

                return (
                  <button
                    type="button"
                    key={option.id}
                    className={btnClass}
                    onClick={() => toggleOption(currentQuestion.id, option.id, currentQuestion.type === "multi_correct")}
                    disabled={isReviewMode}
                    style={{
                      borderColor: isReviewMode && isCorrect ? "green" : (isReviewMode && isSelected && !isCorrect ? "red" : ""),
                      backgroundColor: isReviewMode && isCorrect ? "#e6ffed" : (isReviewMode && isSelected && !isCorrect ? "#fff5f5" : "")
                    }}
                  >
                    <strong>{option.label}</strong>
                    <span><RichText content={option.value} /></span>
                    {isReviewMode && isCorrect && <span style={{ marginLeft: "auto" }}>✓</span>}
                  </button>
                );
              })}
            </div>

            {isReviewMode && reviewData?.explanation && (
              <div className="explanation-box" style={{ marginTop: "20px", padding: "15px", background: "var(--color-bg-secondary)", borderRadius: "8px" }}>
                <h4>Explanation:</h4>
                <RichText content={reviewData.explanation} />
              </div>
            )}

            <div className="row-between" style={{ marginTop: "20px" }}>
              <button
                className="secondary-button"
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
              >
                Previous
              </button>
              <button
                className="primary-button"
                disabled={isSubmitting || (isReviewMode && currentIndex === generatedExam.questions.length - 1)}
                onClick={() => {
                  if (!isReviewMode && currentIndex === generatedExam.questions.length - 1) {
                    void submitExam();
                  } else {
                    setCurrentIndex((index) => Math.min(generatedExam.questions.length - 1, index + 1));
                  }
                }}
              >
                {currentIndex === generatedExam.questions.length - 1 
                  ? (isReviewMode ? "End of Review" : (isSubmitting ? "Submitting..." : "Submit Exam")) 
                  : "Next"}
              </button>
            </div>
          </div>
        </article>

        <aside className="panel exam-sidebar">
          {isReviewMode ? (
            <>
              <div key={resultVersion} className="result-card">
                <h3>Result Summary</h3>
                <div style={{ fontSize: "2rem", fontWeight: "bold", margin: "10px 0" }}>{latestResult?.percentage}%</div>
                <p>{latestResult?.obtainedMarks} / {latestResult?.totalMarks} marks</p>
                <p>{latestResult?.correctAnswers} Correct • {latestResult?.incorrectAnswers} Incorrect</p>
                
                <h4 style={{ marginTop: "20px", color: "var(--color-primary)" }}>Performance Analysis</h4>
                
                <div style={{ marginTop: "15px" }}>
                  <strong style={{ color: "green" }}>✓ Your Strengths</strong>
                  <ul className="plain-list compact" style={{ marginTop: "5px" }}>
                    {latestResult?.insights
                      .filter(t => t.accuracy >= 75)
                      .map((topic) => (
                        <li key={topic.topicId}>
                          <strong>{topic.topicName}</strong>
                          <div className="muted-copy">{topic.accuracy}% Accuracy • Strong</div>
                        </li>
                      ))}
                    {latestResult?.insights.filter(t => t.accuracy >= 75).length === 0 && <li className="muted-copy">Keep practicing to build strengths!</li>}
                  </ul>
                </div>

                <div style={{ marginTop: "15px" }}>
                  <strong style={{ color: "red" }}>⚠ Areas for Improvement</strong>
                  <ul className="plain-list compact" style={{ marginTop: "5px" }}>
                    {latestResult?.insights
                      .filter(t => t.accuracy < 75)
                      .sort((a, b) => a.accuracy - b.accuracy)
                      .map((topic) => (
                        <li key={topic.topicId}>
                          <strong>{topic.topicName}</strong>
                          <div className="muted-copy">{topic.accuracy}% Accuracy • Focus here</div>
                        </li>
                      ))}
                    {latestResult?.insights.filter(t => t.accuracy < 75).length === 0 && <li className="muted-copy">Excellent coverage!</li>}
                  </ul>
                </div>
              </div>

              <h3>Question Palette</h3>
              <div className="palette-grid">
                {generatedExam.questions.map((question: any, index: number) => {
                  const rev = latestResult?.review?.[index];
                  const unanswered = !rev || !rev.selectedOptionIds || rev.selectedOptionIds.length === 0;
                  const isCorrect = rev?.isCorrect === true;

                  let statusClass = "";
                  if (unanswered) {
                    statusClass = "review-unanswered";
                  } else if (isCorrect) {
                    statusClass = "review-correct";
                  } else {
                    statusClass = "review-incorrect";
                  }

                  const isActive = currentIndex === index;

                  return (
                    <button
                      type="button"
                      key={question.id}
                      className={`palette-button ${statusClass} ${isActive ? "active" : ""}`}
                      onClick={() => setCurrentIndex(index)}
                      title={unanswered ? "Unanswered" : (isCorrect ? "Correct" : "Incorrect")}
                    >
                      {index + 1}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <h3>Question Palette</h3>
              <div className="palette-grid">
                {generatedExam.questions.map((question: any, index: number) => {
                  const attempted = (answers[question.id] ?? []).length > 0;
                  const isActive = currentIndex === index;
                  return (
                    <button
                      type="button"
                      key={question.id}
                      className={`palette-button ${attempted ? "answered" : ""} ${isActive ? "active" : ""}`}
                      onClick={() => setCurrentIndex(index)}
                    >
                      {index + 1}
                    </button>
                  );
                })}
              </div>

              <button 
                className="primary-button full-width" 
                onClick={() => void submitExam()} 
                disabled={isSubmitting}
              >
                {isSubmitting ? "Submitting Results..." : "Submit Exam"}
              </button>
            </>
          )}

          {isReviewMode && (
            <button className="secondary-button full-width" style={{ marginTop: "20px" }} onClick={() => navigate("/")}>
              Back to Dashboard
            </button>
          )}
        </aside>
      </section>
    </div>
  );
}
