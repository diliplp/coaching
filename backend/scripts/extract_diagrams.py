import sys
import os
import io
import json
import cv2
import numpy as np
import fitz  # PyMuPDF
from PIL import Image

def is_inside(box1, box2):
    x1, y1, w1, h1 = box1
    x2, y2, w2, h2 = box2
    return x1 >= x2 and y1 >= y2 and (x1 + w1) <= (x2 + w2) and (y1 + h1) <= (y2 + h2)

def get_ans_positions(page):
    """
    Return a sorted list of normalised y-positions where an answer marker ('Ans', 'Ans.', 'Ans :')
    appears on the page. These mark the boundary between a question region and its solution region.
    """
    ph = page.rect.height
    ans_ys = []
    try:
        blocks = page.get_text("dict")["blocks"]
        for blk in blocks:
            for line in blk.get("lines", []):
                for span in line.get("spans", []):
                    txt = span.get("text", "").strip()
                    lower = txt.lower()
                    # Accept "Ans", "Ans.", "Ans :", "Ans:" — period/colon may be in next span
                    if lower.startswith("ans") and len(txt) <= 10:
                        y_norm = span["bbox"][1] / ph  # top of span
                        ans_ys.append(y_norm)
    except Exception:
        pass
    return sorted(ans_ys)


def is_question_image(img_y1, img_y2, ans_positions):
    """
    Classify whether an image is in a question region or a solution/explanation region.

    Rule: an image is a SOLUTION image if it appears BELOW an Ans. marker (answer boundary).
    An image is a QUESTION image if it appears BEFORE the nearest Ans. below it.

    Uses both above/below Ans. markers for precise classification.
    """
    img_center = (img_y1 + img_y2) / 2
    ans_above = [y for y in ans_positions if y <= img_center]
    ans_below = [y for y in ans_positions if y > img_center]

    if not ans_above and not ans_below:
        # No Ans. markers on page — treat upper 75% as question area
        return img_center < 0.75

    if not ans_above:
        # No Ans. above → image precedes any answer on this page.
        # Exception: large images in the top 15% of page are likely continuation of the
        # previous page's solution (the solution spills onto the next page).
        img_area = (img_y2 - img_y1) * 1  # width assumed ~1 for this heuristic (rough)
        actual_area = img_y2 - img_y1  # fractional height only
        if img_y1 < 0.15 and actual_area > 0.08:
            return False  # Large image near top = solution continuation, not a new question
        nearest_below = min(ans_below)
        return (nearest_below - img_center) < 0.60

    # There's an Ans. above this image — image is in solution area UNLESS
    # it's closer to the next Ans. below than to the last Ans. above
    # (meaning a new question block started between them).
    nearest_above = max(ans_above)
    dist_above = img_center - nearest_above

    if not ans_below:
        # Below the last Ans. on the page — solution area
        return False

    nearest_below = min(ans_below)
    dist_below = nearest_below - img_center
    # Question image if it's significantly closer to the next answer than to the last answer
    return dist_below < dist_above * 0.7


def extract_embedded_images(doc, output_dir, book_id):
    """
    Extract images directly from the PDF's internal image table.
    Works for digital PDFs where structural formulas are stored as embedded raster images.
    Returns list of diagram dicts, or empty list if no useful images found.

    Each result includes isQuestionImage: True if the image is in a question region
    (above an Ans. marker), False if it's in a solution/explanation region.
    """
    total_pages = len(doc)

    # Pre-compute Ans. positions per page for question/solution classification
    page_ans_positions = {}
    for page_idx in range(total_pages):
        page_ans_positions[page_idx] = get_ans_positions(doc[page_idx])

    # First pass: collect every (xref, page_idx, bbox_normalised) triple.
    # Track how many pages each xref appears on to identify watermarks.
    xref_page_count = {}   # xref -> set of page indices
    all_items = []         # (page_idx, xref, [y1,x1,y2,x2])

    for page_idx in range(total_pages):
        page = doc[page_idx]
        pw, ph = page.rect.width, page.rect.height
        for img in page.get_images(full=True):
            xref = img[0]
            rects = page.get_image_rects(xref)
            if not rects:
                continue
            r = rects[0]
            y1, x1, y2, x2 = r.y0 / ph, r.x0 / pw, r.y1 / ph, r.x1 / pw
            xref_page_count.setdefault(xref, set()).add(page_idx)
            all_items.append((page_idx, xref, [y1, x1, y2, x2]))

    if not all_items:
        return []  # No embedded images — must be scanned or vector-only PDF

    # Watermark xrefs: appear on more than 60 % of pages
    watermark_xrefs = {
        xref for xref, pages in xref_page_count.items()
        if len(pages) > total_pages * 0.60
    }

    results = []
    diagram_idx = 0
    for page_idx, xref, (y1, x1, y2, x2) in all_items:
        # Skip watermarks (recurring images)
        if xref in watermark_xrefs:
            continue
        # Skip header / footer regions (use center of image, not just y2)
        img_center_y = (y1 + y2) / 2
        if img_center_y <= 0.12 or img_center_y >= 0.92:
            continue
        # Skip full-page backgrounds (area > 70 %)
        if (y2 - y1) * (x2 - x1) > 0.70:
            continue
        # Skip tiny decorative images (area < 0.5 %)
        if (y2 - y1) * (x2 - x1) < 0.005:
            continue

        filename = f"{book_id}_p{page_idx + 1}_d{diagram_idx + 1}.png"
        filepath = os.path.join(output_dir, filename)
        saved = False

        try:
            pix = fitz.Pixmap(doc, xref)

            # Stencil/mask images have no colorspace — render from page instead
            if pix.colorspace is None:
                del pix
                raise ValueError("stencil")

            # Convert any non-RGB colorspace (CMYK, Gray, etc.) to RGB
            if pix.colorspace != fitz.csRGB:
                pix = fitz.Pixmap(fitz.csRGB, pix)

            if pix.alpha:
                # Composite over white background via Pillow so transparent areas
                # become white instead of black (dropping alpha gives RGB=0 = black)
                pil_img = Image.frombytes("RGBA", (pix.width, pix.height), pix.samples)
                del pix
                bg = Image.new("RGB", pil_img.size, (255, 255, 255))
                bg.paste(pil_img, mask=pil_img.split()[3])
                bg.save(filepath)
            else:
                # Sanity check before saving: skip near-black images (corrupt decode)
                raw = np.frombuffer(pix.samples, dtype=np.uint8)
                is_black = raw.size > 0 and raw.mean() < 12
                pix.save(filepath)
                del pix
                if is_black:
                    os.remove(filepath)
                    raise ValueError("black")

            saved = True
        except Exception:
            pass

        if not saved:
            # Fallback: render the exact bounding-box region from the page at 2x zoom.
            # Always produces correct RGB regardless of color space or encoding.
            try:
                page = doc[page_idx]
                pw, ph = page.rect.width, page.rect.height
                clip = fitz.Rect(x1 * pw, y1 * ph, x2 * pw, y2 * ph)
                render_pix = page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0), clip=clip, alpha=False)
                render_pix.save(filepath)
                del render_pix
                saved = True
            except Exception:
                pass

        if not saved:
            continue

        ans_pos = page_ans_positions.get(page_idx, [])
        is_q_img = is_question_image(y1, y2, ans_pos)

        results.append({
            "page": page_idx + 1,
            "url": f"/uploads/diagrams/{filename}",
            "bbox": [y1, x1, y2, x2],
            "isQuestionImage": is_q_img
        })
        diagram_idx += 1

    return results


def extract_via_opencv(doc, output_dir, book_id):
    """
    Fallback for scanned PDFs: render each page and use OpenCV contour detection.
    Watermark regions (top 15 % / bottom 10 % of page) are excluded.
    Images whose bounding-box centre appears on more than 60 % of pages at the
    same relative position are treated as recurring watermarks and skipped.
    """
    total_pages = len(doc)

    # Two-pass: first collect all candidates, then filter recurring ones.
    page_candidates = []  # per-page list of (x,y,cw,ch,img_height,img_width)
    rendered_pages = []   # keep rendered images for second pass

    for page_idx in range(total_pages):
        page = doc[page_idx]
        zoom = 1.5
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        img_data = pix.tobytes("png")
        del pix
        nparr = np.frombuffer(img_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        del img_data, nparr
        h, w = img.shape[:2]

        # Only search the middle 75 % of the page (skip top 15 % and bottom 10 %)
        y_start = int(h * 0.15)
        y_end   = int(h * 0.90)
        roi = img[y_start:y_end, :]

        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 50, 150)
        contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        del gray, edges

        candidates = []
        for cnt in contours:
            x, y_roi, cw, ch = cv2.boundingRect(cnt)
            y = y_roi + y_start          # map back to full-image coordinates
            if cw > 80 and ch > 80 and cw < w * 0.8 and ch < h * 0.75:
                candidates.append((x, y, cw, ch))

        # Remove boxes nested inside larger ones
        filtered = []
        for box in candidates:
            dominated = any(
                is_inside(box, other)
                for other in candidates
                if other != box and other[2] * other[3] > box[2] * box[3]
            )
            if dominated:
                continue
            near_dup = any(
                abs(box[0] - fb[0]) < 10 and
                abs(box[1] - fb[1]) < 10 and
                abs(box[2] - fb[2]) < 10
                for fb in filtered
            )
            if not near_dup:
                filtered.append(box)

        page_candidates.append(filtered)
        rendered_pages.append((img, h, w))
        import gc; gc.collect()

    # Identify recurring bounding-box centres (watermarks)
    # A centre is "recurring" if a very similar centre appears on >60% of pages.
    def centre(box):
        return (box[0] + box[2] / 2, box[1] + box[3] / 2)

    def near(c1, c2, tol=0.05):
        """Are two normalised centres within tol of each other?"""
        return abs(c1[0] - c2[0]) < tol and abs(c1[1] - c2[1]) < tol

    # Build normalised centres per page
    norm_centres_per_page = []
    for page_idx, boxes in enumerate(page_candidates):
        _, h, w = rendered_pages[page_idx]
        norm_centres_per_page.append([
            (centre(b)[0] / w, centre(b)[1] / h) for b in boxes
        ])

    def is_watermark_centre(nc, page_idx):
        count = sum(
            1 for pi, ncs in enumerate(norm_centres_per_page)
            if pi != page_idx and any(near(nc, other) for other in ncs)
        )
        return count > total_pages * 0.50

    results = []
    diagram_idx = 0
    for page_idx, (boxes) in enumerate(page_candidates):
        img, h, w = rendered_pages[page_idx]
        for box in boxes:
            x, y, cw, ch = box
            nc = (centre(box)[0] / w, centre(box)[1] / h)
            if is_watermark_centre(nc, page_idx):
                continue

            pad = 10
            x1 = max(0, x - pad);  y1 = max(0, y - pad)
            x2 = min(w, x + cw + pad); y2 = min(h, y + ch + pad)
            crop = img[y1:y2, x1:x2]

            filename = f"{book_id}_p{page_idx + 1}_d{diagram_idx + 1}.png"
            cv2.imwrite(os.path.join(output_dir, filename), crop)
            del crop

            results.append({
                "page": page_idx + 1,
                "url": f"/uploads/diagrams/{filename}",
                "bbox": [y1 / h, x1 / w, y2 / h, x2 / w]
            })
            diagram_idx += 1

        del img
        import gc; gc.collect()

    return results


def detect_and_crop_diagrams(pdf_path, output_dir, book_id):
    doc = fitz.open(pdf_path)
    os.makedirs(output_dir, exist_ok=True)

    # Try native embedded-image extraction first (precise for digital PDFs)
    results = extract_embedded_images(doc, output_dir, book_id)

    if results:
        print(f"Extraction complete (embedded). Found {len(results)} diagrams.")
    else:
        # Fall back to OpenCV rendering + contour detection (for scanned PDFs)
        results = extract_via_opencv(doc, output_dir, book_id)
        print(f"Extraction complete (OpenCV). Found {len(results)} diagrams.")

    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python extract_diagrams.py <pdf_path> <output_dir> <book_id>")
        sys.exit(1)
    detect_and_crop_diagrams(sys.argv[1], sys.argv[2], sys.argv[3])
