#!/usr/bin/env python3
"""
PDF crop-based question extractor.
Detects question and option boundaries using PyMuPDF text layout,
crops each region at 300 DPI, uploads as images, and builds question
records with [IMAGE: /uploads/...] references.

Usage:
  python3 scratch/extract_pdf_crops.py prod jeePhysics
  python3 scratch/extract_pdf_crops.py prod all
"""
import sys, os, re, json, time, hashlib, requests
import fitz  # pymupdf

ENV     = sys.argv[1] if len(sys.argv) > 1 else "prod"
SUBJECT = sys.argv[2] if len(sys.argv) > 2 else "jeePhysics"
BASE_URL = "http://localhost:3030/api" if ENV == "local" else "https://coaching-saas-production-7fba.up.railway.app/api"
PAPERS_DIR = os.path.join(os.path.dirname(__file__), "..", "papers")
IDS_FILE   = os.path.join(os.path.dirname(__file__), "competitive_ids.json")

DPI      = 300
PADDING  = 6   # px padding around crops at 300 DPI

PAPERS = {
    "jeePhysics":    ("12th_jee_physics.pdf",        "jeePhysics",    4, 1),
    "jeeChemistry":  ("12th JEE Chemistry.pdf",      "jeeChemistry",  4, 1),
    "jeeMaths":      ("12th jee maths.pdf",           "jeeMaths",      4, 1),
    "neetPhysics":   ("12th_neet_physics.pdf",        "neetPhysics",   4, 1),
    "neetChemistry": ("12th_neet_chemistry.pdf",      "neetChemistry", 4, 1),
    "neetBiology":   ("12_neet_biology.pdf",          "neetBiology",   4, 1),
}

# Existing answer keys (from solution PDFs + screenshot)
ANSWER_KEYS = {
    "jeePhysics": {
        1:'D',2:'C',4:'B',5:'D',6:'A',7:'A',8:'B',9:'C',10:'B',
        14:'A',15:'C',16:'C',17:'B',18:'D',19:'C',20:'A',
    },
    "jeeChemistry": {
        1:'D',2:'C',3:'D',4:'B',5:'B',6:'D',8:'B',9:'A',10:'D',11:'A',
        12:'D',13:'C',15:'D',16:'C',17:'B',18:'B',19:'A',21:'D',22:'C',23:'C',24:'B',
    },
    "jeeMaths": {
        1:'A',2:'C',5:'C',6:'A',7:'B',8:'A',9:'B',10:'A',11:'D',12:'D',13:'B',14:'A',
    },
    "neetPhysics": {
        1:'C',2:'A',3:'B',4:'B',5:'A',6:'C',7:'C',8:'A',9:'A',10:'B',
        11:'B',12:'B',13:'D',14:'A',15:'D',16:'A',17:'B',18:'D',19:'D',20:'B',
        21:'D',22:'A',23:'B',24:'B',25:'D',26:'D',27:'C',28:'D',29:'D',30:'B',
        31:'C',32:'A',33:'B',34:'A',35:'C',36:'B',37:'C',38:'C',39:'A',40:'B',
        41:'B',42:'D',43:'A',44:'D',45:'D',
    },
    "neetChemistry": {
        1:'A',2:'B',3:'C',4:'A',8:'D',9:'D',10:'C',16:'D',17:'C',18:'A',
        20:'D',21:'C',23:'D',24:'A',25:'A',26:'D',27:'B',28:'C',29:'A',30:'C',
        31:'B',32:'B',33:'A',34:'D',35:'C',37:'C',38:'B',39:'D',40:'C',41:'C',43:'A',44:'C',
    },
    "neetBiology": {
        1:'B',2:'C',3:'A',4:'C',5:'C',6:'B',7:'B',8:'C',9:'D',
        21:'D',22:'B',23:'C',24:'A',25:'D',27:'A',28:'C',29:'D',
        33:'D',34:'B',35:'B',36:'D',46:'D',47:'C',48:'D',49:'B',50:'D',
        51:'B',54:'D',58:'C',59:'A',60:'C',61:'A',62:'D',63:'B',64:'A',
        65:'A',66:'D',67:'B',68:'A',69:'B',76:'B',77:'C',78:'C',79:'A',80:'A',
    },
}

def login():
    r = requests.post(f"{BASE_URL}/auth/login", json={"email":"admin@coaching.local","password":"admin123"})
    r.raise_for_status()
    return r.json()["token"]

def upload_image(token, img_bytes, filename):
    """Upload a PNG crop to the backend, return its URL."""
    r = requests.post(
        f"{BASE_URL}/admin/upload-image",
        headers={"Authorization": f"Bearer {token}"},
        files={"image": (filename, img_bytes, "image/png")},
        timeout=30
    )
    r.raise_for_status()
    return r.json()["url"]

def scale(val, dpi=DPI):
    """Scale a 72-dpi point coordinate to DPI pixels."""
    return val * dpi / 72

def crop_page_region(page, rect_pts, dpi=DPI):
    """Render a fitz.Rect region of a page at `dpi` and return PNG bytes."""
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    clip = fitz.Rect(rect_pts)
    pix = page.get_pixmap(matrix=mat, clip=clip)
    return pix.tobytes("png")

def find_question_regions(page):
    """
    Use PyMuPDF text layout to find question and option bounding boxes.
    Returns list of dicts:
      { "number": int, "prompt_rect": Rect, "options": {"A": Rect, ...} }
    All rects in PDF points (72 dpi units).
    """
    page_rect = page.rect
    page_h = page_rect.height

    # Get all text spans with positions
    blocks = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)["blocks"]
    lines = []
    for b in blocks:
        if b.get("type") != 0:
            continue
        for line in b.get("lines", []):
            text = "".join(s["text"] for s in line["spans"]).strip()
            if not text:
                continue
            bbox = line["bbox"]  # (x0, y0, x1, y1)
            lines.append({"text": text, "bbox": bbox, "y0": bbox[1], "y1": bbox[3]})

    lines.sort(key=lambda l: l["y0"])

    # Identify question-start lines: "1.", "2.", "Q1.", "Q.1", etc.
    Q_RE  = re.compile(r'^(?:Q\.?\s*)?(\d{1,3})[.)]\s')
    OPT_RE = re.compile(r'^\(?([ABCD])\)?\.\s*|^\(?([ABCD])\)?\s+')

    q_starts = []  # (question_number, line_index)
    opt_positions = {}  # line_index -> option_label

    for i, ln in enumerate(lines):
        qm = Q_RE.match(ln["text"])
        if qm:
            q_starts.append((int(qm.group(1)), i))
        om = OPT_RE.match(ln["text"])
        if om:
            label = om.group(1) or om.group(2)
            opt_positions[i] = label

    if not q_starts:
        return []

    questions = []
    for qi, (qnum, q_line_idx) in enumerate(q_starts):
        next_q_line_idx = q_starts[qi+1][1] if qi+1 < len(q_starts) else len(lines)
        q_block = lines[q_line_idx:next_q_line_idx]

        # Find option line indices within this question block
        opt_line_indices = []
        for li, ln in enumerate(q_block):
            abs_li = q_line_idx + li
            if abs_li in opt_positions:
                opt_line_indices.append((abs_li, opt_positions[abs_li]))

        # Build option rects
        opts = {}
        for oi, (abs_li, label) in enumerate(opt_line_indices):
            # Option spans from this line to the next option (or end of question)
            next_abs = opt_line_indices[oi+1][0] if oi+1 < len(opt_line_indices) else next_q_line_idx
            opt_lines = lines[abs_li:next_abs]
            if not opt_lines:
                continue
            x0 = min(l["bbox"][0] for l in opt_lines) - PADDING
            y0 = opt_lines[0]["bbox"][1] - PADDING
            x1 = max(l["bbox"][2] for l in opt_lines) + PADDING
            y1 = opt_lines[-1]["bbox"][3] + PADDING
            opts[label] = fitz.Rect(
                max(0, x0), max(0, y0),
                min(page_rect.width, x1), min(page_h, y1)
            )

        # Prompt rect: from question line to just before first option
        if opt_line_indices:
            prompt_end_line = lines[opt_line_indices[0][0] - 1] if opt_line_indices[0][0] > q_line_idx else q_block[0]
            prompt_lines = lines[q_line_idx:opt_line_indices[0][0]]
        else:
            prompt_lines = q_block

        if not prompt_lines:
            continue

        px0 = min(l["bbox"][0] for l in prompt_lines) - PADDING
        py0 = prompt_lines[0]["bbox"][1] - PADDING
        px1 = max(l["bbox"][2] for l in prompt_lines) + PADDING
        py1 = prompt_lines[-1]["bbox"][3] + PADDING
        prompt_rect = fitz.Rect(
            max(0, px0), max(0, py0),
            min(page_rect.width, px1), min(page_h, py1)
        )

        questions.append({
            "number": qnum,
            "prompt_rect": prompt_rect,
            "options": opts
        })

    return questions

def process_subject(subject_key, token, ids):
    if subject_key not in PAPERS:
        print(f"Unknown: {subject_key}")
        return

    pdf_file, subj_id_key, marks, neg_marks = PAPERS[subject_key]
    pdf_path = os.path.join(PAPERS_DIR, pdf_file)
    if not os.path.exists(pdf_path):
        print(f"PDF not found: {pdf_path}")
        return

    subject_id = ids["subjects"][subj_id_key]
    topic_id   = ids["topics"][subj_id_key]
    answer_key = ANSWER_KEYS.get(subject_key, {})

    # Find book ID
    r = requests.get(f"{BASE_URL}/subject-books", headers={"Authorization": f"Bearer {token}"})
    books = r.json().get("books", r.json() if isinstance(r.json(), list) else [])
    matching = sorted([b for b in books if b["subjectId"] == subject_id], key=lambda b: b["id"], reverse=True)
    book_id = matching[0]["id"] if matching else f"local-{subject_key}"

    print(f"\n{'='*60}")
    print(f"{subject_key} — {pdf_file}")
    print(f"book={book_id}  subject={subject_id}")

    doc = fitz.open(pdf_path)
    all_questions = []
    global_q_counter = {}  # track which question numbers we've seen

    for page_num, page in enumerate(doc, start=1):
        regions = find_question_regions(page)
        if not regions:
            print(f"  Page {page_num}: no questions detected")
            continue

        print(f"  Page {page_num}: {len(regions)} question(s) detected: {[r['number'] for r in regions]}")

        for region in regions:
            qnum = region["number"]
            if qnum in global_q_counter:
                print(f"    Q{qnum}: duplicate, skipping")
                continue
            global_q_counter[qnum] = True

            # Upload prompt crop
            try:
                prompt_png = crop_page_region(page, region["prompt_rect"])
                prompt_url = upload_image(token, prompt_png, f"crop-{subject_key}-q{qnum}-prompt.png")
            except Exception as e:
                print(f"    Q{qnum} prompt upload failed: {e}")
                continue

            # Upload each option crop
            option_records = []
            correct_ids = []
            correct_label = answer_key.get(qnum)

            for label in ["A", "B", "C", "D"]:
                rect = region["options"].get(label)
                if rect is None or rect.is_empty:
                    # Create placeholder
                    opt_url = None
                else:
                    try:
                        opt_png = crop_page_region(page, rect)
                        opt_url = upload_image(token, opt_png, f"crop-{subject_key}-q{qnum}-opt{label}.png")
                    except Exception as e:
                        print(f"    Q{qnum} opt {label} upload failed: {e}")
                        opt_url = None

                opt_id = f"opt-crop-{subject_key}-q{qnum}-{label.lower()}"
                value = f"[IMAGE: {opt_url}]" if opt_url else f"Option {label}"
                option_records.append({"id": opt_id, "label": label, "value": value})
                if label == correct_label:
                    correct_ids.append(opt_id)

            # Fallback correct: first option if no key
            if not correct_ids and option_records:
                correct_ids = [option_records[0]["id"]]
                has_key = False
            else:
                has_key = bool(correct_label)

            prompt_text = f"[IMAGE: {prompt_url}]"
            q_hash = hashlib.sha256(f"{subject_key}-q{qnum}".encode()).hexdigest()[:12]
            question = {
                "id": f"que-crop-{book_id}-{q_hash}",
                "subjectId": subject_id,
                "topicId": topic_id,
                "type": "single_correct",
                "prompt": prompt_text,
                "difficulty": "medium",
                "marks": marks,
                "negativeMarks": neg_marks,
                "correctOptionIds": correct_ids,
                "options": option_records,
                "explanation": f"Answer: {correct_label}" if has_key else "",
                "sourceType": "pyq",
                "bookId": book_id,
                "isVerified": has_key,
                "pageNumber": page_num,
                "questionNumber": qnum,
            }
            all_questions.append(question)

    print(f"\n  Extracted {len(all_questions)} questions")
    if not all_questions:
        print("  Nothing to upload.")
        return

    # Sort by question number
    all_questions.sort(key=lambda q: q["questionNumber"])

    # Delete existing questions for this book
    r = requests.get(f"{BASE_URL}/question-bank", headers={"Authorization": f"Bearer {token}"})
    all_qs = r.json() if isinstance(r.json(), list) else r.json().get("questions", [])
    existing = [q for q in all_qs if q.get("bookId") == book_id]
    print(f"  Removing {len(existing)} existing questions for book {book_id}...")
    for q in existing:
        requests.delete(f"{BASE_URL}/questions/{q['id']}", headers={"Authorization": f"Bearer {token}"}, timeout=15)

    # Upload new questions
    saved = 0
    for q in all_questions:
        r = requests.post(
            f"{BASE_URL}/questions",
            json=q,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            timeout=15
        )
        if r.ok:
            saved += 1
            print(f"    Q{q['questionNumber']} ✓  answer={ANSWER_KEYS.get(subject_key,{}).get(q['questionNumber'],'?')}")
        else:
            print(f"    Q{q['questionNumber']} ✗  {r.status_code} {r.text[:80]}")

    print(f"  ✓ Saved {saved}/{len(all_questions)} questions for {subject_key}")

def main():
    print(f"PDF Crop Extractor — {ENV}")
    ids = json.load(open(IDS_FILE))
    token = login()
    print(f"✓ Logged in\n")

    subjects = list(PAPERS.keys()) if SUBJECT == "all" else [SUBJECT]
    for subj in subjects:
        process_subject(subj, token, ids)
        if SUBJECT == "all":
            time.sleep(1)

    print(f"\n{'='*60}")
    print("Done! Now recreate exams from the portal or run create_competitive_exams.mjs")

if __name__ == "__main__":
    main()
