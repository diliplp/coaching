import pytesseract
import cv2
import os

# Set tesseract path on Windows if needed
# pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

def main():
    image_path = "c:/Users/dell/Desktop/coaching/scratch/q19_cropped.png"
    if not os.path.exists(image_path):
        print("Image not found.")
        return
        
    img = cv2.imread(image_path)
    # Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    text = pytesseract.image_to_string(gray)
    print("OCR Output of Cropped Region:")
    print(text)

if __name__ == "__main__":
    main()
