import fitz  # PyMuPDF
import os

def main():
    pdf_path = "c:/Users/dell/Desktop/coaching/chapters6_D26-May-2026.pdf"
    doc = fitz.open(pdf_path)
    
    # Save page 2 and page 3
    for p in [1, 2]: # 0-indexed: Page 2 and Page 3
        page = doc[p]
        pix = page.get_pixmap(dpi=150)
        output_path = f"c:/Users/dell/Desktop/coaching/scratch/chapter6_page{p+1}.png"
        pix.save(output_path)
        print(f"Saved Page {p+1} to {output_path}")

if __name__ == "__main__":
    main()
