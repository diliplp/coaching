import fitz  # PyMuPDF
import sys

def main():
    pdf_path = "c:/Users/dell/Desktop/coaching/chapters6_D26-May-2026.pdf"
    doc = fitz.open(pdf_path)
    print(f"Total pages: {len(doc)}")
    
    found = False
    for i in range(len(doc)):
        page = doc[i]
        text = page.get_text()
        if "molecular weight" in text.lower() and "solute is" in text.lower():
            print(f"\n--- Found on Page {i+1} ---")
            # Print lines containing the search terms
            lines = text.split("\n")
            for idx, line in enumerate(lines):
                if "molecular weight" in line.lower() or "solute" in line.lower() or "relation is true" in line.lower():
                    # Print context of 5 lines before and after
                    start = max(0, idx - 4)
                    end = min(len(lines), idx + 10)
                    print("\n".join(lines[start:end]))
                    print("-" * 40)
                    found = True
                    break
            if found:
                # Let's print the entire page text just to be safe
                print("--- Full Page Text ---")
                print(text)
                break

if __name__ == "__main__":
    main()
