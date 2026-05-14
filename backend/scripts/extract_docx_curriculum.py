import sys
import json
import docx
import re

def extract_docx_curriculum(file_path):
    doc = docx.Document(file_path)
    lines = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    
    curriculum = []
    current_subject = None
    current_chapter = None
    
    # regex for chapters like "1. Relations and Functions"
    chapter_regex = re.compile(r'^(\d+)[.\s-]+(.*)')
    
    # regex for subjects like "Mathematics - Chapter Wise..." (handling different dashes)
    subject_regex = re.compile(r'^(.*?)\s*[–\-—]\s*Chapter\s+Wise', re.IGNORECASE)

    for line in lines:
        # Check if it's a subject heading
        subj_match = subject_regex.match(line)
        if subj_match:
            subject_name = subj_match.group(1).strip()
            # If the subject name still contains weird characters, clean them
            subject_name = re.sub(r'[^a-zA-Z0-9\s]', '', subject_name).strip()
            current_subject = {
                "name": subject_name,
                "chapters": []
            }
            curriculum.append(current_subject)
            current_chapter = None
            continue
            
        # Check if it's a chapter heading
        chap_match = chapter_regex.match(line)
        if chap_match:
            chapter_name = chap_match.group(2).strip()
            if current_subject is not None:
                current_chapter = {
                    "name": chapter_name,
                    "topics": []
                }
                current_subject["chapters"].append(current_chapter)
            continue
            
        # Otherwise, treat as a topic
        if current_chapter is not None:
            topic_name = line.strip()
            if topic_name and not topic_name.startswith("Topic List"):
                current_chapter["topics"].append(topic_name)

    return curriculum

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No file path provided"}))
        sys.exit(1)
        
    try:
        data = extract_docx_curriculum(sys.argv[1])
        print(json.dumps(data))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
