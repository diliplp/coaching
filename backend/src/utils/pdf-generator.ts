import puppeteer from "puppeteer";
import { getAppState } from "../data/database.js";

export async function generateStudentReportPDF(studentId: string): Promise<Buffer> {
  const state = await getAppState();

  // Find the student (either from students collection or user search fallback)
  const student = state.students.find(s => s.id === studentId);
  const user = state.users.find(u => u.id === studentId || u.studentId === studentId);
  
  const studentName = student?.name || user?.name || "Student";
  const studentEmail = user?.email || "";
  const studentBatchId = student?.batchId || user?.studentId || "";

  const batch = state.batches.find(b => b.id === studentBatchId);
  const batchName = batch?.name || "Regular Batch";
  
  const className = state.classes.find(c => c.id === (batch?.classId || student?.classId))?.name || "Secondary";
  const streamName = state.streams.find(s => s.id === (batch?.streamId || student?.streamId))?.name || "General";

  // Filter submissions by the student
  const studentSubmissions = state.submissions.filter(sub => sub.studentId === studentId || sub.studentId === user?.id);

  if (studentSubmissions.length === 0) {
    throw new Error("No submissions found for this student. Take a test first to generate a report!");
  }

  // Calculate overall metrics
  const totalExams = studentSubmissions.length;
  let totalObtainedMarks = 0;
  let totalMaxMarks = 0;
  let overallPercentageSum = 0;

  // Track subject averages
  const subjectScores: Record<string, { name: string; totalPercentage: number; count: number; classSum: number; classCount: number }> = {};
  // Track topic analytics
  const topicAnalytics: Record<string, { name: string; correct: number; total: number }> = {};

  studentSubmissions.forEach(sub => {
    totalObtainedMarks += sub.obtainedMarks;
    totalMaxMarks += sub.totalMarks;
    overallPercentageSum += sub.percentage;

    // Find the exam to infer the subject
    const exam = state.exams.find(e => e.id === sub.examId);
    if (exam) {
      const subject = state.subjects.find(s => s.id === exam.subjectId);
      const subjectName = subject?.name || "General";
      const subjectId = subject?.id || "general";

      if (!subjectScores[subjectId]) {
        subjectScores[subjectId] = {
          name: subjectName,
          totalPercentage: 0,
          count: 0,
          classSum: 0,
          classCount: 0
        };
      }
      subjectScores[subjectId].totalPercentage += sub.percentage;
      subjectScores[subjectId].count += 1;

      // Find average percentage of all submissions for this exact exam for class average
      const allExamSubmissions = state.submissions.filter(s => s.examId === exam.id);
      if (allExamSubmissions.length > 0) {
        const examAvg = allExamSubmissions.reduce((sum, s) => sum + s.percentage, 0) / allExamSubmissions.length;
        subjectScores[subjectId].classSum += examAvg;
        subjectScores[subjectId].classCount += 1;
      }
    }

    // Extract topic level performance
    if (sub.insights) {
      sub.insights.forEach(insight => {
        if (!topicAnalytics[insight.topicId]) {
          topicAnalytics[insight.topicId] = {
            name: insight.topicName,
            correct: 0,
            total: 0
          };
        }
        topicAnalytics[insight.topicId].correct += insight.correctAnswers;
        topicAnalytics[insight.topicId].total += insight.totalQuestions;
      });
    }
  });

  const overallAvgScore = overallPercentageSum / totalExams;

  // Calculate batch overall average across these exact same exams
  let classOverallPercentageSum = 0;
  let classOverallCount = 0;

  studentSubmissions.forEach(sub => {
    const allExamSubmissions = state.submissions.filter(s => s.examId === sub.examId);
    if (allExamSubmissions.length > 0) {
      const examAvg = allExamSubmissions.reduce((sum, s) => sum + s.percentage, 0) / allExamSubmissions.length;
      classOverallPercentageSum += examAvg;
      classOverallCount += 1;
    }
  });

  const classOverallAvgScore = classOverallCount > 0 ? (classOverallPercentageSum / classOverallCount) : overallAvgScore;

  // Separate strong and weak topics
  const aggregatedTopics = Object.values(topicAnalytics).map(t => ({
    ...t,
    accuracy: t.total > 0 ? (t.correct / t.total) * 100 : 0
  }));

  const strongTopics = aggregatedTopics.filter(t => t.accuracy >= 70).sort((a, b) => b.accuracy - a.accuracy);
  const weakTopics = aggregatedTopics.filter(t => t.accuracy < 70).sort((a, b) => a.accuracy - b.accuracy);

  // Auto-generate actionable teacher advice
  let teacherComment = "";
  if (overallAvgScore >= 85) {
    teacherComment = `${studentName} is demonstrating an exceptional grasp of all curriculum subjects, consistently performing at the top tier of the class. They show remarkable conceptual clarity, especially in mathematical applications and science segments. To maintain this momentum, we recommend challenging them with advanced Board Paper modules, higher-order thinking skill (HOTS) questions, and timed mock sets to polish speed and accuracy further.`;
  } else if (overallAvgScore >= 70) {
    teacherComment = `${studentName} is exhibiting very strong progress and has grasped most core concepts clearly. They perform consistently across Physics and Mathematics modules but would benefit from extra attention in chemistry naming structures or biology recall elements. Focus on revising the marked weak topics and dedicating a couple of hours weekly to practice mock exercises will easily push their scores into the top tier (90%+).`;
  } else if (overallAvgScore >= 50) {
    teacherComment = `${studentName} has a decent foundational understanding but needs focused efforts to reinforce critical topics. There is a visible gap in core concept retention, which causes errors during high-weightage topics. We suggest systematic daily revisions of their notes, completing regular subject worksheets, and dedicating time specifically to re-attempting weak-topic mock questions until accuracy improves above 75%.`;
  } else {
    teacherComment = `${studentName} is currently facing significant conceptual challenges across core curriculum segments. Immediate personal intervention is recommended. We advise organizing structured, daily revision sheets, starting from foundation chapters, and actively consulting their subject instructors for doubts. Diligent practice on targeted weak-area modules is essential to rebuild conceptual clarity and confidence before mock examinations.`;
  }

  // Compile full styled HTML
  const dateStr = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Academic Report Card - ${studentName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
    
    body {
      font-family: 'Inter', sans-serif;
      color: #1e293b;
      margin: 0;
      padding: 0;
      background: white;
      -webkit-print-color-adjust: exact;
    }
    
    .report-container {
      width: 100%;
      box-sizing: border-box;
      padding: 20px;
    }
    
    /* Header Styles */
    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 3px solid #0f172a;
      padding-bottom: 20px;
      margin-bottom: 25px;
    }
    
    .institute-info h1 {
      margin: 0;
      font-size: 24px;
      color: #0f172a;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .institute-info p {
      margin: 4px 0 0 0;
      font-size: 13px;
      color: #64748b;
    }
    
    .report-title-badge {
      background: #0f172a;
      color: white;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    
    /* Profile Grid */
    .profile-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 25px;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 15px;
    }
    
    .profile-item {
      display: flex;
      flex-direction: column;
    }
    
    .profile-label {
      font-size: 10px;
      color: #64748b;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    
    .profile-val {
      font-size: 14px;
      font-weight: 600;
      color: #0f172a;
    }
    
    /* Metrics Summary */
    .metrics-row {
      display: flex;
      gap: 20px;
      margin-bottom: 30px;
    }
    
    .metric-card {
      flex: 1;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
      background: #fff;
      text-align: center;
      box-shadow: 0 1px 3px rgba(0,0,0,0.02);
    }
    
    .metric-val {
      font-size: 28px;
      font-weight: 700;
      margin: 5px 0;
    }
    
    .metric-val.high { color: #16a34a; }
    .metric-val.mid { color: #ea580c; }
    .metric-val.low { color: #dc2626; }
    
    .metric-label {
      font-size: 12px;
      color: #64748b;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    /* Performance Section */
    .section-title {
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 8px;
      margin-bottom: 15px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    /* Subject Progress Chart */
    .subject-chart-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 35px;
    }
    
    .subject-chart-table th {
      text-align: left;
      font-size: 11px;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 8px 10px;
      border-bottom: 1px solid #e2e8f0;
    }
    
    .subject-chart-table td {
      padding: 14px 10px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: middle;
    }
    
    .subject-name {
      font-weight: 600;
      font-size: 14px;
      color: #0f172a;
      width: 150px;
    }
    
    .chart-container {
      width: 100%;
    }
    
    .progress-bar-wrapper {
      position: relative;
    }
    
    /* Strengths and Weaknesses Grid */
    .topics-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 35px;
      page-break-inside: avoid;
    }
    
    .topic-list-card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
      min-height: 150px;
    }
    
    .topic-list-card.strong {
      background: #f0fdf4;
      border-color: #bbf7d0;
    }
    
    .topic-list-card.weak {
      background: #fef2f2;
      border-color: #fecaca;
    }
    
    .topic-header {
      font-size: 13px;
      font-weight: 700;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .topic-header.strong { color: #15803d; }
    .topic-header.weak { color: #b91c1c; }
    
    .topic-ul {
      margin: 0;
      padding-left: 18px;
      font-size: 12px;
      line-height: 1.6;
    }
    
    .topic-ul.strong { color: #166534; }
    .topic-ul.weak { color: #991b1b; }
    
    /* Teacher Comments block */
    .comments-box {
      border: 1px dashed #cbd5e1;
      border-radius: 8px;
      padding: 18px;
      background: #f8fafc;
      margin-bottom: 45px;
      page-break-inside: avoid;
    }
    
    .comments-title {
      font-size: 13px;
      font-weight: 700;
      color: #334155;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    
    .comments-body {
      font-size: 13px;
      line-height: 1.6;
      color: #475569;
      font-style: italic;
    }
    
    /* Signatures block */
    .signature-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 50px;
      padding: 0 10px;
      page-break-inside: avoid;
    }
    
    .signature-box {
      text-align: center;
      width: 180px;
    }
    
    .sig-line {
      border-top: 1.5px solid #64748b;
      margin-bottom: 8px;
    }
    
    .sig-title {
      font-size: 12px;
      font-weight: 600;
      color: #334155;
    }
    
    .sig-sub {
      font-size: 10px;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 2px;
    }
    
    /* Print break settings */
    @media print {
      body {
        background: white;
      }
      .report-container {
        padding: 0;
      }
      .page-break {
        page-break-before: always;
      }
    }
  </style>
</head>
<body>

  <div class="report-container">
    
    <!-- HEADER -->
    <header class="report-header">
      <div class="institute-info">
        <h1>Gujarat Tuition Academy</h1>
        <p>Premium Coaching & Performance Analysis Portal • Ahmedabad, Gujarat</p>
      </div>
      <div class="report-title-badge">Parent Report Card</div>
    </header>
    
    <!-- STUDENT PROFILE -->
    <div class="profile-card">
      <div class="profile-item">
        <span class="profile-label">STUDENT NAME</span>
        <span class="profile-val">${studentName}</span>
      </div>
      <div class="profile-item">
        <span class="profile-label">BATCH / SECTION</span>
        <span class="profile-val">${batchName}</span>
      </div>
      <div class="profile-item">
        <span class="profile-label">CLASS LEVEL</span>
        <span class="profile-val">Class ${className} (${streamName})</span>
      </div>
      <div class="profile-item">
        <span class="profile-label">REPORT ISSUED</span>
        <span class="profile-val">${dateStr}</span>
      </div>
    </div>
    
    <!-- METRICS ROW -->
    <div class="metrics-row">
      <div class="metric-card">
        <span class="metric-label">EXAMS ATTEMPTED</span>
        <div class="metric-val" style="color: #0f172a;">${totalExams}</div>
        <span style="font-size: 10px; color: #94a3b8; font-weight: 600;">TIMED ONLINE TESTS</span>
      </div>
      <div class="metric-card">
        <span class="metric-label">AVERAGE ACCURACY</span>
        <div class="metric-val ${overallAvgScore >= 70 ? 'high' : (overallAvgScore >= 45 ? 'mid' : 'low')}">${overallAvgScore.toFixed(1)}%</div>
        <span style="font-size: 10px; color: #94a3b8; font-weight: 600;">MARKS ACCRUED</span>
      </div>
      <div class="metric-card">
        <span class="metric-label">CLASS AVERAGE</span>
        <div class="metric-val" style="color: #64748b;">${classOverallAvgScore.toFixed(1)}%</div>
        <span style="font-size: 10px; color: #94a3b8; font-weight: 600;">COHORT PEER MEAN</span>
      </div>
    </div>
    
    <!-- PERFORMANCE SECTION -->
    <section>
      <h3 class="section-title">SUBJECT-WISE PROGRESS & CLASS COMPARISON</h3>
      <p style="font-size: 12px; color: #64748b; margin-top: -10px; margin-bottom: 20px; font-style: italic;">
        The chart below illustrates your child's average percentage score (Blue Bar) mapped against the cohort/batch peer mean (Red Line marker) for exams taken in each subject.
      </p>
      
      <table class="subject-chart-table">
        <thead>
          <tr>
            <th>SUBJECT NAME</th>
            <th>COMPARATIVE SCORE GRAPH</th>
            <th style="text-align: right; width: 80px;">STUDENT %</th>
            <th style="text-align: right; width: 80px;">CLASS AVG</th>
          </tr>
        </thead>
        <tbody>
          ${Object.values(subjectScores).map(score => {
            const studentPercentage = score.count > 0 ? (score.totalPercentage / score.count) : 0;
            const classPercentage = score.classCount > 0 ? (score.classSum / score.classCount) : studentPercentage;
            
            // Build pixel-perfect inline SVG progress bar
            const svgChart = `
              <svg width="100%" height="24" viewBox="0 0 100 24" preserveAspectRatio="none" style="background: #f1f5f9; border-radius: 4px; overflow: hidden; display: block;">
                <!-- Student Score Bar -->
                <rect x="0" y="0" width="${studentPercentage}" height="24" fill="#3b82f6" />
                <!-- Peer Average Line Marker -->
                <rect x="${Math.max(0, classPercentage - 0.75)}" y="0" width="1.5" height="24" fill="#dc2626" />
              </svg>
            `;
            
            return `
              <tr>
                <td class="subject-name">${score.name}</td>
                <td>
                  <div class="chart-container">
                    <div class="progress-bar-wrapper">
                      ${svgChart}
                    </div>
                  </div>
                </td>
                <td style="text-align: right; font-weight: 700; font-size: 14px;">${studentPercentage.toFixed(1)}%</td>
                <td style="text-align: right; font-weight: 600; font-size: 14px; color: #64748b;">${classPercentage.toFixed(1)}%</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </section>
    
    <!-- STRENGTHS & WEAKNESSES -->
    <section>
      <h3 class="section-title">TOPIC-LEVEL MASTERY ANALYSIS</h3>
      <div class="topics-grid">
        <div class="topic-list-card strong">
          <div class="topic-header strong">🌟 Mastered Topics (≥70% Accuracy)</div>
          ${strongTopics.length > 0 ? `
            <ul class="topic-ul strong">
              ${strongTopics.slice(0, 6).map(t => `
                <li><strong>${t.name}</strong> - ${t.accuracy.toFixed(0)}% accuracy (${t.correct}/${t.total} qns)</li>
              `).join('')}
            </ul>
          ` : `<p style="font-size: 12px; color: #166534; font-style: italic; margin: 0;">Concept metrics still compiling. Complete more exams to unlock mastered list.</p>`}
        </div>
        
        <div class="topic-list-card weak">
          <div class="topic-header weak">⚠️ Priority Revision Topics (&lt;70% Accuracy)</div>
          ${weakTopics.length > 0 ? `
            <ul class="topic-ul weak">
              ${weakTopics.slice(0, 6).map(t => `
                <li><strong>${t.name}</strong> - ${t.accuracy.toFixed(0)}% accuracy (${t.correct}/${t.total} qns)</li>
              `).join('')}
            </ul>
          ` : `<p style="font-size: 12px; color: #991b1b; font-style: italic; margin: 0;">Excellent! No weak topics detected at this level.</p>`}
        </div>
      </div>
    </section>
    
    <!-- TEACHER RECOMMENDATIONS -->
    <section class="comments-box">
      <div class="comments-title">✍️ Professional Performance Guidance</div>
      <div class="comments-body">
        "${teacherComment}"
      </div>
    </section>
    
    <!-- SIGNATURES -->
    <footer class="signature-row">
      <div class="signature-box">
        <div class="sig-line"></div>
        <div class="sig-title">Class Mentor</div>
        <div class="sig-sub">Department Faculty</div>
      </div>
      
      <div style="font-size: 11px; color: #94a3b8; font-weight: 500; text-align: center;">
        Academic System Powered by Coaching SaaS
      </div>
      
      <div class="signature-box">
        <div class="sig-line"></div>
        <div class="sig-title">Academy Director</div>
        <div class="sig-sub">Gujarat Tuition Academy</div>
      </div>
    </footer>
    
  </div>

</body>
</html>
  `;

  // Start puppeteer and print page to PDF buffer
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "networkidle0" });
    
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "12mm",
        bottom: "12mm",
        left: "12mm",
        right: "12mm"
      }
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
