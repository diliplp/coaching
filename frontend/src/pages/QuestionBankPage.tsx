import { useEffect, useRef, useState } from "react";
import { apiClient, buildPublicAssetUrl } from "../api/client";
import type { OverviewResponse, QuestionBankResponse, SubjectBook } from "../types";
import { RichText } from "../components/RichText";
import { MathTextarea } from "../components/MathTextarea";
import { getStoredSession } from "../auth";

type SelectedQuestion = {
  questionId: string;
  marks: number;
  negativeMarks: number;
  prompt: string;
  type: string;
  difficulty: string;
  topicName: string;
  subjectName: string;
};

export function QuestionBankPage() {
  const [data, setData] = useState<QuestionBankResponse | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<any>(null);
  const [formData, setFormData] = useState({
    subjectId: "",
    topicId: "",
    type: "single_correct",
    prompt: "",
    difficulty: "medium",
    marks: 4,
    negativeMarks: 1,
    correctOptionIds: [] as string[],
    options: [
      { id: "opt-1", label: "A", value: "" },
      { id: "opt-2", label: "B", value: "" },
      { id: "opt-3", label: "C", value: "" },
      { id: "opt-4", label: "D", value: "" },
    ],
    explanation: "",
    passageText: "",
    sourceType: "custom" as any,
    bookId: "",
    pageNumber: undefined as number | undefined,
    isVerified: false
  });

  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [selectedTopicId, setSelectedTopicId] = useState<string>("");
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("");
  const [selectedSourceType, setSelectedSourceType] = useState<string>("");
  const [books, setBooks] = useState<SubjectBook[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<string>("");
  const [activeQuestionIdForPdf, setActiveQuestionIdForPdf] = useState<string>("");
  const [pdfPageNumber, setPdfPageNumber] = useState<number>(1);

  // AI Review + image upload state
  const [aiReviewLoadingId, setAiReviewLoadingId] = useState<string>("");
  const [aiReviewNotes, setAiReviewNotes] = useState<string>("");
  const [uploadTarget, setUploadTarget] = useState<"prompt" | number | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const imageFileInputRef = useRef<HTMLInputElement>(null);

  // Manual exam builder state
  const [selectedForExam, setSelectedForExam] = useState<Map<string, SelectedQuestion>>(new Map());
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [examName, setExamName] = useState("");
  const [examBatchId, setExamBatchId] = useState("");
  const [examDuration, setExamDuration] = useState(60);
  const [examScheduleStart, setExamScheduleStart] = useState("");
  const [examScheduleEnd, setExamScheduleEnd] = useState("");
  const [overviewData, setOverviewData] = useState<OverviewResponse | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const session = getStoredSession();
  const isTeacher = session?.user.role === "super_admin" || session?.user.role === "teacher";

  const refreshData = () => {
    apiClient.getQuestionBank().then(setData).catch(console.error);
  };

  useEffect(() => {
    refreshData();
    apiClient.getSubjectBooks().then(res => setBooks(res.books)).catch(console.error);
    apiClient.getOverview().then(setOverviewData).catch(console.error);
  }, []);

  const toggleQuestionSelection = (question: any) => {
    setSelectedForExam(prev => {
      const next = new Map(prev);
      if (next.has(question.id)) {
        next.delete(question.id);
      } else {
        next.set(question.id, {
          questionId: question.id,
          marks: question.marks,
          negativeMarks: question.negativeMarks,
          prompt: question.prompt,
          type: question.type,
          difficulty: question.difficulty,
          topicName: question.topicName || "",
          subjectName: question.subjectName || ""
        });
      }
      return next;
    });
  };

  const selectAllQuestions = (questions: any[]) => {
    setSelectedForExam(prev => {
      const next = new Map(prev);
      for (const question of questions) {
        if (!next.has(question.id)) {
          next.set(question.id, {
            questionId: question.id,
            marks: question.marks,
            negativeMarks: question.negativeMarks,
            prompt: question.prompt,
            type: question.type,
            difficulty: question.difficulty,
            topicName: question.topicName || "",
            subjectName: question.subjectName || ""
          });
        }
      }
      return next;
    });
  };

  const deselectAllQuestions = (questions: any[]) => {
    setSelectedForExam(prev => {
      const next = new Map(prev);
      for (const question of questions) {
        next.delete(question.id);
      }
      return next;
    });
  };

  const updateSelectedMarks = (questionId: string, field: "marks" | "negativeMarks", value: number) => {
    setSelectedForExam(prev => {
      const next = new Map(prev);
      const item = next.get(questionId);
      if (item) next.set(questionId, { ...item, [field]: value });
      return next;
    });
  };

  const handleGenerateManualExam = async () => {
    if (!examName.trim() || !examBatchId) {
      alert("Exam name and batch are required");
      return;
    }
    setIsGenerating(true);
    try {
      await apiClient.buildManualExam({
        name: examName,
        batchId: examBatchId,
        durationMinutes: examDuration,
        scheduledStartTime: examScheduleStart || undefined,
        scheduledEndTime: examScheduleEnd || undefined,
        questions: Array.from(selectedForExam.values()).map(q => ({
          questionId: q.questionId,
          marks: q.marks,
          negativeMarks: q.negativeMarks
        }))
      });
      setSelectedForExam(new Map());
      setIsBuilderOpen(false);
      setExamName("");
      setExamBatchId("");
      setExamDuration(60);
      setExamScheduleStart("");
      setExamScheduleEnd("");
      alert("Exam created successfully!");
    } catch (e: any) {
      alert(e?.message || "Failed to create exam");
    } finally {
      setIsGenerating(false);
    }
  };

  if (!data) {
    return <p>Loading question bank...</p>;
  }

  const filteredQuestions = data.questions.filter((question: any) => {
    if (selectedSubjectId && question.subjectId !== selectedSubjectId) return false;
    if (selectedTopicId && question.topicId !== selectedTopicId) return false;
    if (selectedDifficulty && question.difficulty !== selectedDifficulty) return false;
    if (selectedSourceType && question.sourceType !== selectedSourceType) return false;
    if (selectedBookId && question.bookId !== selectedBookId) return false;
    return true;
  });

  const handleOpenForm = (question?: any) => {
    setAiReviewNotes("");
    if (question) {
      setEditingQuestion(question);
      setFormData({
        subjectId: question.subjectId,
        topicId: question.topicId,
        type: question.type,
        prompt: question.prompt,
        difficulty: question.difficulty,
        marks: question.marks,
        negativeMarks: question.negativeMarks,
        correctOptionIds: question.correctOptionIds,
        options: question.options.map((o: any) => ({ ...o })), // Deep-ish copy of options array to avoid direct mutation
        explanation: question.explanation || "",
        passageText: question.passageText || "",
        sourceType: question.sourceType || "custom",
        bookId: question.bookId || "",
        pageNumber: question.pageNumber,
        isVerified: question.isVerified || false
      });
    } else {
      setEditingQuestion(null);
      setFormData({
        subjectId: "",
        topicId: "",
        type: "single_correct",
        prompt: "",
        difficulty: "medium",
        marks: 4,
        negativeMarks: 1,
        correctOptionIds: [],
        options: [
          { id: "opt-1", label: "A", value: "" },
          { id: "opt-2", label: "B", value: "" },
          { id: "opt-3", label: "C", value: "" },
          { id: "opt-4", label: "D", value: "" },
        ],
        explanation: "",
        passageText: "",
        sourceType: "custom",
        bookId: "",
        pageNumber: undefined,
        isVerified: false
      });
    }
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingQuestion) {
        await apiClient.updateQuestion(editingQuestion.id, formData);
      } else {
        await apiClient.createQuestion(formData);
      }
      setIsFormOpen(false);
      setAiReviewNotes("");
      refreshData();
    } catch (error) {
      alert("Error saving question");
      console.error(error);
    }
  };

  // Renders the source PDF page next to the question and asks a vision model to compare
  // the two — returns a suggestion only, never writes directly. If it finds an issue, we
  // open the normal edit form pre-filled with the AI's corrected fields so the admin can
  // review/tweak before saving, same as if they'd typed the fix by hand.
  const handleAiReview = async (question: any) => {
    setAiReviewLoadingId(question.id);
    try {
      const result = await apiClient.admin.aiReviewQuestion(question.id);
      if (!result.needsCorrection) {
        alert(`AI Review: ${result.notes || "No issues found."}`);
        return;
      }
      const baseOptions = question.options.map((o: any) => ({ ...o }));
      const nextOptions = result.options
        ? result.options.map((opt, idx) => ({
            id: baseOptions[idx]?.id || `opt-${idx + 1}`,
            label: opt.label,
            value: opt.value
          }))
        : baseOptions;
      const nextCorrectOptionIds = result.correctLabels
        ? nextOptions.filter((o: any) => result.correctLabels!.includes(o.label)).map((o: any) => o.id)
        : question.correctOptionIds;

      setEditingQuestion(question);
      setFormData({
        subjectId: question.subjectId,
        topicId: question.topicId,
        type: nextCorrectOptionIds.length > 1 ? "multi_correct" : "single_correct",
        prompt: result.prompt ?? question.prompt,
        difficulty: question.difficulty,
        marks: question.marks,
        negativeMarks: question.negativeMarks,
        correctOptionIds: nextCorrectOptionIds,
        options: nextOptions,
        explanation: result.explanation ?? (question.explanation || ""),
        passageText: question.passageText || "",
        sourceType: question.sourceType || "custom",
        bookId: question.bookId || "",
        pageNumber: question.pageNumber,
        isVerified: question.isVerified || false
      });
      setAiReviewNotes(result.notes || "");
      setIsFormOpen(true);
    } catch (e: any) {
      alert(e?.message || "AI review failed");
    } finally {
      setAiReviewLoadingId("");
    }
  };

  const triggerImageUpload = (target: "prompt" | number) => {
    setUploadTarget(target);
    imageFileInputRef.current?.click();
  };

  const handleImageFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || uploadTarget === null) return;
    setIsUploadingImage(true);
    try {
      const { url } = await apiClient.admin.uploadImage(file);
      const token = `[IMAGE: ${url}]`;
      if (uploadTarget === "prompt") {
        setFormData((prev) => ({ ...prev, prompt: prev.prompt ? `${prev.prompt}\n${token}` : token }));
      } else {
        const targetIndex = uploadTarget;
        setFormData((prev) => ({
          ...prev,
          options: prev.options.map((o, idx) => (idx === targetIndex ? { ...o, value: o.value ? `${o.value}\n${token}` : token } : o))
        }));
      }
    } catch (err: any) {
      alert(err?.message || "Image upload failed");
    } finally {
      setIsUploadingImage(false);
      setUploadTarget(null);
    }
  };

  const handleVerify = async (id: string) => {
    try {
      await apiClient.admin.verifyQuestion(id);
      refreshData();
    } catch (error) {
      alert("Error verifying question");
      console.error(error);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this question?")) {
      try {
        await apiClient.deleteQuestion(id);
        refreshData();
      } catch (error) {
        alert("Error deleting question");
        console.error(error);
      }
    }
  };

  const handleClearAll = async () => {
    const confirmation = prompt("This will PERMANENTLY delete ALL questions in the bank. Type 'DELETE ALL' to confirm.");
    if (confirmation !== "DELETE ALL") return;

    try {
      await apiClient.admin.clearAllQuestions();
      refreshData();
      alert("Question bank cleared successfully.");
    } catch (error) {
      console.error(error);
      alert("Failed to clear question bank.");
    }
  };

  const handleClearSubject = async () => {
    if (!selectedSubjectId) {
      alert("Please select a subject from the filter below first.");
      return;
    }
    const subject = data?.subjects.find((s: any) => s.id === selectedSubjectId);
    const subjectName = subject?.name ?? "this subject";
    const confirmation = prompt(`This will PERMANENTLY delete all questions for "${subjectName}". Type 'DELETE' to confirm.`);
    if (confirmation !== "DELETE") return;
    try {
      const result = await apiClient.admin.clearSubjectQuestions(selectedSubjectId);
      refreshData();
      alert(result.message);
    } catch (error: any) {
      console.error(error);
      alert(error?.message ?? "Failed to delete subject questions.");
    }
  };

  const toggleOption = (id: string) => {
    setFormData(prev => {
      if (prev.type === "single_correct") {
        return { ...prev, correctOptionIds: [id] };
      } else {
        const ids = prev.correctOptionIds.includes(id)
          ? prev.correctOptionIds.filter(i => i !== id)
          : [...prev.correctOptionIds, id];
        return { ...prev, correctOptionIds: ids };
      }
    });
  };

  return (
    <div className="page">
      <section className="section-heading">
        <div className="row-between">
          <div>
            <p className="eyebrow">Question Bank</p>
            <h2>Subject and topic organized MCQ library</h2>
          </div>
          {isTeacher && (
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                className="secondary-button"
                style={{ color: "#b45309", borderColor: "#b45309" }}
                onClick={handleClearSubject}
                title={selectedSubjectId ? `Delete all questions for the selected subject` : "Select a subject filter first"}
              >
                Delete Subject MCQs{selectedSubjectId && data ? ` (${data.subjects.find((s: any) => s.id === selectedSubjectId)?.name ?? ""})` : ""}
              </button>
              <button
                className="secondary-button"
                style={{ color: "red", borderColor: "red" }}
                onClick={handleClearAll}
              >
                Delete Entire Bank
              </button>
              {selectedForExam.size > 0 && (
                <button
                  className="primary-button"
                  style={{ background: "#7c3aed", borderColor: "#7c3aed" }}
                  onClick={() => setIsBuilderOpen(true)}
                >
                  Build Exam ({selectedForExam.size})
                </button>
              )}
              <button className="primary-button" onClick={() => handleOpenForm()}>
                + Add Question
              </button>
            </div>
          )}
        </div>
      </section>

      <input
        ref={imageFileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleImageFileSelected}
      />

      {isFormOpen && (
        <article className="panel" style={{ marginBottom: "30px", border: "2px solid var(--color-primary)" }}>
          <h3>{editingQuestion ? "Edit Question" : "Add New Question"}</h3>
          {aiReviewNotes && (
            <div style={{ margin: "10px 0", padding: "12px", background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: "8px", fontSize: "0.9rem" }}>
              <strong>🤖 AI Review:</strong> {aiReviewNotes}
            </div>
          )}
          <form onSubmit={handleSubmit} className="stack">
            <div className="grid-two">
              <label className="field">
                <span>Subject</span>
                <select 
                  value={formData.subjectId} 
                  onChange={e => setFormData({...formData, subjectId: e.target.value})}
                  required
                >
                  <option value="">Select Subject</option>
                  {data.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Topic</span>
                <select 
                  value={formData.topicId} 
                  onChange={e => setFormData({...formData, topicId: e.target.value})}
                  required
                >
                  <option value="">Select Topic</option>
                  {data.topics.filter(t => t.subjectId === formData.subjectId).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
            </div>

            <div className="grid-two">
              <label className="field">
                <span>Type</span>
                <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                  <option value="single_correct">Single Correct</option>
                  <option value="multi_correct">Multi Correct</option>
                </select>
              </label>
              <label className="field">
                <span>Difficulty</span>
                <select value={formData.difficulty} onChange={e => setFormData({...formData, difficulty: e.target.value})}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </label>
            </div>

            <div className="grid-two">
              <label className="field">
                <span>Marks</span>
                <input type="number" value={formData.marks} onChange={e => setFormData({...formData, marks: Number(e.target.value)})} />
              </label>
              <label className="field">
                <span>Negative Marks</span>
                <input type="number" value={formData.negativeMarks} onChange={e => setFormData({...formData, negativeMarks: Number(e.target.value)})} />
              </label>
            </div>

            <label className="field">
              <span>Question Source</span>
              <select value={formData.sourceType} onChange={e => setFormData({...formData, sourceType: e.target.value})}>
                <option value="pyq">PYQ (Previous Year Question)</option>
                <option value="reference">Reference Book</option>
                <option value="ai_generated">AI Generated</option>
                <option value="custom">Custom/Self Created</option>
              </select>
            </label>

            <div className="field">
              <div className="row-between" style={{ marginBottom: "4px" }}>
                <span>Question Prompt (Supports LaTeX and SMILES)</span>
                <button
                  type="button"
                  className="secondary-button"
                  style={{ padding: "3px 10px", fontSize: "0.78rem" }}
                  disabled={isUploadingImage}
                  onClick={() => triggerImageUpload("prompt")}
                >
                  📎 Insert Image
                </button>
              </div>
              <MathTextarea
                rows={4}
                value={formData.prompt}
                onChange={v => setFormData({...formData, prompt: v})}
                placeholder="Type question here. Use $...$ for inline math, $$...$$ for block math."
                required
              />
            </div>

            <div>
              <span>Options (Select correct ones)</span>
              <div className="stack" style={{ marginTop: "10px" }}>
                {formData.options.map((opt, index) => (
                  <div key={opt.id} style={{ display: "flex", gap: "10px", alignItems: "flex-start", marginBottom: "8px" }}>
                    <div style={{ paddingTop: "10px" }}>
                      <input
                        type={formData.type === "single_correct" ? "radio" : "checkbox"}
                        name="correct-opt"
                        checked={formData.correctOptionIds.includes(opt.id)}
                        onChange={() => toggleOption(opt.id)}
                      />
                    </div>
                    <strong style={{ paddingTop: "10px", minWidth: "16px" }}>{opt.label}</strong>
                    <div style={{ flex: 1 }}>
                      <MathTextarea
                        rows={2}
                        value={opt.value}
                        onChange={v => {
                          const newOpts = formData.options.map((item, idx) =>
                            idx === index ? { ...item, value: v } : item
                          );
                          setFormData({...formData, options: newOpts});
                        }}
                        placeholder={`Option ${opt.label}`}
                        required
                      />
                    </div>
                    <button
                      type="button"
                      className="secondary-button"
                      style={{ padding: "3px 10px", fontSize: "0.78rem", marginTop: "4px" }}
                      disabled={isUploadingImage}
                      onClick={() => triggerImageUpload(index)}
                    >
                      📎
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="field">
              <span>Passage / Comprehension Text <span style={{ fontWeight: 400, color: "var(--color-text-muted)", fontSize: "0.8rem" }}>(optional — shown above question in exam)</span></span>
              <MathTextarea
                rows={4}
                value={formData.passageText || ""}
                onChange={v => setFormData({...formData, passageText: v})}
                placeholder="Leave empty for standalone question. For paragraph-based questions, paste the reading passage here. Multiple questions can share the same passage."
              />
            </div>

            <div className="field">
              <span>Explanation</span>
              <MathTextarea
                rows={3}
                value={formData.explanation}
                onChange={v => setFormData({...formData, explanation: v})}
                placeholder="Optional explanation with LaTeX support"
              />
            </div>

            <div className="row-between" style={{ marginTop: "20px" }}>
              <button type="button" className="secondary-button" onClick={() => { setIsFormOpen(false); setAiReviewNotes(""); }}>Cancel</button>
              <button type="submit" className="primary-button">Save Question</button>
            </div>
          </form>
        </article>
      )}

      {/* Filters Section */}
      <article className="panel" style={{ marginBottom: "20px", padding: "15px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "15px", alignItems: "end" }}>
          <label className="field" style={{ margin: 0 }}>
            <span>Filter by Subject</span>
            <select
              value={selectedSubjectId}
              onChange={(e) => {
                setSelectedSubjectId(e.target.value);
                setSelectedTopicId("");
              }}
            >
              <option value="">All Subjects</option>
              {data.subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field" style={{ margin: 0 }}>
            <span>Filter by Topic</span>
            <select
              value={selectedTopicId}
              onChange={(e) => setSelectedTopicId(e.target.value)}
            >
              <option value="">All Topics</option>
              {data.topics
                .filter((t) => !selectedSubjectId || t.subjectId === selectedSubjectId)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </label>

          <label className="field" style={{ margin: 0 }}>
            <span>Filter by Difficulty</span>
            <select
              value={selectedDifficulty}
              onChange={(e) => setSelectedDifficulty(e.target.value)}
            >
              <option value="">All Difficulties</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>

          <label className="field" style={{ margin: 0 }}>
            <span>Filter by Source</span>
            <select
              value={selectedSourceType}
              onChange={(e) => setSelectedSourceType(e.target.value)}
            >
              <option value="">All Sources</option>
              <option value="pyq">PYQ</option>
              <option value="reference">Reference</option>
              <option value="ai_generated">AI Generated</option>
              <option value="custom">Custom</option>
            </select>
          </label>

          <label className="field" style={{ margin: 0 }}>
            <span>Filter by Document / Book</span>
            <select
              value={selectedBookId}
              onChange={(e) => {
                setSelectedBookId(e.target.value);
                setActiveQuestionIdForPdf("");
                setPdfPageNumber(1);
              }}
            >
              <option value="">Select Document...</option>
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          </label>

          {(selectedSubjectId || selectedTopicId || selectedDifficulty || selectedSourceType || selectedBookId) && (
            <button
              className="secondary-button"
              style={{ height: "38px" }}
              onClick={() => {
                setSelectedSubjectId("");
                setSelectedTopicId("");
                setSelectedDifficulty("");
                setSelectedSourceType("");
                setSelectedBookId("");
                setActiveQuestionIdForPdf("");
              }}
            >
              Clear Filters
            </button>
          )}
        </div>
      </article>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px", flexWrap: "wrap", gap: "10px" }}>
        <p className="muted-copy" style={{ margin: 0 }}>
          Showing <strong>{filteredQuestions.length}</strong> of {data.questions.length} questions
        </p>
        {isTeacher && filteredQuestions.length > 0 && (
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", cursor: "pointer", margin: 0 }}>
            <input
              type="checkbox"
              checked={filteredQuestions.every((q: any) => selectedForExam.has(q.id))}
              onChange={(e) => {
                if (e.target.checked) selectAllQuestions(filteredQuestions);
                else deselectAllQuestions(filteredQuestions);
              }}
              style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "#7c3aed" }}
            />
            Select all {filteredQuestions.length} filtered question{filteredQuestions.length !== 1 ? "s" : ""} for exam
          </label>
        )}
      </div>

      {selectedBookId ? (
        <div style={{ display: "flex", gap: "20px", height: "calc(100vh - 250px)", minHeight: "650px", marginTop: "20px" }}>
          {/* Left Pane: PDF Viewer */}
          <div style={{ flex: 1.2, background: "white", borderRadius: "12px", border: "1px solid var(--color-border)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8f9fa" }}>
              <span style={{ fontWeight: "bold", fontSize: "0.95rem", color: "var(--color-text-dark)" }}>
                PDF Preview: {books.find(b => b.id === selectedBookId)?.title}
              </span>
              <span className="tag primary" style={{ fontSize: "0.8rem", padding: "4px 10px" }}>Page {pdfPageNumber}</span>
            </div>
            <iframe
              key={`${selectedBookId}-${pdfPageNumber}`}
              src={`${buildPublicAssetUrl(books.find(b => b.id === selectedBookId)?.fileUrl || "")}#page=${pdfPageNumber}`}
              style={{ width: "100%", height: "100%", border: "none" }}
              title="Book PDF Viewer"
            />
          </div>

          {/* Right Pane: Questions List — sorted by page number to match PDF order */}
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "15px", paddingRight: "5px" }}>
            {filteredQuestions.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: "var(--color-text-muted)" }}>
                <p>No questions generated for this document yet.</p>
              </div>
            ) : (
              [...filteredQuestions]
                .sort((a: any, b: any) => {
                  const aN = a.questionNumber ?? (a.pageNumber != null ? a.pageNumber * 1000 : 999999);
                  const bN = b.questionNumber ?? (b.pageNumber != null ? b.pageNumber * 1000 : 999999);
                  return aN - bN;
                })
                .map((question: any) => {
                const isActive = activeQuestionIdForPdf === question.id;
                return (
                  <article 
                    className="panel question-card" 
                    key={question.id}
                    onClick={() => {
                      setActiveQuestionIdForPdf(question.id);
                      if (question.pageNumber) {
                        setPdfPageNumber(question.pageNumber);
                      }
                    }}
                    style={{ 
                      cursor: "pointer",
                      border: isActive ? "2px solid var(--color-primary)" : "1px solid var(--color-border)",
                      boxShadow: isActive ? "0 4px 12px rgba(0, 128, 128, 0.1)" : "none",
                      transition: "all 0.2s ease",
                      background: isActive ? "#fbfdfd" : "white"
                    }}
                  >
                    <div className="row-between">
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        {isTeacher && (
                          <input
                            type="checkbox"
                            checked={selectedForExam.has(question.id)}
                            onChange={() => toggleQuestionSelection(question)}
                            onClick={(e) => e.stopPropagation()}
                            style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "#7c3aed" }}
                          />
                        )}
                        <span className="tag">{question.subjectName}</span>
                        <span className="tag muted" style={{ marginLeft: "5px" }}>{question.topicName}</span>
                        {question.pageNumber && (
                          <span className="tag primary" style={{ marginLeft: "5px" }}>Page {question.pageNumber}</span>
                        )}
                        {question.isVerified && (
                          <span className="tag" style={{ marginLeft: "5px", background: "#d4edda", color: "#155724", borderColor: "#c3e6cb" }}>
                            VERIFIED
                          </span>
                        )}
                        {(!question.correctOptionIds || question.correctOptionIds.length === 0) && (
                          <span className="tag" style={{ marginLeft: "5px", background: "#f8d7da", color: "#721c24", borderColor: "#f5c6cb" }}>
                            NO ANSWER
                          </span>
                        )}
                      </div>
                      {isTeacher && (
                        <div style={{ display: "flex", gap: "10px" }} onClick={(e) => e.stopPropagation()}>
                          {!question.isVerified && (
                            <button
                              className="secondary-button"
                              style={{ padding: "4px 8px", fontSize: "0.8rem", color: "#155724", borderColor: "#155724" }}
                              onClick={() => handleVerify(question.id)}
                            >
                              Verify
                            </button>
                          )}
                          {question.bookId && question.pageNumber && (
                            <button
                              className="secondary-button"
                              style={{ padding: "4px 8px", fontSize: "0.8rem", color: "#4338ca", borderColor: "#4338ca" }}
                              disabled={aiReviewLoadingId === question.id}
                              onClick={() => handleAiReview(question)}
                            >
                              {aiReviewLoadingId === question.id ? "Reviewing…" : "🤖 AI Review"}
                            </button>
                          )}
                          <button className="secondary-button" style={{ padding: "4px 8px", fontSize: "0.8rem" }} onClick={() => handleOpenForm(question)}>Edit</button>
                          <button className="secondary-button" style={{ padding: "4px 8px", fontSize: "0.8rem", color: "red", borderColor: "red" }} onClick={() => handleDelete(question.id)}>Delete</button>
                        </div>
                      )}
                    </div>
                    <h3><RichText content={question.prompt} /></h3>
                    <p className="muted-copy">
                      {question.type === "multi_correct" ? "Multi correct" : "Single correct"} • {question.difficulty} • {question.marks} marks • -{question.negativeMarks}
                    </p>
                    <ul className="option-list">
                      {question.options.map((option: any) => (
                        <li key={option.id} style={{ fontWeight: question.correctOptionIds.includes(option.id) ? "bold" : "normal", color: question.correctOptionIds.includes(option.id) ? "var(--color-primary)" : "inherit" }}>
                          {option.label}. <RichText content={option.value} />
                          {question.correctOptionIds.includes(option.id) && " ✓"}
                        </li>
                      ))}
                    </ul>
                    {question.explanation && (
                      <div style={{ marginTop: "15px", padding: "10px", background: "var(--color-bg-secondary)", borderRadius: "4px", fontSize: "0.9rem" }}>
                        <strong>Explanation:</strong> <RichText content={question.explanation} />
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <div className="question-grid">
          {filteredQuestions.map((question: any) => (
            <article
              className="panel question-card"
              key={question.id}
              style={selectedForExam.has(question.id) ? { border: "2px solid #7c3aed", background: "#faf5ff" } : {}}
            >
              <div className="row-between">
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  {isTeacher && (
                    <input
                      type="checkbox"
                      checked={selectedForExam.has(question.id)}
                      onChange={() => toggleQuestionSelection(question)}
                      style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "#7c3aed" }}
                    />
                  )}
                  <span className="tag">{question.subjectName}</span>
                  <span className="tag muted" style={{ marginLeft: "5px" }}>{question.topicName}</span>
                  {question.sourceType && (
                    <span
                      className="tag"
                      style={{
                        marginLeft: "5px",
                        background: question.sourceType === "pyq" ? "#fff3cd" : (question.sourceType === "reference" ? "#d1ecf1" : "#e2e3e5"),
                        color: question.sourceType === "pyq" ? "#856404" : (question.sourceType === "reference" ? "#0c5460" : "#383d41"),
                        borderColor: question.sourceType === "pyq" ? "#ffeeba" : (question.sourceType === "reference" ? "#bee5eb" : "#d6d8db")
                      }}
                    >
                      {question.sourceType.toUpperCase()}
                    </span>
                  )}
                  {(question as any).pyqYear && (
                    <span className="tag" style={{ marginLeft: "5px", background: "#fef9c3", color: "#713f12", borderColor: "#fde68a", fontWeight: "bold" }}>
                      {[(question as any).pyqExamName, (question as any).pyqYear, (question as any).pyqSession].filter(Boolean).join(" ")}
                    </span>
                  )}
                  {question.isVerified && (
                    <span className="tag" style={{ marginLeft: "5px", background: "#d4edda", color: "#155724", borderColor: "#c3e6cb" }}>
                      VERIFIED
                    </span>
                  )}
                  {(!question.correctOptionIds || question.correctOptionIds.length === 0) && (
                    <span className="tag" style={{ marginLeft: "5px", background: "#f8d7da", color: "#721c24", borderColor: "#f5c6cb" }}>
                      NO ANSWER
                    </span>
                  )}
                </div>
                {isTeacher && (
                  <div style={{ display: "flex", gap: "10px" }}>
                    {!question.isVerified && (
                      <button
                        className="secondary-button"
                        style={{ padding: "4px 8px", fontSize: "0.8rem", color: "#155724", borderColor: "#155724" }}
                        onClick={() => handleVerify(question.id)}
                      >
                        Verify
                      </button>
                    )}
                    <button className="secondary-button" style={{ padding: "4px 8px", fontSize: "0.8rem" }} onClick={() => handleOpenForm(question)}>Edit</button>
                    <button className="secondary-button" style={{ padding: "4px 8px", fontSize: "0.8rem", color: "red", borderColor: "red" }} onClick={() => handleDelete(question.id)}>Delete</button>
                  </div>
                )}
              </div>
              <h3><RichText content={question.prompt} /></h3>
              <p className="muted-copy">
                {question.type === "multi_correct" ? "Multi correct" : "Single correct"} • {question.difficulty} • {question.marks} marks • -{question.negativeMarks}
              </p>
              <ul className="option-list">
                {question.options.map((option: any) => (
                  <li key={option.id} style={{ fontWeight: question.correctOptionIds.includes(option.id) ? "bold" : "normal", color: question.correctOptionIds.includes(option.id) ? "var(--color-primary)" : "inherit" }}>
                    {option.label}. <RichText content={option.value} />
                    {question.correctOptionIds.includes(option.id) && " ✓"}
                  </li>
                ))}
              </ul>
              {question.explanation && (
                <div style={{ marginTop: "15px", padding: "10px", background: "var(--color-bg-secondary)", borderRadius: "4px", fontSize: "0.9rem" }}>
                  <strong>Explanation:</strong> <RichText content={question.explanation} />
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {/* Sticky bottom bar — shows when questions are selected */}
      {isTeacher && selectedForExam.size > 0 && (
        <div style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "#7c3aed",
          color: "white",
          padding: "14px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          zIndex: 100,
          boxShadow: "0 -4px 20px rgba(124,58,237,0.3)"
        }}>
          <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
            <strong>{selectedForExam.size} question{selectedForExam.size !== 1 ? "s" : ""} selected</strong>
            <span style={{ opacity: 0.85 }}>
              Total marks: {Array.from(selectedForExam.values()).reduce((s, q) => s + q.marks, 0)}
            </span>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={() => setSelectedForExam(new Map())}
              style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.4)", color: "white", padding: "8px 16px", borderRadius: "6px", cursor: "pointer" }}
            >
              Clear
            </button>
            <button
              onClick={() => setIsBuilderOpen(true)}
              style={{ background: "white", border: "none", color: "#7c3aed", padding: "8px 20px", borderRadius: "6px", fontWeight: "bold", cursor: "pointer" }}
            >
              Review & Build Exam
            </button>
          </div>
        </div>
      )}

      {/* Exam Builder Drawer */}
      {isBuilderOpen && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 200,
          display: "flex"
        }}>
          {/* Backdrop */}
          <div
            style={{ flex: 1, background: "rgba(0,0,0,0.4)" }}
            onClick={() => setIsBuilderOpen(false)}
          />
          {/* Drawer panel */}
          <div style={{
            width: "min(520px, 95vw)",
            background: "var(--color-bg)",
            height: "100%",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            boxShadow: "-4px 0 24px rgba(0,0,0,0.15)"
          }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Manual Exam Builder</p>
                <h3 style={{ margin: "4px 0 0" }}>{selectedForExam.size} Questions</h3>
              </div>
              <button onClick={() => setIsBuilderOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.4rem", color: "var(--color-text-muted)" }}>✕</button>
            </div>

            {/* Question list with editable marks */}
            <div style={{ padding: "16px 24px", flex: 1 }}>
              <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", margin: "0 0 12px" }}>
                Adjust per-question marks below. These apply only to this exam — the question bank is unchanged.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "24px" }}>
                {Array.from(selectedForExam.values()).map((q, idx) => (
                  <div key={q.questionId} style={{ padding: "12px", border: "1px solid var(--color-border)", borderRadius: "8px", background: "var(--color-bg-secondary)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: "0 0 4px", fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                          #{idx + 1} · {q.subjectName} · {q.topicName} · <em>{q.difficulty}</em>
                        </p>
                        <p style={{ margin: 0, fontSize: "0.88rem", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                          {q.prompt.replace(/<[^>]+>/g, "").slice(0, 120)}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          const next = new Map(selectedForExam);
                          next.delete(q.questionId);
                          setSelectedForExam(next);
                        }}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", fontSize: "1.1rem", padding: "0 4px", flexShrink: 0 }}
                        title="Remove"
                      >✕</button>
                    </div>
                    <div style={{ display: "flex", gap: "12px", marginTop: "10px" }}>
                      <label style={{ flex: 1 }}>
                        <span style={{ display: "block", fontSize: "0.75rem", color: "var(--color-text-muted)", marginBottom: "3px" }}>Marks (+)</span>
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          value={q.marks}
                          onChange={e => updateSelectedMarks(q.questionId, "marks", Number(e.target.value))}
                          style={{ width: "100%", padding: "5px 8px", border: "1px solid var(--color-border)", borderRadius: "5px", background: "var(--color-bg)", color: "var(--color-text)" }}
                        />
                      </label>
                      <label style={{ flex: 1 }}>
                        <span style={{ display: "block", fontSize: "0.75rem", color: "var(--color-text-muted)", marginBottom: "3px" }}>Negative (−)</span>
                        <input
                          type="number"
                          min={0}
                          step={0.25}
                          value={q.negativeMarks}
                          onChange={e => updateSelectedMarks(q.questionId, "negativeMarks", Number(e.target.value))}
                          style={{ width: "100%", padding: "5px 8px", border: "1px solid var(--color-border)", borderRadius: "5px", background: "var(--color-bg)", color: "var(--color-text)" }}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              {/* Exam config */}
              <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "20px" }}>
                <h4 style={{ margin: "0 0 14px" }}>Exam Settings</h4>
                <div className="stack" style={{ gap: "12px" }}>
                  <label className="field" style={{ margin: 0 }}>
                    <span>Exam Name</span>
                    <input
                      type="text"
                      value={examName}
                      onChange={e => setExamName(e.target.value)}
                      placeholder="e.g. Chapter 3 Practice Test"
                    />
                  </label>
                  <label className="field" style={{ margin: 0 }}>
                    <span>Batch</span>
                    <select value={examBatchId} onChange={e => setExamBatchId(e.target.value)}>
                      <option value="">Select batch...</option>
                      {overviewData?.batches.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field" style={{ margin: 0 }}>
                    <span>Duration (minutes)</span>
                    <input
                      type="number"
                      min={5}
                      value={examDuration}
                      onChange={e => setExamDuration(Number(e.target.value))}
                    />
                  </label>
                  <div className="grid-two" style={{ gap: "12px" }}>
                    <label className="field" style={{ margin: 0 }}>
                      <span>Scheduled Start (optional)</span>
                      <input
                        type="datetime-local"
                        value={examScheduleStart}
                        onChange={e => setExamScheduleStart(e.target.value)}
                      />
                    </label>
                    <label className="field" style={{ margin: 0 }}>
                      <span>Scheduled End (optional)</span>
                      <input
                        type="datetime-local"
                        value={examScheduleEnd}
                        onChange={e => setExamScheduleEnd(e.target.value)}
                      />
                    </label>
                  </div>
                </div>

                <div style={{ marginTop: "20px", padding: "12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", fontSize: "0.85rem", color: "#166534" }}>
                  <strong>Summary:</strong> {selectedForExam.size} questions •{" "}
                  Total {Array.from(selectedForExam.values()).reduce((s, q) => s + q.marks, 0)} marks •{" "}
                  {examDuration} min
                </div>

                <button
                  className="primary-button"
                  style={{ width: "100%", marginTop: "16px", padding: "12px", fontSize: "1rem" }}
                  onClick={handleGenerateManualExam}
                  disabled={isGenerating || !examName.trim() || !examBatchId}
                >
                  {isGenerating ? "Creating exam…" : "Create Exam"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
