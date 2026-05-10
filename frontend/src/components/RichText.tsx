import React, { useEffect, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
// @ts-ignore
import SmiDrawer from "smiles-drawer";

export function RichText({ content }: { content: string }) {
  // SmiDrawer will be used by the SmilesRenderer component

  const tokens: Array<{ type: "text" | "math-block" | "math-inline" | "smiles"; value: string }> = [];
  let remaining = content || "";

  while (remaining.length > 0) {
    const blockMathIdx = remaining.indexOf("$$");
    const inlineMathIdx = remaining.indexOf("$");
    const smilesIdx = remaining.indexOf("[SMILES:");

    const matches = [
      { type: "math-block", idx: blockMathIdx, tag: "$$" },
      { type: "math-inline", idx: inlineMathIdx, tag: "$" },
      { type: "smiles", idx: smilesIdx, tag: "[SMILES:" },
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

    let endTag = match.tag;
    let endIdx = -1;

    const contentStart = match.idx + match.tag.length;

    if (match.type === "smiles") {
      endTag = "]";
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
      endIdx = remaining.indexOf(endTag, contentStart);
    }

    if (endIdx === -1) {
      tokens.push({ type: "text", value: remaining });
      break;
    }

    const matchContent = remaining.slice(contentStart, endIdx).trim();

    tokens.push({ type: match.type as any, value: matchContent });
    remaining = remaining.slice(endIdx + endTag.length);
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

        return null;
      })}
    </div>
  );
}

function SmilesRenderer({ smiles }: { smiles: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      try {
        const drawer = new SmiDrawer.Drawer({ width: 150, height: 150, terminalCarbons: true });
        SmiDrawer.parse(
          smiles,
          (tree: any) => {
            drawer.draw(tree, canvasRef.current, "light", false);
          },
          (err: any) => {
            console.error("Failed to parse/render smiles:", smiles, err);
          }
        );
      } catch (e) {
        console.error("Failed to initialize smiles drawer:", e);
      }
    }
  }, [smiles]);

  return (
    <span style={{ display: "inline-block", margin: "0 10px", verticalAlign: "middle", textAlign: "center" }}>
      <canvas ref={canvasRef} data-smiles={smiles} width="150" height="150" style={{ maxWidth: "100%", display: "block", margin: "0 auto" }}></canvas>
      <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", fontFamily: "monospace" }}>{smiles}</span>
    </span>
  );
}
