import { useEffect, useState, useMemo } from "react";
import { apiClient } from "../api/client";
import { BRANDING } from "../config/branding";

function getAcademicYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const startYear = month >= 4 ? year : year - 1;
  return `${startYear}-${String(startYear + 1).slice(2)}`;
}

interface AdmissionRecord {
  id: string;
  studentName: string;
  dateOfBirth: string;
  schoolName: string;
  standard: "11" | "12";
  board: "CBSE" | "ICSE" | "GSEB";
  batchId: string;
  batchName: string;
  fatherName: string;
  motherName: string | null;
  fatherMobile: string;
  motherMobile: string | null;
  email: string;
  createdAt: string;
}

interface Reports {
  total: number;
  byBatch: Record<string, number>;
  byBoard: Record<string, number>;
  byStandard: Record<string, number>;
  byDate: Record<string, number>;
}

type Tab = "list" | "reports";

export function AdminAdmissionsPage() {
  const [tab, setTab] = useState<Tab>("list");
  const [admissions, setAdmissions] = useState<AdmissionRecord[]>([]);
  const [reports, setReports] = useState<Reports | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [filterBoard, setFilterBoard] = useState("");
  const [filterStandard, setFilterStandard] = useState("");
  const [filterBatch, setFilterBatch] = useState("");
  const batchNames = useMemo(() => [...new Set(admissions.map(a => a.batchName))].sort(), [admissions]);

  useEffect(() => {
    Promise.all([apiClient.getAdmissions(), apiClient.getAdmissionReports()])
      .then(([adms, rpts]) => { setAdmissions(adms); setReports(rpts); })
      .catch(e => setError(e?.message ?? "Failed to load admissions"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return admissions.filter(a => {
      if (filterBoard && a.board !== filterBoard) return false;
      if (filterStandard && a.standard !== filterStandard) return false;
      if (filterBatch && a.batchName !== filterBatch) return false;
      if (q && !a.studentName.toLowerCase().includes(q) &&
          !a.fatherName.toLowerCase().includes(q) &&
          !a.email.toLowerCase().includes(q) &&
          !a.schoolName.toLowerCase().includes(q) &&
          !a.fatherMobile.includes(q)) return false;
      return true;
    });
  }, [admissions, search, filterBoard, filterStandard, filterBatch]);

  const handleExport = () => {
    apiClient.exportAdmissionsCSV();
  };

  if (loading) return <div style={styles.center}>Loading admissions…</div>;
  if (error) return <div style={{ ...styles.center, color: "#dc2626" }}>{error}</div>;

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Admissions</h2>
          <p style={{ color: "#64748b", margin: "2px 0 0", fontSize: "0.9rem" }}>
            {BRANDING.admissionLabel} — {getAcademicYear()} · {admissions.length} total applications
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button onClick={handleExport} style={styles.exportBtn}>⬇ Export CSV</button>
          <a href="/apply" target="_blank" rel="noopener" style={styles.linkBtn}>
            🔗 Form Link
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div style={styles.tabRow}>
        {(["list", "reports"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}>
            {t === "list" ? "📋 Applications" : "📊 Reports"}
          </button>
        ))}
      </div>

      {tab === "list" && (
        <>
          {/* Filters */}
          <div style={styles.filterRow}>
            <input placeholder="Search name, mobile, email, school…" value={search}
              onChange={e => setSearch(e.target.value)} style={styles.searchInput} />
            <select value={filterBoard} onChange={e => setFilterBoard(e.target.value)} style={styles.select}>
              <option value="">All Boards</option>
              {["CBSE", "ICSE", "GSEB"].map(b => <option key={b}>{b}</option>)}
            </select>
            <select value={filterStandard} onChange={e => setFilterStandard(e.target.value)} style={styles.select}>
              <option value="">All Classes</option>
              <option value="11">Class 11</option>
              <option value="12">Class 12</option>
            </select>
            <select value={filterBatch} onChange={e => setFilterBatch(e.target.value)} style={styles.select}>
              <option value="">All Batches</option>
              {batchNames.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            {(search || filterBoard || filterStandard || filterBatch) && (
              <button onClick={() => { setSearch(""); setFilterBoard(""); setFilterStandard(""); setFilterBatch(""); }}
                style={styles.clearBtn}>Clear</button>
            )}
          </div>

          <p style={{ fontSize: "0.82rem", color: "#64748b", marginBottom: "12px" }}>
            Showing {filtered.length} of {admissions.length} records
          </p>

          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {["Student", "DOB", "School", "Class", "Board", "Batch",
                    "Father", "Mobile (F)", "Mother", "Mobile (M)", "Email", "Applied On"].map(h => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={12} style={{ textAlign: "center", padding: "32px", color: "#94a3b8" }}>
                    No admissions found
                  </td></tr>
                )}
                {filtered.map((a, i) => (
                  <tr key={a.id} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                    <td style={styles.td}><strong>{a.studentName}</strong></td>
                    <td style={styles.td}>{a.dateOfBirth}</td>
                    <td style={styles.td}>{a.schoolName}</td>
                    <td style={{ ...styles.td, textAlign: "center" }}>
                      <span style={styles.badge}>{a.standard}</span>
                    </td>
                    <td style={{ ...styles.td, textAlign: "center" }}>
                      <span style={{ ...styles.badge, background: boardColor(a.board) }}>{a.board}</span>
                    </td>
                    <td style={{ ...styles.td, textAlign: "center" }}>
                      <span style={{ ...styles.badge, background: "#f0fdf4", color: "#15803d" }}>{a.batchName}</span>
                    </td>
                    <td style={styles.td}>{a.fatherName}</td>
                    <td style={{ ...styles.td, fontFamily: "monospace", fontSize: "0.85rem" }}>
                      <a href={`tel:${a.fatherMobile}`} style={{ color: "#2563eb", textDecoration: "none" }}>
                        {a.fatherMobile}
                      </a>
                    </td>
                    <td style={{ ...styles.td, color: a.motherName ? "#1e293b" : "#94a3b8" }}>
                      {a.motherName ?? "—"}
                    </td>
                    <td style={{ ...styles.td, fontFamily: "monospace", fontSize: "0.85rem" }}>
                      {a.motherMobile
                        ? <a href={`tel:${a.motherMobile}`} style={{ color: "#2563eb", textDecoration: "none" }}>{a.motherMobile}</a>
                        : <span style={{ color: "#94a3b8" }}>—</span>}
                    </td>
                    <td style={{ ...styles.td, fontSize: "0.82rem" }}>
                      <a href={`mailto:${a.email}`} style={{ color: "#2563eb", textDecoration: "none" }}>
                        {a.email}
                      </a>
                    </td>
                    <td style={{ ...styles.td, color: "#64748b", fontSize: "0.8rem", whiteSpace: "nowrap" }}>
                      {new Date(a.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "reports" && reports && <ReportsPanel reports={reports} />}
    </div>
  );
}

function ReportsPanel({ reports }: { reports: Reports }) {
  const dateEntries = Object.entries(reports.byDate).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div>
      {/* Summary cards */}
      <div style={styles.cardGrid}>
        <StatCard label="Total Applications" value={reports.total} color="#2563eb" />
        <StatCard label="Class 11" value={reports.byStandard["11"] ?? 0} color="#7c3aed" />
        <StatCard label="Class 12" value={reports.byStandard["12"] ?? 0} color="#0891b2" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px", marginTop: "20px" }}>
        <BreakdownCard title="By Board" data={reports.byBoard} total={reports.total}
          colors={{ CBSE: "#2563eb", ICSE: "#7c3aed", GSEB: "#0891b2" }} />
        <BreakdownCard title="By Batch" data={reports.byBatch} total={reports.total}
          colors={{ "1": "#059669", "2": "#d97706", "3": "#dc2626", "4": "#7c3aed" }}
          labelFn={k => `Batch ${k}`} />
      </div>

      {/* Daily trend */}
      <div style={{ ...styles.reportCard, marginTop: "20px" }}>
        <h4 style={styles.reportTitle}>Daily Applications</h4>
        {dateEntries.length === 0
          ? <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>No data yet.</p>
          : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...styles.th, textAlign: "left" }}>Date</th>
                  <th style={styles.th}>Applications</th>
                  <th style={{ ...styles.th, textAlign: "left" }}>Bar</th>
                </tr>
              </thead>
              <tbody>
                {dateEntries.map(([date, count]) => {
                  const max = Math.max(...dateEntries.map(([, c]) => c));
                  return (
                    <tr key={date}>
                      <td style={{ ...styles.td, fontFamily: "monospace" }}>{date}</td>
                      <td style={{ ...styles.td, textAlign: "center", fontWeight: 700 }}>{count}</td>
                      <td style={styles.td}>
                        <div style={{ height: "14px", background: "#dbeafe", borderRadius: "4px", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${(count / max) * 100}%`,
                            background: "#2563eb", borderRadius: "4px", transition: "width 0.4s" }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: "12px", padding: "20px 24px",
      boxShadow: "0 2px 10px rgba(0,0,0,0.06)", borderLeft: `4px solid ${color}` }}>
      <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b", textTransform: "uppercase",
        letterSpacing: "0.06em", fontWeight: 600 }}>{label}</p>
      <p style={{ margin: "8px 0 0", fontSize: "2rem", fontWeight: 800, color }}>{value}</p>
    </div>
  );
}

function BreakdownCard({ title, data, total, colors, labelFn }:
  { title: string; data: Record<string, number>; total: number;
    colors: Record<string, string>; labelFn?: (k: string) => string }) {
  return (
    <div style={styles.reportCard}>
      <h4 style={styles.reportTitle}>{title}</h4>
      {Object.entries(data).map(([key, count]) => (
        <div key={key} style={{ marginBottom: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
            <span style={{ fontSize: "0.88rem", fontWeight: 600, color: "#374151" }}>
              {labelFn ? labelFn(key) : key}
            </span>
            <span style={{ fontSize: "0.88rem", color: "#64748b" }}>
              {count} ({total > 0 ? Math.round((count / total) * 100) : 0}%)
            </span>
          </div>
          <div style={{ height: "10px", background: "#f1f5f9", borderRadius: "6px", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${total > 0 ? (count / total) * 100 : 0}%`,
              background: colors[key] ?? "#94a3b8", borderRadius: "6px", transition: "width 0.4s" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function boardColor(board: string) {
  return board === "CBSE" ? "#eff6ff" : board === "ICSE" ? "#faf5ff" : "#ecfdf5";
}

const styles = {
  page: { padding: "28px 32px", fontFamily: "var(--font-sans, system-ui)" } as React.CSSProperties,
  center: { display: "flex", alignItems: "center", justifyContent: "center", height: "60vh",
    fontSize: "1rem", color: "#64748b" } as React.CSSProperties,
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    marginBottom: "24px" } as React.CSSProperties,
  title: { margin: 0, fontSize: "1.5rem", fontWeight: 800, color: "#1e293b" } as React.CSSProperties,
  exportBtn: { padding: "8px 16px", background: "#2563eb", color: "#fff", border: "none",
    borderRadius: "8px", cursor: "pointer", fontWeight: 600, fontSize: "0.88rem" } as React.CSSProperties,
  linkBtn: { padding: "8px 16px", background: "#f1f5f9", color: "#1e293b", border: "1.5px solid #e2e8f0",
    borderRadius: "8px", textDecoration: "none", fontWeight: 600, fontSize: "0.88rem" } as React.CSSProperties,
  tabRow: { display: "flex", gap: "8px", marginBottom: "20px", borderBottom: "2px solid #e2e8f0",
    paddingBottom: "0" } as React.CSSProperties,
  tab: { padding: "10px 18px", border: "none", background: "transparent", cursor: "pointer",
    fontWeight: 600, fontSize: "0.9rem", color: "#64748b", borderBottom: "2px solid transparent",
    marginBottom: "-2px" } as React.CSSProperties,
  tabActive: { color: "#2563eb", borderBottom: "2px solid #2563eb" } as React.CSSProperties,
  filterRow: { display: "flex", gap: "10px", flexWrap: "wrap" as const, marginBottom: "12px" },
  searchInput: { flex: "1 1 220px", padding: "8px 12px", border: "1.5px solid #e2e8f0",
    borderRadius: "8px", fontSize: "0.88rem", background: "#f8fafc", outline: "none" } as React.CSSProperties,
  select: { padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: "8px",
    fontSize: "0.88rem", background: "#f8fafc", color: "#374151" } as React.CSSProperties,
  clearBtn: { padding: "8px 14px", border: "1.5px solid #fca5a5", borderRadius: "8px",
    background: "#fef2f2", color: "#dc2626", cursor: "pointer", fontSize: "0.88rem",
    fontWeight: 600 } as React.CSSProperties,
  tableWrapper: { overflowX: "auto" as const, borderRadius: "10px",
    boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: "1px solid #e2e8f0" },
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: "0.88rem" },
  th: { padding: "10px 12px", background: "#f8fafc", fontWeight: 700, color: "#475569",
    fontSize: "0.78rem", textTransform: "uppercase" as const, letterSpacing: "0.05em",
    borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" as const } as React.CSSProperties,
  td: { padding: "10px 12px", borderBottom: "1px solid #f1f5f9", color: "#1e293b",
    verticalAlign: "middle" as const } as React.CSSProperties,
  badge: { display: "inline-block", padding: "2px 8px", borderRadius: "99px",
    fontSize: "0.78rem", fontWeight: 700, background: "#eff6ff", color: "#1d4ed8" } as React.CSSProperties,
  cardGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "16px" } as React.CSSProperties,
  reportCard: { background: "#fff", borderRadius: "12px", padding: "20px",
    boxShadow: "0 2px 10px rgba(0,0,0,0.06)" } as React.CSSProperties,
  reportTitle: { margin: "0 0 16px", fontSize: "0.9rem", fontWeight: 700, color: "#374151",
    textTransform: "uppercase" as const, letterSpacing: "0.06em" } as React.CSSProperties,
};
