from PIL import Image
import os

def main():
    img_path = "c:/Users/dell/Desktop/coaching/scratch/page1.png"
    if not os.path.exists(img_path):
        print("page1.png not found.")
        return
        
    img = Image.open(img_path)
    width, height = img.size
    
    # Adjusted coordinates for a clean diagram without surrounding text
    left = int(width * 0.69)
    top = int(height * 0.395)
    right = int(width * 0.93)
    bottom = int(height * 0.515)
    
    cropped = img.crop((left, top, right, bottom))
    
    # Create backend/uploads directory if not exist
    os.makedirs("c:/Users/dell/Desktop/coaching/backend/uploads", exist_ok=True)
    
    output_path = "c:/Users/dell/Desktop/coaching/backend/uploads/q6_diagram.png"
    cropped.save(output_path)
    print(f"Perfect diagram cropped and saved to: {output_path}")

if __name__ == "__main__":
    main()
