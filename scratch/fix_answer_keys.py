#!/usr/bin/env python3
"""
Extract answer keys from solution PDFs and update questions in prod.
Sends each solution page to Ollama vision, extracts Q->answer mapping,
then patches correctOptionIds on matching questions.

Usage:
  python3 scratch/fix_answer_keys.py prod
"""
import sys, os, json, time, base64, requests, re
import fitz

ENV      = sys.argv[1] if len(sys.argv) > 1 else "prod"
BASE_URL = "http://localhost:3030/api" if ENV == "local" else "https://coaching-saas-production-7fba.up.railway.app/api"
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://192.168.11.104:11434")
MODEL      = os.environ.get("OLLAMA_MODEL", "qwen2.5vl:3b")

PAPERS_DIR = os.path.join(os.path.dirname(__file__), "..", "papers")

SOLUTION_MAP = {
    "jeePhysics":    ("12th_jee_physics_solution.pdf",   "sub-1781281692779"),
    "jeeChemistry":  ("12th JEE Chemistry_solution.pdf", "sub-1781281693373"),
    "jeeMaths":      ("12th_jee_solution.pdf",            "sub-1781281693968"),
    "neetPhysics":   ("12th_neet_physics_solution.pdf",  "sub-1781281694539"),
    "neetChemistry": ("12th_neet_chemistry_solution.pdf","sub-1781281695130"),
    "neetBiology":   ("12_neet_biology_solution.pdf",    "sub-1781281695700"),
}

ANSWER_KEY_PROMPT = """You are reading an answer key / solution sheet for an Indian competitive exam (JEE or NEET).

Extract EVERY question number and its correct answer option from this page.

Look for patterns like:
- "1. (B)" or "1. B" or "1.(B)"
- "Q1 → B" or "Ans: B"
- Answer key tables with question numbers and option letters
- Solution paragraphs that mention "correct answer is (C)"

Return ONLY this JSON (no markdown):
{
  "answers": [
    {"questionNumber": 1, "correctOption": "A"},
    {"questionNumber": 2, "correctOption": "C"}
  ]
}

correctOption must be exactly one of: A, B, C, D
If a question has no clear answer on this page, skip it.
If this page has no answers (e.g. blank, cover page), return: {"answers": []}"""

def login():
    r = requests.post(f"{BASE_URL}/auth/login", json={"email": "admin@coaching.local", "password": "admin123"})
    r.raise_for_status()
    return r.json()["token"]

def pdf_to_images(pdf_path, dpi=150):
    doc = fitz.open(pdf_path)
    pages = []
    for i, page in enumerate(doc):
        mat = fitz.Matrix(dpi/72, dpi/72)
        pix = page.get_pixmap(matrix=mat)
        pages.append({"page": i+1, "b64": base64.b64encode(pix.tobytes("png")).decode()})
    print(f"  Converted {len(pages)} pages ({dpi} DPI)")
    return pages

def extract_answers_from_page(b64, page_num):
    payload = {
        "model": MODEL,
        "messages": [{"role": "user", "content": ANSWER_KEY_PROMPT, "images": [b64]}],
        "stream": False,
        "options": {"temperature": 0.1, "num_predict": 2048}
    }
    try:
        r = requests.post(f"{OLLAMA_URL}/api/chat", json=payload, timeout=300)
        if not r.ok:
            print(f"  Page {page_num}: HTTP {r.status_code}")
            return []
        raw = r.json()["message"]["content"]
        raw = re.sub(r"^```(?:json)?\s*", "", raw.strip())
        raw = re.sub(r"\s*```$", "", raw)
        start, end = raw.find("{"), raw.rfind("}")
        if start == -1: return []
        obj = json.loads(raw[start:end+1])
        answers = obj.get("answers", [])
        print(f"  Page {page_num}: {len(answers)} answer(s) found")
        return answers
    except Exception as e:
        print(f"  Page {page_num}: Error — {e}")
        return []

def get_questions_for_subject(token, subject_id):
    r = requests.get(f"{BASE_URL}/question-bank", headers={"Authorization": f"Bearer {token}"})
    all_qs = r.json() if isinstance(r.json(), list) else r.json().get("questions", [])
    qs = [q for q in all_qs if q.get("subjectId") == subject_id]
    # Sort by pageNumber then by original order
    return sorted(qs, key=lambda q: (q.get("pageNumber") or 999, q.get("id", "")))

def patch_question_answer(token, question, correct_label):
    """Update correctOptionIds to match the given option label (A/B/C/D)."""
    options = question.get("options", [])
    target = next((o for o in options if o.get("label", "").upper() == correct_label.upper()), None)
    if not target:
        print(f"    ⚠  Option {correct_label} not found in question {question['id'][-8:]}")
        return False

    updated = {
        **question,
        "correctOptionIds": [target["id"]]
    }
    r = requests.put(
        f"{BASE_URL}/questions/{question['id']}",
        json=updated,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        timeout=15
    )
    return r.ok

def process_subject(subject_key, token):
    sol_file, subject_id = SOLUTION_MAP[subject_key]
    sol_path = os.path.join(PAPERS_DIR, sol_file)
    if not os.path.exists(sol_path):
        print(f"  Solution PDF not found: {sol_path}")
        return

    print(f"\n{'='*60}")
    print(f"{subject_key}  ({sol_file})")

    pages = pdf_to_images(sol_path)

    # Collect all answers from all solution pages
    all_answers = []
    for pg in pages:
        answers = extract_answers_from_page(pg["b64"], pg["page"])
        all_answers.extend(answers)

    if not all_answers:
        print("  No answers extracted from solution PDF")
        return

    # Deduplicate: if same Q number appears multiple times, keep last
    answer_map = {}
    for a in all_answers:
        qn = a.get("questionNumber")
        opt = a.get("correctOption", "").upper()
        if qn and opt in ("A", "B", "C", "D"):
            answer_map[qn] = opt

    print(f"  Total unique answers extracted: {len(answer_map)}")

    # Get questions from DB, sorted by page order
    questions = get_questions_for_subject(token, subject_id)
    print(f"  Questions in DB: {len(questions)}")

    # Match by position: Q1 in PDF = questions[0], Q2 = questions[1], etc.
    updated = 0
    skipped = 0
    for i, q in enumerate(questions):
        q_num = i + 1  # 1-indexed
        if q_num in answer_map:
            ok = patch_question_answer(token, q, answer_map[q_num])
            if ok:
                updated += 1
                print(f"    Q{q_num}: → {answer_map[q_num]}  [{q['prompt'][:50]}]")
            else:
                skipped += 1
        else:
            skipped += 1

    print(f"  ✓ Updated {updated}/{len(questions)} questions | {skipped} skipped (no answer found)")

def main():
    print(f"Fixing answer keys — {ENV}")
    print(f"Ollama: {OLLAMA_URL}  Model: {MODEL}\n")

    token = login()
    print(f"✓ Logged in\n")

    subjects = list(SOLUTION_MAP.keys())
    if len(sys.argv) > 2:
        subjects = [sys.argv[2]]

    for subj in subjects:
        process_subject(subj, token)
        time.sleep(1)

    print(f"\n{'='*60}")
    print("Done. Recreate exams after this to pick up corrected answer keys.")

if __name__ == "__main__":
    main()
