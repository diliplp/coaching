import { useEffect, useState } from "react";
import { apiClient } from "../api/client";

export function CurriculumPage() {
  const [activeTab, setActiveTab] = useState<"subjects" | "chapters" | "topics">("subjects");
  const [subjects, setSubjects] = useState<any[]>([]);
  const [chapters, setChapters] = useState<any[]>([]);
  const [topics, setTopics] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [streams, setStreams] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState<any>({ name: "", classId: "", streamId: "", subjectId: "", chapterId: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterSubjectId, setFilterSubjectId] = useState("");
  const [filterChapterId, setFilterChapterId] = useState("");

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sub, chap, top, cls, str] = await Promise.all([
        apiClient.admin.getSubjects(),
        apiClient.admin.getChapters(),
        apiClient.admin.getTopics(),
        apiClient.admin.getClasses(),
        apiClient.admin.getStreams()
      ]);
      setSubjects(sub);
      setChapters(chap);
      setTopics(top);
      setClasses(cls);
      setStreams(str);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (activeTab === "subjects") {
        if (editingId) await apiClient.admin.updateSubject(editingId, form);
        else await apiClient.admin.createSubject(form);
      } else if (activeTab === "chapters") {
        if (editingId) await apiClient.admin.updateChapter(editingId, form);
        else await apiClient.admin.createChapter(form);
      } else {
        if (editingId) await apiClient.admin.updateTopic(editingId, form);
        else await apiClient.admin.createTopic(form);
      }
      setForm({ name: "", classId: "", streamId: "", subjectId: "", chapterId: "" });
      setEditingId(null);
      fetchData();
    } catch (e) {
      alert("Error saving record");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure?")) return;
    try {
      if (activeTab === "subjects") await apiClient.admin.deleteSubject(id);
      else if (activeTab === "chapters") await apiClient.admin.deleteChapter(id);
      else await apiClient.admin.deleteTopic(id);
      fetchData();
    } catch (e: any) {
      alert(`Error deleting record: ${e.message || "Unknown error"}`);
    }
  };

  const handleEdit = (item: any) => {
    setEditingId(item.id);
    setForm(item);
  };

  const filteredItems = (() => {
    if (activeTab === "subjects") {
      return subjects.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    if (activeTab === "chapters") {
      return chapters.filter(c => {
        const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesSubject = filterSubjectId ? c.subjectId === filterSubjectId : true;
        return matchesSearch && matchesSubject;
      });
    }
    if (activeTab === "topics") {
      return topics.filter(t => {
        const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesSubject = filterSubjectId ? t.subjectId === filterSubjectId : true;
        const matchesChapter = filterChapterId ? t.chapterId === filterChapterId : true;
        return matchesSearch && matchesSubject && matchesChapter;
      });
    }
    return [];
  })();

  if (loading) return <p>Loading curriculum...</p>;

  return (
    <div className="page">
      <section className="section-heading">
        <p className="eyebrow">Curriculum Management</p>
        <h2>Manage Subjects, Chapters, and Topics</h2>
      </section>

      <nav className="tab-nav" style={{ marginBottom: "20px" }}>
        {(["subjects", "chapters", "topics"] as const).map(tab => (
          <button
            key={tab}
            className={activeTab === tab ? "tab-button active" : "tab-button"}
            onClick={() => { 
              setActiveTab(tab); 
              setEditingId(null); 
              setSearchTerm("");
              setFilterSubjectId("");
              setFilterChapterId("");
              setForm({ name: "", classId: "", streamId: "", subjectId: "", chapterId: "" }); 
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </nav>

      <div className="grid-two">
        <section className="panel">
          <h3>{editingId ? "Edit" : "Add"} {activeTab.slice(0, -1)}</h3>
          <form onSubmit={handleSubmit} className="stack" style={{ marginTop: "15px" }}>
            <label className="field">
              <span>Name</span>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
            </label>

            {activeTab === "subjects" && (
              <>
                <label className="field">
                  <span>Class</span>
                  <select value={form.classId} onChange={e => setForm({ ...form, classId: e.target.value })} required>
                    <option value="">Select Class</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Stream</span>
                  <select value={form.streamId} onChange={e => setForm({ ...form, streamId: e.target.value })} required>
                    <option value="">Select Stream</option>
                    {streams.filter(s => s.classId === form.classId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
              </>
            )}

            {(activeTab === "chapters" || activeTab === "topics") && (
              <label className="field">
                <span>Subject</span>
                <select value={form.subjectId} onChange={e => setForm({ ...form, subjectId: e.target.value })} required>
                  <option value="">Select Subject</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            )}

            {activeTab === "topics" && (
              <label className="field">
                <span>Chapter</span>
                <select value={form.chapterId} onChange={e => setForm({ ...form, chapterId: e.target.value })} required>
                  <option value="">Select Chapter</option>
                  {chapters.filter(c => c.subjectId === form.subjectId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}

            <button type="submit" className="primary-button">{editingId ? "Update" : "Create"}</button>
            {editingId && <button type="button" className="secondary-button" onClick={() => { setEditingId(null); setForm({ name: "" }); }}>Cancel</button>}
          </form>
        </section>

        <section className="panel" style={{ display: "flex", flexDirection: "column" }}>
          <div className="row-between" style={{ marginBottom: "15px", flexWrap: "wrap", gap: "10px" }}>
            <h3>Existing {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h3>
          </div>

          <div className="stack" style={{ marginBottom: "20px", padding: "15px", background: "var(--color-bg-secondary)", borderRadius: "12px" }}>
            <input 
              type="text" 
              placeholder={`Search ${activeTab}...`} 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              style={{ padding: "10px", borderRadius: "8px", border: "1px solid var(--color-border)" }}
            />
            
            {(activeTab === "chapters" || activeTab === "topics") && (
              <select 
                value={filterSubjectId} 
                onChange={e => { setFilterSubjectId(e.target.value); setFilterChapterId(""); }}
                style={{ padding: "10px", borderRadius: "8px", border: "1px solid var(--color-border)" }}
              >
                <option value="">Filter by Subject</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}

            {activeTab === "topics" && (
              <select 
                value={filterChapterId} 
                onChange={e => setFilterChapterId(e.target.value)}
                style={{ padding: "10px", borderRadius: "8px", border: "1px solid var(--color-border)" }}
              >
                <option value="">Filter by Chapter</option>
                {chapters.filter(c => !filterSubjectId || c.subjectId === filterSubjectId).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>

          <div style={{ maxHeight: "500px", overflowY: "auto" }}>
            <ul className="plain-list">
              {filteredItems.map(item => (
                <li key={item.id} className="row-between" style={{ padding: "12px", borderBottom: "1px solid var(--color-border)" }}>
                  <div>
                    <strong>{item.name}</strong>
                    <div className="muted-copy" style={{ fontSize: "0.85rem" }}>
                      {activeTab === "subjects" && `${classes.find(c => c.id === item.classId)?.name} • ${streams.find(s => s.id === item.streamId)?.name}`}
                      {activeTab === "chapters" && subjects.find(s => s.id === item.subjectId)?.name}
                      {activeTab === "topics" && `${subjects.find(s => s.id === item.subjectId)?.name} • ${chapters.find(c => c.id === item.chapterId)?.name}`}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button className="secondary-button" style={{ padding: "6px 12px", fontSize: "0.85rem" }} onClick={() => handleEdit(item)}>Edit</button>
                    <button className="secondary-button" style={{ padding: "6px 12px", fontSize: "0.85rem", color: "var(--color-error)", borderColor: "var(--color-error)" }} onClick={() => handleDelete(item.id)}>Delete</button>
                  </div>
                </li>
              ))}
              {filteredItems.length === 0 && <p className="muted-copy">No results found.</p>}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
