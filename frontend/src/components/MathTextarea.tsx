import { useRef } from "react";
import { RichText } from "./RichText";

interface MathTextareaProps {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  required?: boolean;
}

const TOOLBAR = [
  {
    group: "Wrap",
    items: [
      { label: "$ · $",    before: "$",           after: "$",    tip: "Inline math" },
      { label: "$$ · $$",  before: "$$",          after: "$$",   tip: "Block math" },
    ],
  },
  {
    group: "Structure",
    items: [
      { label: "a/b",  before: "\\frac{",  after: "}{}",   tip: "Fraction — selection becomes numerator" },
      { label: "√",    before: "\\sqrt{",  after: "}",     tip: "Square root" },
      { label: "xⁿ",   before: "^{",       after: "}",     tip: "Superscript / power" },
      { label: "xₙ",   before: "_{",       after: "}",     tip: "Subscript" },
      { label: "( )",  before: "\\left(",  after: "\\right)", tip: "Auto-sized parentheses" },
    ],
  },
  {
    group: "Greek",
    items: [
      { label: "α",  before: "\\alpha ",   after: "", tip: "alpha" },
      { label: "β",  before: "\\beta ",    after: "", tip: "beta" },
      { label: "γ",  before: "\\gamma ",   after: "", tip: "gamma" },
      { label: "δ",  before: "\\delta ",   after: "", tip: "delta" },
      { label: "θ",  before: "\\theta ",   after: "", tip: "theta" },
      { label: "λ",  before: "\\lambda ",  after: "", tip: "lambda" },
      { label: "μ",  before: "\\mu ",      after: "", tip: "mu" },
      { label: "π",  before: "\\pi ",      after: "", tip: "pi" },
      { label: "σ",  before: "\\sigma ",   after: "", tip: "sigma" },
      { label: "ω",  before: "\\omega ",   after: "", tip: "omega" },
      { label: "Δ",  before: "\\Delta ",   after: "", tip: "Delta" },
      { label: "Σ",  before: "\\Sigma ",   after: "", tip: "Sigma" },
      { label: "Ω",  before: "\\Omega ",   after: "", tip: "Omega" },
    ],
  },
  {
    group: "Operators",
    items: [
      { label: "±",  before: "\\pm ",      after: "", tip: "plus-minus" },
      { label: "×",  before: "\\times ",   after: "", tip: "times" },
      { label: "÷",  before: "\\div ",     after: "", tip: "divide" },
      { label: "≠",  before: "\\neq ",     after: "", tip: "not equal" },
      { label: "≤",  before: "\\leq ",     after: "", tip: "less or equal" },
      { label: "≥",  before: "\\geq ",     after: "", tip: "greater or equal" },
      { label: "≈",  before: "\\approx ",  after: "", tip: "approximately" },
      { label: "∞",  before: "\\infty ",   after: "", tip: "infinity" },
      { label: "∝",  before: "\\propto ",  after: "", tip: "proportional to" },
      { label: "→",  before: "\\rightarrow ", after: "", tip: "right arrow" },
      { label: "⇌",  before: "\\rightleftharpoons ", after: "", tip: "equilibrium arrows" },
    ],
  },
  {
    group: "Calculus",
    items: [
      { label: "∫",    before: "\\int ",       after: "", tip: "integral" },
      { label: "∑",    before: "\\sum ",       after: "", tip: "summation" },
      { label: "d/dx", before: "\\frac{d}{dx}", after: "", tip: "derivative" },
      { label: "lim",  before: "\\lim_{x \\to 0} ", after: "", tip: "limit" },
    ],
  },
];

export function MathTextarea({ value, onChange, rows = 4, placeholder, required }: MathTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function insert(before: string, after: string) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const selected = value.substring(start, end);
    const newValue = value.substring(0, start) + before + selected + after + value.substring(end);
    onChange(newValue);
    // Restore cursor: if there was a selection, place after full insertion; otherwise inside the wrapper
    const cursorPos = selected.length > 0
      ? start + before.length + selected.length + after.length
      : start + before.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(cursorPos, cursorPos);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {/* Symbol toolbar */}
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "6px",
        padding: "8px",
        background: "var(--color-bg-secondary, #f8f9fa)",
        border: "1px solid var(--color-border, #dee2e6)",
        borderRadius: "6px 6px 0 0",
        borderBottom: "none",
      }}>
        {TOOLBAR.map(group => (
          <div key={group.group} style={{ display: "flex", alignItems: "center", gap: "3px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.65rem", color: "var(--color-text-muted, #888)", marginRight: "2px", whiteSpace: "nowrap" }}>
              {group.group}
            </span>
            {group.items.map(item => (
              <button
                key={item.label}
                type="button"
                title={item.tip}
                onClick={() => insert(item.before, item.after)}
                style={{
                  padding: "2px 7px",
                  fontSize: "0.78rem",
                  fontFamily: "serif",
                  background: "#fff",
                  border: "1px solid var(--color-border, #ccc)",
                  borderRadius: "3px",
                  cursor: "pointer",
                  lineHeight: "1.6",
                  minWidth: "28px",
                  textAlign: "center",
                }}
              >
                {item.label}
              </button>
            ))}
            <span style={{ borderRight: "1px solid var(--color-border, #ddd)", height: "20px", margin: "0 4px" }} />
          </div>
        ))}
      </div>

      {/* Raw LaTeX textarea */}
      <textarea
        ref={ref}
        rows={rows}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        style={{
          fontFamily: "monospace",
          fontSize: "0.88rem",
          borderRadius: "0",
          border: "1px solid var(--color-border, #ccc)",
          padding: "8px",
          resize: "vertical",
          width: "100%",
          boxSizing: "border-box",
        }}
      />

      {/* Live rendered preview */}
      {value.trim() && (
        <div style={{
          padding: "10px 12px",
          background: "#fafafa",
          border: "1px solid var(--color-border, #dee2e6)",
          borderRadius: "0 0 6px 6px",
          borderTop: "1px dashed var(--color-border, #dee2e6)",
          fontSize: "0.9rem",
        }}>
          <span style={{ fontSize: "0.65rem", color: "var(--color-text-muted, #888)", display: "block", marginBottom: "4px" }}>
            PREVIEW
          </span>
          <RichText content={value} />
        </div>
      )}
    </div>
  );
}
