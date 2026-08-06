#!/usr/bin/env python3
"""
Render high-resolution image crops of each question from a PDF.
Uses the PDF text layer to locate question number markers, then renders
a 2.5x-zoom crop from each question's start to the next question's start.
"""
import sys
import os
import json
import re
import fitz  # PyMuPDF


def find_ans_positions(page):
    """
    Return sorted list of y-positions (in pts) where 'Ans' appears on this page.
    These mark the end of a question's options area.
    """
    ans_ys = []
    try:
        for blk in page.get_text("dict")["blocks"]:
            for line in blk.get("lines", []):
                spans = line.get("spans", [])
                if not spans:
                    continue
                span_text = spans[0].get("text", "").strip().lower()
                if span_text.startswith("ans") and len(span_text) <= 10:
                    y = spans[0]["bbox"][1]
                    ans_ys.append(y)
    except Exception:
        pass
    return sorted(ans_ys)


def find_question_positions(doc):
    """
    Scan every page for question-number markers ("1.", "2.", "1)", etc.)
    near the left margin. Returns dict: q_num -> (page_idx, y_top_pts).
    Only the first occurrence of each number is kept (avoids solution repeats).

    Handles two formats:
    a) The number is an isolated span: text == "N." or "N)"
    b) The number starts a combined line:  "N. Question text..."
    """
    found = {}

    for page_idx in range(len(doc)):
        page = doc[page_idx]
        pw = page.rect.width

        blocks = page.get_text("dict")["blocks"]
        for blk in blocks:
            for line in blk.get("lines", []):
                spans = line.get("spans", [])
                if not spans:
                    continue

                first_span = spans[0]
                x0 = first_span.get("bbox", [0])[0]
                y0 = first_span.get("bbox", [0, 0])[1]
                span_text = first_span.get("text", "").strip()
                line_text = "".join(sp.get("text", "") for sp in spans).strip()

                # Format A: isolated number span  "1."  or  "1)"
                # Format B: number at start of combined line  "1. Question..."
                # Capped at 3 digits (1-999) — 2 digits would silently stop detecting
                # question boundaries at #100, making every later question's crop
                # extend until the next 2-digit-or-fewer number it can see, sometimes
                # swallowing several unrelated questions into one oversized image.
                isolated = re.match(r'^(\d{1,3})[.)]$', span_text)
                combined = re.match(r'^(\d{1,3})[.)]\s', line_text)

                m = isolated or combined
                if m and x0 < pw * 0.20:
                    q_num = int(m.group(1))
                    if q_num not in found:
                        found[q_num] = (page_idx, y0)

    return found


def render_crop(doc, page_idx, y_start, y_end, zoom=2.5):
    """Render a horizontal strip of a page at the given zoom level.
    Caller is responsible for any padding on y_start/y_end — the right amount
    depends on whether y_end is anchored to an Ans. marker (safe to pad past)
    or to the next question's start (padding would bleed into its first line)."""
    page = doc[page_idx]
    pw = page.rect.width
    ph = page.rect.height

    clip = fitz.Rect(0, max(0, y_start), pw, min(ph, y_end))

    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat, clip=clip, alpha=False)
    return pix


def extract_question_crops(pdf_path, output_dir, book_id):
    os.makedirs(output_dir, exist_ok=True)
    doc = fitz.open(pdf_path)

    positions = find_question_positions(doc)
    if not positions:
        print(json.dumps([]))
        doc.close()
        return

    sorted_nums = sorted(positions.keys())
    results = []

    # Pre-compute Ans. positions per page (marks the end of each question's options)
    ans_positions_per_page = {}
    for page_idx in range(len(doc)):
        ans_positions_per_page[page_idx] = find_ans_positions(doc[page_idx])

    for i, q_num in enumerate(sorted_nums):
        page_idx, y_start = positions[q_num]
        page = doc[page_idx]
        ph = page.rect.height
        ans_ys = ans_positions_per_page.get(page_idx, [])

        # Find the next question's position (for upper bound)
        if i + 1 < len(sorted_nums):
            next_q_num = sorted_nums[i + 1]
            next_page_idx, next_y = positions[next_q_num]
            max_y = next_y if next_page_idx == page_idx else ph
        else:
            max_y = ph

        # Crop should END at the 'Ans.' line for this question,
        # i.e. the first Ans. marker that is:
        #   - below y_start (after question begins)
        #   - above max_y (before next question or page end)
        pad_top = 6      # pts above question number
        pad_bottom = 10  # pts below last option — only safe when stopping at an Ans. marker

        ans_below = [y for y in ans_ys if y > y_start and y < max_y]
        if ans_below:
            # Stop well before the Ans. line so the answer is not visible in the crop.
            # There's genuine whitespace here, so padding past it is safe.
            y_end = min(ans_below) - 14 + pad_bottom
        else:
            # No Ans. marker on this page (bare question paper) — max_y is the exact
            # y-position where the NEXT question's number starts. Padding past that
            # bleeds its first line into this crop, so stop right at the boundary.
            y_end = max_y

        try:
            pix = render_crop(doc, page_idx, y_start - pad_top, y_end, zoom=2.5)
            filename = f"{book_id}_q{q_num}_crop.png"
            filepath = os.path.join(output_dir, filename)
            pix.save(filepath)
            del pix

            results.append({
                "questionNumber": q_num,
                "page": page_idx + 1,
                "cropUrl": f"/uploads/crops/{filename}",
                # Normalised (0-1) vertical bounds of this question's OWN region —
                # yEnd deliberately stops before the "Ans." marker (see y_end logic
                # above), so a diagram whose bbox falls inside [yStart, yEnd] is
                # provably part of the question itself, never its solution/answer.
                # Lets the diagram-assignment logic in ai-generator.ts match by real
                # page geometry instead of guessing from question order.
                "yStart": round(y_start / ph, 4),
                "yEnd": round(y_end / ph, 4)
            })
        except Exception as e:
            sys.stderr.write(f"[crop] Q{q_num} failed: {e}\n")

    doc.close()
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python extract_question_crops.py <pdf_path> <output_dir> <book_id>", file=sys.stderr)
        sys.exit(1)
    extract_question_crops(sys.argv[1], sys.argv[2], sys.argv[3])
