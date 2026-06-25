import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/client";
import { liveExamState } from "../data/mockExamContext";
import type { AdaptivePlan, BlueprintSummary, OverviewResponse, QuestionBankResponse } from "../types";
import { getStoredSession } from "../auth";
import { StatusModal } from "../components/StatusModal";

export function ExamBuilderPage() {
  const [blueprints, setBlueprints] = useState<BlueprintSummary[]>([]);
  const [questionBank, setQuestionBank] = useState<QuestionBankResponse | null>(null);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [adaptivePlan, setAdaptivePlan] = useState<AdaptivePlan | null>(null);
  const session = getStoredSession();
  const [status, setStatus] = useState<string>("Select a blueprint or build a weighted paper.");
  const [adaptiveStudentId, setAdaptiveStudentId] = useState("student-9-1");
  const [adaptiveSubjectId, setAdaptiveSubjectId] = useState("subject-class9-math");
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [customExamName, setCustomExamName] = useState("Class 9 Weighted Practice Test");
  const [selectionMode, setSelectionMode] = useState<"chapter" | "topic">("chapter");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [totalQuestions, setTotalQuestions] = useState(6);
  const [scheduledStartTime, setScheduledStartTime] = useState("");
  const [scheduledEndTime, setScheduledEndTime] = useState("");
  const [weightages, setWeightages] = useState<Record<string, string>>({});
  const [allowedSources, setAllowedSources] = useState<string[]>(["pyq", "reference", "textbook", "ai_generated", "custom"]);
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [combinedExamName, setCombinedExamName] = useState("PCM/PCB Combined Test");
  const [combinedDuration, setCombinedDuration] = useState(180);
  const [subjectAllocations, setSubjectAllocations] = useState<Record<string, string>>({});
  // AI Prompt Builder structured state
  const [promptClassId, setPromptClassId] = useState("");
  const [promptSubjectId, setPromptSubjectId] = useState("");
  const [promptTopicIds, setPromptTopicIds] = useState<string[]>([]);
  const [promptQuestionCount, setPromptQuestionCount] = useState(15);
  const [promptDifficulty, setPromptDifficulty] = useState("mixed");
  const [promptExtraText, setPromptExtraText] = useState("");

  useEffect(() => {
    Promise.all([apiClient.getBlueprints(), apiClient.getQuestionBank(), apiClient.getOverview()])
      .then(([blueprintsResponse, questionBankResponse, overviewResponse]) => {
        setBlueprints(blueprintsResponse);
        setQuestionBank(questionBankResponse);
        setOverview(overviewResponse);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!overview?.batches.length) {
      return;
    }

    setSelectedBatchId((current) => current || overview.batches[0].id);
  }, [overview]);

  const selectedBatch = useMemo(
    () => overview?.batches.find((batch) => batch.id === selectedBatchId) ?? null,
    [overview, selectedBatchId]
  );

  const availableSubjects = useMemo(() => {
    if (!questionBank || !selectedBatch) {
      return [];
    }

    return questionBank.subjects.filter(
      (subject) => subject.classId === selectedBatch.classId && subject.streamId === selectedBatch.streamId
    );
  }, [questionBank, selectedBatch]);

  useEffect(() => {
    setSelectedSubjectIds((current) => {
      // Keep only subjects that are available in the current batch/class
      const stillValid = current.filter(id => availableSubjects.some(s => s.id === id));
      return stillValid;
    });
  }, [availableSubjects]);

  useEffect(() => {
    if (selectedSubjectIds.length > 0) {
      setAdaptiveSubjectId(selectedSubjectIds[0]);
      const subjectsText = selectedSubjectIds
        .map(id => availableSubjects.find(s => s.id === id)?.name)
        .filter(Boolean)
        .join(", ");
      setCustomExamName(`${selectedBatch?.name ?? "Batch"} ${subjectsText} Weighted Test`);
    } else {
      setCustomExamName(`${selectedBatch?.name ?? "Batch"} New Custom Test`);
    }
  }, [selectedSubjectIds, availableSubjects, selectedBatch]);

  useEffect(() => {
    setWeightages({});
    setSelectedEntityIds([]);
  }, [selectedSubjectIds, selectionMode]);

  const distributeEvenly = () => {
    setSelectedEntityIds(curr => {
      const unique = Array.from(new Set(curr));
      if (unique.length === 0) {
        setStatus("Please select at least one item first.");
        return unique;
      }
      
      const count = unique.length;
      const baseWeight = Math.floor(100 / count);
      const remainder = 100 % count;
      
      const nextWeightages: Record<string, string> = {};
      unique.forEach((id, idx) => {
        nextWeightages[id] = String(idx === 0 ? baseWeight + remainder : baseWeight);
      });
      setWeightages(nextWeightages);
      setStatus(`Auto-balanced 100% weightage across ${count} selected items.`);
      return unique;
    });
  };

  const selectAll = () => {
    const allIds = weightedEntities.map(e => e.id);
    setSelectedEntityIds(allIds);
    setWeightages({}); // Clear weights when selecting all to start fresh
    setStatus(`Selected all ${allIds.length} ${selectionMode === "chapter" ? "chapters" : "topics"}.`);
  };

  const selectLastN = (n: number) => {
    const allIds = weightedEntities.map(e => e.id);
    const selection = allIds.slice(-n);
    setSelectedEntityIds(selection);
    setWeightages({});
    setStatus(`Selected the last ${selection.length} ${selectionMode === "chapter" ? "chapters" : "topics"}.`);
  };

  const availableChapters = useMemo(
    () => questionBank?.chapters.filter((chapter) => selectedSubjectIds.includes(chapter.subjectId)) ?? [],
    [questionBank, selectedSubjectIds]
  );

  const chapterNameById = useMemo(
    () => new Map(availableChapters.map((chapter) => [chapter.id, chapter.name])),
    [availableChapters]
  );

  const availableTopics = useMemo(
    () => questionBank?.topics.filter((topic) => selectedSubjectIds.includes(topic.subjectId)) ?? [],
    [questionBank, selectedSubjectIds]
  );

  const weightedEntities = selectionMode === "chapter" ? availableChapters : availableTopics;
  const weightageTotal = Object.values(weightages).reduce((sum, value) => sum + (Number(value) || 0), 0);

  const questionCountBySubject = useMemo(() => {
    const counts = new Map<string, number>();
    questionBank?.questions.forEach(q => {
      counts.set(q.subjectId, (counts.get(q.subjectId) || 0) + 1);
    });
    return counts;
  }, [questionBank]);

  const createExam = async (blueprintId: string) => {
    setStatus("Generating exam...");
    try {
      const payload = await apiClient.generateExam(blueprintId);
      liveExamState.generatedExam = payload;
      liveExamState.latestResult = null;
      setStatus(`Live exam created: ${payload.exam.name}. Open the Live Exam page to attempt it.`);
    } catch (error) {
      console.error(error);
      setStatus("Unable to generate exam.");
    }
  };

  const createCustomExam = async () => {
    if (!selectedBatchId || selectedSubjectIds.length === 0) {
      setStatus("Select a batch and at least one subject first.");
      return;
    }

    setStatus("Generating weighted exam...");
    try {
      const payload = await apiClient.generateCustomExam({
        name: customExamName,
        batchId: selectedBatchId,
        subjectIds: selectedSubjectIds,
        durationMinutes,
        totalQuestions,
        selectionMode,
        scheduledStartTime: scheduledStartTime || undefined,
        scheduledEndTime: scheduledEndTime || undefined,
        rules: Object.entries(weightages)
          .map(([entityId, weightagePercent]) => ({
            entityId,
            weightagePercent: Number(weightagePercent) || 0
          }))
          .filter((rule) => rule.weightagePercent > 0),
        allowedSourceTypes: allowedSources as any
      });
      liveExamState.generatedExam = payload;
      liveExamState.latestResult = null;
      setStatus(`Weighted exam created: ${payload.exam.name}. Fresh questions and shuffled options are ready.`);
    } catch (error: any) {
      console.error(error);
      setStatus(error.message || "Unable to generate weighted exam. Make sure the selected weightages total 100%.");
    }
  };

  const loadAdaptivePlan = async () => {
    setStatus("Analyzing past results...");
    try {
      const plan = await apiClient.getAdaptivePlan(adaptiveStudentId, adaptiveSubjectId);
      setAdaptivePlan(plan);
      setStatus(`Adaptive recommendation ready for ${plan.studentName}.`);
    } catch (error) {
      console.error(error);
      setAdaptivePlan(null);
      setStatus("No adaptive recommendation available yet. Submit at least one exam first for this student.");
    }
  };

  const createAdaptiveExam = async () => {
    setStatus("Generating adaptive exam...");
    try {
      const payload = await apiClient.generateAdaptiveExam({
        studentId: adaptiveStudentId,
        subjectId: adaptiveSubjectId
      });
      liveExamState.generatedExam = payload;
      liveExamState.latestResult = null;
      setAdaptivePlan(payload.plan ?? null);
      setStatus(`Adaptive exam created: ${payload.exam.name}.`);
    } catch (error) {
      console.error(error);
      setStatus("Unable to generate adaptive exam. The student may need past submissions first.");
    }
  };

  const createCombinedExam = async () => {
    const allocations = Object.entries(subjectAllocations)
      .map(([subjectId, count]) => ({ subjectId, questionCount: Number(count) || 0 }))
      .filter(a => a.questionCount > 0);

    if (!selectedBatchId || allocations.length === 0) {
      setStatus("Select a batch and set question counts for at least one subject.");
      return;
    }

    setStatus("Generating combined exam...");
    try {
      const payload = await apiClient.generateCombinedExam({
        name: combinedExamName,
        batchId: selectedBatchId,
        durationMinutes: combinedDuration,
        subjectAllocations: allocations
      });
      liveExamState.generatedExam = payload;
      liveExamState.latestResult = null;
      const total = payload.questions?.length ?? 0;
      setStatus(`Combined exam "${payload.exam.name}" created with ${total} questions. Open Live Exam page to attempt it.`);
    } catch (e: any) {
      setStatus(e.message || "Failed to generate combined exam.");
    }
  };

  return (
    <div className="page">
      <StatusModal 
        status={status} 
        defaultStatus="Select a blueprint or build a weighted paper." 
        onClose={() => setStatus("Select a blueprint or build a weighted paper.")} 
      />
      <section className="section-heading">
        <p className="eyebrow">Exam Builder</p>
        <h2>Create chapter-wise, topic-wise, and adaptive papers</h2>
        <p>{status}</p>
      </section>

      {/* NEW: AI Magic Builder Section */}
      {session?.user.role === "super_admin" && (
        <>
          <article className="panel" style={{ 
            background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)", 
            color: "white",
            border: "none",
            boxShadow: "0 10px 25px rgba(99, 102, 241, 0.3)",
            position: "relative",
            overflow: "hidden"
          }}>
            <div style={{ position: "relative", zIndex: 2 }}>
              <div className="row-between">
                <div>
                  <span className="tag" style={{ background: "rgba(255,255,255,0.2)", color: "white", border: "none" }}>NEW ✨ AI PROMPT BUILDER</span>
                  <h3 style={{ color: "white", marginTop: "10px", fontSize: "1.75rem" }}>What kind of exam do you want today?</h3>
                  <p style={{ opacity: 0.9, color: "white" }}>Just describe your exam in simple words and let AI do the heavy lifting.</p>
                </div>
              </div>

              {/* ── Structured selectors ── */}
              <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>

                {/* Row 1: Class / Subject / Count / Difficulty */}
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  {/* Class */}
                  <select
                    value={promptClassId}
                    onChange={e => { setPromptClassId(e.target.value); setPromptSubjectId(""); setPromptTopicIds([]); }}
                    style={{ flex: 1, minWidth: "130px", borderRadius: "10px", padding: "10px 12px", border: "none", fontSize: "0.9rem", color: "#1f2937", background: "rgba(255,255,255,0.95)" }}
                  >
                    <option value="">All Classes</option>
                    {overview?.classes.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>

                  {/* Subject */}
                  <select
                    value={promptSubjectId}
                    onChange={e => { setPromptSubjectId(e.target.value); setPromptTopicIds([]); }}
                    style={{ flex: 2, minWidth: "160px", borderRadius: "10px", padding: "10px 12px", border: "none", fontSize: "0.9rem", color: "#1f2937", background: "rgba(255,255,255,0.95)" }}
                  >
                    <option value="">Select Subject *</option>
                    {(questionBank?.subjects ?? [])
                      .filter((s: any) => !promptClassId || s.classId === promptClassId)
                      .map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>

                  {/* Question count */}
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(255,255,255,0.95)", borderRadius: "10px", padding: "8px 12px" }}>
                    <span style={{ fontSize: "0.82rem", color: "#6b7280", whiteSpace: "nowrap" }}>Qs:</span>
                    <input
                      type="number" min={5} max={50} value={promptQuestionCount}
                      onChange={e => setPromptQuestionCount(Math.min(50, Math.max(5, Number(e.target.value))))}
                      style={{ width: "52px", border: "none", fontSize: "0.95rem", fontWeight: 600, color: "#1f2937", background: "transparent", outline: "none" }}
                    />
                  </div>

                  {/* Difficulty */}
                  <select
                    value={promptDifficulty}
                    onChange={e => setPromptDifficulty(e.target.value)}
                    style={{ flex: 1, minWidth: "120px", borderRadius: "10px", padding: "10px 12px", border: "none", fontSize: "0.9rem", color: "#1f2937", background: "rgba(255,255,255,0.95)" }}
                  >
                    <option value="mixed">Mixed Difficulty</option>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>

                {/* Row 2: Topic chips (only when subject selected) */}
                {promptSubjectId && (() => {
                  const topics = (questionBank?.topics ?? []).filter((t: any) => t.subjectId === promptSubjectId);
                  if (topics.length === 0) return null;
                  return (
                    <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: "12px", padding: "14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                        <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>
                          TOPICS — {promptTopicIds.length === 0 ? "All topics selected" : `${promptTopicIds.length} selected`}
                        </span>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button onClick={() => setPromptTopicIds(topics.map((t: any) => t.id))}
                            style={{ fontSize: "0.75rem", padding: "3px 10px", background: "rgba(255,255,255,0.2)", border: "none", borderRadius: "6px", color: "white", cursor: "pointer" }}>
                            All
                          </button>
                          <button onClick={() => setPromptTopicIds([])}
                            style={{ fontSize: "0.75rem", padding: "3px 10px", background: "rgba(255,255,255,0.2)", border: "none", borderRadius: "6px", color: "white", cursor: "pointer" }}>
                            Clear
                          </button>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "7px" }}>
                        {topics.map((t: any) => {
                          const selected = promptTopicIds.includes(t.id);
                          return (
                            <button
                              key={t.id}
                              onClick={() => setPromptTopicIds(prev =>
                                prev.includes(t.id) ? prev.filter(id => id !== t.id) : [...prev, t.id]
                              )}
                              style={{
                                padding: "5px 14px", borderRadius: "20px", border: "none", cursor: "pointer", fontSize: "0.8rem",
                                background: selected ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.15)",
                                color: selected ? "#6366f1" : "rgba(255,255,255,0.9)",
                                fontWeight: selected ? 700 : 400,
                                transition: "all 0.15s"
                              }}
                            >
                              {t.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Row 3: Additional instructions */}
                <textarea
                  placeholder="Additional instructions (optional) — e.g. Focus on numericals, include assertion-reason questions, avoid theory questions..."
                  value={promptExtraText}
                  onChange={e => setPromptExtraText(e.target.value)}
                  style={{ width: "100%", minHeight: "70px", borderRadius: "10px", padding: "14px", border: "none", fontSize: "0.9rem", color: "#1f2937", background: "rgba(255,255,255,0.95)", resize: "vertical" }}
                />

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    className="primary-button"
                    disabled={!promptSubjectId}
                    style={{ background: "white", color: "#6366f1", padding: "12px 30px", fontSize: "1rem", fontWeight: "bold", border: "none", boxShadow: "0 4px 10px rgba(0,0,0,0.15)", opacity: promptSubjectId ? 1 : 0.5 }}
                    onClick={async () => {
                      if (!promptSubjectId) return;
                      setStatus("AI is generating questions from your curriculum...");
                      try {
                        const result = await apiClient.generateExamFromPrompt({
                          subjectId: promptSubjectId,
                          topicIds: promptTopicIds.length > 0 ? promptTopicIds : undefined,
                          questionCount: promptQuestionCount,
                          difficulty: promptDifficulty,
                          additionalInstructions: promptExtraText.trim() || undefined,
                        });
                        liveExamState.generatedExam = result;
                        liveExamState.latestResult = null;
                        setStatus(`Successfully generated "${result.exam.name}" with ${result.questions.length} questions!`);
                      } catch (e: any) {
                        setStatus(`Error: ${e.message}`);
                      }
                    }}
                  >
                    ✨ Generate Exam with AI
                  </button>
                </div>
              </div>
            </div>
            
            {/* Background decorative blob */}
            <div style={{ 
              position: "absolute", 
              top: "-50px", 
              right: "-50px", 
              width: "200px", 
              height: "200px", 
              background: "rgba(255,255,255,0.1)", 
              borderRadius: "50%",
              zIndex: 1 
            }} />
          </article>

          <div style={{ margin: "40px 0", textAlign: "center", position: "relative" }}>
            <hr style={{ border: "none", borderTop: "1px solid var(--color-border)" }} />
            <span style={{ 
              position: "absolute", 
              top: "50%", 
              left: "50%", 
              transform: "translate(-50%, -50%)", 
              background: "var(--color-bg)", 
              padding: "0 20px", 
              color: "var(--color-text-muted)",
              fontSize: "0.9rem",
              fontWeight: "bold"
            }}>
              OR USE TRADITIONAL BUILDER
            </span>
          </div>
        </>
      )}

      <article className="panel">
        <div className="row-between adaptive-header">
          <div>
            <p className="eyebrow">Teacher Weighted Paper Builder</p>
            <h3>Create papers by chapter or topic with percentage weightage</h3>
          </div>
          <div style={{ textAlign: "right" }}>
            <span className={weightageTotal === 100 ? "tag" : "tag muted"}>{weightageTotal}% allocated</span>
            <div style={{ width: "200px", height: "8px", background: "var(--color-bg-secondary)", borderRadius: "4px", marginTop: "8px", overflow: "hidden" }}>
              <div style={{ width: `${Math.min(weightageTotal, 100)}%`, height: "100%", background: weightageTotal === 100 ? "var(--color-primary)" : (weightageTotal > 100 ? "#ef4444" : "#f59e0b"), transition: "width 0.3s ease" }}></div>
            </div>
          </div>
        </div>

        <div className="adaptive-form-grid">
          <label className="field">
            <span>Batch</span>
            <select value={selectedBatchId} onChange={(event) => setSelectedBatchId(event.target.value)}>
              {overview?.batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.name}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <span>Subjects</span>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "8px" }}>
              {availableSubjects.map((subject) => (
                <label key={subject.id} style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "8px", 
                  padding: "8px 12px", 
                  background: selectedSubjectIds.includes(subject.id) ? "var(--color-primary-light, #e0f2f1)" : "white",
                  border: "1px solid",
                  borderColor: selectedSubjectIds.includes(subject.id) ? "var(--color-primary)" : "var(--color-border)",
                  borderRadius: "20px",
                  cursor: "pointer",
                  fontSize: "0.9rem",
                  transition: "all 0.2s"
                }}>
                  <input 
                    type="checkbox" 
                    checked={selectedSubjectIds.includes(subject.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedSubjectIds([...selectedSubjectIds, subject.id]);
                      } else {
                        setSelectedSubjectIds(selectedSubjectIds.filter(id => id !== subject.id));
                      }
                    }}
                  />
                  {subject.name}
                </label>
              ))}
            </div>
          </div>
          <label className="field">
            <span>Exam Name</span>
            <input value={customExamName} onChange={(event) => setCustomExamName(event.target.value)} />
          </label>
          <label className="field">
            <span>Paper Style</span>
            <select value={selectionMode} onChange={(event) => setSelectionMode(event.target.value as "chapter" | "topic")}>
              <option value="chapter">Chapter-wise</option>
              <option value="topic">Topic-wise</option>
            </select>
          </label>
          <label className="field">
            <span>Total Questions</span>
            <input
              type="number"
              min="1"
              value={totalQuestions}
              onChange={(event) => setTotalQuestions(Number(event.target.value) || 1)}
            />
          </label>
          <label className="field">
            <span>Duration (minutes)</span>
            <input
              type="number"
              min="5"
              value={durationMinutes}
              onChange={(event) => setDurationMinutes(Number(event.target.value) || 5)}
            />
          </label>
          <label className="field">
            <span>Start Time</span>
            <input
              type="datetime-local"
              value={scheduledStartTime}
              onChange={(event) => setScheduledStartTime(event.target.value)}
            />
          </label>
          <label className="field">
            <span>End Time</span>
            <input
              type="datetime-local"
              value={scheduledEndTime}
              onChange={(event) => setScheduledEndTime(event.target.value)}
            />
          </label>
        </div>

        <div style={{ marginBottom: "24px" }}>
          <button 
            className="text-link" 
            style={{ fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", padding: 0 }}
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? "− Hide Advanced Options" : "+ Show Advanced Options (Sources, etc.)"}
          </button>
          
          {showAdvanced && (
            <div className="panel" style={{ marginTop: "12px", background: "var(--color-bg-secondary)", border: "1px dashed var(--color-border)" }}>
              <div className="field">
                <span style={{ fontWeight: "bold", fontSize: "0.85rem" }}>Allowed Question Sources</span>
                <div style={{ display: "flex", gap: "12px", marginTop: "10px", flexWrap: "wrap" }}>
                  {["pyq", "reference", "textbook", "ai_generated", "custom"].map(source => (
                    <label key={source} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", background: "white", padding: "6px 14px", border: "1px solid var(--color-border)", borderRadius: "20px", fontSize: "0.85rem" }}>
                      <input 
                        type="checkbox" 
                        checked={allowedSources.includes(source)}
                        onChange={(e) => {
                          if (e.target.checked) setAllowedSources([...allowedSources, source]);
                          else if (allowedSources.length > 1) setAllowedSources(allowedSources.filter(s => s !== source));
                        }}
                      />
                      {source === "pyq" ? "Previous Year Questions" : (source === "reference" ? "Reference Books" : (source === "textbook" ? "Textbooks" : source.replace("_", " ").toUpperCase()))}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="row-between" style={{ marginBottom: "16px" }}>
          <div>
            <h4 style={{ margin: 0 }}>Select {selectionMode === "chapter" ? "Chapters" : "Topics"}</h4>
            <p className="muted-copy" style={{ fontSize: "0.85rem" }}>Select items to include, then distribute weightage.</p>
          </div>
          <div className="action-row" style={{ margin: 0 }}>
            <button className="secondary-button" style={{ padding: "6px 12px", fontSize: "0.85rem" }} onClick={distributeEvenly} disabled={selectedEntityIds.length === 0}>
              Distribute Evenly
            </button>
            <button className="secondary-button" style={{ padding: "6px 12px", fontSize: "0.85rem" }} onClick={selectAll}>
              Select All
            </button>
            <button className="secondary-button" style={{ padding: "6px 12px", fontSize: "0.85rem" }} onClick={() => selectLastN(3)}>
              Recent 3
            </button>
            <button className="secondary-button" style={{ padding: "6px 12px", fontSize: "0.85rem", color: "var(--color-error, #ef4444)" }} onClick={() => setSelectedEntityIds([])}>
              Clear
            </button>
          </div>
        </div>

        <div className="weightage-grid">
          {weightedEntities.map((entity) => {
            const isSelected = selectedEntityIds.includes(entity.id);
            return (
              <div key={entity.id} className={`weightage-card ${isSelected ? "selected" : ""}`} style={{ 
                transition: "all 0.2s ease",
                borderColor: isSelected ? "var(--color-primary)" : "",
                background: isSelected ? "rgba(15, 118, 110, 0.05)" : "",
                display: "flex",
                justifyContent: "space-between",
                padding: "16px",
                borderRadius: "16px",
                border: "1px solid var(--color-border)"
              }}>
                <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                  <input 
                    type="checkbox" 
                    id={`check-${entity.id}`}
                    checked={isSelected}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedEntityIds(prev => Array.from(new Set([...prev, entity.id])));
                      } else {
                        setSelectedEntityIds(prev => prev.filter(id => id !== entity.id));
                        setWeightages(curr => {
                          const next = { ...curr };
                          delete next[entity.id];
                          return next;
                        });
                      }
                    }}
                    style={{ marginTop: "4px", cursor: "pointer" }}
                  />
                  <label htmlFor={`check-${entity.id}`} style={{ cursor: "pointer" }}>
                    <strong style={{ display: "block", fontSize: "0.95rem" }}>{entity.name}</strong>
                    {selectionMode === "topic" && "chapterId" in entity ? (
                      <p className="muted-copy" style={{ fontSize: "0.75rem", margin: 0 }}>{chapterNameById.get(String(entity.chapterId)) ?? "Unknown"}</p>
                    ) : null}
                  </label>
                </div>
                <div className="weightage-input" style={{ opacity: isSelected ? 1 : 0.4, pointerEvents: isSelected ? "auto" : "none" }}>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={weightages[entity.id] ?? ""}
                    onChange={(event) =>
                      setWeightages((current) => ({
                        ...current,
                        [entity.id]: event.target.value
                      }))
                    }
                    placeholder="0"
                    style={{ width: "60px", padding: "8px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                  />
                  <span style={{ marginLeft: "4px" }}>%</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="action-row">
          <button className="primary-button" disabled={weightageTotal !== 100} onClick={() => void createCustomExam()}>
            Generate Weighted Exam
          </button>
        </div>
      </article>

      <article className="panel">
        <div className="row-between adaptive-header">
          <div>
            <p className="eyebrow">PCM / PCB Combined Exam</p>
            <h3>Set per-subject question counts for a multi-subject paper</h3>
            <p className="muted-copy" style={{ fontSize: "0.85rem" }}>JEE: 25+25+25 = 75Q | NEET: 45+45+90 = 180Q</p>
          </div>
        </div>

        <div className="adaptive-form-grid" style={{ marginBottom: "20px" }}>
          <label className="field">
            <span>Exam Name</span>
            <input value={combinedExamName} onChange={(e) => setCombinedExamName(e.target.value)} />
          </label>
          <label className="field">
            <span>Duration (minutes)</span>
            <input type="number" min="5" value={combinedDuration} onChange={(e) => setCombinedDuration(Number(e.target.value) || 5)} />
          </label>
        </div>

        <h4 style={{ marginBottom: "12px" }}>Questions per Subject</h4>
        <div style={{ display: "grid", gap: "10px" }}>
          {availableSubjects.length === 0 ? (
            <p className="muted-copy">Select a batch above to see available subjects.</p>
          ) : availableSubjects.map(subject => {
            const available = questionCountBySubject.get(subject.id) || 0;
            const requested = Number(subjectAllocations[subject.id] || 0);
            const overLimit = requested > 0 && requested > available;
            return (
              <div key={subject.id} style={{ display: "flex", alignItems: "center", gap: "16px", padding: "12px 16px", border: `1px solid ${overLimit ? "#f59e0b" : "var(--color-border)"}`, borderRadius: "12px", background: requested > 0 ? "rgba(15,118,110,0.04)" : "" }}>
                <div style={{ flex: 1 }}>
                  <strong>{subject.name}</strong>
                  <span style={{ marginLeft: "10px", fontSize: "0.8rem", color: available === 0 ? "#ef4444" : "var(--color-text-muted)" }}>
                    {available} available
                  </span>
                  {overLimit && (
                    <span style={{ marginLeft: "8px", fontSize: "0.75rem", color: "#f59e0b" }}>
                      ⚠ only {available} in bank — will use all
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={subjectAllocations[subject.id] ?? ""}
                  onChange={(e) => setSubjectAllocations(prev => ({ ...prev, [subject.id]: e.target.value }))}
                  style={{ width: "80px", padding: "8px 12px", borderRadius: "8px", border: `1px solid ${overLimit ? "#f59e0b" : "#cbd5e1"}`, textAlign: "center", fontSize: "1rem" }}
                />
                <span style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", minWidth: "60px" }}>questions</span>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: "16px", padding: "12px 16px", background: "var(--color-bg-secondary)", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong>
            Total: {Object.values(subjectAllocations).reduce((sum, v) => sum + (Number(v) || 0), 0)} questions
          </strong>
          <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
            Batch: {overview?.batches.find(b => b.id === selectedBatchId)?.name ?? "—"}
          </span>
        </div>

        <div className="action-row" style={{ marginTop: "16px" }}>
          <button
            className="primary-button"
            onClick={() => void createCombinedExam()}
            disabled={Object.values(subjectAllocations).every(v => !Number(v))}
          >
            Generate Combined Exam
          </button>
        </div>
      </article>

      <article className="panel">
        <div className="row-between adaptive-header">
          <div>
            <p className="eyebrow">Adaptive Engine</p>
            <h3>Create a rule-based improvement paper from past performance</h3>
          </div>
        </div>

        <div className="adaptive-form-grid">
          <label className="field">
            <span>Student Id</span>
            <input value={adaptiveStudentId} onChange={(event) => setAdaptiveStudentId(event.target.value)} />
          </label>
          <label className="field">
            <span>Subject Id</span>
            <input value={adaptiveSubjectId} onChange={(event) => setAdaptiveSubjectId(event.target.value)} />
          </label>
        </div>

        <div className="action-row">
          <button className="secondary-button" onClick={() => void loadAdaptivePlan()}>
            Analyze Student
          </button>
          <button className="primary-button" onClick={() => void createAdaptiveExam()}>
            Generate Adaptive Exam
          </button>
        </div>

        {adaptivePlan && (
          <div className="adaptive-plan-card">
            <h4>{adaptivePlan.studentName} Adaptive Plan</h4>
            <p className="muted-copy">{adaptivePlan.summary}</p>
            <ul className="plain-list compact">
              {adaptivePlan.topics.map((topic) => (
                <li key={topic.topicId}>
                  <strong>
                    {topic.topicName} • {topic.questionCount} question(s)
                  </strong>
                  <span>
                    {topic.reason} • accuracy {topic.averageAccuracy}% • weakness {topic.averageWeaknessScore}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </article>

      <div className="stack">
        {blueprints.map((blueprint) => (
          <article key={blueprint.id} className="panel blueprint-card">
            <div>
              <h3>{blueprint.name}</h3>
              <p className="muted-copy">
                {blueprint.className || "Class"} • {blueprint.streamName || "Stream"} • {blueprint.subjectName || "Subject"}
              </p>
              <p className="muted-copy">
                {blueprint.batchName || "Batch"} • {blueprint.durationMinutes} minute timed exam
              </p>
            </div>
            <button className="primary-button" onClick={() => void createExam(blueprint.id)}>
              Generate Exam
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
