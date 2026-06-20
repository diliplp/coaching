import { useState, useEffect } from "react";
import { apiClient } from "../api/client";

const BOARDS = ["CBSE", "ICSE", "GSEB"] as const;

type Field = {
  studentName: string;
  dateOfBirth: string;
  schoolName: string;
  standard: "11" | "12" | "";
  board: string;
  batchId: string;
  fatherName: string;
  motherName: string;
  fatherMobile: string;
  motherMobile: string;
  email: string;
};

const EMPTY: Field = {
  studentName: "", dateOfBirth: "", schoolName: "", standard: "",
  board: "", batchId: "", fatherName: "", motherName: "",
  fatherMobile: "", motherMobile: "", email: "",
};

export function AdmissionFormPage() {
  const [form, setForm] = useState<Field>(EMPTY);
  const [batches, setBatches] = useState<{ id: string; name: string }[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiClient.getPublicBatches()
      .then(setBatches)
      .catch(() => setBatches([]))
      .finally(() => setBatchesLoading(false));
  }, []);

  const set = (k: keyof Field, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!/^\d{10}$/.test(form.fatherMobile)) {
      setError("Father's mobile number must be exactly 10 digits.");
      return;
    }
    if (form.motherMobile && !/^\d{10}$/.test(form.motherMobile)) {
      setError("Mother's mobile number must be exactly 10 digits.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError("Please enter a valid email address.");
      return;
    }

    const selectedBatch = batches.find(b => b.id === form.batchId);
    if (!selectedBatch) {
      setError("Please select a batch.");
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.submitAdmission({
        studentName: form.studentName,
        dateOfBirth: form.dateOfBirth,
        schoolName: form.schoolName,
        standard: form.standard as "11" | "12",
        board: form.board,
        batchId: selectedBatch.id,
        batchName: selectedBatch.name,
        fatherName: form.fatherName,
        motherName: form.motherName || undefined,
        fatherMobile: form.fatherMobile,
        motherMobile: form.motherMobile || undefined,
        email: form.email,
      });
      setDone(true);
    } catch (err: any) {
      setError(err?.message ?? "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={{ textAlign: "center", padding: "48px 20px" }}>
            <div style={{ fontSize: "3.5rem", marginBottom: "20px" }}>✅</div>
            <h2 style={{ color: "#16a34a", marginBottom: "12px", fontSize: "1.5rem" }}>
              Application Submitted Successfully!
            </h2>
            <p style={{ color: "#64748b", lineHeight: 1.7, maxWidth: "380px", margin: "0 auto" }}>
              Thank you for applying to <strong>BSA Classes 11-12 (2026-27)</strong>.<br />
              We will contact you on the provided mobile number or email address.
            </p>
            <div style={{ marginTop: "28px", padding: "16px 24px", background: "#f0fdf4",
              border: "1px solid #bbf7d0", borderRadius: "10px", display: "inline-block" }}>
              <p style={{ margin: 0, fontSize: "0.88rem", color: "#15803d" }}>
                Keep this page saved — our team will reach out within 2–3 working days.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <img src="/logo.jpeg" alt="BSA Logo" style={styles.logo} />
          <div>
            <h1 style={styles.title}>BSA Admission Form</h1>
            <p style={styles.subtitle}>Classes 11-12 · Academic Year 2026-27</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <Section label="Student Details">
            <Row>
              <Field label="Student Full Name *" htmlFor="studentName">
                <input id="studentName" style={styles.input} value={form.studentName} required
                  onChange={e => set("studentName", e.target.value)} placeholder="As per school records" />
              </Field>
              <Field label="Date of Birth *" htmlFor="dob">
                <input id="dob" type="date" style={styles.input} value={form.dateOfBirth} required
                  onChange={e => set("dateOfBirth", e.target.value)} />
              </Field>
            </Row>
            <Row>
              <Field label="Current School Name *" htmlFor="school">
                <input id="school" style={styles.input} value={form.schoolName} required
                  onChange={e => set("schoolName", e.target.value)} placeholder="Your current school" />
              </Field>
            </Row>
            <Row>
              <Field label="Applying for Class *" htmlFor="standard">
                <select id="standard" style={styles.input} value={form.standard} required
                  onChange={e => set("standard", e.target.value as "11" | "12")}>
                  <option value="">Select class</option>
                  <option value="11">Class 11</option>
                  <option value="12">Class 12</option>
                </select>
              </Field>
              <Field label="Board *" htmlFor="board">
                <select id="board" style={styles.input} value={form.board} required
                  onChange={e => set("board", e.target.value)}>
                  <option value="">Select board</option>
                  {BOARDS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </Field>
              <Field label="Batch *" htmlFor="batch">
                <select id="batch" style={styles.input} value={form.batchId} required
                  onChange={e => set("batchId", e.target.value)}
                  disabled={batchesLoading}>
                  <option value="">
                    {batchesLoading ? "Loading batches…" : batches.length === 0 ? "No batches available" : "Select batch"}
                  </option>
                  {batches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </Field>
            </Row>
          </Section>

          <Section label="Parent / Guardian Details">
            <Row>
              <Field label="Father's Name *" htmlFor="fatherName">
                <input id="fatherName" style={styles.input} value={form.fatherName} required
                  onChange={e => set("fatherName", e.target.value)} />
              </Field>
              <Field label="Mother's Name" htmlFor="motherName">
                <input id="motherName" style={styles.input} value={form.motherName}
                  onChange={e => set("motherName", e.target.value)} />
              </Field>
            </Row>
            <Row>
              <Field label="Father's Mobile Number *" htmlFor="fatherMobile">
                <input id="fatherMobile" type="tel" style={styles.input} value={form.fatherMobile}
                  maxLength={10} required onChange={e => set("fatherMobile", e.target.value.replace(/\D/g, ""))}
                  placeholder="10-digit mobile number" />
              </Field>
              <Field label="Mother's Mobile Number" htmlFor="motherMobile">
                <input id="motherMobile" type="tel" style={styles.input} value={form.motherMobile}
                  maxLength={10} onChange={e => set("motherMobile", e.target.value.replace(/\D/g, ""))}
                  placeholder="10-digit mobile number" />
              </Field>
            </Row>
            <Row>
              <Field label="Email Address *" htmlFor="email">
                <input id="email" type="email" style={styles.input} value={form.email} required
                  onChange={e => set("email", e.target.value)} placeholder="For communication" />
              </Field>
            </Row>
          </Section>

          {error && (
            <p style={{ color: "#dc2626", background: "#fef2f2", border: "1px solid #fca5a5",
              borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", fontSize: "0.9rem" }}>
              {error}
            </p>
          )}

          <button type="submit" disabled={submitting || batchesLoading}
            style={{ ...styles.submitBtn, opacity: (submitting || batchesLoading) ? 0.7 : 1 }}>
            {submitting ? "Submitting…" : "Submit Application"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "28px" }}>
      <h3 style={{ fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase",
        letterSpacing: "0.08em", color: "#64748b", marginBottom: "16px",
        paddingBottom: "8px", borderBottom: "1px solid #e2e8f0" }}>
        {label}
      </h3>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "16px", marginBottom: "16px" }}>{children}</div>;
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} style={{ display: "block", fontSize: "0.82rem",
        fontWeight: 600, color: "#374151", marginBottom: "6px" }}>{label}</label>
      {children}
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #f0f4ff 0%, #e8f0fe 100%)",
    padding: "32px 16px",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
  } as React.CSSProperties,
  card: {
    background: "#fff",
    borderRadius: "16px",
    boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
    padding: "32px",
    width: "100%",
    maxWidth: "760px",
  } as React.CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    marginBottom: "32px",
    paddingBottom: "24px",
    borderBottom: "2px solid #e2e8f0",
  } as React.CSSProperties,
  logo: {
    width: "64px",
    height: "64px",
    borderRadius: "50%",
    objectFit: "contain" as const,
    border: "2px solid #dbeafe",
  },
  title: {
    margin: 0,
    fontSize: "1.5rem",
    fontWeight: 700,
    color: "#1e3a5f",
  } as React.CSSProperties,
  subtitle: {
    margin: "4px 0 0",
    fontSize: "0.9rem",
    color: "#64748b",
  } as React.CSSProperties,
  input: {
    width: "100%",
    padding: "10px 12px",
    border: "1.5px solid #e2e8f0",
    borderRadius: "8px",
    fontSize: "0.92rem",
    color: "#1e293b",
    background: "#f8fafc",
    outline: "none",
    boxSizing: "border-box" as const,
  },
  submitBtn: {
    width: "100%",
    padding: "14px",
    background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
    color: "#fff",
    border: "none",
    borderRadius: "10px",
    fontSize: "1rem",
    fontWeight: 700,
    cursor: "pointer",
    marginTop: "8px",
    letterSpacing: "0.02em",
  } as React.CSSProperties,
};
