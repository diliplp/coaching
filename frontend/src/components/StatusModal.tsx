interface StatusModalProps {
  status: string;
  defaultStatus: string;
  onClose: () => void;
}

export function StatusModal({ status, defaultStatus, onClose }: StatusModalProps) {
  if (!status || status === defaultStatus) return null;

  const isProcessing = status.includes("...") || 
                       status.toLowerCase().includes("ing") || 
                       status.toLowerCase().includes("analyzing") || 
                       status.toLowerCase().includes("generating") ||
                       status.toLowerCase().includes("working");
                       
  const isError = status.toLowerCase().includes("fail") || 
                  status.toLowerCase().includes("error") || 
                  status.toLowerCase().includes("unable") || 
                  status.toLowerCase().includes("not found");
                  
  const isSuccess = !isProcessing && !isError;

  return (
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
        maxWidth: "420px",
        textAlign: "center",
        animation: "scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
        color: "#1e293b"
      }}>
        {isProcessing && (
          <div style={{ marginBottom: "1.25rem" }}>
            <div style={{
              width: "50px",
              height: "50px",
              border: "4px solid rgba(0, 112, 243, 0.1)",
              borderTop: "4px solid #0070f3",
              borderRadius: "50%",
              margin: "0 auto",
              animation: "spin 1s linear infinite"
            }} />
          </div>
        )}

        {isSuccess && (
          <div style={{ marginBottom: "1.25rem", color: "#10b981" }}>
            <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto" }}>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
        )}

        {isError && (
          <div style={{ marginBottom: "1.25rem", color: "#ef4444" }}>
            <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto" }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
        )}

        <h3 style={{ 
          fontSize: "1.25rem", 
          fontWeight: "600", 
          marginBottom: "0.75rem",
          color: isError ? "#ef4444" : (isSuccess ? "#10b981" : "#0070f3")
        }}>
          {isProcessing ? "Processing..." : (isSuccess ? "Success!" : "Notification")}
        </h3>

        <p style={{ 
          fontSize: "0.95rem", 
          lineHeight: "1.5", 
          color: "#475569",
          marginBottom: isProcessing ? 0 : "1.5rem"
        }}>
          {status}
        </p>

        {!isProcessing && (
          <button 
            onClick={onClose}
            className="primary-button"
            style={{ 
              width: "100%", 
              padding: "10px 0", 
              borderRadius: "10px",
              fontWeight: "600",
              background: isError ? "#ef4444" : (isSuccess ? "#10b981" : "var(--color-primary)")
            }}
          >
            Okay
          </button>
        )}
      </div>
    </div>
  );
}
