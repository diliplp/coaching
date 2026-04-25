import json
import sys
from pathlib import Path

from pypdf import PdfReader


def main() -> None:
    pdf_path = Path(sys.argv[1])
    reader = PdfReader(str(pdf_path))
    pages = []

    for page in reader.pages:
        pages.append(page.extract_text() or "")

    extracted_text = "\n\n".join(part.strip() for part in pages if part.strip())
    payload = {
        "pageCount": len(reader.pages),
        "extractedText": extracted_text,
        "previewText": extracted_text[:2000],
    }
    print(json.dumps(payload))


if __name__ == "__main__":
    main()
