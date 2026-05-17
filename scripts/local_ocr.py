import os
import sys
import subprocess

def setup_instructions():
    print("""
    === JEE PDF OCR TOOL SETUP ===
    To use this script, you need to install these dependencies:
    
    1. Install Tesseract OCR:
       Download from: https://github.com/UB-Mannheim/tesseract/wiki
       (Make sure to add it to your System PATH during installation)
       
    2. Install Python libraries:
       pip install pytesseract pdf2image pillow
       
    3. Install Poppler (for PDF to Image conversion):
       Download from: https://github.com/oschwartz10612/poppler-windows/releases/
       Add the 'bin' folder to your System PATH.
    ==============================
    """)

def process_pdf(input_path):
    try:
        from pdf2image import convert_from_path
        import pytesseract
        from PIL import Image
    except ImportError:
        setup_instructions()
        return

    print(f"Reading PDF: {input_path}")
    # Convert PDF to images (one per page)
    # 300 DPI is usually good for OCR
    pages = convert_from_path(input_path, 300)
    
    output_text = []
    
    for i, page in enumerate(pages):
        print(f"Processing Page {i+1}/{len(pages)}...")
        # OCR the image
        text = pytesseract.image_to_string(page)
        output_text.append(f"--- PAGE {i+1} ---\n{text}")
    
    # Save the text version for reference
    output_filename = input_path.replace(".pdf", "_OCR.txt")
    with open(output_filename, "w", encoding="utf-8") as f:
        f.write("\n\n".join(output_text))
        
    print(f"\nSuccess! OCR text saved to: {output_filename}")
    print("You can now copy-paste this text or use it to generate a searchable PDF.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python local_ocr.py <path_to_pdf>")
        setup_instructions()
    else:
        process_pdf(sys.argv[1])
