import { useEffect, useState, type FormEvent } from "react";
import { apiClient, buildPublicAssetUrl } from "../api/client";
import type { SubjectBooksResponse } from "../types";

export function SubjectBooksPage() {
  const [data, setData] = useState<SubjectBooksResponse | null>(null);
  const [allChapters, setAllChapters] = useState<any[]>([]);
  const [allTopics, setAllTopics] = useState<any[]>([]);
  
  // Upload State
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedStreamId, setSelectedStreamId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [title, setTitle] = useState("");
  const [bookType, setBookType] = useState<"pyq" | "reference" | "textbook">("textbook");
  const [file, setFile] = useState<File | null>(null);
  const [ocr, setOcr] = useState(false);
  const [status, setStatus] = useState("Teachers can upload PDF books subject-wise here.");
  
  // AI Generation State
  const [generatingForBook, setGeneratingForBook] = useState<string | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState("");
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [questionCount, setQuestionCount] = useState(5);

  // Curriculum Detection State
  const [detectingForBook, setDetectingForBook] = useState<string | null>(null);
  const [detectedCurriculum, setDetectedCurriculum] = useState<{ bookId: string; chapters: { name: string; topics: string[] }[] } | null>(null);

  const loadData = async () => {
    const [response, qbResponse] = await Promise.all([
      apiClient.getSubjectBooks(),
      apiClient.getQuestionBank()
    ]);
    setData(response);
    setAllChapters(qbResponse.chapters);
    setAllTopics(qbResponse.topics);
  };

  useEffect(() => {
    loadData().catch(console.error);
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!subjectId || !title || !file) {
      setStatus("Please choose a subject, add a book title, and select a PDF file.");
      return;
    }

    setStatus("Uploading PDF book...");
    try {
      await apiClient.uploadSubjectBook({ subjectId, title, file, bookType, ocr });
      setTitle("");
      setFile(null);
      setOcr(false);
      setStatus("PDF uploaded and processed successfully.");
      await loadData();
    } catch (error: any) {
      console.error(error);
      setStatus(`Upload failed: ${error.message || "Unknown error"}`);
    }
  };

  const handleGenerateQuestions = async (bookId: string) => {
    setGeneratingForBook(bookId);
    setStatus("AI is reading the PDF and generating questions with STEM formatting... This may take up to a minute.");
    try {
      const result = await apiClient.generateQuestionsFromBook(bookId, {
        chapterId: selectedChapterId,
        topicIds: selectedTopicIds.length > 0 ? selectedTopicIds : undefined,
        questionCount
      });
      setStatus(`Success: ${result.message}`);
      setGeneratingForBook(null);
    } catch (error: any) {
      console.error(error);
      setStatus(`Failed to generate AI questions: ${error.message || "Unknown error"}`);
      setGeneratingForBook(null);
    }
  };

  const handleDetectCurriculum = async (bookId: string) => {
    setDetectingForBook(bookId);
    setStatus("AI is analyzing the PDF to identify chapters and topics... Please wait.");
    try {
      const result = await apiClient.detectCurriculumFromBook(bookId);
      setDetectedCurriculum({ bookId, chapters: result.chapters });
      setStatus(`AI detected ${result.chapters.length} chapters in this book.`);
      setDetectingForBook(null);
    } catch (error: any) {
      console.error(error);
      setStatus(`Curriculum detection failed: ${error.message || "Unknown error"}`);
      setDetectingForBook(null);
    }
  };

  const handleImportCurriculum = async (book: any) => {
    if (!detectedCurriculum || !data) return;
    setStatus("Importing detected chapters and topics into your subject structure...");
    try {
      // Find the subject node to get classId and streamId
      const subjectNode = data.subjects.find(s => s.id === book.subjectId);
      if (!subjectNode) throw new Error("Subject context not found");

      await apiClient.admin.saveBulkCurriculum({
        classId: subjectNode.classId,
        streamId: subjectNode.streamId,
        subjects: [
          {
            name: subjectNode.name,
            chapters: detectedCurriculum.chapters
          }
        ]
      });
      setStatus("Curriculum successfully imported and saved.");
      setDetectedCurriculum(null);
      await loadData();
    } catch (error: any) {
      console.error(error);
      setStatus(`Import failed: ${error.message || "Unknown error"}`);
    }
  };

  if (!data) {
    return <p>Loading subject books...</p>;
  }

  // Derived filterings for Upload
  const filteredStreams = data.subjects
    .filter(s => s.classId === selectedClassId)
    .reduce((acc: any[], curr) => {
      if (!acc.find(s => s.id === curr.streamId)) {
        acc.push({ id: curr.streamId, name: curr.streamName });
      }
      return acc;
    }, []);

  const filteredSubjects = data.subjects.filter(s => s.classId === selectedClassId && s.streamId === selectedStreamId);

  return (
    <div className="page">
      <section className="section-heading">
        <p className="eyebrow">Teacher Subject Library</p>
        <h2>Add PDF books for Maths, Science, or any subject</h2>
        <p>{status}</p>
      </section>

      <section className="grid-two">
        <article className="panel">
          <h3>Upload Subject PDF</h3>
          <form className="book-form stack" onSubmit={(event) => void handleSubmit(event)}>
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

            <label className="field">
              <span>Subject</span>
              <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                <option value="">Select Subject</option>
                {filteredSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>

            <label className="field">
              <span>Book Title</span>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="NCERT Mathematics Book"
              />
            </label>

            <label className="field">
              <span>Book Type</span>
              <select value={bookType} onChange={(e) => setBookType(e.target.value as any)}>
                <option value="textbook">Text Book</option>
                <option value="reference">Reference Book</option>
                <option value="pyq">PYQ (Previous Year Question)</option>
              </select>
            </label>

            <label className="field">
              <span>PDF File</span>
              <input
                type="file"
                accept="application/pdf"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>

            <label className="field" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "10px", marginTop: "5px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={ocr}
                onChange={(event) => setOcr(event.target.checked)}
                style={{ width: "18px", height: "18px", cursor: "pointer" }}
              />
              <span style={{ fontWeight: "normal", fontSize: "0.95rem" }}>OCR Scanned PDF (Make Searchable/Text-Enabled)</span>
            </label>

            <button className="primary-button" type="submit" disabled={!subjectId}>Upload PDF</button>
          </form>
        </article>

        <article className="panel">
          <h3>Uploaded Books</h3>
          {data.books.length === 0 ? (
            <p>No books uploaded yet.</p>
          ) : (
            <ul className="plain-list">
              {data.books.map((book) => (
                <li key={book.id} className="panel" style={{ display: "block", marginBottom: "2rem", padding: "1.5rem", borderRadius: "12px", background: "white", border: "1px solid var(--color-border)" }}>
                  {/* Book Info Section */}
                  <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
                    <div style={{ 
                      background: "rgba(0, 128, 128, 0.1)", 
                      color: "var(--color-primary)", 
                      padding: "8px 16px", 
                      borderRadius: "20px", 
                      display: "inline-block", 
                      fontSize: "0.75rem", 
                      fontWeight: "bold",
                      marginBottom: "0.5rem"
                    }}>
                      {book.bookType === "pyq" ? "PREVIOUS YEAR PAPER" : book.bookType === "textbook" ? "TEXT BOOK" : "REFERENCE BOOK"}
                    </div>
                    <h4 style={{ margin: "0.5rem 0", fontSize: "1.25rem" }}>{book.title}</h4>
                    <p className="muted-copy" style={{ fontSize: "0.85rem" }}>
                      {book.subjectName} • {new Date(book.uploadedAt).toLocaleDateString()}
                    </p>
                    
                    <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginTop: "1rem" }}>
                      <a 
                        className="secondary-button" 
                        href={buildPublicAssetUrl(book.fileUrl)} 
                        target="_blank" 
                        rel="noreferrer"
                        style={{ fontSize: "0.85rem", padding: "6px 16px" }}
                      >
                        View PDF
                      </a>
                      <button 
                        className="secondary-button" 
                        disabled={detectingForBook === book.id}
                        onClick={() => handleDetectCurriculum(book.id)}
                        style={{ fontSize: "0.85rem", padding: "6px 16px" }}
                      >
                        {detectingForBook === book.id ? "Analyzing..." : "Analyze Curriculum"}
                      </button>
                      <button 
                        className="secondary-button" 
                        style={{ color: "var(--color-error)", borderColor: "var(--color-error)", fontSize: "0.85rem", padding: "6px 16px" }}
                        onClick={async () => {
                          if (confirm(`Delete "${book.title}"?`)) {
                            try {
                              await apiClient.deleteSubjectBook(book.id);
                              loadData();
                            } catch (e) {
                              alert("Failed to delete book");
                            }
                          }
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Detected Curriculum Section */}
                  {detectedCurriculum?.bookId === book.id && (
                    <div style={{ 
                      background: "rgba(0, 112, 243, 0.05)", 
                      padding: "1.25rem", 
                      borderRadius: "10px", 
                      border: "1px solid var(--color-primary-light)",
                      marginTop: "1.5rem",
                      marginBottom: "1.5rem"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                        <strong style={{ fontSize: "0.95rem" }}>Detected Structure</strong>
                        <button className="primary-button" style={{ padding: "4px 12px", fontSize: "0.8rem" }} onClick={() => handleImportCurriculum(book)}>
                          Import to Subject
                        </button>
                      </div>
                      <div style={{ maxHeight: "200px", overflowY: "auto", fontSize: "0.85rem" }}>
                        {detectedCurriculum.chapters.map((ch, idx) => (
                          <div key={idx} style={{ marginBottom: "10px", borderBottom: "1px solid rgba(0,0,0,0.05)", paddingBottom: "5px" }}>
                            <div style={{ fontWeight: "bold" }}>{ch.name}</div>
                            <div className="muted-copy" style={{ fontSize: "0.8rem", paddingLeft: "10px" }}>
                              {ch.topics.join(", ")}
                            </div>
                          </div>
                        ))}
                      </div>
                      <button 
                        className="text-link" 
                        style={{ marginTop: "10px", fontSize: "0.8rem" }} 
                        onClick={() => setDetectedCurriculum(null)}
                      >
                        Close Preview
                      </button>
                    </div>
                  )}


                  {/* AI Tool Section - Vertical Stack */}
                  <div style={{ 
                    background: "var(--color-bg-secondary)", 
                    padding: "1.25rem", 
                    borderRadius: "10px", 
                    border: "1px solid var(--color-border)",
                    marginTop: "1.5rem"
                  }}>
                    <div style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: "0.5rem", marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong style={{ fontSize: "0.9rem" }}>AI Question Generator</strong>
                      <span className="tag muted" style={{ fontSize: "0.7rem" }}>STEM-AI</span>
                    </div>

                    <div className="stack" style={{ gap: "1rem" }}>
                      <label className="field">
                        <span>Select Chapter</span>
                        <select 
                          value={selectedChapterId} 
                          onChange={(e) => { setSelectedChapterId(e.target.value); setSelectedTopicIds([]); }}
                          style={{ background: "white" }}
                        >
                          <option value="">Choose...</option>
                          {allChapters.filter(c => c.subjectId === book.subjectId).map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </label>

                      <div className="field">
                        <span>Select Topics</span>
                        <div style={{ 
                          background: "white", 
                          border: "1px solid var(--color-border)", 
                          borderRadius: "8px", 
                          padding: "10px",
                          maxHeight: "150px",
                          overflowY: "auto",
                          marginTop: "4px"
                        }}>
                          <label style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px", paddingBottom: "10px", borderBottom: "1px solid var(--color-border)", fontWeight: "bold", fontSize: "0.9rem" }}>
                            <input 
                              type="checkbox" 
                              checked={selectedTopicIds.length === allTopics.filter(t => t.chapterId === selectedChapterId).length && selectedTopicIds.length > 0}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedTopicIds(allTopics.filter(t => t.chapterId === selectedChapterId).map(t => t.id));
                                } else {
                                  setSelectedTopicIds([]);
                                }
                              }}
                              style={{ margin: 0, flexShrink: 0, width: "auto" }}
                            />
                            <span>Select All Topics</span>
                          </label>
                          {allTopics.filter(t => t.chapterId === selectedChapterId).map(t => (
                            <label key={t.id} style={{ display: "flex", alignItems: "flex-start", gap: "6px", marginBottom: "8px", fontSize: "0.85rem", lineHeight: "1.4" }}>
                              <input 
                                type="checkbox" 
                                checked={selectedTopicIds.includes(t.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedTopicIds([...selectedTopicIds, t.id]);
                                  } else {
                                    setSelectedTopicIds(selectedTopicIds.filter(id => id !== t.id));
                                  }
                                }}
                                style={{ margin: "3px 0 0 0", flexShrink: 0, width: "auto" }}
                              />
                              <span style={{ flex: 1, textAlign: "left" }}>{t.name}</span>
                            </label>
                          ))}
                          {allTopics.filter(t => t.chapterId === selectedChapterId).length === 0 && (
                            <p className="muted-copy" style={{ fontSize: "0.8rem", margin: 0 }}>No topics found in this chapter.</p>
                          )}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: "10px", alignItems: "flex-end" }}>
                        <label className="field" style={{ flex: 1 }}>
                          <span>Count</span>
                          <input 
                            type="number" 
                            min="1" 
                            max="20" 
                            value={questionCount} 
                            onChange={(e) => setQuestionCount(Number(e.target.value))} 
                            style={{ background: "white" }}
                          />
                        </label>
                        <button 
                          className="primary-button" 
                          disabled={generatingForBook === book.id} 
                          onClick={() => void handleGenerateQuestions(book.id)}
                          style={{ flex: 2, height: "42px" }}
                        >
                          {generatingForBook === book.id ? "Working..." : "Generate AI Questions"}
                        </button>
                      </div>
                    </div>
                  </div>

                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

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
