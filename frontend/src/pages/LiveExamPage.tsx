import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/client";
import { getStoredSession } from "../auth";
import { liveExamState } from "../data/mockExamContext";

export function LiveExamPage() {
  const session = getStoredSession();
  const generatedExam = liveExamState.generatedExam;
  const [timeLeft, setTimeLeft] = useState<number>(generatedExam ? generatedExam.exam.durationMinutes * 60 : 0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [resultVersion, setResultVersion] = useState(0);

  useEffect(() => {
    if (!generatedExam) {
      return;
    }

    setTimeLeft(generatedExam.exam.durationMinutes * 60);
    setCurrentIndex(0);
    setAnswers({});
  }, [generatedExam]);

  useEffect(() => {
    if (!generatedExam) {
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
  }, [timeLeft, generatedExam]);

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
          <p>Generate an exam first from the Exam Builder page.</p>
        </section>
      </div>
    );
  }

  const currentQuestion = generatedExam.questions[currentIndex];

  const toggleOption = (questionId: string, optionId: string, multiCorrect: boolean) => {
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
    if (!liveExamState.generatedExam) {
      return;
    }

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
    } catch (error) {
      console.error(error);
    }
  };

  const latestResult = liveExamState.latestResult;

  return (
    <div className="page">
      <section className="exam-layout">
        <article className="panel exam-main">
          <div className="row-between">
            <div>
              <p className="eyebrow">Student Exam Experience</p>
              <h2>{generatedExam.exam.name}</h2>
              {generatedExam.exam.adaptiveSummary ? (
                <p className="muted-copy">{generatedExam.exam.adaptiveSummary}</p>
              ) : null}
            </div>
            <div className="timer-box">{formattedTime}</div>
          </div>

          <div className="question-shell">
            <p className="question-meta">
              Question {currentIndex + 1} of {generatedExam.questions.length}
            </p>
            <h3>{currentQuestion.prompt}</h3>

            <div className="options-grid">
              {currentQuestion.options.map((option) => {
                const isSelected = (answers[currentQuestion.id] ?? []).includes(option.id);
                return (
                  <button
                    type="button"
                    key={option.id}
                    className={isSelected ? "option-button selected" : "option-button"}
                    onClick={() => toggleOption(currentQuestion.id, option.id, currentQuestion.type === "multi_correct")}
                  >
                    <strong>{option.label}</strong>
                    <span>{option.value}</span>
                  </button>
                );
              })}
            </div>

            <div className="row-between">
              <button
                className="secondary-button"
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
              >
                Previous
              </button>
              <button
                className="primary-button"
                onClick={() => setCurrentIndex((index) => Math.min(generatedExam.questions.length - 1, index + 1))}
              >
                Save & Next
              </button>
            </div>
          </div>
        </article>

        <aside className="panel exam-sidebar">
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

          <button className="primary-button full-width" onClick={() => void submitExam()}>
            Submit Exam
          </button>
          {session?.user.role !== "student" && (
            <p className="muted-copy">Teacher/admin users can review the flow here. Student account submits against its linked student record.</p>
          )}

          {latestResult && (
            <div key={resultVersion} className="result-card">
              <h4>Instant Result</h4>
              <p>{latestResult.obtainedMarks} / {latestResult.totalMarks} marks</p>
              <p>{latestResult.percentage}% score</p>
              <h5>Weakest Topics</h5>
              <ul className="plain-list compact">
                {latestResult.weakestTopics.map((topic) => (
                  <li key={topic.topicId}>
                    <strong>{topic.topicName}</strong>
                    <span>Weakness score {topic.weaknessScore}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}
