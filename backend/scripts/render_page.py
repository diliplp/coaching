import base64
import json
import sys

import fitz  # PyMuPDF


def main() -> None:
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: render_page.py <pdf_path> <page_index>"}))
        sys.exit(1)

    pdf_path = sys.argv[1]
    page_idx = int(sys.argv[2])  # 0-based

    doc = fitz.open(pdf_path)
    if page_idx < 0 or page_idx >= len(doc):
        print(json.dumps({"error": f"Page index {page_idx} out of range (0–{len(doc)-1})"}))
        sys.exit(1)

    page = doc[page_idx]
    # 150 DPI — sharp enough for math, small enough to be fast
    mat = fitz.Matrix(150 / 72, 150 / 72)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    img_bytes = pix.tobytes("png")
    img_b64 = base64.b64encode(img_bytes).decode("utf-8")
    del pix

    print(json.dumps({"base64": img_b64, "width": page.rect.width, "height": page.rect.height}))


if __name__ == "__main__":
    main()
