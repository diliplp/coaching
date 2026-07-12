import { useEffect, useMemo, useState } from "react";
import { apiClient, buildPublicAssetUrl } from "../api/client";
import type { Question, QuestionBankResponse, SubjectBook } from "../types";
import { RichText } from "../components/RichText";

const FLAG_LABELS: Record<string, string> = {
  wrong_option_count: "Wrong option count",
  placeholder_leak: "Placeholder text leaked in",
  undelimited_latex: "Undelimited LaTeX",
  missing_referenced_diagram: "Missing referenced diagram",
  no_answer_detected: "No answer detected",
  answer_key_conflict: "Answer-key conflict",
  fidelity_mismatch: "Vision fidelity mismatch"
};

function flagLabel(flag: string): string {
  const base = flag.split(":")[0];
  return FLAG_LABELS[base] || flag;
}

export function QAReportPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [books, setBooks] = useState<SubjectBook[]>([]);
  const [questionBank, setQuestionBank] = useState<QuestionBankResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [bookId, setBookId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [status, setStatus] = useState("flagged");
  const [flagReason, setFlagReason] = useState("");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeQuestionId, setActiveQuestionId] = useState("");
  const [pdfPageNumber, setPdfPageNumber] = useState(1);
  const [reassignSubjectId, setReassignSubjectId] = useState("");
  const [reassignTopicId, setReassignTopicId] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const refresh = () => {
    setIsLoading(true);
    apiClient.admin
      .getQaReport({ bookId: bookId || undefined, subjectId: subjectId || undefined, status: status || undefined })
      .then((res) => setQuestions(res.questions))
      .catch(console.error)
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    apiClient.getSubjectBooks().then((res) => setBooks(res.books)).catch(console.error);
    apiClient.getQuestionBank().then(setQuestionBank).catch(console.error);
  }, []);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, subjectId, status]);

  const allFlagReasons = useMemo(() => {
    const set = new Set<string>();
    for (const q of questions) {
      for (const f of q.qaFlags || []) set.add(f.split(":")[0]);
    }
    return [...set].sort();
  }, [questions]);

  const filteredQuestions = useMemo(() => {
    if (!flagReason) return questions;
    return questions.filter((q) => (q.qaFlags || []).some((f) => f.split(":")[0] === flagReason));
  }, [questions, flagReason]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) =>
      prev.size === filteredQuestions.length ? new Set() : new Set(filteredQuestions.map((q) => q.id))
    );
  };

  const activeBook = books.find((b) => b.id === bookId);
  const activeQuestion = filteredQuestions.find((q) => q.id === activeQuestionId);

  const handleReview = async (id: string, action: "approve" | "reject") => {
    try {
      await apiClient.admin.qaReview(id, action);
      setQuestions((prev) => prev.filter((q) => q.id !== id || status !== "flagged"));
      refresh();
    } catch (e: any) {
      alert(e?.message || "Failed to update review status");
    }
  };

  const handleBulkReview = async (action: "approve" | "reject") => {
    if (selected.size === 0) return;
    setIsBusy(true);
    try {
      await Promise.all([...selected].map((id) => apiClient.admin.qaReview(id, action)));
      setSelected(new Set());
      refresh();
    } catch (e: any) {
      alert(e?.message || "Bulk review failed");
    } finally {
      setIsBusy(false);
    }
  };

  const handleBulkReassign = async () => {
    if (selected.size === 0 || (!reassignSubjectId && !reassignTopicId)) return;
    setIsBusy(true);
    try {
      const result = await apiClient.admin.bulkReassignQuestions({
        questionIds: [...selected],
        subjectId: reassignSubjectId || undefined,
        topicId: reassignTopicId || undefined
      });
      alert(result.message);
      setSelected(new Set());
      setReassignSubjectId("");
      setReassignTopicId("");
      refresh();
    } catch (e: any) {
      alert(e?.message || "Bulk reassign failed");
    } finally {
      setIsBusy(false);
    }
  };

  const statusTagStyle = (s?: string) => {
    if (s === "approved") return { background: "#d4edda", color: "#155724", borderColor: "#c3e6cb" };
    if (s === "rejected") return { background: "#f8d7da", color: "#721c24", borderColor: "#f5c6cb" };
    return { background: "#fff3cd", color: "#856404", borderColor: "#ffeeba" };
  };

  return (
    <div className="page">
      <section className="section-heading">
        <div className="row-between">
          <div>
            <p className="eyebrow">Question Bank</p>
            <h2>Extraction QA Report</h2>
            <p className="muted-copy" style={{ marginTop: "6px" }}>
              Questions flagged by the automated post-extraction verification pass. Review, approve, reject, or bulk-reassign subject/topic.
            </p>
          </div>
        </div>
      </section>

      <article className="panel" style={{ marginBottom: "20px", padding: "15px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "15px", alignItems: "end" }}>
          <label className="field" style={{ margin: 0 }}>
            <span>Book</span>
            <select value={bookId} onChange={(e) => setBookId(e.target.value)}>
              <option value="">All Books</option>
              {books.map((b) => (
                <option key={b.id} value={b.id}>{b.title}</option>
              ))}
            </select>
          </label>
          <label className="field" style={{ margin: 0 }}>
            <span>Subject</span>
            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">All Subjects</option>
              {questionBank?.subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label className="field" style={{ margin: 0 }}>
            <span>Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="flagged">Flagged</option>
              <option value="unreviewed">Unreviewed</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="">All</option>
            </select>
          </label>
          <label className="field" style={{ margin: 0 }}>
            <span>Flag Reason</span>
            <select value={flagReason} onChange={(e) => setFlagReason(e.target.value)}>
              <option value="">All Reasons</option>
              {allFlagReasons.map((f) => (
                <option key={f} value={f}>{flagLabel(f)}</option>
              ))}
            </select>
          </label>
        </div>
      </article>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px", flexWrap: "wrap", gap: "10px" }}>
        <p className="muted-copy" style={{ margin: 0 }}>
          {isLoading ? "Loading…" : `Showing ${filteredQuestions.length} question${filteredQuestions.length !== 1 ? "s" : ""}`}
        </p>
        {filteredQuestions.length > 0 && (
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", cursor: "pointer", margin: 0 }}>
            <input
              type="checkbox"
              checked={selected.size === filteredQuestions.length}
              onChange={toggleSelectAll}
              style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "#7c3aed" }}
            />
            Select all {filteredQuestions.length}
          </label>
        )}
      </div>

      <div style={{ display: "flex", gap: "20px", minHeight: "400px" }}>
        <div style={{ flex: activeQuestion && bookId ? 1 : "unset", width: activeQuestion && bookId ? undefined : "100%", display: "flex", flexDirection: "column", gap: "15px" }}>
          {filteredQuestions.length === 0 && !isLoading && (
            <div style={{ textAlign: "center", padding: "60px", color: "var(--color-text-muted)" }}>
              <p>No questions match these filters. 🎉</p>
            </div>
          )}
          {filteredQuestions.map((question) => (
            <article
              key={question.id}
              className="panel question-card"
              onClick={() => {
                setActiveQuestionId(question.id);
                if (question.pageNumber) setPdfPageNumber(question.pageNumber);
              }}
              style={{
                cursor: "pointer",
                border: activeQuestionId === question.id ? "2px solid var(--color-primary)" : "1px solid var(--color-border)"
              }}
            >
              <div className="row-between">
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <input
                    type="checkbox"
                    checked={selected.has(question.id)}
                    onChange={() => toggleSelect(question.id)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "#7c3aed" }}
                  />
                  <span className="tag">{question.subjectName}</span>
                  <span className="tag muted">{question.topicName}</span>
                  {question.pageNumber && <span className="tag primary">Page {question.pageNumber}</span>}
                  <span className="tag" style={statusTagStyle(question.qaStatus)}>
                    {(question.qaStatus || "unreviewed").toUpperCase()}
                  </span>
                  {(question.qaFlags || []).map((f) => (
                    <span key={f} className="tag" style={{ background: "#f8d7da", color: "#721c24", borderColor: "#f5c6cb", fontSize: "0.75rem" }}>
                      {flagLabel(f)}
                    </span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: "8px" }} onClick={(e) => e.stopPropagation()}>
                  <button
                    className="secondary-button"
                    style={{ padding: "4px 10px", fontSize: "0.8rem", color: "#155724", borderColor: "#155724" }}
                    onClick={() => handleReview(question.id, "approve")}
                  >
                    Approve
                  </button>
                  <button
                    className="secondary-button"
                    style={{ padding: "4px 10px", fontSize: "0.8rem", color: "red", borderColor: "red" }}
                    onClick={() => handleReview(question.id, "reject")}
                  >
                    Reject
                  </button>
                </div>
              </div>
              <h3 style={{ fontSize: "1rem" }}><RichText content={question.prompt} /></h3>
              <ul className="option-list">
                {question.options.map((option) => (
                  <li key={option.id} style={{ fontWeight: question.correctOptionIds.includes(option.id) ? "bold" : "normal" }}>
                    {option.label}. <RichText content={option.value} />
                    {question.correctOptionIds.includes(option.id) && " ✓"}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        {activeQuestion && bookId && activeBook && (
          <div style={{ flex: 1, background: "white", borderRadius: "12px", border: "1px solid var(--color-border)", overflow: "hidden", display: "flex", flexDirection: "column", position: "sticky", top: "20px", height: "calc(100vh - 250px)", minHeight: "500px" }}>
            <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8f9fa" }}>
              <span style={{ fontWeight: "bold", fontSize: "0.95rem" }}>PDF Preview: {activeBook.title}</span>
              <span className="tag primary">Page {pdfPageNumber}</span>
            </div>
            <iframe
              key={`${activeBook.id}-${pdfPageNumber}`}
              src={`${buildPublicAssetUrl(activeBook.fileUrl || "")}#page=${pdfPageNumber}`}
              style={{ width: "100%", height: "100%", border: "none" }}
              title="Book PDF Viewer"
            />
          </div>
        )}
      </div>

      {selected.size > 0 && (
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
          flexWrap: "wrap",
          gap: "12px",
          zIndex: 100,
          boxShadow: "0 -4px 20px rgba(124,58,237,0.3)"
        }}>
          <strong>{selected.size} selected</strong>
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <select
              value={reassignSubjectId}
              onChange={(e) => { setReassignSubjectId(e.target.value); setReassignTopicId(""); }}
              style={{ padding: "6px 10px", borderRadius: "6px", border: "none" }}
            >
              <option value="">Reassign subject…</option>
              {questionBank?.subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {reassignSubjectId && (
              <select
                value={reassignTopicId}
                onChange={(e) => setReassignTopicId(e.target.value)}
                style={{ padding: "6px 10px", borderRadius: "6px", border: "none" }}
              >
                <option value="">Keep topic / auto</option>
                {questionBank?.topics.filter((t) => t.subjectId === reassignSubjectId).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
            <button
              disabled={isBusy || !reassignSubjectId}
              onClick={handleBulkReassign}
              style={{ background: "white", border: "none", color: "#7c3aed", padding: "8px 16px", borderRadius: "6px", fontWeight: "bold", cursor: "pointer" }}
            >
              Reassign
            </button>
            <button
              disabled={isBusy}
              onClick={() => handleBulkReview("approve")}
              style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.4)", color: "white", padding: "8px 16px", borderRadius: "6px", cursor: "pointer" }}
            >
              Approve All
            </button>
            <button
              disabled={isBusy}
              onClick={() => handleBulkReview("reject")}
              style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.4)", color: "white", padding: "8px 16px", borderRadius: "6px", cursor: "pointer" }}
            >
              Reject All
            </button>
            <button
              onClick={() => setSelected(new Set())}
              style={{ background: "none", border: "none", color: "white", cursor: "pointer", textDecoration: "underline" }}
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
