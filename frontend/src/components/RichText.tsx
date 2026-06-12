import React, { useEffect, useRef, useState } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import "katex/contrib/mhchem";
// @ts-ignore
import SmiDrawer from "smiles-drawer";
import { buildPublicAssetUrl } from "../api/client";

export function RichText({ content }: { content: string }) {
  // SmiDrawer will be used by the SmilesRenderer component

  const tokens: Array<{ type: "text" | "math-block" | "math-inline" | "smiles" | "image"; value: string }> = [];
  let remaining = content || "";

  while (remaining.length > 0) {
    const blockMathIdx = remaining.indexOf("$$");
    const blockMathBracketIdx = remaining.indexOf("\\[");
    const inlineMathIdx = remaining.indexOf("$");
    const inlineMathBracketIdx = remaining.indexOf("\\(");
    const smilesIdx = remaining.indexOf("[SMILES:");
    const imageIdx = remaining.indexOf("[IMAGE:");

    const matches = [
      { type: "math-block", idx: blockMathIdx, tag: "$$", endTag: "$$" },
      { type: "math-block", idx: blockMathBracketIdx, tag: "\\[", endTag: "\\]" },
      { type: "math-inline", idx: inlineMathIdx, tag: "$", endTag: "$" },
      { type: "math-inline", idx: inlineMathBracketIdx, tag: "\\(", endTag: "\\)" },
      { type: "smiles", idx: smilesIdx, tag: "[SMILES:", endTag: "]" },
      { type: "image", idx: imageIdx, tag: "[IMAGE:", endTag: "]" },
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

    if (match.type === "smiles") {
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

        if (token.type === "image") {
          return (
            <DiagramImage key={i} src={buildPublicAssetUrl(token.value)} />
          );
        }

        return null;
      })}
    </div>
  );
}

function DiagramImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <div style={{ margin: "12px 0", textAlign: "center" }}>
      <img
        src={src}
        alt="Question Diagram"
        onError={() => setFailed(true)}
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

        const drawer = new DrawerConstructor({ width: 200, height: 200, terminalCarbons: true });
        parseFunc(
          cleanSmiles,
          (tree: any) => {
            drawer.draw(tree, canvasRef.current, "light", false);
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
