import sys
import os
import io
import json
import cv2
import numpy as np
import fitz  # PyMuPDF

def is_inside(box1, box2):
    x1, y1, w1, h1 = box1
    x2, y2, w2, h2 = box2
    return x1 >= x2 and y1 >= y2 and (x1 + w1) <= (x2 + w2) and (y1 + h1) <= (y2 + h2)

def detect_and_crop_diagrams(pdf_path, output_dir, book_id):
    doc = fitz.open(pdf_path)
    os.makedirs(output_dir, exist_ok=True)
    
    extracted_diagrams = []
    
    for page_idx in range(len(doc)):
        page = doc[page_idx]
        zoom = 1.0
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat)
        
        # Convert to OpenCV format
        img_data = pix.tobytes("png")
        nparr = np.frombuffer(img_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        h, w, _ = img.shape
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Detect edges using Canny
        edges = cv2.Canny(gray, 50, 150)
        
        # Find all contours
        contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        
        candidates = []
        for cnt in contours:
            x, y, cw, ch = cv2.boundingRect(cnt)
            # Filter candidates by size:
            # - Must be large enough to be a diagram (at least 80x80 pixels at zoom=1.0)
            # - Must not be the entire page (max 80% of page dimensions)
            if cw > 80 and ch > 80 and cw < w * 0.8 and ch < h * 0.8:
                candidates.append((x, y, cw, ch))
        
        # Remove nested/overlapping boxes (keep only the parent containers)
        filtered_boxes = []
        for box in candidates:
            # If this box is inside any other larger candidate, discard it
            if any(is_inside(box, other) for other in candidates if other != box and (other[2]*other[3] > box[2]*box[3])):
                continue
            # Avoid duplicate/near-identical boxes
            if not any(abs(box[0]-fb[0]) < 10 and abs(box[1]-fb[1]) < 10 and abs(box[2]-fb[2]) < 10 for fb in filtered_boxes):
                filtered_boxes.append(box)
        
        for diagram_idx, (x, y, cw, ch) in enumerate(filtered_boxes):
            # Crop diagram with small padding
            padding = 10
            x1 = max(0, x - padding)
            y1 = max(0, y - padding)
            x2 = min(w, x + cw + padding)
            y2 = min(h, y + ch + padding)
            
            crop = img[y1:y2, x1:x2]
            
            # Save cropped diagram
            filename = f"{book_id}_p{page_idx+1}_d{diagram_idx+1}.png"
            filepath = os.path.join(output_dir, filename)
            cv2.imwrite(filepath, crop)
            
            extracted_diagrams.append({
                "page": page_idx + 1,
                "url": f"/uploads/diagrams/{filename}",
                "bbox": [y1/h, x1/w, y2/h, x2/w]
            })
            del crop
            
        # Free memory at the end of each page loop
        del pix, img_data, nparr, img, gray, edges, contours, candidates, filtered_boxes
        import gc
        gc.collect()
        
    print(f"Extraction complete. Found {len(extracted_diagrams)} diagrams.")
    print(json.dumps(extracted_diagrams, indent=2))

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python extract_diagrams.py <pdf_path> <output_dir> <book_id>")
        sys.exit(1)
    detect_and_crop_diagrams(sys.argv[1], sys.argv[2], sys.argv[3])
