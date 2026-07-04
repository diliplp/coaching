import { useEffect, useMemo, useRef, useState } from "react";
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
  const [startingId, setStartingId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

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
    setStartingId(id);
    setStartError(null);
    try {
      const payload = await apiClient.getExam(id);
      liveExamState.generatedExam = payload;
      liveExamState.latestResult = null;
      setActiveExam(payload);
    } catch (e: any) {
      console.error("[startScheduledExam] failed:", e);
      setStartError(e?.message || "Failed to load exam. Please try again or contact your administrator.");
    } finally {
      setStartingId(null);
    }
  };

  const generatedExam = activeExam;
  const [timeLeft, setTimeLeft] = useState<number | null>(generatedExam ? generatedExam.exam.durationMinutes * 60 : null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const answersRef = useRef<Record<string, string[]>>({});
  const [integerAnswers, setIntegerAnswers] = useState<Record<string, string>>({});
  const integerAnswersRef = useRef<Record<string, string>>({});
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [resultVersion, setResultVersion] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [revisionLoading, setRevisionLoading] = useState(false);
  const [markedForReview, setMarkedForReview] = useState<Set<number>>(new Set());
  const toggleMarkForReview = () =>
    setMarkedForReview(prev => {
      const next = new Set(prev);
      next.has(currentIndex) ? next.delete(currentIndex) : next.add(currentIndex);
      return next;
    });

  // Anti-cheat state
  const [violations, setViolations] = useState(0);
  const [cheatWarning, setCheatWarning] = useState<string | null>(null);
  const [needsFullscreen, setNeedsFullscreen] = useState(false);
  const violationsRef = useRef(0);
  const submitRef = useRef<() => Promise<void>>(async () => {});
  const examLiveRef = useRef(false);

  // Keep refs in sync so handlers can read current answers without stale closure
  answersRef.current = answers;
  integerAnswersRef.current = integerAnswers;

  // Per-question time tracking
  const questionTimesRef = useRef<Record<string, number>>({});  // accumulated seconds per question
  const questionVisitStartRef = useRef<number | null>(null);    // epoch ms when current Q was opened
  const timerQuestionIdRef = useRef<string | null>(null);       // which question the timer is running for

  const flushQuestionTime = () => {
    const qId = timerQuestionIdRef.current;
    const start = questionVisitStartRef.current;
    if (qId && start !== null) {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      questionTimesRef.current[qId] = (questionTimesRef.current[qId] ?? 0) + elapsed;
      questionVisitStartRef.current = Date.now(); // reset so re-visits accumulate correctly
    }
  };

  useEffect(() => {
    if (!generatedExam) {
      return;
    }

    setIsReviewMode(false);

    const initSession = async () => {
      try {
        // Try to restore an existing in-progress session
        const session = await apiClient.getExamSession(generatedExam.exam.id);
        setAnswers(session.answers ?? {});
        setIntegerAnswers(session.integerAnswers ?? {});
        setCurrentIndex(session.currentQuestionIndex ?? 0);
        setTimeLeft(session.timeRemainingSeconds);
      } catch {
        // No existing in-progress session — try to create a fresh one
        try {
          const session = await apiClient.createExamSession(generatedExam.exam.id);
          setTimeLeft(session.timeRemainingSeconds);
          setAnswers({});
        } catch (err: any) {
          if (err?.message === "already_submitted") {
            // Exam was force-submitted by teacher; fetch and display the existing result.
            try {
              const result = await apiClient.getMySubmissionForExam(generatedExam.exam.id);
              liveExamState.latestResult = result;
              setResultVersion((v) => v + 1);
              setIsReviewMode(true);
              setCurrentIndex(0);
            } catch {
              setTimeLeft(generatedExam.exam.durationMinutes * 60);
              setAnswers({});
            }
          } else {
            setTimeLeft(generatedExam.exam.durationMinutes * 60);
            setAnswers({});
          }
        }
      }
    };

    void initSession();
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

    const answeredCount = Object.values(answers).filter(val => val && val.length > 0).length
      + Object.values(integerAnswers).filter(val => val !== "").length;
    const totalQuestions = generatedExam.questions.length;

    const sendHeartbeat = () => {
      apiClient.sendExamHeartbeat(generatedExam.exam.id, {
        answeredCount,
        totalQuestions,
        currentQuestionIndex: currentIndex,
        status: "taking"
      }).then((response) => {
        if (response.status === "terminated") {
          // Teacher force-submitted this exam; fetch result and transition to review.
          apiClient.getMySubmissionForExam(generatedExam.exam.id).then((result) => {
            liveExamState.latestResult = result;
            setResultVersion((v) => v + 1);
            setIsReviewMode(true);
            setCurrentIndex(0);
          }).catch(() => setIsReviewMode(true));
        }
      }).catch((err) => console.error("Heartbeat error:", err));
    };

    sendHeartbeat();

    const interval = setInterval(sendHeartbeat, 5000);
    return () => clearInterval(interval);
  }, [generatedExam, isReviewMode, answers, currentIndex]);

  // Persist current question index whenever student navigates
  useEffect(() => {
    if (!generatedExam || isReviewMode) return;
    apiClient.saveExamSessionIndex(generatedExam.exam.id, currentIndex).catch(() => {});
  }, [currentIndex, generatedExam, isReviewMode]);

  // Per-question timer: flush previous question's time, start clock for new question
  useEffect(() => {
    if (!generatedExam || isReviewMode) return;
    flushQuestionTime();
    const q = generatedExam.questions[currentIndex];
    if (q) {
      timerQuestionIdRef.current = q.id;
      questionVisitStartRef.current = Date.now();
    }
  }, [currentIndex, generatedExam, isReviewMode]);

  const formattedTime = useMemo(() => {
    if (timeLeft === null) return "00:00";
    const minutes = Math.floor(timeLeft / 60).toString().padStart(2, "0");
    const seconds = (timeLeft % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  }, [timeLeft]);

  // All hooks must precede early returns to keep the hook call count stable across renders.
  const latestResult = liveExamState.latestResult;

  const sectionBoundaries = useMemo(() => {
    const sections = (generatedExam?.exam as any)?.sections as Array<{ name: string; totalQuestions: number; attemptQuestions: number; questionType: string }> | undefined;
    if (!sections || sections.length === 0) return null;
    const boundaries: Array<{ name: string; start: number; end: number; attemptQuestions: number; totalQuestions: number; questionType: string }> = [];
    let pos = 0;
    sections.forEach((s: { name: string; totalQuestions: number; attemptQuestions: number; questionType: string }) => {
      boundaries.push({ name: s.name, start: pos, end: pos + s.totalQuestions - 1, attemptQuestions: s.attemptQuestions, totalQuestions: s.totalQuestions, questionType: s.questionType });
      pos += s.totalQuestions;
    });
    return boundaries;
  }, [generatedExam]);

  const currentSection = useMemo(() => {
    if (!sectionBoundaries) return null;
    return sectionBoundaries.find(s => currentIndex >= s.start && currentIndex <= s.end) ?? null;
  }, [sectionBoundaries, currentIndex]);

  const topicBreakdown = useMemo(() => {
    if (!generatedExam || !latestResult?.review) return [];
    const map = new Map<string, { name: string; total: number; correct: number; unanswered: number }>();
    generatedExam.questions.forEach((q: any, i: number) => {
      const tid = q.topicId || "unknown";
      const tname = latestResult.insights?.find((ins: any) => ins.topicId === tid)?.topicName || q.topicName || "Other";
      if (!map.has(tid)) map.set(tid, { name: tname, total: 0, correct: 0, unanswered: 0 });
      const entry = map.get(tid)!;
      entry.total++;
      const rev = latestResult.review?.find((r: any) => r.questionId === q.id);
      if (!rev?.selectedOptionIds?.length) entry.unanswered++;
      else if (rev.isCorrect) entry.correct++;
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [generatedExam, latestResult]);

  // ── Anti-cheat ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!generatedExam || isReviewMode) return;

    document.body.classList.add("exam-running");

    const requestFS = () => {
      document.documentElement.requestFullscreen?.().catch(() => {});
    };
    requestFS();

    const addViolation = (reason: string, violationType: string) => {
      violationsRef.current += 1;
      const count = violationsRef.current;
      setViolations(count);
      apiClient.reportViolation(generatedExam.exam.id, violationType).catch(() => {});
      if (count >= 3) {
        setCheatWarning(`⚠️ Third violation detected: ${reason}\n\nYour exam is being auto-submitted.`);
        void submitRef.current();
      } else {
        setCheatWarning(`⚠️ ${reason}\n\nWarning ${count} of 3. Your exam will be auto-submitted on the third violation.`);
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden && examLiveRef.current) addViolation("Tab switch detected.", "tab_switch");
    };

    let blurTimer: ReturnType<typeof setTimeout>;
    const onBlur = () => {
      blurTimer = setTimeout(() => {
        if (!document.hidden && examLiveRef.current) addViolation("Window focus lost — possible screen switch.", "window_blur");
      }, 300);
    };
    const onFocus = () => clearTimeout(blurTimer);

    const onFullscreenChange = () => {
      if (examLiveRef.current) setNeedsFullscreen(!document.fullscreenElement);
    };

    const blockEvent = (e: Event) => { e.preventDefault(); };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!examLiveRef.current) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && ['c', 'a', 'v', 'u', 's', 'p', 'f'].includes(e.key.toLowerCase())) e.preventDefault();
      if (['F12', 'F5', 'F11', 'F1'].includes(e.key)) e.preventDefault();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('contextmenu', blockEvent);
    document.addEventListener('selectstart', blockEvent);
    document.addEventListener('copy', blockEvent);
    document.addEventListener('cut', blockEvent);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('contextmenu', blockEvent);
      document.removeEventListener('selectstart', blockEvent);
      document.removeEventListener('copy', blockEvent);
      document.removeEventListener('cut', blockEvent);
      document.removeEventListener('keydown', onKeyDown);
      clearTimeout(blurTimer);
      document.body.classList.remove("exam-running");
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [generatedExam, isReviewMode]);

  if (!generatedExam) {
    return (
      <div className="page">
        <section className="section-heading">
          <p className="eyebrow">Live Exam</p>
          <h2>Active Scheduled Exams</h2>
          <p>Select an exam from your scheduled list to begin the test.</p>
        </section>

        {startError && (
          <div style={{ padding: "12px 16px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", color: "#dc2626", fontSize: "0.9rem", marginBottom: "16px" }}>
            {startError}
          </div>
        )}
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
                    onClick={() => { if (isAvailable && !startingId) void startScheduledExam(exam.id); }}
                    disabled={!isAvailable || !!startingId}
                    style={{ padding: "10px 24px", minWidth: "110px" }}
                  >
                    {startingId === exam.id ? "Loading..." : hasEnded ? "Completed" : hasStarted ? "Start Exam" : "Upcoming"}
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

  // Guard: if questions array has no valid item at currentIndex, reset to 0
  if (!currentQuestion) {
    if (currentIndex !== 0) {
      setCurrentIndex(0);
    }
    return (
      <div className="page">
        <p style={{ padding: "40px", color: "#dc2626" }}>
          Question {currentIndex + 1} could not be loaded. Returning to question 1...
        </p>
      </div>
    );
  }

  const toggleOption = (questionId: string, optionId: string, multiCorrect: boolean) => {
    if (isReviewMode) return;

    // Compute new selection from current ref (avoids stale closure in updater)
    const existing = answersRef.current[questionId] ?? [];
    const hasOption = existing.includes(optionId);
    const nextValues = multiCorrect
      ? hasOption ? existing.filter((id) => id !== optionId) : [...existing, optionId]
      : hasOption ? [] : [optionId];

    setAnswers((current) => ({ ...current, [questionId]: nextValues }));

    // Persist to DB immediately (fire-and-forget)
    if (generatedExam) {
      apiClient.saveExamSessionAnswer(generatedExam.exam.id, { questionId, selectedOptionIds: nextValues }).catch(() => {});
    }
  };

  const setIntegerInput = (questionId: string, value: string) => {
    if (isReviewMode) return;
    // Allow only non-negative integers (0–9999)
    if (value !== "" && !/^\d{1,4}$/.test(value)) return;
    setIntegerAnswers(curr => ({ ...curr, [questionId]: value }));
    if (generatedExam) {
      apiClient.saveExamSessionAnswer(generatedExam.exam.id, {
        questionId,
        selectedOptionIds: [],
        ...(value !== "" ? { integerAnswer: Number(value) } : {})
      } as any).catch(() => {});
    }
  };



  const submitExam = async () => {
    if (!liveExamState.generatedExam || isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    // Flush time for the question currently open before building the payload
    flushQuestionTime();
    questionVisitStartRef.current = null;

    const payload = {
      studentId: session?.user.studentId ?? undefined,
      timeSpentSeconds: { ...questionTimesRef.current },
      answers: liveExamState.generatedExam.questions.map((question) => {
        const base: any = {
          questionId: question.id,
          selectedOptionIds: answers[question.id] ?? []
        };
        if ((question as any).type === "integer") {
          const raw = integerAnswers[question.id];
          if (raw !== undefined && raw !== "") base.integerAnswer = Number(raw);
        }
        return base;
      })
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

  // Keep submitRef current so the anti-cheat effect can call submitExam without stale closure
  submitRef.current = submitExam;

  // Track whether exam is currently live (not review, not lobby)
  examLiveRef.current = !!generatedExam && !isReviewMode;

  // Match review by questionId — review[] is in DB order but questions may be shuffled per-student.
  const reviewData = latestResult?.review?.find((r: any) => r.questionId === currentQuestion?.id)
    ?? latestResult?.review?.[currentIndex];

  return (
    <div className="page" onContextMenu={e => e.preventDefault()}>
      {/* ── Fullscreen required overlay ─────────────────────────────────────── */}
      {needsFullscreen && !isReviewMode && (
        <div style={overlayStyle}>
          <div style={overlayCardStyle}>
            <div style={{ fontSize: "2.5rem", marginBottom: "12px" }}>🖥️</div>
            <h3 style={{ margin: "0 0 8px", color: "#1e293b" }}>Fullscreen Required</h3>
            <p style={{ color: "#64748b", marginBottom: "20px", lineHeight: 1.6 }}>
              You exited fullscreen mode. Please return to fullscreen to continue your exam.
            </p>
            <button
              style={overlayBtnStyle}
              onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}
            >
              Re-enter Fullscreen
            </button>
          </div>
        </div>
      )}

      {/* ── Cheat warning overlay ───────────────────────────────────────────── */}
      {cheatWarning && (
        <div style={overlayStyle}>
          <div style={{ ...overlayCardStyle, borderTop: "4px solid #dc2626" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "12px" }}>🚨</div>
            <h3 style={{ margin: "0 0 8px", color: "#dc2626" }}>Integrity Alert</h3>
            <p style={{ color: "#374151", marginBottom: "8px", whiteSpace: "pre-line", lineHeight: 1.6 }}>
              {cheatWarning}
            </p>
            <p style={{ fontSize: "0.82rem", color: "#94a3b8", marginBottom: "20px" }}>
              Violation {violations} of 3
            </p>
            {violations < 3 && (
              <button
                style={overlayBtnStyle}
                onClick={() => {
                  setCheatWarning(null);
                  document.documentElement.requestFullscreen?.().catch(() => {});
                }}
              >
                I Understand — Resume Exam
              </button>
            )}
          </div>
        </div>
      )}

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

          <div className="question-shell" style={{ position: "relative", border: isReviewMode ? `2px solid ${reviewData?.isCorrect ? "green" : "red"}` : "none", padding: isReviewMode ? "20px" : "0", borderRadius: "8px", userSelect: "none", WebkitUserSelect: "none" }}>
            {/* Watermark — student name stamped diagonally so screenshots are traceable */}
            {!isReviewMode && session?.user?.name && (
              <div aria-hidden="true" style={{
                position: "absolute", inset: 0, zIndex: 0,
                pointerEvents: "none", overflow: "hidden", borderRadius: "8px",
                display: "flex", flexWrap: "wrap", alignContent: "flex-start",
                gap: "40px 24px", padding: "24px",
                opacity: 0.045,
              }}>
                {Array.from({ length: 30 }).map((_, i) => (
                  <span key={i} style={{
                    fontSize: "0.78rem", fontWeight: 700, color: "#000",
                    transform: "rotate(-25deg)", whiteSpace: "nowrap",
                    display: "inline-block", letterSpacing: "0.05em",
                  }}>
                    {session.user.name}
                  </span>
                ))}
              </div>
            )}
            <div style={{ position: "relative", zIndex: 1 }}>
            <div className="row-between" style={{ alignItems: "center", marginBottom: "8px" }}>
              <p className="question-meta" style={{ margin: 0 }}>
                {currentSection && (
                  <span style={{ marginRight: "8px", background: currentSection.questionType === "integer" ? "#ede9fe" : "#dbeafe", color: currentSection.questionType === "integer" ? "#6d28d9" : "#1d4ed8", padding: "2px 8px", borderRadius: "4px", fontSize: "0.75rem", fontWeight: "bold" }}>
                    {currentSection.name}
                    {currentSection.attemptQuestions < currentSection.totalQuestions && ` (attempt ${currentSection.attemptQuestions} of ${currentSection.totalQuestions})`}
                  </span>
                )}
                Question {currentIndex + 1} of {generatedExam.questions.length}
                {isReviewMode && (
                  <span style={{ marginLeft: "10px", fontWeight: "bold", color: reviewData?.isCorrect ? "green" : "red" }}>
                    {reviewData?.isCorrect ? "✓ Correct" : "✗ Incorrect"}
                  </span>
                )}
              </p>
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                {isReviewMode && (() => {
                  const rd = reviewData as any;
                  const secs = rd?.timeSpentSeconds;
                  const zone = rd?.speedZone;
                  if (secs === undefined) return null;
                  const mins = Math.floor(secs / 60);
                  const s = secs % 60;
                  const label = mins > 0 ? `${mins}m ${s}s` : `${s}s`;
                  const zoneColors: Record<string, { bg: string; color: string; text: string }> = {
                    fast: { bg: "#dcfce7", color: "#15803d", text: "Fast" },
                    normal: { bg: "#dbeafe", color: "#1d4ed8", text: "Normal" },
                    slow: { bg: "#fef9c3", color: "#854d0e", text: "Slow" }
                  };
                  const zc = zone ? zoneColors[zone] : { bg: "#f1f5f9", color: "#475569", text: "" };
                  return (
                    <span style={{ fontSize: "0.72rem", padding: "2px 8px", borderRadius: "4px", background: zc.bg, color: zc.color, fontWeight: "bold" }}>
                      ⏱ {label}{zone ? ` · ${zc.text}` : ""}
                    </span>
                  );
                })()}
                {isReviewMode && (() => {
                  const rd = reviewData as any;
                  if (!rd || rd.isCorrect || !(rd.marksLost > 0)) return null;
                  return (
                    <span style={{ fontSize: "0.72rem", padding: "2px 8px", borderRadius: "4px", background: "#fef2f2", color: "#b91c1c", fontWeight: "bold" }}>
                      −{rd.marksLost} marks
                    </span>
                  );
                })()}
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
                {currentQuestion.pyqYear && (
                <span
                  className="tag"
                  style={{
                    fontSize: "0.7rem",
                    background: "#fef9c3",
                    color: "#713f12",
                    border: "none",
                    fontWeight: "bold"
                  }}
                >
                  {[currentQuestion.pyqExamName, currentQuestion.pyqYear, currentQuestion.pyqSession].filter(Boolean).join(" ")}
                </span>
                )}
              </div>
            </div>
            <h3><RichText content={currentQuestion.prompt} /></h3>

            {(currentQuestion as any).type === "integer" ? (
              <div style={{ marginTop: "20px" }}>
                <p style={{ fontSize: "0.85rem", color: "#64748b", marginBottom: "10px" }}>
                  Enter your answer (non-negative integer):
                </p>
                <input
                  type="number"
                  min="0"
                  max="9999"
                  step="1"
                  value={isReviewMode ? ((reviewData as any)?.integerAnswer ?? "") : (integerAnswers[currentQuestion.id] ?? "")}
                  onChange={e => setIntegerInput(currentQuestion.id, e.target.value)}
                  disabled={isReviewMode}
                  style={{
                    width: "160px", padding: "12px 16px", fontSize: "1.4rem", fontWeight: "bold",
                    border: isReviewMode
                      ? `2px solid ${reviewData?.isCorrect ? "#059669" : "#dc2626"}`
                      : "2px solid #cbd5e1",
                    borderRadius: "8px", textAlign: "center",
                    background: isReviewMode ? (reviewData?.isCorrect ? "#ecfdf5" : "#fff5f5") : "white"
                  }}
                  placeholder="0"
                />
                {isReviewMode && (
                  <p style={{ marginTop: "10px", fontSize: "0.9rem", color: "#374151" }}>
                    Correct answer: <strong style={{ color: "#059669" }}>{(reviewData as any)?.correctIntegerAnswer}</strong>
                    {(reviewData as any)?.integerAnswer !== undefined && (
                      <span style={{ marginLeft: "12px", color: "#dc2626" }}>Your answer: <strong>{(reviewData as any).integerAnswer}</strong></span>
                    )}
                  </p>
                )}
              </div>
            ) : (
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
            )}

            {isReviewMode && (
              <div className="explanation-box" style={{ 
                marginTop: "24px", 
                padding: "24px", 
                background: "#f8fafc", 
                borderRadius: "16px", 
                border: "1px solid #e2e8f0",
                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)"
              }}>
                <div style={{ marginBottom: "20px" }}>
                  <h4 style={{ color: "#059669", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px", fontSize: "1.1rem" }}>
                    <span style={{ 
                      background: "#10b981", 
                      color: "white", 
                      width: "24px", 
                      height: "24px", 
                      borderRadius: "50%", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      fontSize: "0.9rem"
                    }}>✓</span> 
                    Correct Answer
                  </h4>
                  <div style={{ 
                    padding: "16px", 
                    background: "white", 
                    borderRadius: "12px", 
                    border: "1px solid #d1fae5",
                    boxShadow: "inset 0 2px 4px 0 rgba(0, 0, 0, 0.05)"
                  }}>
                    {reviewData?.correctOptionIds.map(cid => {
                      const opt = currentQuestion.options.find((o: any) => o.id === cid);
                      return (
                        <div key={cid} style={{ fontWeight: "600", color: "#065f46", fontSize: "1.05rem" }}>
                          Option {opt?.label}: <RichText content={opt?.value || ""} />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {(() => {
                  const secs = (reviewData as any)?.timeSpentSeconds;
                  const zone = (reviewData as any)?.speedZone;
                  if (secs === undefined) return null;
                  const mins = Math.floor(secs / 60);
                  const s = secs % 60;
                  const label = mins > 0 ? `${mins}m ${s}s` : `${s}s`;
                  const zoneMap: Record<string, { bg: string; color: string; border: string; text: string }> = {
                    fast:   { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0", text: "Fast — answered quickly" },
                    normal: { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe", text: "Normal pace" },
                    slow:   { bg: "#fefce8", color: "#854d0e", border: "#fde68a", text: "Slow — consider skipping next time" },
                  };
                  const zc = zone ? zoneMap[zone] : { bg: "#f8fafc", color: "#475569", border: "#e2e8f0", text: "" };
                  return (
                    <div style={{ marginBottom: "20px", padding: "12px 16px", background: zc.bg, border: `1px solid ${zc.border}`, borderRadius: "10px", display: "flex", alignItems: "center", gap: "12px" }}>
                      <span style={{ fontSize: "1.2rem" }}>⏱</span>
                      <div>
                        <span style={{ fontWeight: 700, color: zc.color, fontSize: "1rem" }}>{label}</span>
                        {zc.text && <span style={{ color: zc.color, fontSize: "0.8rem", marginLeft: "8px", opacity: 0.85 }}>· {zc.text}</span>}
                      </div>
                    </div>
                  );
                })()}

                {reviewData?.explanation ? (
                  <div>
                    <h4 style={{ color: "#475569", marginBottom: "12px", fontSize: "1.1rem" }}>Explanation</h4>
                    <div style={{
                      lineHeight: "1.7",
                      color: "#334155",
                      background: "white",
                      padding: "16px",
                      borderRadius: "12px",
                      border: "1px solid #e2e8f0"
                    }}>
                      <RichText content={reviewData.explanation} />
                    </div>
                  </div>
                ) : (
                  <p className="muted-copy" style={{ fontStyle: "italic" }}>No detailed explanation available for this question.</p>
                )}
              </div>
            )}

            <div className="row-between" style={{ marginTop: "20px", flexWrap: "wrap", gap: "10px" }}>
              <button
                className="secondary-button"
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
              >
                Previous
              </button>
              {!isReviewMode && (
                <button
                  onClick={toggleMarkForReview}
                  style={{
                    padding: "10px 18px", borderRadius: "8px", fontWeight: 600, fontSize: "0.9rem", cursor: "pointer", border: "2px solid",
                    borderColor: markedForReview.has(currentIndex) ? "#f59e0b" : "#cbd5e1",
                    background: markedForReview.has(currentIndex) ? "#fef3c7" : "transparent",
                    color: markedForReview.has(currentIndex) ? "#92400e" : "#64748b",
                  }}
                >
                  {markedForReview.has(currentIndex) ? "🟡 Marked" : "🔖 Mark for Review"}
                </button>
              )}
              <button
                className="primary-button"
                disabled={isSubmitting || (isReviewMode && currentIndex === generatedExam.questions.length - 1)}
                onClick={() => {
                  if (!isReviewMode && currentIndex === generatedExam.questions.length - 1) {
                    setShowSubmitConfirm(true);
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
            </div> {/* end z-index wrapper */}
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

                {(latestResult?.incorrectAnswers ?? 0) > 0 && latestResult?.id && (
                  <button
                    className="primary-button"
                    style={{ width: "100%", marginTop: "12px", fontSize: "0.85rem", padding: "10px" }}
                    disabled={revisionLoading}
                    onClick={async () => {
                      setRevisionLoading(true);
                      try {
                        const payload = await apiClient.generateRevisionSet(latestResult!.id!);
                        liveExamState.generatedExam = payload;
                        liveExamState.latestResult = null;
                        setActiveExam(payload);
                        setCurrentIndex(0);
                        setAnswers({});
                        setIntegerAnswers({});
                        setMarkedForReview(new Set());
                        setIsReviewMode(false);
                        setResultVersion(v => v + 1);
                      } catch (e: any) {
                        alert(e?.message || "Could not generate revision set.");
                      } finally {
                        setRevisionLoading(false);
                      }
                    }}
                  >
                    {revisionLoading ? "Generating..." : "Practice Weak Topics"}
                  </button>
                )}

                {latestResult?.timingStats && (() => {
                  const ts = latestResult.timingStats!;
                  const totalMins = Math.floor(ts.totalTimeSeconds / 60);
                  const totalSecs = ts.totalTimeSeconds % 60;
                  const avgMins = Math.floor(ts.avgTimePerQuestion / 60);
                  const avgSecs = ts.avgTimePerQuestion % 60;
                  return (
                    <div style={{ marginTop: "16px", padding: "12px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontWeight: "bold", fontSize: "0.82rem", marginBottom: "8px", color: "#374151" }}>⏱ Time Analysis</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "0.8rem" }}>
                        <div><span style={{ color: "#64748b" }}>Total time:</span> <strong>{totalMins}m {totalSecs}s</strong></div>
                        <div><span style={{ color: "#64748b" }}>Avg per Q:</span> <strong>{avgMins > 0 ? `${avgMins}m ` : ""}{avgSecs}s</strong></div>
                        {ts.impulseErrors > 0 && <div style={{ color: "#b45309" }}>⚡ Impulse errors: <strong>{ts.impulseErrors}</strong></div>}
                        {ts.stuckCount > 0 && <div style={{ color: "#dc2626" }}>🔴 Stuck questions: <strong>{ts.stuckCount}</strong></div>}
                      </div>
                      {(ts.impulseErrors > 0 || ts.stuckCount > 0) && (
                        <div style={{ marginTop: "8px", fontSize: "0.75rem", color: "#64748b", lineHeight: 1.5 }}>
                          {ts.impulseErrors > 0 && <div>⚡ <em>Impulse error</em> = answered in &lt;30s but got it wrong. Slow down on these.</div>}
                          {ts.stuckCount > 0 && <div>🔴 <em>Stuck</em> = spent &gt;3 min and still got it wrong. Skip and return next time.</div>}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {latestResult?.negativeMarkingAnalysis && (() => {
                  const nma = latestResult.negativeMarkingAnalysis!;
                  const impulseCount = nma.skipCandidates.filter(s => s.category === "impulse").length;
                  const stuckCount = nma.skipCandidates.filter(s => s.category === "stuck").length;
                  const gain = nma.counterfactualScore - latestResult.obtainedMarks;
                  return (
                    <div style={{ marginTop: "12px", padding: "12px", background: "#fffbeb", borderRadius: "8px", border: "1px solid #fde68a" }}>
                      <div style={{ fontWeight: "bold", fontSize: "0.82rem", marginBottom: "8px", color: "#92400e" }}>📊 Skip Strategy</div>
                      <div style={{ fontSize: "0.8rem", color: "#78350f", marginBottom: "8px", lineHeight: 1.5 }}>
                        You lost <strong>{nma.totalNegativeMarks} marks</strong> to negative marking across {nma.skipCandidates.length} wrong answer{nma.skipCandidates.length !== 1 ? "s" : ""}.
                      </div>
                      <div style={{ padding: "8px 12px", background: "#fef3c7", borderRadius: "6px", fontSize: "0.82rem", marginBottom: "8px", textAlign: "center" }}>
                        If you had skipped those {nma.skipCandidates.length} question{nma.skipCandidates.length !== 1 ? "s" : ""}:<br />
                        <span style={{ fontSize: "1.1rem", fontWeight: 800, color: "#15803d" }}>
                          {nma.counterfactualScore} / {latestResult.totalMarks} marks ({nma.counterfactualPercentage}%)
                        </span>
                        <span style={{ fontSize: "0.75rem", color: "#15803d", display: "block" }}>+{gain} marks over your actual score</span>
                      </div>
                      {(impulseCount > 0 || stuckCount > 0) && (
                        <div style={{ fontSize: "0.75rem", color: "#78350f", lineHeight: 1.6 }}>
                          {impulseCount > 0 && <div>⚡ <strong>{impulseCount}</strong> impulse guess{impulseCount !== 1 ? "es" : ""} (answered in &lt;30s and wrong)</div>}
                          {stuckCount > 0 && <div>🔴 <strong>{stuckCount}</strong> stuck question{stuckCount !== 1 ? "s" : ""} (spent &gt;3 min and wrong)</div>}
                          <div style={{ marginTop: "4px", color: "#92400e" }}>These are prime skip candidates next time.</div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <h4 style={{ marginTop: "20px", marginBottom: "12px", color: "var(--color-primary)" }}>Topic-wise Breakdown</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {topicBreakdown.map(t => {
                    const wrong = t.total - t.correct - t.unanswered;
                    const pct = Math.round((t.correct / t.total) * 100);
                    const color = pct >= 75 ? "#16a34a" : pct >= 40 ? "#f59e0b" : "#dc2626";
                    return (
                      <div key={t.name}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: "4px" }}>
                          <span style={{ fontWeight: 600 }}>{t.name}</span>
                          <span style={{ color, fontWeight: 700 }}>{t.correct}/{t.total}</span>
                        </div>
                        <div style={{ height: "6px", borderRadius: "3px", background: "#e2e8f0", overflow: "hidden" }}>
                          <div style={{ display: "flex", height: "100%" }}>
                            <div style={{ width: `${(t.correct/t.total)*100}%`, background: "#16a34a" }} />
                            <div style={{ width: `${(wrong/t.total)*100}%`, background: "#ef4444" }} />
                            <div style={{ width: `${(t.unanswered/t.total)*100}%`, background: "#94a3b8" }} />
                          </div>
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "2px" }}>
                          {t.correct} correct · {wrong} wrong · {t.unanswered} skipped
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <h3>Question Palette</h3>
              <div className="palette-grid">
                {generatedExam.questions.map((question: any, index: number) => {
                  const rev = latestResult?.review?.find((r: any) => r.questionId === question.id);
                  const unanswered = !rev || !rev.selectedOptionIds || rev.selectedOptionIds.length === 0;
                  const isCorrect = rev?.isCorrect === true;
                  const secs = (rev as any)?.timeSpentSeconds;
                  const timeLabel = secs !== undefined
                    ? (secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`)
                    : "";

                  let statusClass = "";
                  if (unanswered) statusClass = "review-unanswered";
                  else if (isCorrect) statusClass = "review-correct";
                  else statusClass = "review-incorrect";

                  const isActive = currentIndex === index;

                  return (
                    <button
                      type="button"
                      key={question.id}
                      className={`palette-button ${statusClass} ${isActive ? "active" : ""}`}
                      onClick={() => setCurrentIndex(index)}
                      title={`Q${index + 1} · ${unanswered ? "Skipped" : isCorrect ? "Correct" : "Incorrect"}${timeLabel ? ` · ${timeLabel}` : ""}`}
                    >
                      {index + 1}
                    </button>
                  );
                })}
              </div>

              <h4 style={{ marginTop: "20px", marginBottom: "10px", color: "var(--color-primary)" }}>Per-Question Time</h4>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                  <thead>
                    <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                      <th style={{ padding: "6px 8px", fontWeight: 600, color: "#475569" }}>Q#</th>
                      <th style={{ padding: "6px 8px", fontWeight: 600, color: "#475569" }}>Result</th>
                      <th style={{ padding: "6px 8px", fontWeight: 600, color: "#475569" }}>Time Spent</th>
                      <th style={{ padding: "6px 8px", fontWeight: 600, color: "#475569" }}>Pace</th>
                    </tr>
                  </thead>
                  <tbody>
                    {generatedExam.questions.map((question: any, index: number) => {
                      const rev = latestResult?.review?.find((r: any) => r.questionId === question.id);
                      const unanswered = !rev || !rev.selectedOptionIds || rev.selectedOptionIds.length === 0;
                      const isCorrect = rev?.isCorrect === true;
                      const secs = (rev as any)?.timeSpentSeconds;
                      const zone = (rev as any)?.speedZone;
                      const timeLabel = secs !== undefined
                        ? (secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`)
                        : "—";
                      const zoneColors: Record<string, string> = {
                        fast: "#15803d", normal: "#1d4ed8", slow: "#854d0e"
                      };
                      const isActive = currentIndex === index;
                      return (
                        <tr
                          key={question.id}
                          onClick={() => setCurrentIndex(index)}
                          style={{
                            cursor: "pointer",
                            background: isActive ? "#eff6ff" : (index % 2 === 0 ? "white" : "#f8fafc"),
                            borderBottom: "1px solid #e2e8f0"
                          }}
                        >
                          <td style={{ padding: "6px 8px", fontWeight: isActive ? 700 : 400 }}>{index + 1}</td>
                          <td style={{ padding: "6px 8px", color: unanswered ? "#94a3b8" : isCorrect ? "#16a34a" : "#dc2626", fontWeight: 600 }}>
                            {unanswered ? "—" : isCorrect ? "✓" : "✗"}
                          </td>
                          <td style={{ padding: "6px 8px", fontFamily: "monospace" }}>{timeLabel}</td>
                          <td style={{ padding: "6px 8px", color: zone ? zoneColors[zone] : "#94a3b8", fontWeight: 600, fontSize: "0.72rem" }}>
                            {zone ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <h3>Question Palette</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", fontSize: "0.7rem", marginBottom: "10px" }}>
                {[["#e2e8f0","#475569","Not visited"],["#bbf7d0","#15803d","Answered"],["#fef3c7","#92400e","Marked"],["#fed7aa","#9a3412","Answered+Marked"]].map(([bg,col,label]) => (
                  <span key={label} style={{ display:"flex", alignItems:"center", gap:"4px", color: col }}>
                    <span style={{ width:10, height:10, borderRadius:2, background:bg, display:"inline-block" }} />{label}
                  </span>
                ))}
              </div>
              <div className="palette-grid">
                {generatedExam.questions.map((question: any, index: number) => {
                  const attempted = (answers[question.id] ?? []).length > 0;
                  const marked = markedForReview.has(index);
                  const isActive = currentIndex === index;
                  let cls = "palette-button";
                  if (isActive) cls += " active";
                  else if (attempted && marked) cls += " answered-marked";
                  else if (marked) cls += " marked-review";
                  else if (attempted) cls += " answered";
                  return (
                    <button type="button" key={question.id} className={cls}
                      onClick={() => setCurrentIndex(index)} title={`Q${index+1}${marked?" · Marked for Review":""}`}>
                      {index + 1}{marked && !isActive ? "·" : ""}
                    </button>
                  );
                })}
              </div>

              <button
                className="primary-button full-width"
                onClick={() => setShowSubmitConfirm(true)}
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

      {isReviewMode && (
        <section className="section" style={{ marginTop: "40px", maxWidth: "1100px", margin: "40px auto" }}>
          <div className="panel" style={{ padding: "30px", background: "white" }}>
            <h3 style={{ marginBottom: "25px", display: "flex", alignItems: "center", gap: "12px", fontSize: "1.5rem" }}>
              <span style={{ fontSize: "1.8rem" }}>📜</span> Detailed Question-wise Analysis
            </h3>
            <div className="stack" style={{ gap: "30px" }}>
              {generatedExam.questions.map((question: any, index: number) => {
                const rev = latestResult?.review?.find((r: any) => r.questionId === question.id);
                const isCorrect = rev?.isCorrect;
                const unanswered = !rev?.selectedOptionIds || rev.selectedOptionIds.length === 0;

                return (
                  <article key={question.id} style={{ 
                    borderLeft: `8px solid ${unanswered ? "#94a3b8" : (isCorrect ? "#10b981" : "#ef4444")}`,
                    padding: "24px",
                    background: "#fdfdfd",
                    borderRadius: "12px",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                    border: "1px solid var(--color-border)",
                    borderLeftWidth: "8px"
                  }}>
                    <div className="row-between" style={{ marginBottom: "16px", alignItems: "center" }}>
                      <span style={{ fontWeight: "700", color: "var(--color-text-muted)", fontSize: "0.9rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Question {index + 1}
                      </span>
                      <span style={{ 
                        fontWeight: "bold", 
                        color: unanswered ? "#64748b" : (isCorrect ? "#059669" : "#dc2626"),
                        fontSize: "0.85rem",
                        background: unanswered ? "#f1f5f9" : (isCorrect ? "#ecfdf5" : "#fef2f2"),
                        padding: "6px 14px",
                        borderRadius: "20px",
                        border: `1px solid ${unanswered ? "#e2e8f0" : (isCorrect ? "#d1fae5" : "#fecaca")}`
                      }}>
                        {unanswered ? "UNATTEMPTED" : (isCorrect ? "✓ CORRECT" : "✗ INCORRECT")}
                      </span>
                    </div>
                    
                    <div style={{ fontSize: "1.2rem", marginBottom: "20px", fontWeight: "500", lineHeight: "1.5" }}>
                      <RichText content={question.prompt} />
                    </div>

                    <div className="options-grid" style={{ pointerEvents: "none", opacity: 0.9, marginBottom: "20px" }}>
                      {question.options.map((option: any) => {
                        const isSelected = (rev?.selectedOptionIds ?? []).includes(option.id);
                        const isCorrectOpt = (rev?.correctOptionIds ?? []).includes(option.id);
                        
                        let border = "1px solid var(--color-border)";
                        let bg = "white";
                        if (isCorrectOpt) {
                          border = "2px solid #10b981";
                          bg = "#f0fdf4";
                        } else if (isSelected && !isCorrectOpt) {
                          border = "2px solid #ef4444";
                          bg = "#fef2f2";
                        }

                        return (
                          <div key={option.id} style={{ 
                            padding: "12px 16px", 
                            borderRadius: "10px", 
                            border, 
                            background: bg,
                            display: "flex",
                            gap: "12px",
                            alignItems: "center",
                            boxShadow: isCorrectOpt || isSelected ? "0 2px 4px rgba(0,0,0,0.05)" : "none"
                          }}>
                            <strong style={{ 
                              color: isCorrectOpt ? "#059669" : (isSelected ? "#dc2626" : "var(--color-text-muted)"),
                              fontSize: "1.1rem"
                            }}>{option.label}.</strong>
                            <div style={{ flex: 1 }}>
                              <RichText content={option.value} />
                            </div>
                            {isCorrectOpt && <span style={{ color: "#059669", fontWeight: "bold" }}>✓</span>}
                            {isSelected && !isCorrectOpt && <span style={{ color: "#dc2626", fontWeight: "bold" }}>✗</span>}
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ marginTop: "20px", padding: "20px", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                      <div style={{ marginBottom: "12px", display: "flex", alignItems: "center", gap: "10px" }}>
                        <strong style={{ color: "#059669", fontSize: "1rem" }}>Correct Answer: </strong>
                        <span style={{ 
                          fontWeight: "700", 
                          background: "#10b981", 
                          color: "white", 
                          padding: "2px 10px", 
                          borderRadius: "4px",
                          fontSize: "0.9rem"
                        }}>
                          {rev?.correctOptionIds.map((cid: string) => question.options.find((o: any) => o.id === cid)?.label).join(", ")}
                        </span>
                      </div>
                      {rev?.explanation ? (
                        <div>
                          <strong style={{ color: "#475569", fontSize: "1rem", display: "block", marginBottom: "8px" }}>Explanation:</strong>
                          <div style={{ color: "#334155", fontSize: "1rem", lineHeight: "1.6" }}>
                            <RichText content={rev.explanation} />
                          </div>
                        </div>
                      ) : (
                        <p className="muted-copy" style={{ fontStyle: "italic", fontSize: "0.9rem", margin: 0 }}>No detailed explanation available for this question.</p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      )}
      {/* ── Submit Confirmation Modal ───────────────────────────────────────── */}
      {showSubmitConfirm && !isReviewMode && (() => {
        const total = generatedExam.questions.length;
        const attempted = Object.values(answers).filter(a => a.length > 0).length;
        const unattempted = total - attempted;
        const markedCount = markedForReview.size;
        return (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
            zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
            padding: "20px"
          }}>
            <div style={{
              background: "white", borderRadius: "16px", padding: "32px",
              maxWidth: "420px", width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.3)"
            }}>
              <h2 style={{ margin: "0 0 8px 0", fontSize: "1.3rem" }}>Submit Exam?</h2>
              <p style={{ color: "#64748b", margin: "0 0 20px 0", fontSize: "0.9rem" }}>
                This action cannot be undone.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "#f0fdf4", borderRadius: "8px" }}>
                  <span style={{ color: "#166534" }}>Answered</span>
                  <strong style={{ color: "#16a34a" }}>{attempted} / {total}</strong>
                </div>
                {unattempted > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "#fef2f2", borderRadius: "8px" }}>
                    <span style={{ color: "#991b1b" }}>Not Answered</span>
                    <strong style={{ color: "#dc2626" }}>{unattempted}</strong>
                  </div>
                )}
                {markedCount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "#fffbeb", borderRadius: "8px" }}>
                    <span style={{ color: "#92400e" }}>Marked for Review</span>
                    <strong style={{ color: "#f59e0b" }}>{markedCount}</strong>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                <button
                  className="secondary-button"
                  style={{ flex: 1 }}
                  onClick={() => setShowSubmitConfirm(false)}
                  disabled={isSubmitting}
                >
                  Go Back
                </button>
                <button
                  className="primary-button"
                  style={{ flex: 1, background: "#dc2626", borderColor: "#dc2626" }}
                  onClick={() => { setShowSubmitConfirm(false); void submitExam(); }}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Submitting..." : "Yes, Submit"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.75)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 9999,
  backdropFilter: "blur(4px)",
};

const overlayCardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: "16px",
  padding: "36px 32px",
  maxWidth: "400px",
  width: "90%",
  textAlign: "center",
  boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
};

const overlayBtnStyle: React.CSSProperties = {
  padding: "12px 28px",
  background: "#1d4ed8",
  color: "#fff",
  border: "none",
  borderRadius: "8px",
  fontWeight: 700,
  fontSize: "0.95rem",
  cursor: "pointer",
};
