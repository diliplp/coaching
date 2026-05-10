import { useEffect, useState } from "react";
import { apiClient } from "../api/client";

export function ExamsListPage() {
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    fetchExams();
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
          exams.map((exam) => (
            <article className="panel" key={exam.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3>{exam.name}</h3>
                <p className="muted-copy">
                  {exam.durationMinutes} minutes • {exam.questions.length} questions • {exam.generationMode}
                </p>
                {exam.scheduledStartTime && (
                  <p className="muted-copy">
                    Scheduled: {new Date(exam.scheduledStartTime).toLocaleString()} - {exam.scheduledEndTime ? new Date(exam.scheduledEndTime).toLocaleString() : "No end time"}
                  </p>
                )}
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <button className="secondary-button" style={{ color: "red", borderColor: "red" }} onClick={() => handleDelete(exam.id)}>Delete</button>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
