import React, { useEffect, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import "katex/contrib/mhchem";
// @ts-ignore
import SmiDrawer from "smiles-drawer";
import { buildPublicAssetUrl } from "../api/client";

export function RichText({ content }: { content: string }) {
  const tokens: Array<{ type: "text" | "math-block" | "math-inline" | "smiles" | "image" | "graph"; value: string }> = [];
  let remaining = content || "";

  while (remaining.length > 0) {
    const blockMathIdx = remaining.indexOf("$$");
    const blockMathBracketIdx = remaining.indexOf("\\[");
    const inlineMathIdx = remaining.indexOf("$");
    const inlineMathBracketIdx = remaining.indexOf("\\(");
    const smilesIdx = remaining.indexOf("[SMILES:");
    const imageIdx = remaining.indexOf("[IMAGE:");
    const graphIdx = remaining.indexOf("[GRAPH:");

    const matches = [
      { type: "math-block", idx: blockMathIdx, tag: "$$", endTag: "$$" },
      { type: "math-block", idx: blockMathBracketIdx, tag: "\\[", endTag: "\\]" },
      { type: "math-inline", idx: inlineMathIdx, tag: "$", endTag: "$" },
      { type: "math-inline", idx: inlineMathBracketIdx, tag: "\\(", endTag: "\\)" },
      { type: "smiles", idx: smilesIdx, tag: "[SMILES:", endTag: "]" },
      { type: "image", idx: imageIdx, tag: "[IMAGE:", endTag: "]" },
      { type: "graph", idx: graphIdx, tag: "[GRAPH:", endTag: "]" },
    ]
      .filter((m) => m.idx !== -1)
      .sort((a, b) => a.idx - b.idx);

    let earliestMatch = matches.length > 0 ? matches[0] : null;

    if (earliestMatch && earliestMatch.type === "math-inline") {
      const blockMatch = matches.find((m) => m.type === "math-block" && m.idx === earliestMatch!.idx);
      if (blockMatch) {
        earliestMatch = blockMatch;
      }
    }

    if (!earliestMatch) {
      tokens.push({ type: "text", value: remaining });
      break;
    }

    const match = earliestMatch;

    if (match.idx > 0) {
      tokens.push({ type: "text", value: remaining.slice(0, match.idx) });
    }

    const contentStart = match.idx + match.tag.length;
    let endIdx = -1;

    // Depth-track [ ] for smiles and graph tokens (content may contain nested brackets)
    if (match.type === "smiles" || match.type === "graph") {
      let depth = 1;
      let i = contentStart;
      while (i < remaining.length && depth > 0) {
        if (remaining[i] === "[") depth++;
        else if (remaining[i] === "]") depth--;
        i++;
      }
      if (depth === 0) {
        endIdx = i - 1;
      }
    } else {
      endIdx = remaining.indexOf(match.endTag, contentStart);
    }

    if (endIdx === -1) {
      tokens.push({ type: "text", value: remaining });
      break;
    }

    const matchContent = remaining.slice(contentStart, endIdx).trim();

    tokens.push({ type: match.type as any, value: matchContent });
    remaining = remaining.slice(endIdx + match.endTag.length);
  }

  return (
    <div style={{ display: "inline", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      {tokens.map((token, i) => {
        if (token.type === "text") return <span key={i}>{token.value}</span>;

        if (token.type === "math-block") {
          try {
            const html = katex.renderToString(token.value, { displayMode: true, throwOnError: false });
            return <div key={i} dangerouslySetInnerHTML={{ __html: html }} />;
          } catch (e) {
            return <div key={i}>{token.value}</div>;
          }
        }

        if (token.type === "math-inline") {
          try {
            const html = katex.renderToString(token.value, { displayMode: false, throwOnError: false });
            return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
          } catch (e) {
            return <span key={i}>{token.value}</span>;
          }
        }

        if (token.type === "smiles") {
          return <SmilesRenderer key={i} smiles={token.value} />;
        }

        if (token.type === "graph") {
          return <GraphRenderer key={i} spec={token.value} />;
        }

        if (token.type === "image") {
          return (
            <div key={i} style={{ margin: "12px 0", textAlign: "center" }}>
              <img
                src={buildPublicAssetUrl(token.value)}
                alt="Question Diagram"
                style={{
                  maxWidth: "100%",
                  maxHeight: "350px",
                  borderRadius: "8px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                  border: "1px solid var(--color-border)",
                  padding: "6px",
                  background: "#fff",
                  display: "block",
                  margin: "0 auto"
                }}
              />
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

function SmilesRenderer({ smiles }: { smiles: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cleanSmiles = smiles.trim();

  useEffect(() => {
    if (canvasRef.current) {
      try {
        const DrawerConstructor = SmiDrawer.Drawer || (SmiDrawer as any).default?.Drawer;
        const parseFunc = SmiDrawer.parse || (SmiDrawer as any).default?.parse;

        if (!DrawerConstructor || !parseFunc) {
          console.error("SmilesDrawer components not found in import:", SmiDrawer);
          return;
        }

        const drawer = new DrawerConstructor({
          width: 200,
          height: 200,
          terminalCarbons: true,
          themes: {
            custom: {
              C: "#555555",
              O: "#cc2200",
              N: "#1a5cb4",
              H: "#999999",
              S: "#bb8800",
              P: "#cc6600",
              F: "#009999",
              Cl: "#007700",
              Br: "#884400",
              I: "#550099",
              BACKGROUND: "#f9f9f9",
            },
          },
        });
        parseFunc(
          cleanSmiles,
          (tree: any) => {
            drawer.draw(tree, canvasRef.current, "custom", false);
          },
          (err: any) => {
            console.error("Failed to parse/render smiles:", cleanSmiles, err);
          }
        );
      } catch (e) {
        console.error("Failed to initialize smiles drawer:", e);
      }
    }
  }, [cleanSmiles]);

  return (
    <span style={{ display: "inline-block", margin: "10px", verticalAlign: "middle", textAlign: "center", border: "1px solid var(--color-border)", borderRadius: "8px", padding: "10px", background: "#f9f9f9" }}>
      <canvas ref={canvasRef} data-smiles={cleanSmiles} width="200" height="200" style={{ maxWidth: "100%", display: "block", margin: "0 auto" }}></canvas>
      <span style={{ fontSize: "0.7rem", color: "var(--color-text-muted)", fontFamily: "monospace", display: "block", marginTop: "5px" }}>{cleanSmiles}</span>
    </span>
  );
}

// Parses: "line;x=0 1 2 3;y=0 5 10 15;xl=Time (s);yl=Velocity (m/s);title=v-t Graph"
// Multi-trace: "line;x=0 1 2 3;y1=0 5 10 15;y2=0 2 4 6;n1=Body A;n2=Body B;xl=Time;yl=Velocity"
function GraphRenderer({ spec }: { spec: string }) {
  const parts: Record<string, string> = {};
  spec.split(";").forEach((seg) => {
    const eq = seg.indexOf("=");
    if (eq === -1) {
      parts["type"] = seg.trim();
    } else {
      parts[seg.slice(0, eq).trim()] = seg.slice(eq + 1).trim();
    }
  });

  const parseNums = (s: string) =>
    s.split(/[\s,]+/).map(Number).filter((n) => !isNaN(n));

  const xVals = parseNums(parts.x || "");

  // Collect traces: single y= or multiple y1=, y2=, y3=
  const traces: { y: number[]; name: string; color: string }[] = [];
  const COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706"];

  if (parts.y) {
    traces.push({ y: parseNums(parts.y), name: parts.n || "", color: COLORS[0] });
  } else {
    [1, 2, 3, 4].forEach((i) => {
      if (parts[`y${i}`]) {
        traces.push({ y: parseNums(parts[`y${i}`]), name: parts[`n${i}`] || `Trace ${i}`, color: COLORS[i - 1] });
      }
    });
  }

  if (xVals.length < 2 || traces.length === 0 || traces[0].y.length < 2) {
    return (
      <span style={{ fontSize: "0.8rem", color: "#999", fontStyle: "italic" }}>
        [Graph data insufficient]
      </span>
    );
  }

  const W = 340, H = 230;
  const PAD_L = 52, PAD_R = 20, PAD_T = 30, PAD_B = 44;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const xMin = Math.min(...xVals);
  const xMax = Math.max(...xVals);
  const allY = traces.flatMap((t) => t.y);
  const yMin = Math.min(0, ...allY);
  const yMax = Math.max(...allY);
  const yPad = (yMax - yMin) * 0.08;

  const toSX = (x: number) => PAD_L + ((x - xMin) / (xMax - xMin || 1)) * plotW;
  const toSY = (y: number) => PAD_T + plotH - ((y - yMin) / (yMax - yMin + yPad || 1)) * plotH;

  // Y axis tick values (4 ticks)
  const yTicks = Array.from({ length: 5 }, (_, i) =>
    Math.round(yMin + ((yMax - yMin) / 4) * i)
  );
  const xTicks = xVals.length <= 6 ? xVals : [xVals[0], ...xVals.filter((_, i) => i % Math.ceil(xVals.length / 4) === 0), xVals[xVals.length - 1]];

  return (
    <div style={{ display: "block", margin: "14px 0", textAlign: "center" }}>
      <svg
        width={W}
        height={H}
        style={{
          border: "1px solid #e0e0e0",
          borderRadius: "10px",
          background: "#fafafa",
          display: "inline-block",
        }}
      >
        {/* Title */}
        {parts.title && (
          <text x={W / 2} y={18} textAnchor="middle" fontSize={11} fontWeight="600" fill="#111">
            {parts.title}
          </text>
        )}

        {/* Light grid lines */}
        {yTicks.map((y, i) => (
          <line key={i} x1={PAD_L} y1={toSY(y)} x2={W - PAD_R} y2={toSY(y)} stroke="#e5e7eb" strokeWidth={1} />
        ))}

        {/* Axes */}
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + plotH} stroke="#555" strokeWidth={1.5} />
        <line x1={PAD_L} y1={PAD_T + plotH} x2={W - PAD_R} y2={PAD_T + plotH} stroke="#555" strokeWidth={1.5} />

        {/* Y axis ticks + labels */}
        {yTicks.map((y, i) => (
          <g key={i}>
            <line x1={PAD_L - 4} y1={toSY(y)} x2={PAD_L} y2={toSY(y)} stroke="#555" strokeWidth={1} />
            <text x={PAD_L - 7} y={toSY(y) + 4} textAnchor="end" fontSize={9} fill="#555">
              {y}
            </text>
          </g>
        ))}

        {/* X axis ticks + labels */}
        {xTicks.map((x, i) => (
          <g key={i}>
            <line x1={toSX(x)} y1={PAD_T + plotH} x2={toSX(x)} y2={PAD_T + plotH + 4} stroke="#555" strokeWidth={1} />
            <text x={toSX(x)} y={PAD_T + plotH + 15} textAnchor="middle" fontSize={9} fill="#555">
              {x}
            </text>
          </g>
        ))}

        {/* Data traces */}
        {traces.map((trace, ti) => {
          const pts = xVals
            .map((x, i) => trace.y[i] !== undefined ? `${toSX(x)},${toSY(trace.y[i])}` : null)
            .filter(Boolean)
            .join(" ");
          return (
            <g key={ti}>
              <polyline points={pts} fill="none" stroke={trace.color} strokeWidth={2.2} strokeLinejoin="round" />
              {xVals.map((x, i) =>
                trace.y[i] !== undefined ? (
                  <circle key={i} cx={toSX(x)} cy={toSY(trace.y[i])} r={3} fill={trace.color} />
                ) : null
              )}
            </g>
          );
        })}

        {/* Legend (multi-trace only) */}
        {traces.length > 1 &&
          traces.map((trace, ti) => (
            <g key={ti}>
              <line x1={W - PAD_R - 60} y1={PAD_T + 10 + ti * 16} x2={W - PAD_R - 44} y2={PAD_T + 10 + ti * 16} stroke={trace.color} strokeWidth={2} />
              <text x={W - PAD_R - 40} y={PAD_T + 14 + ti * 16} fontSize={9} fill="#333">
                {trace.name}
              </text>
            </g>
          ))}

        {/* X axis label */}
        {parts.xl && (
          <text x={PAD_L + plotW / 2} y={H - 6} textAnchor="middle" fontSize={10} fill="#333">
            {parts.xl}
          </text>
        )}

        {/* Y axis label (rotated) */}
        {parts.yl && (
          <text
            x={0}
            y={0}
            textAnchor="middle"
            fontSize={10}
            fill="#333"
            transform={`translate(13, ${PAD_T + plotH / 2}) rotate(-90)`}
          >
            {parts.yl}
          </text>
        )}
      </svg>
    </div>
  );
}
