import React, { useState } from "react";
import { apiClient } from "../api/client";
import { RichText } from "../components/RichText";

export function OfflineExamBuilderPage() {
  const [className, setClassName] = useState("XII");
  const [subjectName, setSubjectName] = useState("Physics");
  const [topics, setTopics] = useState("Electrostatics, Current Electricity, Magnetism");
  const [paper, setPaper] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    setPaper(null);
    try {
      const result = await apiClient.generateOfflineBoardPaper({
        className,
        subjectName,
        topics: topics.split(",").map(t => t.trim()).filter(Boolean)
      });
      setPaper(result);
    } catch (err: any) {
      alert("Error generating paper: " + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  if (paper) {
    return (
      <div style={{ background: "white", minHeight: "100vh", color: "black", fontFamily: "'Times New Roman', Times, serif" }}>
        <style>
          {`
            @media print {
              .sidebar, .sidebar-toggle, .session-card, .no-print, header, nav {
                display: none !important;
              }
              .app-shell, .content, .page {
                display: block !important;
                margin: 0 !important;
                padding: 0 !important;
                width: 100% !important;
                background: white !important;
                color: black !important;
              }
              #printable-paper {
                border: none !important;
                padding: 20px !important;
                margin: 0 auto !important;
                width: 100% !important;
                max-width: 100% !important;
              }
            }
          `}
        </style>
        
        <div className="no-print" style={{ padding: "20px", display: "flex", gap: "10px", background: "#f8f9fa", borderBottom: "1px solid #dee2e6" }}>
          <button className="primary-button" onClick={() => window.print()}>🖨️ Print Question Paper</button>
          <button className="secondary-button" onClick={() => setPaper(null)}>Back to Builder</button>
        </div>
        
        <div id="printable-paper" style={{ maxWidth: "800px", margin: "0 auto", padding: "40px", fontSize: "16px", lineHeight: "1.5" }}>
          <div style={{ textAlign: "center", marginBottom: "20px" }}>
            <h1 style={{ textTransform: "uppercase", fontSize: "22px", margin: "0 0 10px 0" }}>{paper.title}</h1>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", borderBottom: "2px solid black", paddingBottom: "10px" }}>
              <span>Time Allowed: {paper.timeAllowed}</span>
              <span>Maximum Marks: {paper.maximumMarks}</span>
            </div>
          </div>
          
          <div style={{ marginBottom: "20px" }}>
            <strong style={{ fontSize: "18px", textDecoration: "underline" }}>General Instructions:</strong>
            <ol style={{ margin: "10px 0", paddingLeft: "30px", fontSize: "15px" }}>
              {paper.generalInstructions?.map((inst: string, i: number) => <li key={i}>{inst}</li>)}
            </ol>
          </div>
          
          {paper.sections?.map((sec: any, secIdx: number) => (
            <div key={secIdx} style={{ marginBottom: "30px" }}>
              <h2 style={{ textAlign: "center", textDecoration: "underline", fontSize: "18px", margin: "20px 0 10px 0" }}>{sec.sectionName}</h2>
              {sec.instructions && <p style={{ fontStyle: "italic", marginBottom: "15px", fontSize: "15px" }}>{sec.instructions}</p>}
              
              {sec.questions?.map((q: any, qIdx: number) => (
                <div key={qIdx} style={{ display: "flex", marginBottom: "20px", pageBreakInside: "avoid" }}>
                  <div style={{ width: "35px", fontWeight: "bold" }}>{q.qNumber}.</div>
                  <div style={{ flex: 1 }}>
                    <RichText content={q.text} />
                    
                    {q.options && q.options.length > 0 && (
                      <div style={{ marginTop: "10px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                        {q.options.map((opt: string, optIdx: number) => (
                          <div key={optIdx}><RichText content={opt} /></div>
                        ))}
                      </div>
                    )}

                    {q.hasOrChoice && (
                      <div style={{ margin: "15px 0" }}>
                        <div style={{ textAlign: "center", fontWeight: "bold", fontStyle: "italic", marginBottom: "15px" }}>OR</div>
                        <RichText content={q.orText || ""} />
                        
                        {q.orOptions && q.orOptions.length > 0 && (
                          <div style={{ marginTop: "10px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                            {q.orOptions.map((opt: string, optIdx: number) => (
                              <div key={optIdx}><RichText content={opt} /></div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ width: "50px", textAlign: "right", fontWeight: "bold" }}>[{q.marks}]</div>
                </div>
              ))}
            </div>
          ))}
          
          <div style={{ textAlign: "center", marginTop: "50px", fontWeight: "bold", fontSize: "20px" }}>
            *** END OF PAPER ***
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <section className="section-heading">
        <p className="eyebrow">Printable Papers</p>
        <h2>CBSE Offline Paper Generator</h2>
        <p className="muted-copy">Generate perfectly formatted Board Papers ready for A4 printing.</p>
      </section>

      <div className="panel" style={{ maxWidth: "600px", margin: "0 auto" }}>
        <form onSubmit={handleGenerate} className="stack" style={{ gap: "20px" }}>
          <div className="grid-two">
            <label className="field">
              <span style={{ fontWeight: "600", fontSize: "0.85rem", color: "var(--color-text-muted)" }}>CLASS</span>
              <select value={className} onChange={e => setClassName(e.target.value)} style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--color-border)" }}>
                <option value="XII">Class XII</option>
                <option value="X">Class X</option>
              </select>
            </label>
            <label className="field">
              <span style={{ fontWeight: "600", fontSize: "0.85rem", color: "var(--color-text-muted)" }}>SUBJECT</span>
              <select value={subjectName} onChange={e => setSubjectName(e.target.value)} style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--color-border)" }}>
                <option value="Physics">Physics</option>
                <option value="Chemistry">Chemistry</option>
                <option value="Biology">Biology</option>
                <option value="Mathematics">Mathematics</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span style={{ fontWeight: "600", fontSize: "0.85rem", color: "var(--color-text-muted)" }}>SYLLABUS / TOPICS TO COVER</span>
            <textarea 
              value={topics} 
              onChange={e => setTopics(e.target.value)} 
              placeholder="e.g. Full Syllabus OR Chapter 1, 2, and 3"
              rows={4} 
              style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--color-border)", fontFamily: "inherit" }}
              required 
            />
          </label>
          <button className="primary-button" type="submit" disabled={isGenerating} style={{ height: "48px", fontSize: "1rem" }}>
            {isGenerating ? "🧠 Generating Board Blueprint & Questions..." : "Generate Offline Paper"}
          </button>
          
          {isGenerating && (
            <p className="muted-copy" style={{ textAlign: "center", fontSize: "0.9rem" }}>
              Please wait. The AI is crafting 30+ unique questions matching the exact CBSE typology... (This takes about 45-60 seconds).
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
