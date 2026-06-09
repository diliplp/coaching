from PIL import Image
import os

def main():
    img_path = "c:/Users/dell/Desktop/coaching/scratch/page1.png"
    if not os.path.exists(img_path):
        print("page1.png not found.")
        return
        
    img = Image.open(img_path)
    width, height = img.size
    print(f"Image dimensions: {width} x {height}")
    
    # Let's try to crop the diagram on the right side of Q6.
    # Q6 is vertically located roughly around 40% to 52% of the page height.
    # Horizontally, the diagram is on the right side, roughly 68% to 92% of the page width.
    
    # Test Crop 1
    left = int(width * 0.65)
    top = int(height * 0.38)
    right = int(width * 0.95)
    bottom = int(height * 0.52)
    
    cropped = img.crop((left, top, right, bottom))
    cropped.save("c:/Users/dell/Desktop/coaching/scratch/q6_diagram_test.png")
    print("Test crop saved to scratch/q6_diagram_test.png")

if __name__ == "__main__":
    main()
