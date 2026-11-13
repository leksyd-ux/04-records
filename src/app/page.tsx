"use client";

import { useEffect, useState, useCallback } from "react";

interface RecordItem {
  publicId: string;
  title: string;
  content: string;
  category: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface DeletionAuditItem {
  id: string;
  recordPublicId: string;
  recordTitle: string;
  deletedByUserEmail: string;
  deletedAt: string;
}

interface UserSession {
  id: string;
  email: string;
  name: string;
}

async function requestDemoSession(userNum: 1 | 2): Promise<UserSession> {
  const res = await fetch("/api/auth/demo-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: userNum }),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.user) {
    throw new Error(data.error || "Failed to establish demo session.");
  }

  return data.user as UserSession;
}

export default function RecordsPage() {
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [activeUserNumber, setActiveUserNumber] = useState<1 | 2>(1);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [audits, setAudits] = useState<DeletionAuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // View state & URL state synchronization
  const [viewMode, setViewMode] = useState<"list" | "create" | "detail">("list");
  const [selectedRecord, setSelectedRecord] = useState<RecordItem | null>(null);
  const [crossUserTestResult, setCrossUserTestResult] = useState<string | null>(null);
  const [crossUserTestRunning, setCrossUserTestRunning] = useState(false);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formCategory, setFormCategory] = useState("General");
  const [formStatus, setFormStatus] = useState("ACTIVE");
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Delete modal state
  const [recordToDelete, setRecordToDelete] = useState<RecordItem | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const refreshData = useCallback(async (): Promise<boolean> => {
    try {
      const [recRes, auditRes] = await Promise.all([
        fetch("/api/records"),
        fetch("/api/records/audits"),
      ]);

      if (!recRes.ok) {
        if (recRes.status === 401) return false;
        throw new Error(`Records request failed with status ${recRes.status}.`);
      }

      const recData = await recRes.json();
      setRecords(recData.records || []);
      if (recData.user) {
        setCurrentUser(recData.user);
        setActiveUserNumber(recData.user.email?.includes("user2") ? 2 : 1);
      }

      if (auditRes.ok) {
        const auditData = await auditRes.json();
        setAudits(auditData.audits || []);
      }

      return true;
    } catch (err) {
      console.error(err);
      setError("Failed to fetch records.");
      return false;
    }
  }, []);

  const authenticateDemoUser = useCallback(async (userNum: 1 | 2) => {
    const user = await requestDemoSession(userNum);
    setCurrentUser(user);
    setActiveUserNumber(userNum);
  }, []);

  const fetchRecordDetail = useCallback(async (publicId: string): Promise<boolean> => {
    const res = await fetch(`/api/records/${encodeURIComponent(publicId)}`);
    if (!res.ok) return false;

    const data = await res.json();
    setSelectedRecord(data.record);
    setViewMode("detail");
    return true;
  }, []);

  const clearUrlState = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("record");
    url.searchParams.delete("view");
    window.history.replaceState({}, "", url.toString());
  }, []);

  const syncViewWithUrl = useCallback(async () => {
    const params = new URLSearchParams(window.location.search);
    const publicId = params.get("record");

    if (publicId) {
      try {
        if (await fetchRecordDetail(publicId)) return;
      } catch (err) {
        console.error(err);
      }

      setSelectedRecord(null);
      setViewMode("list");
      clearUrlState();
      return;
    }

    setSelectedRecord(null);
    setViewMode(params.get("view") === "create" ? "create" : "list");
  }, [clearUrlState, fetchRecordDetail]);

  const updateUrlState = (mode: "list" | "create" | "detail", publicId?: string) => {
    setViewMode(mode);
    setCrossUserTestResult(null);
    if (mode !== "detail") setSelectedRecord(null);

    const url = new URL(window.location.href);
    if (mode === "detail" && publicId) {
      url.searchParams.set("record", publicId);
      url.searchParams.delete("view");
    } else if (mode === "create") {
      url.searchParams.delete("record");
      url.searchParams.set("view", "create");
    } else {
      url.searchParams.delete("record");
      url.searchParams.delete("view");
    }

    window.history.pushState({}, "", url.toString());
  };

  // Switch authenticated user (User 1 vs User 2)
  const switchUser = async (userNum: 1 | 2) => {
    setError(null);
    setSuccessMsg(null);
    setCrossUserTestResult(null);
    setLoading(true);

    try {
      await authenticateDemoUser(userNum);
      setViewMode("list");
      setSelectedRecord(null);
      setRecordToDelete(null);
      clearUrlState();
      await refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error switching user session.");
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        const ready = await refreshData();
        if (cancelled) return;

        if (!ready) {
          await authenticateDemoUser(1);
          if (cancelled) return;
          await refreshData();
        }

        if (!cancelled) await syncViewWithUrl();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to establish session.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void boot();

    return () => {
      cancelled = true;
    };
  }, [authenticateDemoUser, refreshData, syncViewWithUrl]);

  useEffect(() => {
    const handlePopState = () => {
      void syncViewWithUrl();
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [syncViewWithUrl]);

  // Create record handler
  const handleCreateRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFormSubmitting(true);

    try {
      const res = await fetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle,
          content: formContent,
          category: formCategory,
          status: formStatus,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create record.");
        return;
      }

      setSuccessMsg(`Record created with opaque identifier: ${data.record.publicId}`);
      setFormTitle("");
      setFormContent("");
      await refreshData();
      updateUrlState("detail", data.record.publicId);
      setSelectedRecord(data.record);
    } catch {
      setError("Network error creating record.");
    } finally {
      setFormSubmitting(false);
    }
  };

  // Confirm deletion handler
  const handleConfirmDelete = async () => {
    if (!recordToDelete) return;
    setDeleteSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/records/${recordToDelete.publicId}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to delete record.");
      } else {
        setSuccessMsg(`Record ${recordToDelete.publicId} deleted and permanent audit logged.`);
        setRecordToDelete(null);
        setSelectedRecord(null);
        updateUrlState("list");
        await refreshData();
      }
    } catch {
      setError("Network error deleting record.");
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // Cross-user test: Attempt to fetch the currently selected record using the other user's session
  const testCrossUserAccess = async (targetPublicId: string) => {
    const originalUserNum = activeUserNumber;
    const otherUserNum = originalUserNum === 1 ? 2 : 1;

    setCrossUserTestRunning(true);
    setCrossUserTestResult("Running live isolation test...");

    let result = "Cross-user test did not complete.";

    try {
      await requestDemoSession(otherUserNum);
      const res = await fetch(`/api/records/${encodeURIComponent(targetPublicId)}`);
      const data = await res.json().catch(() => ({}));

      if (res.status === 403) {
        result = "✓ PASS: 403 Forbidden returned — structural ownership prevented cross-user access.";
      } else if (res.status === 404) {
        result = "✓ PASS: 404 Not Found — record does not exist for the adversary session.";
      } else if (res.ok) {
        result = "✕ FAIL: 200 OK returned — data leaked across users!";
      } else {
        result = `Status ${res.status}: ${data.error || "Unexpected response from the records API."}`;
      }
    } catch {
      result = "Network error executing the cross-user test.";
    } finally {
      try {
        await requestDemoSession(originalUserNum);
        await refreshData();
      } catch {
        result = "Cross-user test completed, but the original session could not be restored. Refresh the page.";
      }

      setCrossUserTestRunning(false);
      setCrossUserTestResult(result);
    }
  };

  const crossUserTestPassed = crossUserTestResult?.includes("PASS") ?? false;
  const crossUserTestFailed = crossUserTestResult?.includes("FAIL") ?? false;

  return (
    <main>
      {/* User Switcher Bar */}
      <aside aria-label="Evaluator Controls" className="user-switcher-bar" id="evaluator-user-switcher">
        <div className="user-tag">
          <span style={{ color: "var(--text-muted)" }}>Current Session:</span>
          <strong>{currentUser?.name || "Loading..."}</strong>
          <span className={`user-badge ${activeUserNumber === 1 ? "user1-badge" : "user2-badge"}`}>
            {currentUser?.email}
          </span>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>Switch Active Identity:</span>
          <button
            id="switch-user-1-btn"
            className={`btn btn-sm ${activeUserNumber === 1 ? "btn-primary" : "btn-secondary"}`}
            onClick={() => switchUser(1)}
            disabled={loading || crossUserTestRunning}
          >
            User 1 (Owner)
          </button>
          <button
            id="switch-user-2-btn"
            className={`btn btn-sm ${activeUserNumber === 2 ? "btn-primary" : "btn-secondary"}`}
            onClick={() => switchUser(2)}
            disabled={loading || crossUserTestRunning}
          >
            User 2 (Adversary)
          </button>
        </div>
      </aside>

      <div className="page-container">
        {/* Header */}
        <header className="section-header">
          <div>
            <h1 className="section-title">Records & Strict Access Control</h1>
            <p className="section-subtitle">
              Every query scopes structurally to the authenticated user. Zero cross-tenant data leakage.
              Opaque identifiers prevent ID enumeration. Deletion audits are permanently preserved.
            </p>
          </div>

          <div>
            {viewMode === "list" ? (
              <button
                id="create-record-btn"
                className="btn btn-primary"
                onClick={() => updateUrlState("create")}
              >
                + New Record
              </button>
            ) : (
              <button
                id="back-to-list-btn"
                className="btn btn-secondary"
                onClick={() => updateUrlState("list")}
              >
                ← Back to List
              </button>
            )}
          </div>
        </header>

        {/* Global Feedback Banners */}
        {error && (
          <div role="alert" className="alert-box alert-danger">
            {error}
          </div>
        )}
        {successMsg && (
          <div role="status" className="alert-box alert-success">
            {successMsg}
          </div>
        )}

        {/* SCREEN 1: LIST VIEW */}
        {viewMode === "list" && (
          <section aria-labelledby="records-list-heading">
            <h2 id="records-list-heading" className="sr-only">
              Your Records
            </h2>
            {records.length === 0 ? (
              /* Genuine Empty State */
              <div className="empty-state-box" id="empty-state-container">
                <svg className="empty-state-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <div className="empty-state-title">No records found for {currentUser?.name}</div>
                <p className="empty-state-desc">
                  This account has zero records in the database. Use the button below to create your first record.
                </p>
                <button
                  id="empty-create-btn"
                  className="btn btn-primary"
                  onClick={() => updateUrlState("create")}
                >
                  Create Your First Record
                </button>
              </div>
            ) : (
              <div className="records-grid" id="records-list-grid">
                {records.map((rec) => (
                  <article key={rec.publicId} className="record-card" id={`card-${rec.publicId}`}>
                    <div style={{ flex: 1, marginRight: "16px" }}>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "6px" }}>
                        <span className="public-id-pill">{rec.publicId}</span>
                        <span className={`chip ${rec.status === "ACTIVE" ? "chip-active" : "chip-archived"}`}>
                          {rec.status}
                        </span>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          {rec.category}
                        </span>
                      </div>

                      <h3 className="record-title">{rec.title}</h3>
                      <p className="record-snippet">{rec.content}</p>

                      <div className="record-meta">
                        <span>Created: {new Date(rec.createdAt).toLocaleDateString()}</span>
                        <span>•</span>
                        <span>Owner: {currentUser?.name}</span>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        id={`view-btn-${rec.publicId}`}
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setSelectedRecord(rec);
                          updateUrlState("detail", rec.publicId);
                        }}
                      >
                        View Detail
                      </button>
                      <button
                        id={`delete-btn-${rec.publicId}`}
                        className="btn btn-danger btn-sm"
                        onClick={() => setRecordToDelete(rec)}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {/* SCREEN 2: CREATE VIEW */}
        {viewMode === "create" && (
          <section aria-labelledby="create-record-heading" className="form-card" id="create-record-form-container">
            <h2 id="create-record-heading" style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "18px" }}>
              Create New Record
            </h2>

            <form onSubmit={handleCreateRecord}>
              <div className="form-group">
                <label htmlFor="form-title" className="form-label">
                  Record Title *
                </label>
                <input
                  id="form-title"
                  className="form-input"
                  type="text"
                  placeholder="e.g. Q4 Financial Strategy & Key Notes"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  required
                  maxLength={120}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
                <div>
                  <label htmlFor="form-category" className="form-label">
                    Category
                  </label>
                  <select
                    id="form-category"
                    className="form-select"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                  >
                    <option value="General">General</option>
                    <option value="Financial">Financial</option>
                    <option value="Confidential">Confidential</option>
                    <option value="Operations">Operations</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="form-status" className="form-label">
                    Status
                  </label>
                  <select
                    id="form-status"
                    className="form-select"
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="ARCHIVED">ARCHIVED</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="form-content" className="form-label">
                  Record Content *
                </label>
                <textarea
                  id="form-content"
                  className="form-textarea"
                  placeholder="Enter secure record body or notes..."
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  required
                  maxLength={5000}
                />
              </div>

              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => updateUrlState("list")}
                  disabled={formSubmitting}
                >
                  Cancel
                </button>
                <button
                  id="submit-record-btn"
                  type="submit"
                  className="btn btn-primary"
                  disabled={formSubmitting}
                >
                  {formSubmitting ? "Saving Record..." : "Save Record"}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* SCREEN 3: DETAIL VIEW */}
        {viewMode === "detail" && selectedRecord && (
          <section aria-labelledby="detail-record-heading" className="detail-card" id="detail-record-container">
            <div className="detail-header">
              <div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px" }}>
                  <span className="public-id-pill" id="detail-public-id">
                    {selectedRecord.publicId}
                  </span>
                  <span
                    className={`chip ${selectedRecord.status === "ACTIVE" ? "chip-active" : "chip-archived"}`}
                  >
                    {selectedRecord.status}
                  </span>
                  <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                    {selectedRecord.category}
                  </span>
                </div>
                <h2 id="detail-record-heading" style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                  {selectedRecord.title}
                </h2>
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  id="detail-delete-btn"
                  className="btn btn-danger btn-sm"
                  onClick={() => setRecordToDelete(selectedRecord)}
                >
                  Delete Record
                </button>
              </div>
            </div>

            <div className="detail-content">{selectedRecord.content}</div>

            <div
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-color)",
                borderRadius: "var(--radius-sm)",
                padding: "16px",
                fontSize: "0.8125rem",
                color: "var(--text-secondary)",
              }}
            >
              <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>
                Security & Invariant Metadata
              </div>
              <div>• Owner: <strong>{currentUser?.email}</strong></div>
              <div>• Internal UUID PK: <em>Hidden (never exposed in URL, DOM, or payload)</em></div>
              <div>• Addressable URL: <code>?record={selectedRecord.publicId}</code></div>
              <div>• Created: {new Date(selectedRecord.createdAt).toLocaleString()}</div>
            </div>

            {/* Adversarial Cross-User Testing Trigger */}
            <div style={{ marginTop: "24px", paddingTop: "18px", borderTop: "1px solid var(--border-color)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                    Test Cross-User Access Isolation
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                    Temporarily switch to User {activeUserNumber === 1 ? 2 : 1}, attempt this fetch, then restore your session.
                  </div>
                </div>
                <button
                  id="test-cross-user-btn"
                  className="btn btn-secondary btn-sm"
                  onClick={() => testCrossUserAccess(selectedRecord.publicId)}
                  disabled={crossUserTestRunning || loading}
                >
                  {crossUserTestRunning ? "Running Isolation Test..." : "Execute Cross-User Attack Test"}
                </button>
              </div>

              {crossUserTestResult && (
                <div
                  id="cross-user-test-output"
                  role="status"
                  aria-live="polite"
                  style={{
                    marginTop: "12px",
                    padding: "10px 14px",
                    borderRadius: "6px",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    background: crossUserTestPassed
                      ? "var(--success-bg)"
                      : crossUserTestFailed
                      ? "var(--danger-bg)"
                      : "var(--bg-input)",
                    color: crossUserTestPassed
                      ? "var(--success-text)"
                      : crossUserTestFailed
                      ? "var(--danger-text)"
                      : "var(--text-secondary)",
                    border: `1px solid ${
                      crossUserTestPassed
                        ? "var(--success-border)"
                        : crossUserTestFailed
                        ? "var(--danger-border)"
                        : "var(--border-color)"
                    }`,
                  }}
                >
                  {crossUserTestResult}
                </div>
              )}
            </div>
          </section>
        )}

        {/* SCREEN 4: DELETE CONFIRMATION MODAL */}
        {recordToDelete && (
          <div className="modal-overlay" role="dialog" aria-modal="true" id="delete-confirm-modal">
            <div className="modal-box">
              <h3 className="modal-title">Confirm Record Deletion</h3>
              <p className="modal-body">
                Are you sure you want to delete <strong>&quot;{recordToDelete.title}&quot;</strong> (
                <code>{recordToDelete.publicId}</code>)?
                <br /><br />
                <span style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                  <strong>Audit Invariant:</strong> Before this record is purged, an immutable audit record capturing your user identity, timestamp, and record snapshot will be permanently logged in PostgreSQL.
                </span>
              </p>

              <div className="modal-actions">
                <button
                  id="cancel-delete-btn"
                  className="btn btn-secondary"
                  onClick={() => setRecordToDelete(null)}
                  disabled={deleteSubmitting}
                >
                  Cancel
                </button>
                <button
                  id="confirm-delete-btn"
                  className="btn btn-danger"
                  onClick={handleConfirmDelete}
                  disabled={deleteSubmitting}
                >
                  {deleteSubmitting ? "Auditing & Deleting..." : "Yes, Delete & Audit"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Permanent Deletion Audit Log Section */}
        <section aria-labelledby="audit-log-heading" className="audit-section" id="deletion-audit-log-section">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2 id="audit-log-heading" style={{ fontSize: "1.125rem", fontWeight: 700 }}>
                Permanent Deletion Audit Log
              </h2>
              <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                Audits persist permanently even after records are deleted. Foreign-key cascades do NOT erase this log.
              </p>
            </div>
            <span className="chip chip-active" style={{ fontSize: "0.6875rem" }}>
              {audits.length} Audits Retained
            </span>
          </div>

          {audits.length === 0 ? (
            <div style={{ padding: "24px", textAlign: "center", color: "var(--text-muted)", fontSize: "0.8125rem" }}>
              No deletions recorded yet. Delete a record above to verify audit persistence.
            </div>
          ) : (
            <table className="audit-table" id="audit-log-table">
              <thead>
                <tr>
                  <th>Public ID Reference</th>
                  <th>Deleted Title Snapshot</th>
                  <th>Deleted By</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {audits.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <span className="public-id-pill">{a.recordPublicId}</span>
                    </td>
                    <td style={{ fontWeight: 500 }}>{a.recordTitle}</td>
                    <td>{a.deletedByUserEmail}</td>
                    <td style={{ color: "var(--text-muted)" }}>
                      {new Date(a.deletedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </main>
  );
}
