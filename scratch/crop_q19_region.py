import fitz  # PyMuPDF

def main():
    pdf_path = "c:/Users/dell/Desktop/coaching/chapters6_D26-May-2026.pdf"
    doc = fitz.open(pdf_path)
    
    # We will search on all pages for Q19
    for i, page in enumerate(doc):
        rects = page.search_for("Which relation is true")
        if rects:
            print(f"Found on Page {i+1} at rect: {rects[0]}")
            # Crop a box around the question (extend below it to capture the options)
            r = rects[0]
            # Let's crop from y-10 to y+150 to get the options
            crop_rect = fitz.Rect(0, r.y1 - 20, page.rect.width, r.y1 + 150)
            
            # Render this region at high resolution
            pix = page.get_pixmap(clip=crop_rect, dpi=200)
            output_path = f"c:/Users/dell/Desktop/coaching/scratch/q19_cropped.png"
            pix.save(output_path)
            print(f"Successfully cropped and saved Q19 to {output_path}")
            
            # Let's copy it to the appDataDir brain artifacts folder to embed it in the artifact
            import shutil
            dest_dir = "C:/Users/dell/.gemini/antigravity/brain/1bac99db-80fa-49b6-9f7f-7b6499bb3467"
            os.makedirs(dest_dir, exist_ok=True)
            shutil.copy(output_path, os.path.join(dest_dir, "q19_cropped.png"))
            print("Copied to artifacts folder.")
            return

import os
if __name__ == "__main__":
    main()
