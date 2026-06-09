import cv2
import os

def main():
    image_path = "c:/Users/dell/Desktop/coaching/scratch/chapter6_page2.png"
    if not os.path.exists(image_path):
        print("Image not found.")
        return
        
    img = cv2.imread(image_path)
    h, w, c = img.shape
    print(f"Loaded image: {w}x{h}")
    
    # Since we know Q19 is in the upper middle area based on text order (18, 19, 20, 21, 22),
    # let's crop from y = 15% to 45% of height
    y_start = int(h * 0.03)
    y_end = int(h * 0.22)
    crop = img[y_start:y_end, 0:w]
    
    output_path = "c:/Users/dell/Desktop/coaching/scratch/q19_cropped.png"
    cv2.imwrite(output_path, crop)
    print(f"Cropped region to {output_path}")
    
    # Copy to artifacts
    import shutil
    dest_dir = "C:/Users/dell/.gemini/antigravity/brain/1bac99db-80fa-49b6-9f7f-7b6499bb3467"
    os.makedirs(dest_dir, exist_ok=True)
    shutil.copy(output_path, os.path.join(dest_dir, "q19_cropped.png"))
    print("Copied to artifacts.")

if __name__ == "__main__":
    main()
