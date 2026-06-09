import cv2
import os

def main():
    image_path = "c:/Users/dell/Desktop/coaching/scratch/chapter6_page2.png"
    if not os.path.exists(image_path):
        print("Image not found.")
        return
        
    img = cv2.imread(image_path)
    h, w, c = img.shape
    
    # Crop tightly around Question 19 (approximately y = 0.09 to 0.16)
    y_start = int(h * 0.08)
    y_end = int(h * 0.16)
    crop = img[y_start:y_end, 0:w]
    
    output_path = "c:/Users/dell/Desktop/coaching/scratch/q19_only.png"
    cv2.imwrite(output_path, crop)
    print("Cropped Question 19 tightly.")
    
    import shutil
    dest_dir = "C:/Users/dell/.gemini/antigravity/brain/1bac99db-80fa-49b6-9f7f-7b6499bb3467"
    os.makedirs(dest_dir, exist_ok=True)
    shutil.copy(output_path, os.path.join(dest_dir, "q19_only.png"))
    print("Copied q19_only.png to artifacts.")

if __name__ == "__main__":
    main()
