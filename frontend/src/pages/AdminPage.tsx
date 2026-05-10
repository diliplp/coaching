import React, { useEffect, useState } from "react";
import { apiClient } from "../api/client";

export function AdminPage() {
  const [activeTab, setActiveTab] = useState<"classes" | "streams" | "batches" | "subjects" | "users">("classes");
  const [classes, setClasses] = useState<any[]>([]);
  const [streams, setStreams] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  // Form states
  const [newClass, setNewClass] = useState("");
  const [newStream, setNewStream] = useState({ name: "", classId: "" });
  const [newBatch, setNewBatch] = useState({ name: "", classId: "", streamId: "" });
  const [newSubject, setNewSubject] = useState({ name: "", classId: "", streamId: "" });
  const [newUser, setNewUser] = useState({ name: "", email: "", role: "student", password: "", batchId: "", classId: "", streamId: "" });

  // Edit states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});

  const fetchData = async () => {
    try {
      if (activeTab === "classes") setClasses(await apiClient.admin.getClasses());
      if (activeTab === "streams") setStreams(await apiClient.admin.getStreams());
      if (activeTab === "batches") setBatches(await apiClient.admin.getBatches());
      if (activeTab === "subjects") setSubjects(await apiClient.admin.getSubjects());
      if (activeTab === "users") setUsers(await apiClient.admin.getUsers());
      
      // Also fetch classes and streams for dropdowns
      if (activeTab !== "classes") setClasses(await apiClient.admin.getClasses());
      if (activeTab === "batches" || activeTab === "subjects" || activeTab === "users") setStreams(await apiClient.admin.getStreams());
      if (activeTab === "users") setBatches(await apiClient.admin.getBatches());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchData();
    setEditingId(null);
  }, [activeTab]);

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiClient.admin.createClass({ name: newClass });
    setNewClass("");
    fetchData();
  };

  const handleUpdateClass = async (id: string) => {
    await apiClient.admin.updateClass(id, { name: editData.name });
    setEditingId(null);
    fetchData();
  };

  const handleDeleteClass = async (id: string) => {
    if (confirm("Are you sure?")) {
      await apiClient.admin.deleteClass(id);
      fetchData();
    }
  };

  const handleCreateStream = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiClient.admin.createStream(newStream);
    setNewStream({ name: "", classId: "" });
    fetchData();
  };

  const handleUpdateStream = async (id: string) => {
    await apiClient.admin.updateStream(id, { name: editData.name, classId: editData.classId });
    setEditingId(null);
    fetchData();
  };

  const handleDeleteStream = async (id: string) => {
    if (confirm("Are you sure?")) {
      await apiClient.admin.deleteStream(id);
      fetchData();
    }
  };

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiClient.admin.createBatch(newBatch);
    setNewBatch({ name: "", classId: "", streamId: "" });
    fetchData();
  };

  const handleUpdateBatch = async (id: string) => {
    await apiClient.admin.updateBatch(id, { name: editData.name, classId: editData.classId, streamId: editData.streamId });
    setEditingId(null);
    fetchData();
  };

  const handleDeleteBatch = async (id: string) => {
    if (confirm("Are you sure?")) {
      await apiClient.admin.deleteBatch(id);
      fetchData();
    }
  };

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiClient.admin.createSubject(newSubject);
    setNewSubject({ name: "", classId: "", streamId: "" });
    fetchData();
  };

  const handleUpdateSubject = async (id: string) => {
    await apiClient.admin.updateSubject(id, { name: editData.name, classId: editData.classId, streamId: editData.streamId });
    setEditingId(null);
    fetchData();
  };

  const handleDeleteSubject = async (id: string) => {
    if (confirm("Are you sure?")) {
      await apiClient.admin.deleteSubject(id);
      fetchData();
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiClient.admin.createUser(newUser);
    setNewUser({ name: "", email: "", role: "student", password: "", batchId: "", classId: "", streamId: "" });
    fetchData();
  };

  const handleUpdateUser = async (id: string) => {
    await apiClient.admin.updateUser(id, editData);
    setEditingId(null);
    fetchData();
  };

  const handleDeleteUser = async (id: string) => {
    if (confirm("Are you sure?")) {
      await apiClient.admin.deleteUser(id);
      fetchData();
    }
  };

  const startEdit = (item: any) => {
    setEditingId(item.id);
    setEditData({ ...item });
  };

  const actionButtons = (id: string, item: any, saveHandler: () => void, deleteHandler: () => void) => (
    <div style={{ display: "flex", gap: "10px" }}>
      {editingId === id ? (
        <>
          <button className="primary-button" style={{ padding: "4px 8px" }} onClick={saveHandler}>Save</button>
          <button className="secondary-button" style={{ padding: "4px 8px" }} onClick={() => setEditingId(null)}>Cancel</button>
        </>
      ) : (
        <>
          <button className="secondary-button" style={{ padding: "4px 8px" }} onClick={() => startEdit(item)}>Edit</button>
          <button className="secondary-button" style={{ padding: "4px 8px", color: "red", borderColor: "red" }} onClick={deleteHandler}>Delete</button>
        </>
      )}
    </div>
  );

  return (
    <div className="page">
      <section className="section-heading">
        <p className="eyebrow">Admin Dashboard</p>
        <h2>Manage Institute Configuration (CBSE, GSEB, ICSE | JEE, NEET, GujCET)</h2>
      </section>

      <div style={{ display: "flex", gap: "10px", marginBottom: "20px", borderBottom: "1px solid var(--color-border)", paddingBottom: "10px" }}>
        {(["classes", "streams", "batches", "users"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "8px 16px",
              borderRadius: "4px",
              textTransform: "capitalize",
              background: activeTab === tab ? "var(--color-primary)" : "var(--color-bg-secondary)",
              color: activeTab === tab ? "white" : "inherit",
              border: "none",
              cursor: "pointer"
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      <article className="panel">
        {activeTab === "classes" && (
          <div>
            <h3>Classes</h3>
            <form onSubmit={handleCreateClass} style={{ display: "flex", gap: "10px", alignItems: "flex-end", marginBottom: "20px" }}>
              <label className="field" style={{ flex: 1 }}>
                <span>Class Name (e.g. 12th CBSE)</span>
                <input
                  type="text"
                  value={newClass}
                  onChange={(e) => setNewClass(e.target.value)}
                  required
                />
              </label>
              <button type="submit" className="primary-button">Add Class</button>
            </form>
            <ul className="plain-list">
              {classes.map((cls) => (
                <li key={cls.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  {editingId === cls.id ? (
                    <input type="text" value={editData.name} onChange={(e) => setEditData({...editData, name: e.target.value})} style={{ flex: 1, marginRight: "10px" }} />
                  ) : (
                    <div><strong>{cls.name}</strong> <span className="muted-copy">({cls.id})</span></div>
                  )}
                  {actionButtons(cls.id, cls, () => handleUpdateClass(cls.id), () => handleDeleteClass(cls.id))}
                </li>
              ))}
            </ul>
          </div>
        )}

        {activeTab === "streams" && (
          <div>
            <h3>Streams</h3>
            <form onSubmit={handleCreateStream} style={{ display: "flex", gap: "10px", alignItems: "flex-end", marginBottom: "20px" }}>
              <label className="field">
                <span>Select Class</span>
                <select value={newStream.classId} onChange={(e) => setNewStream({ ...newStream, classId: e.target.value })} required>
                  <option value="">Select...</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="field" style={{ flex: 1 }}>
                <span>Stream Name (e.g. Science)</span>
                <input
                  type="text"
                  value={newStream.name}
                  onChange={(e) => setNewStream({ ...newStream, name: e.target.value })}
                  required
                />
              </label>
              <button type="submit" className="primary-button">Add Stream</button>
            </form>
            <ul className="plain-list">
              {streams.map((str) => (
                <li key={str.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  {editingId === str.id ? (
                    <div style={{ display: "flex", gap: "10px", flex: 1, marginRight: "10px" }}>
                      <select value={editData.classId} onChange={(e) => setEditData({...editData, classId: e.target.value})}>
                        {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <input type="text" value={editData.name} onChange={(e) => setEditData({...editData, name: e.target.value})} style={{ flex: 1 }} />
                    </div>
                  ) : (
                    <div><strong>{str.name}</strong> <span className="muted-copy">(Class ID: {str.classId})</span></div>
                  )}
                  {actionButtons(str.id, str, () => handleUpdateStream(str.id), () => handleDeleteStream(str.id))}
                </li>
              ))}
            </ul>
          </div>
        )}

        {activeTab === "batches" && (
          <div>
            <h3>Batches</h3>
            <form onSubmit={handleCreateBatch} style={{ display: "flex", gap: "10px", alignItems: "flex-end", marginBottom: "20px" }}>
              <label className="field">
                <span>Select Class</span>
                <select value={newBatch.classId} onChange={(e) => setNewBatch({ ...newBatch, classId: e.target.value })} required>
                  <option value="">Select...</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Select Stream</span>
                <select value={newBatch.streamId} onChange={(e) => setNewBatch({ ...newBatch, streamId: e.target.value })} required>
                  <option value="">Select...</option>
                  {streams.filter(s => s.classId === newBatch.classId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="field" style={{ flex: 1 }}>
                <span>Batch Name (e.g. JEE Target)</span>
                <input
                  type="text"
                  value={newBatch.name}
                  onChange={(e) => setNewBatch({ ...newBatch, name: e.target.value })}
                  required
                />
              </label>
              <button type="submit" className="primary-button">Add Batch</button>
            </form>
            <ul className="plain-list">
              {batches.map((bat) => (
                <li key={bat.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  {editingId === bat.id ? (
                    <div style={{ display: "flex", gap: "10px", flex: 1, marginRight: "10px" }}>
                      <select value={editData.classId} onChange={(e) => setEditData({...editData, classId: e.target.value})}>
                        {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <select value={editData.streamId} onChange={(e) => setEditData({...editData, streamId: e.target.value})}>
                        {streams.filter(s => s.classId === editData.classId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <input type="text" value={editData.name} onChange={(e) => setEditData({...editData, name: e.target.value})} style={{ flex: 1 }} />
                    </div>
                  ) : (
                    <div><strong>{bat.name}</strong> <span className="muted-copy">(Stream ID: {bat.streamId})</span></div>
                  )}
                  {actionButtons(bat.id, bat, () => handleUpdateBatch(bat.id), () => handleDeleteBatch(bat.id))}
                </li>
              ))}
            </ul>
          </div>
        )}

        {activeTab === "subjects" && (
          <div>
            <h3>Subjects</h3>
            <form onSubmit={handleCreateSubject} style={{ display: "flex", gap: "10px", alignItems: "flex-end", marginBottom: "20px" }}>
              <label className="field">
                <span>Select Class</span>
                <select value={newSubject.classId} onChange={(e) => setNewSubject({ ...newSubject, classId: e.target.value })} required>
                  <option value="">Select...</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Select Stream</span>
                <select value={newSubject.streamId} onChange={(e) => setNewSubject({ ...newSubject, streamId: e.target.value })} required>
                  <option value="">Select...</option>
                  {streams.filter(s => s.classId === newSubject.classId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="field" style={{ flex: 1 }}>
                <span>Subject Name (e.g. Physics)</span>
                <input
                  type="text"
                  value={newSubject.name}
                  onChange={(e) => setNewSubject({ ...newSubject, name: e.target.value })}
                  required
                />
              </label>
              <button type="submit" className="primary-button">Add Subject</button>
            </form>
            <ul className="plain-list">
              {subjects.map((sub) => (
                <li key={sub.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  {editingId === sub.id ? (
                    <div style={{ display: "flex", gap: "10px", flex: 1, marginRight: "10px" }}>
                      <select value={editData.classId} onChange={(e) => setEditData({...editData, classId: e.target.value})}>
                        {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <select value={editData.streamId} onChange={(e) => setEditData({...editData, streamId: e.target.value})}>
                        {streams.filter(s => s.classId === editData.classId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <input type="text" value={editData.name} onChange={(e) => setEditData({...editData, name: e.target.value})} style={{ flex: 1 }} />
                    </div>
                  ) : (
                    <div><strong>{sub.name}</strong> <span className="muted-copy">(Stream ID: {sub.streamId})</span></div>
                  )}
                  {actionButtons(sub.id, sub, () => handleUpdateSubject(sub.id), () => handleDeleteSubject(sub.id))}
                </li>
              ))}
            </ul>
          </div>
        )}

        {activeTab === "users" && (
          <div>
            <h3>Users</h3>
            <form onSubmit={handleCreateUser} style={{ display: "flex", flexDirection: "column", gap: "15px", marginBottom: "20px" }}>
              <div style={{ display: "flex", gap: "10px" }}>
                <label className="field" style={{ flex: 1 }}><span>Name</span><input type="text" value={newUser.name} onChange={(e) => setNewUser({...newUser, name: e.target.value})} required /></label>
                <label className="field" style={{ flex: 1 }}><span>Email</span><input type="email" value={newUser.email} onChange={(e) => setNewUser({...newUser, email: e.target.value})} required /></label>
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <label className="field" style={{ flex: 1 }}><span>Password</span><input type="password" value={newUser.password} onChange={(e) => setNewUser({...newUser, password: e.target.value})} required /></label>
                <label className="field" style={{ flex: 1 }}>
                  <span>Role</span>
                  <select value={newUser.role} onChange={(e) => setNewUser({...newUser, role: e.target.value})} required>
                    <option value="student">Student</option>
                    <option value="teacher">Teacher</option>
                    <option value="super_admin">Admin</option>
                  </select>
                </label>
              </div>
              
              {newUser.role === "student" && (
                <div style={{ display: "flex", gap: "10px" }}>
                  <label className="field" style={{ flex: 1 }}><span>Class</span>
                    <select value={newUser.classId} onChange={(e) => setNewUser({...newUser, classId: e.target.value})} required>
                      <option value="">Select...</option>
                      {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>
                  <label className="field" style={{ flex: 1 }}><span>Stream</span>
                    <select value={newUser.streamId} onChange={(e) => setNewUser({...newUser, streamId: e.target.value})} required>
                      <option value="">Select...</option>
                      {streams.filter(s => s.classId === newUser.classId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </label>
                  <label className="field" style={{ flex: 1 }}><span>Batch</span>
                    <select value={newUser.batchId} onChange={(e) => setNewUser({...newUser, batchId: e.target.value})} required>
                      <option value="">Select...</option>
                      {batches.filter(b => b.streamId === newUser.streamId).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </label>
                </div>
              )}
              <button type="submit" className="primary-button">Add User</button>
            </form>

            <h3 style={{ marginTop: "30px" }}>Existing Users</h3>
            <ul className="plain-list">
              {users.map((u) => (
                <li key={u.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  {editingId === u.id ? (
                    <div style={{ display: "flex", gap: "10px", flex: 1, marginRight: "10px", flexWrap: "wrap" }}>
                      <input type="text" value={editData.name} onChange={(e) => setEditData({...editData, name: e.target.value})} />
                      <input type="email" value={editData.email} onChange={(e) => setEditData({...editData, email: e.target.value})} />
                      <select value={editData.role} onChange={(e) => setEditData({...editData, role: e.target.value})}>
                        <option value="student">Student</option>
                        <option value="teacher">Teacher</option>
                        <option value="super_admin">Admin</option>
                      </select>
                    </div>
                  ) : (
                    <div>
                      <strong>{u.name}</strong> <span className="muted-copy">({u.email})</span>
                      <span className="tag" style={{ marginLeft: "10px" }}>{u.role}</span>
                    </div>
                  )}
                  {actionButtons(u.id, u, () => handleUpdateUser(u.id), () => handleDeleteUser(u.id))}
                </li>
              ))}
            </ul>
          </div>
        )}
      </article>
    </div>
  );
}
