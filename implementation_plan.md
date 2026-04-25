# Gujarat Tuition Exam Portal Implementation Plan

This document defines a practical MVP and phased roadmap for building an exam portal for local tuition classes in Gujarat. The goal is not only to conduct online exams, but to help institutes improve student performance through dynamic paper generation, automated evaluation, and actionable analytics.

## 1. Product Vision

Build a **Test + Analysis + Improvement System** for coaching classes that can:

- Organize students by `Class -> Stream -> Batch`
- Maintain a structured question bank by `Subject -> Topic`
- Generate exams dynamically from blueprint rules
- Deliver a reliable timed exam experience
- Evaluate instantly with negative marking
- Identify weak topics for each student and each batch
- Help teachers take follow-up action using reports and practice tests

This positioning is stronger than a basic “exam portal” because tuition classes care about better results, batch comparisons, and parent confidence.

## 2. Target Users

### Super Admin / Institute Owner
- Configures the institute
- Creates classes, streams, batches, subjects, and users
- Reviews overall performance and usage

### Faculty / Teacher
- Creates and manages the question bank
- Defines test blueprints
- Schedules exams
- Reviews result analytics for students and batches

### Student
- Logs in and attempts exams
- Views scores, solutions, and topic-wise performance
- Takes follow-up practice tests for weak areas

### Parent (Phase 2)
- Views summary reports for student progress and consistency

## 3. Core MVP Scope

The MVP should include the following modules.

### 3.1 User and Academic Structure
- Role-based access: `super_admin`, `institute_admin`, `teacher`, `student`
- Academic hierarchy:
  - Classes: `10th`, `11th`, `12th`
  - Streams: `Science`, `Commerce`, `Arts`
  - Batches assigned under class and stream
- Student enrollment into one or more batches if needed

### 3.2 Question Bank
- Question types:
  - MCQ single correct
  - MCQ multiple correct
- Structured taxonomy:
  - `Class -> Stream -> Subject -> Topic -> Subtopic` (optional)
- Question metadata:
  - difficulty level
  - marks
  - negative marks
  - solution/explanation
  - tags such as `board`, `chapter-test`, `mock-test`
  - status such as `draft`, `approved`, `archived`

### 3.3 Dynamic Exam Paper Generation
- Faculty creates an exam blueprint with rules such as:
  - total number of questions
  - total marks
  - duration
  - subject/topic coverage
  - easy/medium/hard mix
  - marks per question
  - negative marking rules
- System generates exam papers dynamically from approved questions
- Support shuffled question order and option order
- Support exam modes:
  - scheduled mock test
  - chapter test
  - practice test

### 3.4 Exam Taking Experience
- Secure student login
- Exam instructions screen
- Live countdown timer
- Question palette with statuses:
  - answered
  - unanswered
  - marked for review
  - not visited
- Save and next / previous navigation
- Auto-save answers periodically
- Auto-submit when time expires
- Resume support after temporary network interruption

### 3.5 Evaluation and Analytics
- Instant submission result generation
- Automatic score calculation
- Negative marking deduction
- Topic-wise accuracy analysis
- Weak-topic detection using incorrect answer patterns
- Result summary:
  - score
  - percentage
  - rank in batch
  - time spent
  - attempted vs unattempted

### 3.6 Result Review
- Show correct answers after submission based on exam settings
- Show explanations / solutions
- Highlight weak topics
- Show recommended follow-up practice topics

## 4. High-Value Additions Around MVP

These features are strongly recommended because they increase business value for coaching classes without changing the product direction.

### 4.1 Faculty Dashboard
- Batch-wise performance overview
- Most difficult topics
- Most wrongly answered questions
- Top performers and at-risk students

### 4.2 Student Dashboard
- Recent exam history
- Progress trend across tests
- Subject-wise and topic-wise performance
- Personalized weak-topic list

### 4.3 Test Templates
- Faculty can reuse templates such as:
  - board pattern test
  - chapter test
  - unit test
  - full syllabus mock
  - speed test

### 4.4 Practice from Weak Topics
- After each exam, system can generate a smaller practice paper using weak topics
- This becomes a strong differentiator for tuition institutes

### 4.5 Gujarati and English Support
- UI labels and exam instructions should support Gujarati and English
- Useful for local institutes and mixed-language student groups

## 5. Features to Keep for Phase 2

These are valuable, but should not delay MVP launch.

- Parent portal
- WhatsApp / SMS notifications
- Payment and fee integration
- Advanced anti-cheating mechanisms
- Mobile app
- Full offline mode
- AI-assisted question generation
- Adaptive testing engine

## 6. Functional Workflows

### 6.1 Institute Setup Flow
1. Admin creates classes, streams, and batches
2. Admin creates teacher accounts
3. Admin imports or adds students
4. Admin maps students to batches

### 6.2 Question Bank Flow
1. Teacher selects class, stream, subject, and topic
2. Teacher creates questions with options, correct answers, marks, and explanation
3. Question is saved as draft or approved
4. Approved questions become available for exam generation

### 6.3 Exam Creation Flow
1. Teacher chooses target batch or class
2. Teacher selects manual paper or blueprint-based dynamic generation
3. Teacher defines date, duration, marks, negative marks, and visibility of solutions
4. System generates paper and stores question snapshot for that exam

### 6.4 Student Exam Flow
1. Student logs in
2. Student opens active exam
3. Student attempts questions with timer and palette support
4. System auto-saves responses
5. Exam auto-submits on timeout or manual submit
6. Result is generated immediately or after release setting

### 6.5 Analytics Flow
1. System compares student answers with correct answers
2. Marks and penalties are calculated
3. Topic-level accuracy is derived from question-topic mappings
4. Weak topics are ranked
5. Dashboards and reports are generated for teacher and student

## 7. Recommended Database Entities

Below is a suggested initial entity model for the MVP.

### 7.1 User and Organization
- `users`
- `roles`
- `institutes`
- `teachers`
- `students`

### 7.2 Academic Structure
- `academic_classes`
- `streams`
- `batches`
- `student_batch_enrollments`
- `subjects`
- `topics`
- `subtopics` (optional)

### 7.3 Question Bank
- `questions`
- `question_options`
- `question_topic_mappings`
- `question_tags`
- `question_versions` (optional if audit history is needed)

### 7.4 Exam Engine
- `exams`
- `exam_blueprints`
- `exam_blueprint_rules`
- `exam_question_snapshots`
- `exam_assignments`
- `student_exam_attempts`
- `student_answers`

### 7.5 Analytics and Reporting
- `exam_results`
- `topic_performance_summaries`
- `student_weak_topics`
- `batch_performance_summaries`

## 8. Suggested Tech Implementation

Based on the existing stack direction, the following is a practical implementation approach.

### Frontend
- React with Vite
- Role-based dashboards for admin, teacher, and student
- Exam interface optimized for desktop first and mobile usable
- Charting library for analytics visualizations

### Backend
- Node.js with Express
- TypeORM for data modeling
- PostgreSQL as primary database
- JWT-based authentication

### Infrastructure
- Local development with `.env` configuration
- Cloud deployment in a later phase
- Storage for reports and exports if PDF generation is added

## 9. Module Breakdown for Engineering

### Module A: Authentication and Roles
- login
- access control
- user session handling

### Module B: Academic Management
- classes
- streams
- batches
- student enrollment

### Module C: Question Bank
- create/edit question
- topic mapping
- filters and search
- bulk import readiness

### Module D: Exam Management
- exam creation
- exam blueprint rules
- scheduling
- assignment to students or batches

### Module E: Exam Runner
- timer
- palette
- answer autosave
- submission

### Module F: Evaluation Engine
- marks calculation
- negative marks
- result publishing

### Module G: Analytics
- student performance
- batch performance
- weak-topic analysis
- rankings

## 10. Phased Delivery Plan

### Phase 1: Foundation
- Initialize frontend and backend project
- Set up auth and role model
- Create core entities for class, stream, batch, subject, topic, and users
- Set up question bank CRUD

### Phase 2: Exam Engine MVP
- Create exam blueprints
- Generate dynamic papers
- Build timed exam interface
- Implement answer autosave and auto-submit
- Implement instant evaluation and result summary

### Phase 3: Analytics MVP
- Student topic-wise analysis
- Weak-topic detection
- Teacher batch dashboard
- Ranking and trend views

### Phase 4: Business Differentiators
- Weak-topic practice tests
- Test templates
- Gujarati language support
- PDF reports for student/parent sharing

## 11. Reporting and Analytics Logic

The system should mathematically identify weak topics using simple and explainable rules in MVP:

- accuracy per topic = correct answers / total attempted questions for that topic
- penalty impact = total negative marks caused in that topic
- confidence gap = unattempted + incorrect weighted against total topic questions

Weak topics can then be ranked using a weighted score such as:

`weakness_score = (incorrect * 1.0) + (unattempted * 0.7) + (negative_penalty_ratio * 0.5)`

This is simple enough to implement early and strong enough for useful faculty insights.

## 12. Non-Functional Requirements

- Fast page loads during live exam
- Reliable auto-save
- Protection against duplicate submissions
- Audit trail for exam attempts
- Scalable question filtering and search
- Clear handling of timer expiry and reconnect flows

## 13. Risks and Mitigations

### Risk: Poor question quality in early stage
- Add approval workflow and question status fields

### Risk: Students losing answers due to connectivity
- Add periodic autosave and reconnect-safe attempt state

### Risk: Dynamic paper generation producing unbalanced papers
- Use blueprint constraints and approved-question minimum thresholds

### Risk: Analytics becoming hard to trust
- Start with explainable formulas and visible topic-level calculations

## 14. Recommended MVP Deliverable for Client Pitch

When pitching this to the tuition class, describe the MVP as:

> A smart exam platform for coaching classes that conducts tests, evaluates instantly, identifies weak topics automatically, and helps teachers improve student performance through targeted follow-up practice.

This message is more compelling than calling it only an online test portal.

## 15. Immediate Next Build Steps

1. Finalize MVP scope and roles
2. Freeze the core database schema
3. Build authentication and academic hierarchy management
4. Build the question bank
5. Build blueprint-based exam generation
6. Build the live exam runner
7. Build evaluation and analytics
8. Add dashboards and reports

## 16. Nice-to-Have Future Enhancements

- Parent portal with summary view
- AI-generated similar questions
- Performance-based personalized homework
- Leaderboards across branches
- QR-code based student login for centers
- OMR + online hybrid exam support
