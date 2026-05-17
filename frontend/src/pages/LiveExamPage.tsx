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
  const generatedExam = liveExamState.generatedExam;
  const [timeLeft, setTimeLeft] = useState<number>(generatedExam ? generatedExam.exam.durationMinutes * 60 : 0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [resultVersion, setResultVersion] = useState(0);

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
    if (!generatedExam || isReviewMode) {
      return;
    }

    if (timeLeft <= 0) {
      void submitExam();
      return;
    }

    const timer = window.setTimeout(() => {
      setTimeLeft((current) => current - 1);
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [timeLeft, generatedExam, isReviewMode]);

  const formattedTime = useMemo(() => {
    const minutes = Math.floor(timeLeft / 60).toString().padStart(2, "0");
    const seconds = (timeLeft % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  }, [timeLeft]);

  if (!generatedExam) {
    return (
      <div className="page">
        <section className="section-heading">
          <p className="eyebrow">Live Exam</p>
          <h2>No active exam yet</h2>
          <p>Go to Dashboard or Exam Builder to start a test.</p>
        </section>
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

  const [isSubmitting, setIsSubmitting] = useState(false);

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
              {currentQuestion.options.map((option) => {
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
          ) : (
            <>
              <h3>Question Palette</h3>
              <div className="palette-grid">
                {generatedExam.questions.map((question, index) => {
                  const attempted = (answers[question.id] ?? []).length > 0;
                  return (
                    <button
                      type="button"
                      key={question.id}
                      className={attempted ? "palette-button answered" : "palette-button"}
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
