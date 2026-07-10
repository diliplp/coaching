import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { apiClient, buildPublicAssetUrl, openJobStream } from "../api/client";
import type { SubjectBooksResponse } from "../types";
import { StatusModal } from "../components/StatusModal";

type BatchItem = {
  file: File;
  title: string;
  subjectId: string;
  bookType: "textbook" | "reference" | "pyq";
  ocr: boolean;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
};

function titleFromFilename(name: string) {
  return name
    .replace(/\.pdf$/i, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function SubjectBooksPage() {
  const [data, setData] = useState<SubjectBooksResponse | null>(null);
  const [allChapters, setAllChapters] = useState<any[]>([]);
  const [allTopics, setAllTopics] = useState<any[]>([]);

  // Upload — single
  const [uploadTab, setUploadTab] = useState<"single" | "batch">("single");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedStreamId, setSelectedStreamId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [title, setTitle] = useState("");
  const [bookType, setBookType] = useState<"pyq" | "reference" | "textbook">("textbook");
  const [file, setFile] = useState<File | null>(null);
  const [ocr, setOcr] = useState(false);

  // Upload — batch
  const [batchQueue, setBatchQueue] = useState<BatchItem[]>([]);
  const [batchSubjectId, setBatchSubjectId] = useState("");
  const [batchBookType, setBatchBookType] = useState<"textbook" | "reference" | "pyq">("textbook");
  const [batchUploading, setBatchUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const batchFileInputRef = useRef<HTMLInputElement>(null);

  // Book list
  const [bookFilter, setBookFilter] = useState("");
  const [expandedBookId, setExpandedBookId] = useState<string | null>(null);

  // Status + AI state
  const [status, setStatus] = useState("Teachers can upload PDF books subject-wise here.");
  const [generatingForBook, setGeneratingForBook] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState("");
  const generationCleanupRef = useRef<(() => void) | null>(null);
  const [extractingForBook, setExtractingForBook] = useState<string | null>(null);
  const [selectedChapters, setSelectedChapters] = useState<Record<string, string>>({});
  const [selectedTopicsMap, setSelectedTopicsMap] = useState<Record<string, string[]>>({});
  const [questionCount, setQuestionCount] = useState(5);
  const [pyqMeta, setPyqMeta] = useState<Record<string, { pyqYear?: string; pyqExamName?: string; pyqSession?: string }>>({});
  const [answerKeyInputs, setAnswerKeyInputs] = useState<Record<string, string>>({});
  const [applyingAnswerKey, setApplyingAnswerKey] = useState<string | null>(null);
  const [answerKeyBookSelections, setAnswerKeyBookSelections] = useState<Record<string, string>>({});
  const [extractionProgress, setExtractionProgress] = useState<Record<string, { status: string; message: string; count: number }>>({});
  const pollingRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const [detectingForBook, setDetectingForBook] = useState<string | null>(null);
  const [detectedCurriculum, setDetectedCurriculum] = useState<{ bookId: string; chapters: { name: string; topics: string[] }[] } | null>(null);

  const startPolling = (bookId: string) => {
    if (pollingRef.current[bookId]) return;
    pollingRef.current[bookId] = setInterval(async () => {
      try {
        const res = await apiClient.getExtractionStatus(bookId);
        setExtractionProgress(prev => ({ ...prev, [bookId]: { status: res.extractionStatus, message: res.extractionProgress, count: res.extractionQuestionCount } }));
        if (res.extractionStatus === "done" || res.extractionStatus === "error") {
          clearInterval(pollingRef.current[bookId]);
          delete pollingRef.current[bookId];
          setExtractingForBook(null);
          if (res.extractionStatus === "done") { setStatus(`Done! ${res.extractionQuestionCount} questions extracted.`); await loadData(); }
          else setStatus(`Extraction failed: ${res.extractionProgress}`);
        }
      } catch { /* ignore transient */ }
    }, 3000);
  };

  const loadData = async () => {
    const [response, qbResponse] = await Promise.all([apiClient.getSubjectBooks(), apiClient.getQuestionBank()]);
    setData(response);
    setAllChapters(qbResponse.chapters);
    setAllTopics(qbResponse.topics);
  };

  useEffect(() => { loadData().catch(console.error); }, []);

  // ── Single upload ────────────────────────────────────────────────────────────
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!subjectId || !title || !file) { setStatus("Please choose a subject, add a title, and select a PDF."); return; }
    setStatus("Uploading PDF book...");
    try {
      await apiClient.uploadSubjectBook({ subjectId, title, file, bookType, ocr });
      setTitle(""); setFile(null); setOcr(false);
      setStatus("PDF uploaded successfully.");
      await loadData();
    } catch (error: any) { setStatus(`Upload failed: ${error.message || "Unknown error"}`); }
  };

  // ── Batch upload ─────────────────────────────────────────────────────────────
  const addFilesToBatch = (files: FileList | File[]) => {
    const items: BatchItem[] = Array.from(files)
      .filter(f => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"))
      .map(f => ({
        file: f,
        title: titleFromFilename(f.name),
        subjectId: batchSubjectId,
        bookType: batchBookType,
        ocr: false,
        status: "pending",
      }));
    setBatchQueue(prev => [...prev, ...items]);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setIsDragOver(false);
    if (e.dataTransfer.files.length) addFilesToBatch(e.dataTransfer.files);
  };

  const handleBatchUploadAll = async () => {
    if (!batchQueue.some(i => i.status === "pending")) return;
    setBatchUploading(true);
    for (let i = 0; i < batchQueue.length; i++) {
      if (batchQueue[i].status !== "pending") continue;
      setBatchQueue(prev => prev.map((item, idx) => idx === i ? { ...item, status: "uploading" } : item));
      try {
        await apiClient.uploadSubjectBook({ subjectId: batchQueue[i].subjectId || batchSubjectId, title: batchQueue[i].title, file: batchQueue[i].file, bookType: batchQueue[i].bookType, ocr: batchQueue[i].ocr });
        setBatchQueue(prev => prev.map((item, idx) => idx === i ? { ...item, status: "done" } : item));
      } catch (err: any) {
        setBatchQueue(prev => prev.map((item, idx) => idx === i ? { ...item, status: "error", error: err.message || "Failed" } : item));
      }
    }
    setBatchUploading(false);
    setStatus("Batch upload complete.");
    await loadData();
  };

  // ── AI tools ─────────────────────────────────────────────────────────────────
  const handleGenerateQuestions = async (bookId: string) => {
    generationCleanupRef.current?.(); generationCleanupRef.current = null;
    setGeneratingForBook(bookId); setGenerationProgress("Starting AI generation job..."); setStatus("");
    try {
      const bookChapterId = selectedChapters[bookId] || "";
      const bookTopicIds = selectedTopicsMap[bookId] || [];
      const { jobId } = await apiClient.startGenerateQuestionsJob(bookId, {
        chapterId: (bookChapterId && bookChapterId !== "__all__") ? bookChapterId : undefined,
        topicIds: bookTopicIds.length > 0 ? bookTopicIds : undefined,
        questionCount
      });
      const cleanup = openJobStream(jobId, {
        onProgress: (msg) => setGenerationProgress(msg),
        onComplete: async (data) => { generationCleanupRef.current = null; setGeneratingForBook(null); setGenerationProgress(""); setStatus(`Done! ${data.count ?? 0} question(s) generated.`); await loadData(); },
        onError: (msg) => { generationCleanupRef.current = null; setGeneratingForBook(null); setGenerationProgress(""); setStatus(`Generation failed: ${msg}`); }
      });
      generationCleanupRef.current = cleanup;
    } catch (error: any) { setGeneratingForBook(null); setGenerationProgress(""); setStatus(`Failed to start generation: ${error.message || "Unknown error"}`); }
  };

  const handleExtractQuestions = async (bookId: string) => {
    setExtractingForBook(bookId);
    setExtractionProgress(prev => ({ ...prev, [bookId]: { status: "running", message: "Starting...", count: 0 } }));
    setStatus("Extraction started.");
    try {
      const bookChapterId = selectedChapters[bookId] || "";
      const bookTopicIds = selectedTopicsMap[bookId] || [];
      const meta = pyqMeta[bookId] || {};
      await apiClient.extractQuestionsFromBook(bookId, {
        chapterId: (bookChapterId && bookChapterId !== "__all__") ? bookChapterId : undefined,
        topicIds: bookTopicIds.length > 0 ? bookTopicIds : undefined,
        pyqYear: meta.pyqYear ? parseInt(meta.pyqYear) : undefined,
        pyqExamName: meta.pyqExamName || undefined,
        pyqSession: meta.pyqSession || undefined,
      });
      startPolling(bookId);
    } catch (error: any) { setStatus(`Failed to start extraction: ${error.message || "Unknown error"}`); setExtractingForBook(null); }
  };

  const handleDetectCurriculum = async (bookId: string) => {
    setDetectingForBook(bookId);
    setStatus("AI is analyzing the PDF...");
    try {
      const result = await apiClient.detectCurriculumFromBook(bookId);
      setDetectedCurriculum({ bookId, chapters: result.chapters });
      setStatus(`AI detected ${result.chapters.length} chapters.`);
    } catch (error: any) { setStatus(`Curriculum detection failed: ${error.message || "Unknown error"}`); }
    finally { setDetectingForBook(null); }
  };

  const handleImportCurriculum = async (book: any) => {
    if (!detectedCurriculum || !data) return;
    setStatus("Importing chapters and topics...");
    try {
      const subjectNode = data.subjects.find(s => s.id === book.subjectId);
      if (!subjectNode) throw new Error("Subject context not found");
      await apiClient.admin.saveBulkCurriculum({ classId: subjectNode.classId, streamId: subjectNode.streamId, bookId: book.id, subjects: [{ name: subjectNode.name, chapters: detectedCurriculum.chapters }] });
      setStatus("Curriculum imported successfully.");
      setDetectedCurriculum(null);
      await loadData();
    } catch (error: any) { setStatus(`Import failed: ${error.message || "Unknown error"}`); }
  };

  const handleApplyAnswerKey = async (bookId: string) => {
    const key = (answerKeyInputs[bookId] || "").trim();
    if (!key) { setStatus("Please enter the answer key."); return; }
    setApplyingAnswerKey(bookId);
    try {
      const result = await apiClient.applyAnswerKey(bookId, key);
      setStatus(`${result.message}. Applied: ${result.applied.join(", ")}`);
    } catch (error: any) { setStatus(`Failed: ${error.message || "Unknown error"}`); }
    finally { setApplyingAnswerKey(null); }
  };

  const handleApplyAnswerKeyFromBook = async (bookId: string) => {
    const answerKeyBookId = answerKeyBookSelections[bookId];
    if (!answerKeyBookId) { setStatus("Select a solution/answer-key PDF first."); return; }
    setApplyingAnswerKey(bookId);
    try {
      const result = await apiClient.applyAnswerKeyFromBook(bookId, answerKeyBookId);
      setStatus(result.message);
      await loadData();
    } catch (error: any) { setStatus(`Failed: ${error.message || "Unknown error"}`); }
    finally { setApplyingAnswerKey(null); }
  };

  if (!data) return <p>Loading subject books...</p>;

  const filteredStreams = data.subjects.filter(s => s.classId === selectedClassId)
    .reduce((acc: any[], curr) => { if (!acc.find(s => s.id === curr.streamId)) acc.push({ id: curr.streamId, name: curr.streamName }); return acc; }, []);
  const filteredSubjects = data.subjects.filter(s => s.classId === selectedClassId && s.streamId === selectedStreamId);
  const allSubjectsFlat = Array.from(new Map(data.subjects.map(s => [s.id, s])).values());

  const filteredBooks = data.books.filter(book => {
    if (!bookFilter) return true;
    const q = bookFilter.toLowerCase();
    return book.title.toLowerCase().includes(q) || book.subjectName?.toLowerCase().includes(q);
  });

  const typeColor = (bt: string) => bt === "pyq" ? { bg: "#fff3cd", color: "#856404" } : bt === "textbook" ? { bg: "#d1ecf1", color: "#0c5460" } : { bg: "#d4edda", color: "#155724" };
  const typeLabel = (bt: string) => bt === "pyq" ? "PYQ" : bt === "textbook" ? "Text" : "Ref";

  return (
    <div className="page">
      <StatusModal status={status} defaultStatus="Teachers can upload PDF books subject-wise here." onClose={() => setStatus("Teachers can upload PDF books subject-wise here.")} />
      <section className="section-heading">
        <p className="eyebrow">Teacher Subject Library</p>
        <h2>Add PDF books for Maths, Science, or any subject</h2>
        <p>{status}</p>
      </section>

      {/* ── Upload Panel ────────────────────────────────────────────────────── */}
      <article className="panel" style={{ marginBottom: "24px" }}>
        {/* Tab bar */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px", borderBottom: "1px solid var(--color-border)", paddingBottom: "12px" }}>
          {(["single", "batch"] as const).map(tab => (
            <button key={tab} onClick={() => setUploadTab(tab)} style={{ padding: "6px 18px", borderRadius: "20px", border: "1.5px solid", fontWeight: 600, fontSize: "0.85rem", cursor: "pointer", transition: "all 0.15s", borderColor: uploadTab === tab ? "var(--color-primary, #2563eb)" : "var(--color-border)", background: uploadTab === tab ? "var(--color-primary, #2563eb)" : "transparent", color: uploadTab === tab ? "#fff" : "var(--color-text)" }}>
              {tab === "single" ? "Single Book" : "Batch Upload"}
            </button>
          ))}
          {uploadTab === "batch" && batchQueue.length > 0 && (
            <span style={{ marginLeft: "auto", fontSize: "0.82rem", color: "var(--color-text-muted)", alignSelf: "center" }}>
              {batchQueue.filter(i => i.status === "done").length}/{batchQueue.length} uploaded
            </span>
          )}
        </div>

        {uploadTab === "single" ? (
          /* ── Single upload form ─────────────────────────────────────── */
          <form className="book-form stack" onSubmit={(e) => void handleSubmit(e)}>
            <div className="grid-two">
              <label className="field">
                <span>Class</span>
                <select value={selectedClassId} onChange={(e) => { setSelectedClassId(e.target.value); setSelectedStreamId(""); setSubjectId(""); }}>
                  <option value="">Select Class</option>
                  {Array.from(new Set(data.subjects.map(s => s.classId))).map(cid => (
                    <option key={cid} value={cid}>{data.subjects.find(s => s.classId === cid)?.className}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Stream</span>
                <select value={selectedStreamId} onChange={(e) => { setSelectedStreamId(e.target.value); setSubjectId(""); }}>
                  <option value="">Select Stream</option>
                  {filteredStreams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            </div>
            <div className="grid-two">
              <label className="field">
                <span>Subject</span>
                <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                  <option value="">Select Subject</option>
                  {filteredSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Book Type</span>
                <select value={bookType} onChange={(e) => setBookType(e.target.value as any)}>
                  <option value="textbook">Text Book</option>
                  <option value="reference">Reference Book</option>
                  <option value="pyq">PYQ</option>
                </select>
              </label>
            </div>
            <label className="field">
              <span>Book Title</span>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. NCERT Mathematics Class 11" />
            </label>
            <div style={{ display: "flex", gap: "16px", alignItems: "flex-end" }}>
              <label className="field" style={{ flex: 1 }}>
                <span>PDF File</span>
                <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
              <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: "8px", marginBottom: 0, paddingBottom: "4px" }}>
                <input type="checkbox" checked={ocr} onChange={(e) => setOcr(e.target.checked)} style={{ width: "16px", height: "16px" }} />
                <span style={{ fontWeight: "normal", fontSize: "0.88rem", whiteSpace: "nowrap" }}>OCR scan</span>
              </label>
            </div>
            <button className="primary-button" type="submit" disabled={!subjectId || !file}>Upload PDF</button>
          </form>
        ) : (
          /* ── Batch upload ───────────────────────────────────────────── */
          <div>
            {/* Shared settings */}
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "16px" }}>
              <label className="field" style={{ flex: "1 1 200px", margin: 0 }}>
                <span style={{ fontSize: "0.8rem" }}>Default Subject</span>
                <select value={batchSubjectId} onChange={(e) => { setBatchSubjectId(e.target.value); setBatchQueue(prev => prev.map(i => i.status === "pending" ? { ...i, subjectId: e.target.value } : i)); }}>
                  <option value="">— Select subject —</option>
                  {allSubjectsFlat.map(s => <option key={s.id} value={s.id}>{s.name} ({s.className})</option>)}
                </select>
              </label>
              <label className="field" style={{ flex: "0 0 160px", margin: 0 }}>
                <span style={{ fontSize: "0.8rem" }}>Default Type</span>
                <select value={batchBookType} onChange={(e) => { setBatchBookType(e.target.value as any); setBatchQueue(prev => prev.map(i => i.status === "pending" ? { ...i, bookType: e.target.value as any } : i)); }}>
                  <option value="textbook">Text Book</option>
                  <option value="reference">Reference Book</option>
                  <option value="pyq">PYQ</option>
                </select>
              </label>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => batchFileInputRef.current?.click()}
              style={{ border: `2px dashed ${isDragOver ? "var(--color-primary, #2563eb)" : "var(--color-border)"}`, borderRadius: "12px", padding: "32px", textAlign: "center", cursor: "pointer", background: isDragOver ? "rgba(37,99,235,0.04)" : "var(--color-bg-secondary)", transition: "all 0.15s", marginBottom: "16px" }}
            >
              <div style={{ fontSize: "2rem", marginBottom: "8px" }}>📂</div>
              <div style={{ fontWeight: 600, marginBottom: "4px" }}>Drop PDF files here</div>
              <div style={{ fontSize: "0.82rem", color: "var(--color-text-muted)" }}>or click to select — you can pick hundreds at once</div>
              <input ref={batchFileInputRef} type="file" accept="application/pdf" multiple style={{ display: "none" }} onChange={(e) => { if (e.target.files) addFilesToBatch(e.target.files); e.target.value = ""; }} />
            </div>

            {/* Queue table */}
            {batchQueue.length > 0 && (
              <div style={{ overflowX: "auto", marginBottom: "16px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.83rem" }}>
                  <thead>
                    <tr style={{ background: "var(--color-bg-secondary)", borderBottom: "2px solid var(--color-border)" }}>
                      <th style={thS}>#</th>
                      <th style={thS}>File</th>
                      <th style={{ ...thS, minWidth: "200px" }}>Title</th>
                      <th style={thS}>Subject</th>
                      <th style={thS}>Type</th>
                      <th style={thS}>OCR</th>
                      <th style={thS}>Status</th>
                      <th style={thS}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchQueue.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: "1px solid var(--color-border)", background: item.status === "done" ? "#f0fdf4" : item.status === "error" ? "#fef2f2" : item.status === "uploading" ? "#eff6ff" : "transparent" }}>
                        <td style={tdS}>{idx + 1}</td>
                        <td style={{ ...tdS, maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.file.name}>{item.file.name}</td>
                        <td style={tdS}>
                          <input value={item.title} onChange={(e) => setBatchQueue(prev => prev.map((it, i) => i === idx ? { ...it, title: e.target.value } : it))} disabled={item.status !== "pending"} style={{ width: "100%", padding: "4px 8px", borderRadius: "6px", border: "1px solid var(--color-border)", fontSize: "0.82rem", background: item.status !== "pending" ? "transparent" : undefined }} />
                        </td>
                        <td style={tdS}>
                          <select value={item.subjectId} onChange={(e) => setBatchQueue(prev => prev.map((it, i) => i === idx ? { ...it, subjectId: e.target.value } : it))} disabled={item.status !== "pending"} style={{ padding: "4px 6px", borderRadius: "6px", border: "1px solid var(--color-border)", fontSize: "0.8rem" }}>
                            <option value="">—</option>
                            {allSubjectsFlat.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </td>
                        <td style={tdS}>
                          <select value={item.bookType} onChange={(e) => setBatchQueue(prev => prev.map((it, i) => i === idx ? { ...it, bookType: e.target.value as any } : it))} disabled={item.status !== "pending"} style={{ padding: "4px 6px", borderRadius: "6px", border: "1px solid var(--color-border)", fontSize: "0.8rem" }}>
                            <option value="textbook">Text</option>
                            <option value="reference">Ref</option>
                            <option value="pyq">PYQ</option>
                          </select>
                        </td>
                        <td style={{ ...tdS, textAlign: "center" }}>
                          <input type="checkbox" checked={item.ocr} onChange={(e) => setBatchQueue(prev => prev.map((it, i) => i === idx ? { ...it, ocr: e.target.checked } : it))} disabled={item.status !== "pending"} />
                        </td>
                        <td style={{ ...tdS, fontWeight: 600, color: item.status === "done" ? "#16a34a" : item.status === "error" ? "#dc2626" : item.status === "uploading" ? "#2563eb" : "var(--color-text-muted)" }}>
                          {item.status === "done" ? "✓ Done" : item.status === "error" ? `✗ ${item.error || "Error"}` : item.status === "uploading" ? "⏳..." : "Pending"}
                        </td>
                        <td style={tdS}>
                          {item.status === "pending" && (
                            <button onClick={() => setBatchQueue(prev => prev.filter((_, i) => i !== idx))} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: "0.9rem", padding: "2px 6px" }}>✕</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: "flex", gap: "10px" }}>
              <button className="primary-button" disabled={batchUploading || batchQueue.filter(i => i.status === "pending").length === 0} onClick={() => void handleBatchUploadAll()}>
                {batchUploading ? `Uploading...` : `Upload All (${batchQueue.filter(i => i.status === "pending").length} pending)`}
              </button>
              {batchQueue.length > 0 && !batchUploading && (
                <button className="secondary-button" onClick={() => setBatchQueue([])}>Clear Queue</button>
              )}
              {batchQueue.some(i => i.status === "error") && (
                <button className="secondary-button" onClick={() => setBatchQueue(prev => prev.map(i => i.status === "error" ? { ...i, status: "pending", error: undefined } : i))}>
                  Retry Failed
                </button>
              )}
            </div>
          </div>
        )}
      </article>

      {/* ── Book Library ─────────────────────────────────────────────────────── */}
      <article className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <h3 style={{ margin: 0 }}>Book Library</h3>
            <span style={{ fontSize: "0.82rem", color: "var(--color-text-muted)" }}>{filteredBooks.length} of {data.books.length} books</span>
          </div>
          <input
            type="text"
            placeholder="Search by title or subject..."
            value={bookFilter}
            onChange={(e) => setBookFilter(e.target.value)}
            style={{ padding: "8px 14px", borderRadius: "8px", border: "1px solid var(--color-border)", fontSize: "0.85rem", width: "260px" }}
          />
        </div>

        {data.books.length === 0 ? (
          <p className="muted-copy">No books uploaded yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ background: "var(--color-bg-secondary)", borderBottom: "2px solid var(--color-border)" }}>
                  <th style={thS}>Type</th>
                  <th style={thS}>Title</th>
                  <th style={thS}>Subject</th>
                  <th style={{ ...thS, textAlign: "center" }}>Pages</th>
                  <th style={thS}>Uploaded</th>
                  <th style={{ ...thS, textAlign: "center" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBooks.map((book) => {
                  const tc = typeColor(book.bookType || "textbook");
                  const isExpanded = expandedBookId === book.id;
                  const bookChapterId = selectedChapters[book.id] || "";
                  const bookSelectedTopicIds = selectedTopicsMap[book.id] || [];
                  const bookChapters = allChapters.filter(c => c.subjectId === book.subjectId && c.bookId === book.id);
                  const allChaptersSelected = bookChapterId === "__all__";
                  const bookTopics = allChaptersSelected
                    ? allTopics.filter(t => t.bookId === book.id)
                    : allTopics.filter(t => t.chapterId === bookChapterId && t.bookId === book.id);
                  const prog = extractionProgress[book.id];
                  const isExtracting = extractingForBook === book.id || prog?.status === "running";

                  return (
                    <>
                      <tr key={book.id} style={{ borderBottom: isExpanded ? "none" : "1px solid var(--color-border)", cursor: "pointer" }} onClick={() => setExpandedBookId(isExpanded ? null : book.id)}>
                        <td style={tdS}>
                          <span style={{ fontSize: "0.72rem", padding: "2px 7px", borderRadius: "4px", background: tc.bg, color: tc.color, fontWeight: 700 }}>{typeLabel(book.bookType || "textbook")}</span>
                        </td>
                        <td style={{ ...tdS, fontWeight: 600 }}>{book.title}</td>
                        <td style={tdS}><span className="tag" style={{ fontSize: "0.75rem" }}>{book.subjectName}</span></td>
                        <td style={{ ...tdS, textAlign: "center", color: "var(--color-text-muted)" }}>{(book as any).pageCount ?? "—"}</td>
                        <td style={{ ...tdS, color: "var(--color-text-muted)" }}>{new Date(book.uploadedAt).toLocaleDateString()}</td>
                        <td style={{ ...tdS, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: "flex", gap: "6px", justifyContent: "center", alignItems: "center" }}>
                            <a className="secondary-button" href={buildPublicAssetUrl(book.fileUrl)} target="_blank" rel="noreferrer" style={{ fontSize: "0.75rem", padding: "4px 10px" }}>PDF</a>
                            <button className="secondary-button" style={{ fontSize: "0.75rem", padding: "4px 10px" }} onClick={() => setExpandedBookId(isExpanded ? null : book.id)}>
                              {isExpanded ? "▲ Close" : "▼ Tools"}
                            </button>
                            <button style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: "1rem", padding: "2px 6px" }}
                              onClick={async () => { if (confirm(`Delete "${book.title}"?`)) { try { await apiClient.deleteSubjectBook(book.id); loadData(); } catch { alert("Failed to delete"); } } }}>
                              ✕
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded AI tools row */}
                      {isExpanded && (
                        <tr key={`${book.id}-expanded`} style={{ borderBottom: "1px solid var(--color-border)" }}>
                          <td colSpan={6} style={{ padding: "0 0 16px 0" }}>
                            <div style={{ margin: "0 8px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>

                              {/* AI Generator */}
                              <div style={{ background: "var(--color-bg-secondary)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--color-border)" }}>
                                <div style={{ fontWeight: 700, fontSize: "0.85rem", marginBottom: "12px", display: "flex", justifyContent: "space-between" }}>
                                  AI Question Generator <span className="tag muted" style={{ fontSize: "0.68rem" }}>STEM-AI</span>
                                </div>
                                <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                                  <select value={bookChapterId} onChange={(e) => { const val = e.target.value; setSelectedChapters(prev => ({ ...prev, [book.id]: val })); if (val === "__all__") { setSelectedTopicsMap(prev => ({ ...prev, [book.id]: allTopics.filter(t => t.bookId === book.id).map((t: any) => t.id) })); } else { setSelectedTopicsMap(prev => ({ ...prev, [book.id]: [] })); } }} style={{ flex: 1, padding: "6px 8px", borderRadius: "6px", border: "1px solid var(--color-border)", fontSize: "0.82rem", background: "white" }}>
                                    <option value="">Chapter...</option>
                                    <option value="__all__">— All Chapters —</option>
                                    {bookChapters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                  </select>
                                  <input type="number" min={1} max={20} value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))} style={{ width: "60px", padding: "6px 8px", borderRadius: "6px", border: "1px solid var(--color-border)", fontSize: "0.82rem", background: "white" }} />
                                  <button className="primary-button" style={{ fontSize: "0.8rem", padding: "6px 14px", whiteSpace: "nowrap" }} disabled={generatingForBook === book.id} onClick={() => void handleGenerateQuestions(book.id)}>
                                    {generatingForBook === book.id ? "..." : "Generate"}
                                  </button>
                                </div>
                                {generatingForBook === book.id && generationProgress && (
                                  <div style={{ fontSize: "0.78rem", color: "#1e40af", background: "#eff6ff", padding: "8px 12px", borderRadius: "6px" }}>{generationProgress}</div>
                                )}
                                <button className="secondary-button" style={{ width: "100%", fontSize: "0.8rem", marginTop: "8px" }} disabled={detectingForBook === book.id} onClick={() => void handleDetectCurriculum(book.id)}>
                                  {detectingForBook === book.id ? "Analyzing..." : "Analyze Curriculum"}
                                </button>
                                {detectedCurriculum?.bookId === book.id && (
                                  <div style={{ marginTop: "10px", background: "rgba(0,112,243,0.05)", border: "1px solid var(--color-primary-light)", borderRadius: "8px", padding: "10px" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                                      <strong style={{ fontSize: "0.82rem" }}>{detectedCurriculum.chapters.length} chapters detected</strong>
                                      <div style={{ display: "flex", gap: "6px" }}>
                                        <button className="primary-button" style={{ fontSize: "0.75rem", padding: "3px 10px" }} onClick={() => void handleImportCurriculum(book)}>Import</button>
                                        <button className="text-link" style={{ fontSize: "0.75rem" }} onClick={() => setDetectedCurriculum(null)}>Close</button>
                                      </div>
                                    </div>
                                    <div style={{ maxHeight: "120px", overflowY: "auto", fontSize: "0.78rem" }}>
                                      {detectedCurriculum.chapters.map((ch, i) => (
                                        <div key={i} style={{ marginBottom: "4px" }}><strong>{ch.name}</strong> <span style={{ color: "var(--color-text-muted)" }}>— {ch.topics.slice(0, 3).join(", ")}{ch.topics.length > 3 ? "…" : ""}</span></div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Extract + Answer Key */}
                              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                                {/* MCQ Extraction */}
                                <div style={{ background: "var(--color-bg-secondary)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--color-border)", flex: 1 }}>
                                  <div style={{ fontWeight: 700, fontSize: "0.85rem", marginBottom: "10px" }}>Extract PDF MCQs</div>
                                  {book.bookType === "pyq" && (
                                    <div style={{ display: "flex", gap: "6px", marginBottom: "8px", flexWrap: "wrap" }}>
                                      <input type="number" placeholder="Year" value={pyqMeta[book.id]?.pyqYear ?? ""} onChange={e => setPyqMeta(prev => ({ ...prev, [book.id]: { ...prev[book.id], pyqYear: e.target.value } }))} style={{ width: "90px", padding: "5px 8px", borderRadius: "6px", border: "1px solid var(--color-border)", fontSize: "0.8rem" }} />
                                      <select value={pyqMeta[book.id]?.pyqExamName ?? ""} onChange={e => setPyqMeta(prev => ({ ...prev, [book.id]: { ...prev[book.id], pyqExamName: e.target.value } }))} style={{ flex: 1, padding: "5px 8px", borderRadius: "6px", border: "1px solid var(--color-border)", fontSize: "0.8rem" }}>
                                        <option value="">Exam (auto)</option>
                                        <option value="JEE Mains">JEE Mains</option>
                                        <option value="JEE Advanced">JEE Advanced</option>
                                        <option value="NEET">NEET</option>
                                        <option value="GUJCET">GUJCET</option>
                                      </select>
                                      <input type="text" placeholder="Session" value={pyqMeta[book.id]?.pyqSession ?? ""} onChange={e => setPyqMeta(prev => ({ ...prev, [book.id]: { ...prev[book.id], pyqSession: e.target.value } }))} style={{ width: "90px", padding: "5px 8px", borderRadius: "6px", border: "1px solid var(--color-border)", fontSize: "0.8rem" }} />
                                    </div>
                                  )}
                                  {(isExtracting || prog?.status === "done" || prog?.status === "error") && (
                                    <div style={{ fontSize: "0.78rem", padding: "6px 10px", borderRadius: "6px", marginBottom: "8px", background: prog?.status === "error" ? "#fff0f0" : prog?.status === "done" ? "#f0fff4" : "#f0f7ff", color: prog?.status === "error" ? "#c0392b" : prog?.status === "done" ? "#1a6b45" : "#1a4a7a" }}>
                                      {prog?.message || "Starting..."}{prog?.status === "done" && prog.count ? ` (${prog.count} Q)` : ""}
                                    </div>
                                  )}
                                  <button className="secondary-button" style={{ width: "100%", fontSize: "0.8rem" }} disabled={isExtracting} onClick={() => void handleExtractQuestions(book.id)}>
                                    {isExtracting ? "Extracting..." : "📥 Extract to Bank"}
                                  </button>
                                </div>

                                {/* Answer Key */}
                                <div style={{ background: "var(--color-bg-secondary)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--color-border)" }}>
                                  <div style={{ fontWeight: 700, fontSize: "0.85rem", marginBottom: "10px", display: "flex", justifyContent: "space-between" }}>
                                    Answer Key <span className="tag muted" style={{ fontSize: "0.68rem" }}>OVERRIDE AI</span>
                                  </div>
                                  {(book as any).answerKey && (
                                    <div style={{ fontSize: "0.75rem", color: "var(--color-primary)", marginBottom: "6px", wordBreak: "break-all" }}>Saved: {(book as any).answerKey}</div>
                                  )}
                                  {(book as any).answerKeyBookId && (
                                    <div style={{ fontSize: "0.75rem", color: "var(--color-primary)", marginBottom: "6px" }}>
                                      Linked to: {data.books.find(b => b.id === (book as any).answerKeyBookId)?.title || (book as any).answerKeyBookId}
                                    </div>
                                  )}
                                  {/* Auto-detect from a separately-uploaded solution PDF (e.g. this book is the
                                      bare question paper; the linked one has "Ans. : X" below each question). */}
                                  <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
                                    <select
                                      value={answerKeyBookSelections[book.id] || ""}
                                      onChange={e => setAnswerKeyBookSelections(prev => ({ ...prev, [book.id]: e.target.value }))}
                                      style={{ flex: 1, padding: "5px 8px", borderRadius: "6px", border: "1px solid var(--color-border)", fontSize: "0.78rem" }}
                                    >
                                      <option value="">Auto-detect from solution PDF...</option>
                                      {data.books.filter(b => b.subjectId === book.subjectId && b.id !== book.id).map(b => (
                                        <option key={b.id} value={b.id}>{b.title}</option>
                                      ))}
                                    </select>
                                    <button className="secondary-button" style={{ fontSize: "0.8rem", padding: "5px 12px", whiteSpace: "nowrap" }} disabled={applyingAnswerKey === book.id || !answerKeyBookSelections[book.id]} onClick={() => void handleApplyAnswerKeyFromBook(book.id)}>
                                      {applyingAnswerKey === book.id ? "..." : "Auto-Apply"}
                                    </button>
                                  </div>
                                  <div style={{ fontSize: "0.7rem", color: "var(--color-text-secondary)", marginBottom: "6px" }}>— or type it manually —</div>
                                  <div style={{ display: "flex", gap: "6px" }}>
                                    <input type="text" placeholder="D,A,C,B,A,..." value={answerKeyInputs[book.id] || ""} onChange={e => setAnswerKeyInputs(prev => ({ ...prev, [book.id]: e.target.value }))} style={{ flex: 1, padding: "5px 8px", borderRadius: "6px", border: "1px solid var(--color-border)", fontSize: "0.82rem", fontFamily: "monospace" }} />
                                    <button className="primary-button" style={{ fontSize: "0.8rem", padding: "5px 12px", whiteSpace: "nowrap" }} disabled={applyingAnswerKey === book.id} onClick={() => void handleApplyAnswerKey(book.id)}>
                                      {applyingAnswerKey === book.id ? "..." : "Apply"}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="panel" style={{ marginTop: "30px" }}>
        <h3>Reference Papers</h3>
        <div className="question-grid">
          {data.referencePapers.map((paper) => (
            <article className="panel question-card" key={paper.id}>
              <div className="row-between">
                <span className="tag">{paper.classLevel}</span>
                <span className="tag muted">{paper.category}</span>
              </div>
              <h3>{paper.displayName}</h3>
              <p className="muted-copy">{paper.subject} • {paper.fileType.toUpperCase()}</p>
              <a className="text-link" href={buildPublicAssetUrl(paper.fileUrl)} target="_blank" rel="noreferrer">Open Reference</a>
            </article>
          ))}
        </div>
      </article>
    </div>
  );
}

const thS: React.CSSProperties = { padding: "8px 12px", textAlign: "left", fontWeight: 600, fontSize: "0.78rem", color: "var(--color-text-muted)", whiteSpace: "nowrap" };
const tdS: React.CSSProperties = { padding: "8px 12px", verticalAlign: "middle" };
