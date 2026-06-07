import { useEffect, useState } from "react";
import { apiClient, buildPublicAssetUrl } from "../api/client";
import type { QuestionBankResponse, SubjectBook } from "../types";
import { RichText } from "../components/RichText";
import { getStoredSession } from "../auth";

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

  const session = getStoredSession();
  const isTeacher = session?.user.role === "super_admin" || session?.user.role === "teacher";

  const refreshData = () => {
    apiClient.getQuestionBank().then(setData).catch(console.error);
  };

  useEffect(() => {
    refreshData();
    apiClient.getSubjectBooks().then(res => setBooks(res.books)).catch(console.error);
  }, []);

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
      refreshData();
    } catch (error) {
      alert("Error saving question");
      console.error(error);
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
            <div style={{ display: "flex", gap: "10px" }}>
              <button 
                className="secondary-button" 
                style={{ color: "red", borderColor: "red" }} 
                onClick={handleClearAll}
              >
                Clear Entire Bank
              </button>
              <button className="primary-button" onClick={() => handleOpenForm()}>
                + Add Question
              </button>
            </div>
          )}
        </div>
      </section>

      {isFormOpen && (
        <article className="panel" style={{ marginBottom: "30px", border: "2px solid var(--color-primary)" }}>
          <h3>{editingQuestion ? "Edit Question" : "Add New Question"}</h3>
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

            <label className="field">
              <span>Question Prompt (Supports LaTeX and SMILES)</span>
              <textarea 
                rows={4} 
                value={formData.prompt} 
                onChange={e => setFormData({...formData, prompt: e.target.value})}
                required
              />
            </label>

            <div>
              <span>Options (Select correct ones)</span>
              <div className="stack" style={{ marginTop: "10px" }}>
                {formData.options.map((opt, index) => (
                  <div key={opt.id} style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <input 
                      type={formData.type === "single_correct" ? "radio" : "checkbox"}
                      name="correct-opt"
                      checked={formData.correctOptionIds.includes(opt.id)}
                      onChange={() => toggleOption(opt.id)}
                    />
                    <strong>{opt.label}</strong>
                    <input 
                      type="text" 
                      placeholder={`Option ${opt.label} value`}
                      value={opt.value}
                      onChange={e => {
                        const newOpts = formData.options.map((item, idx) => 
                          idx === index ? { ...item, value: e.target.value } : item
                        );
                        setFormData({...formData, options: newOpts});
                      }}
                      style={{ flex: 1 }}
                      required
                    />
                  </div>
                ))}
              </div>
            </div>

            <label className="field">
              <span>Explanation</span>
              <textarea 
                rows={2} 
                value={formData.explanation} 
                onChange={e => setFormData({...formData, explanation: e.target.value})}
              />
            </label>

            <div className="row-between" style={{ marginTop: "20px" }}>
              <button type="button" className="secondary-button" onClick={() => setIsFormOpen(false)}>Cancel</button>
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

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
        <p className="muted-copy" style={{ margin: 0 }}>
          Showing <strong>{filteredQuestions.length}</strong> of {data.questions.length} questions
        </p>
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

          {/* Right Pane: Questions List */}
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "15px", paddingRight: "5px" }}>
            {filteredQuestions.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: "var(--color-text-muted)" }}>
                <p>No questions generated for this document yet.</p>
              </div>
            ) : (
              filteredQuestions.map((question: any) => {
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
                      <div>
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
            <article className="panel question-card" key={question.id}>
              <div className="row-between">
                <div>
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
                  {question.isVerified && (
                    <span className="tag" style={{ marginLeft: "5px", background: "#d4edda", color: "#155724", borderColor: "#c3e6cb" }}>
                      VERIFIED
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
    </div>
  );
}
