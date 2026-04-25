import { useEffect, useState, type FormEvent } from "react";
import { apiClient, buildPublicAssetUrl } from "../api/client";
import type { SubjectBooksResponse } from "../types";

export function SubjectBooksPage() {
  const [data, setData] = useState<SubjectBooksResponse | null>(null);
  const [subjectId, setSubjectId] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("Teachers can upload PDF books subject-wise here.");

  const loadBooks = async () => {
    const response = await apiClient.getSubjectBooks();
    setData(response);
    if (!subjectId && response.subjects.length > 0) {
      setSubjectId(response.subjects[0].id);
    }
  };

  useEffect(() => {
    loadBooks().catch(console.error);
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
      await loadBooks();
    } catch (error) {
      console.error(error);
      setStatus("Unable to upload the PDF book.");
    }
  };

  if (!data) {
    return <p>Loading subject books...</p>;
  }

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
          <form className="book-form" onSubmit={(event) => void handleSubmit(event)}>
            <label className="field">
              <span>Subject</span>
              <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
                {data.subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.className} {subject.streamName} - {subject.name}
                  </option>
                ))}
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

            <button className="primary-button" type="submit">Upload PDF</button>
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
                  <div>
                    <strong>{book.title}</strong>
                    <div className="muted-copy">
                      {book.subjectName} • {new Date(book.uploadedAt).toLocaleString()}
                    </div>
                    {book.pageCount ? (
                      <div className="muted-copy">
                        {book.pageCount} pages parsed{book.extractedAt ? ` • ${new Date(book.extractedAt).toLocaleString()}` : ""}
                      </div>
                    ) : null}
                    {book.previewText ? <p className="preview-text">{book.previewText}</p> : null}
                  </div>
                  <a className="text-link" href={buildPublicAssetUrl(book.fileUrl)} target="_blank" rel="noreferrer">
                    Open PDF
                  </a>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      <article className="panel">
        <h3>Reference Papers from Project Directory</h3>
        <p className="muted-copy">
          These PDFs are loaded from the `books-papers` folder and can be used by teachers as syllabus and paper-pattern references.
        </p>
        {data.referencePapers.length === 0 ? (
          <p>No reference papers found in the project directory.</p>
        ) : (
          <div className="question-grid">
            {data.referencePapers.map((paper) => (
              <article className="panel question-card" key={paper.id}>
                <div className="row-between">
                  <span className="tag">{paper.classLevel}</span>
                  <span className="tag muted">{paper.category}</span>
                </div>
                <h3>{paper.displayName}</h3>
                <p className="muted-copy">
                  {paper.subject} • {paper.fileType.toUpperCase()}
                </p>
                <p className="muted-copy">{paper.relativePath}</p>
                <a className="text-link" href={buildPublicAssetUrl(paper.fileUrl)} target="_blank" rel="noreferrer">
                  Open Reference File
                </a>
              </article>
            ))}
          </div>
        )}
      </article>
    </div>
  );
}
