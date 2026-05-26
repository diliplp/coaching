import sys
import os
import io
import fitz  # PyMuPDF (no poppler required!)
import pytesseract
from PIL import Image
from pypdf import PdfWriter, PdfReader

def ocr_pdf(input_path, output_pdf_path, output_txt_path):
    try:
        print(f"Reading PDF with PyMuPDF: {input_path}")
        doc = fitz.open(input_path)
        
        writer = PdfWriter()
        full_text = []
        
        for i in range(len(doc)):
            print(f"Processing Page {i+1}/{len(doc)}...")
            page = doc[i]
            
            # Render page to image using PyMuPDF matrix
            # 150 DPI is approx 2.083 zoom (150/72)
            zoom = 2.0833
            mat = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=mat)
            
            # Convert pixmap to PIL Image
            img_data = pix.tobytes("png")
            page_img = Image.open(io.BytesIO(img_data))
            
            # Extract text
            text = pytesseract.image_to_string(page_img)
            full_text.append(text)
            
            # Generate searchable PDF page bytes
            pdf_page_bytes = pytesseract.image_to_pdf_or_hocr(page_img, extension='pdf')
            
            # Load page and add to writer
            page_reader = PdfReader(io.BytesIO(pdf_page_bytes))
            writer.add_page(page_reader.pages[0])
            
        # Save the searchable PDF
        with open(output_pdf_path, "wb") as f:
            writer.write(f)
            
        # Save the extracted text
        with open(output_txt_path, "w", encoding="utf-8") as f:
            f.write("\n\n".join(full_text))
            
        print("OCR processing finished successfully.")
    except Exception as e:
        print(f"OCR processing failed: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python make_searchable_pdf.py <input_path> <output_pdf_path> <output_txt_path>")
        sys.exit(1)
    ocr_pdf(sys.argv[1], sys.argv[2], sys.argv[3])
