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

  // Pagination & Server-side filtering state
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(20);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [selectedChapterId, setSelectedChapterId] = useState<string>("");
  const [selectedTopicId, setSelectedTopicId] = useState<string>("");
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("");
  const [selectedSourceType, setSelectedSourceType] = useState<string>("");
  const [books, setBooks] = useState<SubjectBook[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<string>("");
  const [selectedTag, setSelectedTag] = useState<string>("");
  const [activeQuestionIdForPdf, setActiveQuestionIdForPdf] = useState<string>("");
  const [pdfPageNumber, setPdfPageNumber] = useState<number>(1);
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [jumpPageInput, setJumpPageInput] = useState<string>("");

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

  // Debounce search query input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadQuestionBank = async () => {
    setIsFetching(true);
    try {
      const res = await apiClient.getQuestionBank({
        page,
        limit,
        subjectId: selectedSubjectId || undefined,
        chapterId: selectedChapterId || undefined,
        topicId: selectedTopicId || undefined,
        difficulty: selectedDifficulty || undefined,
        tag: selectedTag || undefined,
        sourceType: selectedSourceType || undefined,
        bookId: selectedBookId || undefined,
        search: debouncedSearch || undefined
      });
      setData(res);
    } catch (err) {
      console.error("Failed to load question bank:", err);
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    loadQuestionBank();
  }, [
    page,
    limit,
    selectedSubjectId,
    selectedChapterId,
    selectedTopicId,
    selectedDifficulty,
    selectedTag,
    selectedSourceType,
    selectedBookId,
    debouncedSearch
  ]);

  useEffect(() => {
    apiClient.getSubjectBooks().then(res => setBooks(res.books)).catch(console.error);
    apiClient.getOverview().then(setOverviewData).catch(console.error);
  }, []);

  const refreshData = () => {
    loadQuestionBank();
  };

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
        options: question.options.map((o: any) => ({ ...o })),
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

  if (!data) {
    return (
      <div className="page" style={{ textAlign: "center", padding: "60px" }}>
        <div className="spinner" style={{ margin: "0 auto 15px" }}></div>
        <p className="muted-copy">Loading Question Bank...</p>
      </div>
    );
  }

  const totalCount = data.totalCount ?? data.questions.length;
  const totalPages = data.totalPages ?? (Math.ceil(totalCount / limit) || 1);
  const currentPage = data.page ?? page;

  const filteredChapters = data.chapters.filter(
    (c) => !selectedSubjectId || c.subjectId === selectedSubjectId
  );
  const filteredTopics = data.topics.filter((t) => {
    if (selectedSubjectId && t.subjectId !== selectedSubjectId) return false;
    if (selectedChapterId && t.chapterId !== selectedChapterId) return false;
    return true;
  });

  const hasActiveFilters = Boolean(
    selectedSubjectId ||
    selectedChapterId ||
    selectedTopicId ||
    selectedDifficulty ||
    selectedSourceType ||
    selectedBookId ||
    selectedTag ||
    searchQuery
  );

  const handleClearFilters = () => {
    setSelectedSubjectId("");
    setSelectedChapterId("");
    setSelectedTopicId("");
    setSelectedDifficulty("");
    setSelectedSourceType("");
    setSelectedBookId("");
    setSelectedTag("");
    setSearchQuery("");
    setActiveQuestionIdForPdf("");
    setPage(1);
  };

  // Helper Pagination Controls Component
  const renderPaginationControls = () => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "white", borderRadius: "10px", border: "1px solid var(--color-border)", margin: "15px 0", flexWrap: "wrap", gap: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "0.9rem", color: "var(--color-text-dark)" }}>
        <span>
          Showing <strong>{totalCount > 0 ? (currentPage - 1) * limit + 1 : 0} - {Math.min(currentPage * limit, totalCount)}</strong> of <strong>{totalCount.toLocaleString()}</strong> questions
        </span>
        {isFetching && <span style={{ color: "#7c3aed", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "4px" }}>⚡ Loading...</span>}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        {/* Page Size Selector */}
        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", margin: 0 }}>
          <span style={{ color: "var(--color-text-muted)" }}>Per page:</span>
          <select
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setPage(1);
            }}
            style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid var(--color-border)", fontSize: "0.85rem" }}
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>

        {/* Page Navigation Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <button
            className="secondary-button"
            disabled={currentPage <= 1 || isFetching}
            onClick={() => setPage(1)}
            style={{ padding: "5px 10px", fontSize: "0.85rem" }}
            title="First Page"
          >
            «
          </button>
          <button
            className="secondary-button"
            disabled={currentPage <= 1 || isFetching}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            style={{ padding: "5px 12px", fontSize: "0.85rem" }}
          >
            Prev
          </button>

          <span style={{ padding: "0 8px", fontSize: "0.88rem", fontWeight: 600 }}>
            Page {currentPage} of {totalPages}
          </span>

          <button
            className="secondary-button"
            disabled={currentPage >= totalPages || isFetching}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            style={{ padding: "5px 12px", fontSize: "0.85rem" }}
          >
            Next
          </button>
          <button
            className="secondary-button"
            disabled={currentPage >= totalPages || isFetching}
            onClick={() => setPage(totalPages)}
            style={{ padding: "5px 10px", fontSize: "0.85rem" }}
            title="Last Page"
          >
            »
          </button>
        </div>

        {/* Jump to Page */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const p = parseInt(jumpPageInput);
            if (p >= 1 && p <= totalPages) {
              setPage(p);
              setJumpPageInput("");
            }
          }}
          style={{ display: "flex", alignItems: "center", gap: "4px" }}
        >
          <input
            type="number"
            min={1}
            max={totalPages}
            placeholder="Go to..."
            value={jumpPageInput}
            onChange={(e) => setJumpPageInput(e.target.value)}
            style={{ width: "65px", padding: "4px 8px", borderRadius: "6px", border: "1px solid var(--color-border)", fontSize: "0.85rem" }}
          />
          <button type="submit" className="secondary-button" style={{ padding: "4px 10px", fontSize: "0.85rem" }}>Go</button>
        </form>
      </div>
    </div>
  );

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

      {/* Search & Filters Section */}
      <article className="panel" style={{ marginBottom: "20px", padding: "18px" }}>
        {/* Real-time Search Box */}
        <div style={{ marginBottom: "16px" }}>
          <div style={{ position: "relative" }}>
            <input
              type="text"
              placeholder="🔍 Search questions by keyword, formula, tag, serial number (e.g. #1247)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 14px 10px 40px",
                borderRadius: "8px",
                border: "1.5px solid var(--color-border)",
                fontSize: "0.95rem",
                background: "#fafafa"
              }}
            />
            <span style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", fontSize: "1.1rem", color: "#6b7280" }}>
              🔍
            </span>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                style={{
                  position: "absolute",
                  right: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  color: "#6b7280",
                  fontSize: "1rem"
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Filters Dropdowns Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", alignItems: "end" }}>
          <label className="field" style={{ margin: 0 }}>
            <span>Subject</span>
            <select
              value={selectedSubjectId}
              onChange={(e) => {
                setSelectedSubjectId(e.target.value);
                setSelectedChapterId("");
                setSelectedTopicId("");
                setPage(1);
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
            <span>Chapter</span>
            <select
              value={selectedChapterId}
              onChange={(e) => {
                setSelectedChapterId(e.target.value);
                setSelectedTopicId("");
                setPage(1);
              }}
            >
              <option value="">All Chapters</option>
              {filteredChapters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field" style={{ margin: 0 }}>
            <span>Topic</span>
            <select
              value={selectedTopicId}
              onChange={(e) => {
                setSelectedTopicId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Topics</option>
              {filteredTopics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field" style={{ margin: 0 }}>
            <span>Difficulty</span>
            <select
              value={selectedDifficulty}
              onChange={(e) => {
                setSelectedDifficulty(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Difficulties</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard / Difficult / Advanced</option>
            </select>
          </label>

          <label className="field" style={{ margin: 0 }}>
            <span>Source</span>
            <select
              value={selectedSourceType}
              onChange={(e) => {
                setSelectedSourceType(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Sources</option>
              <option value="pyq">PYQ</option>
              <option value="reference">Reference</option>
              <option value="ai_generated">AI Generated</option>
              <option value="custom">Custom</option>
            </select>
          </label>

          <label className="field" style={{ margin: 0 }}>
            <span>Document / Book</span>
            <select
              value={selectedBookId}
              onChange={(e) => {
                setSelectedBookId(e.target.value);
                setActiveQuestionIdForPdf("");
                setPdfPageNumber(1);
                setPage(1);
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

          <label className="field" style={{ margin: 0 }}>
            <span>Tag / Reference</span>
            <input
              type="text"
              placeholder="e.g. JEE MAIN 2023..."
              value={selectedTag}
              onChange={(e) => {
                setSelectedTag(e.target.value);
                setPage(1);
              }}
              style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--color-border)" }}
            />
          </label>

          {hasActiveFilters && (
            <button
              className="secondary-button"
              style={{ height: "38px" }}
              onClick={handleClearFilters}
            >
              Clear All Filters
            </button>
          )}
        </div>
      </article>

      {/* Select All on Page bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "10px" }}>
        {isTeacher && data.questions.length > 0 && (
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", cursor: "pointer", margin: 0 }}>
            <input
              type="checkbox"
              checked={data.questions.length > 0 && data.questions.every((q: any) => selectedForExam.has(q.id))}
              onChange={(e) => {
                if (e.target.checked) selectAllQuestions(data.questions);
                else deselectAllQuestions(data.questions);
              }}
              style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "#7c3aed" }}
            />
            Select all {data.questions.length} questions on this page for exam
          </label>
        )}
      </div>

      {/* Top Pagination Controls */}
      {renderPaginationControls()}

      {selectedBookId ? (
        <div style={{ display: "flex", gap: "20px", height: "calc(100vh - 250px)", minHeight: "650px", marginTop: "15px" }}>
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

          {/* Right Pane: Questions List */}
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "15px", paddingRight: "5px" }}>
            {data.questions.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: "var(--color-text-muted)" }}>
                <p>No questions found matching your filter criteria.</p>
              </div>
            ) : (
              data.questions.map((question: any) => {
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
                        {question.serialNumber != null && (
                          <span className="tag" style={{ background: "#374151", color: "white", borderColor: "#374151", fontWeight: "bold" }}>
                            #{question.serialNumber}
                          </span>
                        )}
                        <span className="tag">{question.subjectName}</span>
                        <span className="tag muted" style={{ marginLeft: "5px" }}>{question.topicName}</span>
                        {question.pageNumber && (
                          <span className="tag primary" style={{ marginLeft: "5px" }}>Page {question.pageNumber}</span>
                        )}
                        {Array.isArray(question.tags) && question.tags.map((t: string, idx: number) => {
                          const isDiff = ["Easy", "Medium", "Hard", "Difficult", "Advanced"].includes(t);
                          const isOrange = !isDiff && (t.includes("JEE") || t.includes("KVPY") || t.includes("IIT") || t.includes("AIEEE") || t.includes("NEET") || t.includes("GUJCET"));
                          return (
                            <span
                              key={idx}
                              className="tag"
                              style={{
                                marginLeft: "4px",
                                background: isOrange ? "#ffedd5" : isDiff ? (t === "Easy" ? "#dcfce7" : t === "Medium" ? "#fef9c3" : "#fee2e2") : "#e0e7ff",
                                color: isOrange ? "#c2410c" : isDiff ? (t === "Easy" ? "#15803d" : t === "Medium" ? "#a16207" : "#b91c1c") : "#4338ca",
                                borderColor: isOrange ? "#fed7aa" : isDiff ? (t === "Easy" ? "#bbf7d0" : t === "Medium" ? "#fef08a" : "#fecaca") : "#c7d2fe",
                                fontWeight: isOrange || isDiff ? 600 : 500
                              }}
                            >
                              {t}
                            </span>
                          );
                        })}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span className="tag primary">{question.marks} Marks</span>
                      </div>
                    </div>

                    <div style={{ marginTop: "12px", color: "var(--color-text-dark)", lineHeight: "1.5" }}>
                      <RichText content={question.prompt} />
                    </div>

                    <div style={{ marginTop: "15px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      {question.options.map((option: any) => {
                        const isCorrect = question.correctOptionIds.includes(option.id);
                        return (
                          <div 
                            key={option.id} 
                            style={{ 
                              padding: "8px 12px", 
                              borderRadius: "6px", 
                              border: isCorrect ? "1px solid var(--color-primary)" : "1px solid var(--color-border)",
                              background: isCorrect ? "var(--color-primary-light)" : "var(--color-bg-light)",
                              fontSize: "0.9rem",
                              display: "flex",
                              alignItems: "flex-start",
                              gap: "8px"
                            }}
                          >
                            <strong style={{ color: isCorrect ? "var(--color-primary-dark)" : "var(--color-text-muted)", minWidth: "16px" }}>
                              {option.label}.
                            </strong>
                            <div style={{ flex: 1 }}>
                              <RichText content={option.value} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>
      ) : (
        /* Regular List View */
        <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
          {data.questions.length === 0 ? (
            <div className="panel" style={{ textAlign: "center", padding: "50px 20px" }}>
              <p className="eyebrow">No Questions Found</p>
              <h3>No questions match your selected filters.</h3>
              <p className="muted-copy" style={{ marginTop: "8px" }}>Try clearing search keywords or choosing different subject/topic filters.</p>
              {hasActiveFilters && (
                <button className="secondary-button" style={{ marginTop: "15px" }} onClick={handleClearFilters}>
                  Clear All Filters
                </button>
              )}
            </div>
          ) : (
            data.questions.map((question: any) => (
              <article className="panel question-card" key={question.id}>
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
                    {question.serialNumber != null && (
                      <span className="tag" style={{ background: "#374151", color: "white", borderColor: "#374151", fontWeight: "bold" }}>
                        #{question.serialNumber}
                      </span>
                    )}
                    <span className="tag">{question.subjectName}</span>
                    <span className="tag muted" style={{ marginLeft: "5px" }}>{question.topicName}</span>
                    {Array.isArray(question.tags) && question.tags.map((t: string, idx: number) => {
                      const isDiff = ["Easy", "Medium", "Hard", "Difficult", "Advanced"].includes(t);
                      const isOrange = !isDiff && (t.includes("JEE") || t.includes("KVPY") || t.includes("IIT") || t.includes("AIEEE") || t.includes("NEET") || t.includes("GUJCET"));
                      return (
                        <span
                          key={idx}
                          className="tag"
                          style={{
                            marginLeft: "4px",
                            background: isOrange ? "#ffedd5" : isDiff ? (t === "Easy" ? "#dcfce7" : t === "Medium" ? "#fef9c3" : "#fee2e2") : "#e0e7ff",
                            color: isOrange ? "#c2410c" : isDiff ? (t === "Easy" ? "#15803d" : t === "Medium" ? "#a16207" : "#b91c1c") : "#4338ca",
                            borderColor: isOrange ? "#fed7aa" : isDiff ? (t === "Easy" ? "#bbf7d0" : t === "Medium" ? "#fef08a" : "#fecaca") : "#c7d2fe",
                            fontWeight: isOrange || isDiff ? 600 : 500
                          }}
                        >
                          {t}
                        </span>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span className="tag primary">{question.marks} Marks</span>
                    <span className={`tag ${question.difficulty === "easy" ? "success" : question.difficulty === "medium" ? "warning" : "danger"}`}>
                      {question.difficulty.toUpperCase()}
                    </span>
                    {isTeacher && (
                      <div style={{ display: "flex", gap: "6px", marginLeft: "10px" }}>
                        <button
                          className="secondary-button"
                          style={{ padding: "4px 10px", fontSize: "0.8rem", color: "#4f46e5", borderColor: "#c7d2fe" }}
                          disabled={aiReviewLoadingId === question.id}
                          onClick={() => handleAiReview(question)}
                          title="Run AI audit against original PDF page"
                        >
                          {aiReviewLoadingId === question.id ? "🤖 Reviewing..." : "🤖 AI Audit"}
                        </button>
                        <button className="secondary-button" style={{ padding: "4px 10px", fontSize: "0.8rem" }} onClick={() => handleOpenForm(question)}>
                          Edit
                        </button>
                        <button className="secondary-button" style={{ padding: "4px 10px", fontSize: "0.8rem", color: "red", borderColor: "red" }} onClick={() => handleDelete(question.id)}>
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ marginTop: "12px", color: "var(--color-text-dark)", lineHeight: "1.5" }}>
                  <RichText content={question.prompt} />
                </div>

                <div style={{ marginTop: "15px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  {question.options.map((option: any) => {
                    const isCorrect = question.correctOptionIds.includes(option.id);
                    return (
                      <div 
                        key={option.id} 
                        style={{ 
                          padding: "8px 12px", 
                          borderRadius: "6px", 
                          border: isCorrect ? "1px solid var(--color-primary)" : "1px solid var(--color-border)",
                          background: isCorrect ? "var(--color-primary-light)" : "var(--color-bg-light)",
                          fontSize: "0.9rem",
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "8px"
                        }}
                      >
                        <strong style={{ color: isCorrect ? "var(--color-primary-dark)" : "var(--color-text-muted)", minWidth: "16px" }}>
                          {option.label}.
                        </strong>
                        <div style={{ flex: 1 }}>
                          <RichText content={option.value} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            ))
          )}
        </div>
      )}

      {/* Bottom Pagination Controls */}
      {renderPaginationControls()}

      {/* Manual Exam Builder Modal */}
      {isBuilderOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}>
          <div className="panel stack" style={{ width: "100%", maxWidth: "700px", maxHeight: "90vh", overflowY: "auto", background: "white" }}>
            <div className="row-between">
              <h3>Create Custom Exam ({selectedForExam.size} Questions)</h3>
              <button className="secondary-button" onClick={() => setIsBuilderOpen(false)}>✕</button>
            </div>

            <div className="grid-two">
              <label className="field">
                <span>Exam Title</span>
                <input type="text" placeholder="e.g. Weekly Maths Test" value={examName} onChange={e => setExamName(e.target.value)} required />
              </label>
              <label className="field">
                <span>Assign to Batch</span>
                <select value={examBatchId} onChange={e => setExamBatchId(e.target.value)} required>
                  <option value="">Select Batch...</option>
                  {overviewData?.batches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid-two">
              <label className="field">
                <span>Duration (Minutes)</span>
                <input type="number" min={5} max={300} value={examDuration} onChange={e => setExamDuration(Number(e.target.value))} />
              </label>
              <label className="field">
                <span>Schedule Start (Optional)</span>
                <input type="datetime-local" value={examScheduleStart} onChange={e => setExamScheduleStart(e.target.value)} />
              </label>
            </div>

            <div style={{ marginTop: "10px" }}>
              <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Selected Questions:</span>
              <div className="stack" style={{ marginTop: "8px", maxHeight: "250px", overflowY: "auto" }}>
                {Array.from(selectedForExam.values()).map((item, idx) => (
                  <div key={item.questionId} style={{ padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", background: "#fafafa" }}>
                    <div style={{ flex: 1, fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <strong>Q{idx + 1}:</strong> {item.prompt.substring(0, 60)}...
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <label style={{ fontSize: "0.78rem", display: "flex", alignItems: "center", gap: "4px" }}>
                        +Marks:
                        <input type="number" value={item.marks} onChange={e => updateSelectedMarks(item.questionId, "marks", Number(e.target.value))} style={{ width: "45px", padding: "2px 4px", fontSize: "0.8rem" }} />
                      </label>
                      <label style={{ fontSize: "0.78rem", display: "flex", alignItems: "center", gap: "4px" }}>
                        -Marks:
                        <input type="number" value={item.negativeMarks} onChange={e => updateSelectedMarks(item.questionId, "negativeMarks", Number(e.target.value))} style={{ width: "45px", padding: "2px 4px", fontSize: "0.8rem" }} />
                      </label>
                      <button className="secondary-button" style={{ padding: "2px 6px", fontSize: "0.75rem", color: "red", borderColor: "red" }} onClick={() => setSelectedForExam(prev => { const n = new Map(prev); n.delete(item.questionId); return n; })}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="row-between" style={{ marginTop: "20px" }}>
              <button className="secondary-button" onClick={() => setIsBuilderOpen(false)}>Cancel</button>
              <button className="primary-button" disabled={isGenerating} onClick={handleGenerateManualExam}>
                {isGenerating ? "Creating Exam..." : "Create Exam"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
