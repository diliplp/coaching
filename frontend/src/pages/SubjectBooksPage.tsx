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
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("Teachers can upload PDF books subject-wise here.");
  
  // AI Generation State
  const [generatingForBook, setGeneratingForBook] = useState<string | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState("");
  const [selectedTopicId, setSelectedTopicId] = useState("");
  const [questionCount, setQuestionCount] = useState(5);

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
      await apiClient.uploadSubjectBook({ subjectId, title, file });
      setTitle("");
      setFile(null);
      setStatus("PDF uploaded successfully.");
      await loadData();
    } catch (error) {
      console.error(error);
      setStatus("Unable to upload the PDF book.");
    }
  };

  const handleGenerateQuestions = async (bookId: string) => {
    if (!selectedTopicId) {
      setStatus("Please select a topic before generating questions.");
      return;
    }
    setGeneratingForBook(bookId);
    setStatus("AI is reading the PDF and generating questions with STEM formatting... This may take up to a minute.");
    try {
      const result = await apiClient.generateQuestionsFromBook(bookId, {
        topicId: selectedTopicId,
        questionCount
      });
      setStatus(`Success: ${result.message}`);
      setGeneratingForBook(null);
    } catch (error: any) {
      console.error(error);
      setStatus("Failed to generate AI questions.");
      setGeneratingForBook(null);
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
              <span>PDF File</span>
              <input
                type="file"
                accept="application/pdf"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
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
                <li key={book.id}>
                  <div style={{ marginBottom: "15px" }}>
                    <div className="row-between">
                      <strong>{book.title}</strong>
                      <a className="text-link" href={buildPublicAssetUrl(book.fileUrl)} target="_blank" rel="noreferrer">Open PDF</a>
                    </div>
                    <div className="muted-copy">
                      {book.subjectName} • {new Date(book.uploadedAt).toLocaleString()}
                    </div>
                  </div>

                  {/* AI Question Generation UI */}
                  <div className="panel" style={{ background: "var(--color-bg-secondary)", border: "1px solid var(--color-border)" }}>
                    <strong>Generate AI Questions</strong>
                    <div className="stack" style={{ marginTop: "10px" }}>
                      <div className="grid-two">
                        <label className="field">
                          <span>Chapter</span>
                          <select 
                            value={selectedChapterId} 
                            onChange={(e) => { setSelectedChapterId(e.target.value); setSelectedTopicId(""); }}
                          >
                            <option value="">Select Chapter...</option>
                            {allChapters.filter(c => c.subjectId === book.subjectId).map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Topic</span>
                          <select 
                            value={selectedTopicId} 
                            onChange={(e) => setSelectedTopicId(e.target.value)}
                          >
                            <option value="">Select Topic...</option>
                            {allTopics.filter(t => t.chapterId === selectedChapterId).map(t => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      
                      <div className="row-between">
                        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          Question Count:
                          <input 
                            type="number" 
                            min="1" 
                            max="20" 
                            value={questionCount} 
                            onChange={(e) => setQuestionCount(Number(e.target.value))} 
                            style={{ width: "60px" }}
                          />
                        </label>

                        <button 
                          className="primary-button" 
                          disabled={generatingForBook === book.id || !selectedTopicId} 
                          onClick={() => void handleGenerateQuestions(book.id)}
                        >
                          {generatingForBook === book.id ? "Generating..." : "Generate AI Questions"}
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
