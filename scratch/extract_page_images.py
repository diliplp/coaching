import fitz

def main():
    doc = fitz.open("c:/Users/dell/Desktop/coaching/UnitTest_D07-Jun-2026.pdf")
    page = doc[0]
    pix = page.get_pixmap(dpi=150)
    pix.save("c:/Users/dell/Desktop/coaching/scratch/page1.png")
    print("Saved page 1 as PNG.")

if __name__ == "__main__":
    main()
