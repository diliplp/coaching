import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../api/client";

export function ExamsListPage() {
  const navigate = useNavigate();
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState<any[]>([]);

  // Editing state
  const [editingExam, setEditingExam] = useState<any | null>(null);
  const [editName, setEditName] = useState("");
  const [editDuration, setEditDuration] = useState<number>(0);
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editBatchId, setEditBatchId] = useState("");

  const fetchExams = async () => {
    try {
      const data = await apiClient.getExams();
      setExams(data);
      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  const fetchBatches = async () => {
    try {
      const data = await apiClient.getOverview();
      setBatches(data.batches);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchExams();
    fetchBatches();
  }, []);

  const handleDelete = async (id: string) => {
    if (confirm("Delete this exam?")) {
      try {
        await apiClient.deleteExam(id);
        fetchExams();
      } catch (e) {
        console.error(e);
        alert("Failed to delete exam");
      }
    }
  };

  const formatForDateTimeInput = (dateStr?: string) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "";
      const pad = (num: number) => String(num).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return "";
    }
  };

  const handleEditClick = (exam: any) => {
    setEditingExam(exam);
    setEditName(exam.name);
    setEditDuration(exam.durationMinutes);
    setEditStartTime(formatForDateTimeInput(exam.scheduledStartTime));
    setEditEndTime(formatForDateTimeInput(exam.scheduledEndTime));
    setEditBatchId(exam.batchId || "");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExam) return;

    try {
      await apiClient.updateExam(editingExam.id, {
        name: editName,
        durationMinutes: Number(editDuration),
        scheduledStartTime: editStartTime || undefined,
        scheduledEndTime: editEndTime || undefined,
        batchId: editBatchId || undefined
      });
      setEditingExam(null);
      fetchExams();
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to update exam");
    }
  };

  if (loading) return <p>Loading exams...</p>;

  return (
    <div className="page">
      <section className="section-heading">
        <p className="eyebrow">Exam Management</p>
        <h2>Review and Manage Generated Exams</h2>
      </section>

      <div className="stack">
        {exams.length === 0 ? (
          <p>No exams generated yet.</p>
        ) : (
          exams.map((exam) => {
            const batchName = batches.find(b => String(b.id) === String(exam.batchId))?.name || "No Batch Assigned";
            return (
              <article className="panel" key={exam.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3>{exam.name}</h3>
                  <p className="muted-copy">
                    {exam.durationMinutes} minutes • {exam.questions.length} questions • {exam.generationMode}
                  </p>
                  <p className="muted-copy" style={{ fontSize: "0.85rem", marginTop: "4px" }}>
                    Batch: <strong>{batchName}</strong>
                  </p>
                  {exam.scheduledStartTime && (
                    <p className="muted-copy" style={{ fontSize: "0.85rem", marginTop: "2px" }}>
                      Scheduled: {new Date(exam.scheduledStartTime).toLocaleString()} - {exam.scheduledEndTime ? new Date(exam.scheduledEndTime).toLocaleString() : "No end time"}
                    </p>
                  )}
                </div>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <button className="primary-button" style={{ padding: "8px 16px", fontSize: "0.85rem" }} onClick={() => navigate(`/exams/${exam.id}/monitor`)}>Monitor Live</button>
                  <button className="secondary-button" onClick={() => handleEditClick(exam)}>Edit</button>
                  <button className="secondary-button" style={{ color: "red", borderColor: "red" }} onClick={() => handleDelete(exam.id)}>Delete</button>
                </div>
              </article>
            );
          })
        )}
      </div>

      {editingExam && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(15, 23, 42, 0.4)",
          backdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          animation: "fadeIn 0.2s ease-out"
        }}>
          <div style={{
            background: "rgba(255, 255, 255, 0.95)",
            border: "1px solid rgba(255, 255, 255, 0.8)",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
            borderRadius: "16px",
            padding: "2rem",
            width: "90%",
            maxWidth: "480px",
            animation: "scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
            color: "#1e293b"
          }}>
            <h3 style={{ fontSize: "1.25rem", fontWeight: "600", marginBottom: "1.5rem" }}>Edit Scheduled Exam</h3>
            
            <form onSubmit={handleSave} className="book-form">
              <label className="field">
                <span>Exam Name</span>
                <input required value={editName} onChange={e => setEditName(e.target.value)} />
              </label>

              <label className="field">
                <span>Duration (Minutes)</span>
                <input required type="number" value={editDuration} onChange={e => setEditDuration(Number(e.target.value))} />
              </label>

              <label className="field">
                <span>Assign to Batch</span>
                <select value={editBatchId} onChange={e => setEditBatchId(e.target.value)}>
                  <option value="">No Batch Assigned</option>
                  {batches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Scheduled Start Time</span>
                <input type="datetime-local" value={editStartTime} onChange={e => setEditStartTime(e.target.value)} />
              </label>

              <label className="field">
                <span>Scheduled End Time</span>
                <input type="datetime-local" value={editEndTime} onChange={e => setEditEndTime(e.target.value)} />
              </label>

              <div style={{ display: "flex", gap: "12px", marginTop: "24px", justifyContent: "flex-end" }}>
                <button type="button" className="secondary-button" onClick={() => setEditingExam(null)}>Cancel</button>
                <button type="submit" className="primary-button">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
