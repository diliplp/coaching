import cv2
import numpy as np

def main():
    img = cv2.imread("c:/Users/dell/Desktop/coaching/scratch/page1.png")
    h, w, _ = img.shape
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Adaptive thresholding or Canny to handle watermark/noise
    edges = cv2.Canny(gray, 50, 150)
    
    # Find list of contours
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    print("Total contours found:", len(contours))
    
    diagram_candidates = []
    for cnt in contours:
        x, y, cw, ch = cv2.boundingRect(cnt)
        # We want contours that are substantial in size
        if cw > 200 and ch > 200 and cw < w * 0.8 and ch < h * 0.8:
            diagram_candidates.append((x, y, cw, ch))
            
    print("Candidates:", len(diagram_candidates))
    # Print the top 10 largest candidates by area
    diagram_candidates = sorted(diagram_candidates, key=lambda c: c[2]*c[3], reverse=True)
    for i, (x, y, cw, ch) in enumerate(diagram_candidates[:10]):
        print(f"{i+1}: X={x}, Y={y}, W={cw}, H={ch}, Area={cw*ch}")

if __name__ == "__main__":
    main()
