import fitz  # PyMuPDF
import pytesseract
from PIL import Image
import io

def main():
    pdf_path = "c:/Users/dell/Desktop/coaching/UnitTest_D07-Jun-2026.pdf"
    doc = fitz.open(pdf_path)
    print(f"Total Pages: {len(doc)}")

    output_text = []
    for i, page in enumerate(doc):
        print(f"Processing Page {i+1}/{len(doc)}...")
        # Render page to image pixmap
        pix = page.get_pixmap(dpi=150)
        img_data = pix.tobytes("png")
        img = Image.open(io.BytesIO(img_data))
        
        # OCR the image
        text = pytesseract.image_to_string(img)
        output_text.append(f"--- PAGE {i+1} ---\n{text}")

    output_filename = "c:/Users/dell/Desktop/coaching/scratch/UnitTest_extracted.txt"
    with open(output_filename, "w", encoding="utf-8") as f:
        f.write("\n\n".join(output_text))

    print(f"Success! Text saved to: {output_filename}")

if __name__ == "__main__":
    main()
