import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { getAppState } from "../data/database.js";

function loadLogoBase64(): string {
  // Production: set FRONTEND_URL env var → puppeteer fetches the logo as a network URL
  // Development: read from monorepo frontend/public
  if (process.env.FRONTEND_URL) return `${process.env.FRONTEND_URL}/logo.jpeg`;
  try {
    const logoPath = path.join(process.cwd(), "..", "frontend", "public", "logo.jpeg");
    const buf = fs.readFileSync(logoPath);
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch {
    return "";
  }
}

interface ReportOptions {
  from?: number;
  to?: number;
}

export async function generateStudentReportPDF(studentId: string, options: ReportOptions = {}): Promise<Buffer> {
  const state = await getAppState();

  const student = state.students.find(s => s.id === studentId);
  const user    = state.users.find(u => u.id === studentId || u.studentId === studentId);

  const studentName  = student?.name  || user?.name  || "Student";
  const studentEmail = user?.email || "";
  const batchId      = student?.batchId || "";

  const batch      = state.batches.find(b => b.id === batchId);
  const batchName  = batch?.name || "—";
  const className  = state.classes.find(c => c.id === (batch?.classId  || student?.classId))?.name  || "—";
  const streamName = state.streams.find(s => s.id === (batch?.streamId || student?.streamId))?.name || "—";

  // ── Date range ──────────────────────────────────────────────────────────────
  const { from, to } = options;
  const allSubmissions = state.submissions.filter(sub =>
    sub.studentId === studentId || sub.studentId === user?.id
  );
  const studentSubmissions = allSubmissions.filter(sub => {
    if (!from && !to) return true;
    const ts = parseInt(sub.id.replace("submission-", ""), 10);
    if (!isNaN(ts)) {
      if (from && ts < from) return false;
      if (to   && ts > to)   return false;
    }
    return true;
  });

  if (studentSubmissions.length === 0) {
    throw new Error("No submissions found for this student in the selected date range. Try a wider range or ask the student to complete an exam.");
  }

  // ── Metrics ─────────────────────────────────────────────────────────────────
  const totalExams = studentSubmissions.length;
  let overallPctSum = 0;

  const subjectScores: Record<string, { name: string; totalPct: number; count: number; classSum: number; classCount: number }> = {};
  const topicAnalytics: Record<string, { name: string; correct: number; total: number }> = {};

  studentSubmissions.forEach(sub => {
    overallPctSum += sub.percentage;

    const exam    = state.exams.find(e => e.id === sub.examId);
    const subject = exam ? state.subjects.find(s => s.id === exam.subjectId) : null;
    if (subject) {
      if (!subjectScores[subject.id]) {
        subjectScores[subject.id] = { name: subject.name, totalPct: 0, count: 0, classSum: 0, classCount: 0 };
      }
      subjectScores[subject.id].totalPct += sub.percentage;
      subjectScores[subject.id].count    += 1;

      const allExamSubs = state.submissions.filter(s => s.examId === sub.examId);
      if (allExamSubs.length > 0) {
        const examAvg = allExamSubs.reduce((s, x) => s + x.percentage, 0) / allExamSubs.length;
        subjectScores[subject.id].classSum   += examAvg;
        subjectScores[subject.id].classCount += 1;
      }
    }

    (sub.insights || []).forEach((ins: any) => {
      if (!topicAnalytics[ins.topicId]) {
        topicAnalytics[ins.topicId] = { name: ins.topicName, correct: 0, total: 0 };
      }
      topicAnalytics[ins.topicId].correct += ins.correctAnswers;
      topicAnalytics[ins.topicId].total   += ins.totalQuestions;
    });
  });

  const overallAvg = overallPctSum / totalExams;

  // Class average across same exams
  let classSum = 0, classCount = 0;
  studentSubmissions.forEach(sub => {
    const all = state.submissions.filter(s => s.examId === sub.examId);
    if (all.length > 0) {
      classSum  += all.reduce((s, x) => s + x.percentage, 0) / all.length;
      classCount++;
    }
  });
  const classAvg = classCount > 0 ? classSum / classCount : overallAvg;

  // Batch rank
  const batchStudents = state.students.filter(s => s.batchId === batchId);
  const rankList = batchStudents.map(bs => {
    const subs = state.submissions.filter(s => s.studentId === bs.id);
    const avg  = subs.length > 0 ? subs.reduce((a, s) => a + s.percentage, 0) / subs.length : 0;
    return { id: bs.id, avg };
  }).sort((a, b) => b.avg - a.avg);
  const batchRank = rankList.findIndex(r => r.id === studentId) + 1 || "—";
  const batchSize = batchStudents.length || "—";

  // Topics
  const allTopics   = Object.values(topicAnalytics).map(t => ({ ...t, accuracy: t.total > 0 ? (t.correct / t.total) * 100 : 0 }));
  const strongTopics = allTopics.filter(t => t.accuracy >= 70).sort((a, b) => b.accuracy - a.accuracy);
  const weakTopics   = allTopics.filter(t => t.accuracy <  70).sort((a, b) => a.accuracy - b.accuracy);

  // ── AI guidance ─────────────────────────────────────────────────────────────
  const weakList = weakTopics.slice(0, 3).map(t => `${t.name} (${t.accuracy.toFixed(0)}%)`).join(", ");
  let guidance = "";
  if (overallAvg >= 85) {
    guidance = `${studentName} is performing at the top tier of their batch with exceptional conceptual clarity. ${weakList ? `A focused revision of ${weakList} will help achieve near-perfect scores.` : "Continue with HOTS and timed mock sets to sharpen speed and accuracy."}`;
  } else if (overallAvg >= 70) {
    guidance = `${studentName} shows strong understanding across most topics. ${weakList ? `Priority attention to ${weakList} is recommended to break into the 85%+ bracket.` : "Consistent practice on timed sets will consolidate this performance."} Regular mock attempts over the next few weeks will build the required exam stamina.`;
  } else if (overallAvg >= 50) {
    guidance = `${studentName} has a developing foundational understanding but requires focused effort on core concept retention. ${weakList ? `Immediate revision of ${weakList} is advised` : "Targeted weak-topic revision is advised"}, alongside daily practice worksheets. Re-attempting weak-topic questions until accuracy exceeds 75% will noticeably improve overall scores.`;
  } else {
    guidance = `${studentName} is currently facing conceptual challenges that require structured intervention. ${weakList ? `Topics needing urgent attention: ${weakList}.` : ""} We recommend daily revision sheets starting from foundation chapters, one-on-one instructor sessions for doubts, and dedicated weak-area practice modules before the next mock examination.`;
  }

  // ── Dates ───────────────────────────────────────────────────────────────────
  const logoSrc  = loadLogoBase64();
  const today    = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  const fmtDate  = (ts?: number) => ts ? new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
  const periodLabel = (from || to) ? `${fmtDate(from) || "Beginning"} – ${fmtDate(to) || "Today"}` : "All Time";

  // ── HTML ────────────────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Parent Report Card — ${studentName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
    * { box-sizing: border-box; }
    body {
      font-family: 'Inter', sans-serif;
      color: #1e293b;
      margin: 0; padding: 0;
      background: white;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .wrap { width: 100%; padding: 28px 32px; }

    /* ── Header ── */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 3px solid #0f172a;
      padding-bottom: 18px;
      margin-bottom: 22px;
    }
    .header-left { display: flex; align-items: center; gap: 14px; }
    .header-left img { width: 58px; height: 58px; object-fit: contain; border-radius: 6px; }
    .inst-name { font-size: 22px; font-weight: 700; color: #0f172a; letter-spacing: 0.3px; margin: 0; }
    .inst-tag  { font-size: 12px; color: #64748b; margin: 3px 0 0 0; }
    .badge { background: #0f172a; color: white; padding: 8px 16px; border-radius: 6px; font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; }

    /* ── Profile card ── */
    .profile {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 12px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 14px 18px;
      margin-bottom: 22px;
    }
    .pitem-lbl { font-size: 9px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 4px; }
    .pitem-val { font-size: 13px; font-weight: 700; color: #0f172a; line-height: 1.3; }

    /* ── Metric cards ── */
    .metrics { display: flex; gap: 16px; margin-bottom: 28px; }
    .mcard {
      flex: 1;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 14px;
      text-align: center;
    }
    .mcard-lbl { font-size: 10px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    .mcard-val { font-size: 26px; font-weight: 700; margin: 6px 0 2px 0; }
    .mcard-sub { font-size: 9px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    .c-high { color: #16a34a; } .c-mid { color: #ea580c; } .c-low { color: #dc2626; } .c-dark { color: #0f172a; } .c-muted { color: #64748b; }

    /* ── Section title ── */
    .sec-title {
      font-size: 13px; font-weight: 700; color: #0f172a;
      border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;
      margin: 0 0 14px 0; text-transform: uppercase; letter-spacing: 0.6px;
    }
    .sec-note { font-size: 11px; color: #64748b; font-style: italic; margin: -10px 0 16px 0; }

    /* ── Subject table ── */
    .subj-tbl { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    .subj-tbl th { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; padding: 6px 10px; border-bottom: 1px solid #e2e8f0; text-align: left; }
    .subj-tbl td { padding: 12px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
    .subj-name { font-weight: 600; font-size: 13px; color: #0f172a; width: 140px; }
    .subj-pct  { text-align: right; font-weight: 700; font-size: 13px; width: 75px; }
    .subj-avg  { text-align: right; font-weight: 600; font-size: 13px; color: #64748b; width: 75px; }

    /* ── Topic grid ── */
    .topic-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-bottom: 30px; page-break-inside: avoid; }
    .tcard { border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; }
    .tcard.strong { background: #f0fdf4; border-color: #bbf7d0; }
    .tcard.weak   { background: #fef2f2; border-color: #fecaca; }
    .tcard-hdr  { font-size: 12px; font-weight: 700; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
    .tcard-hdr.strong { color: #15803d; } .tcard-hdr.weak { color: #b91c1c; }
    .tcard ul { margin: 0; padding-left: 16px; font-size: 11.5px; line-height: 1.65; }
    .tcard.strong ul { color: #166534; } .tcard.weak ul { color: #991b1b; }

    /* ── Guidance box ── */
    .guidance { border: 1px dashed #cbd5e1; border-radius: 8px; padding: 16px; background: #f8fafc; margin-bottom: 40px; page-break-inside: avoid; }
    .guidance-title { font-size: 12px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
    .guidance-body  { font-size: 12.5px; line-height: 1.65; color: #475569; font-style: italic; }

    /* ── Signatures ── */
    .sigs { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 50px; padding: 0 10px; page-break-inside: avoid; }
    .sig-box { text-align: center; width: 170px; }
    .sig-line { border-top: 1.5px solid #64748b; margin-bottom: 7px; }
    .sig-title { font-size: 12px; font-weight: 600; color: #334155; }
    .sig-sub   { font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.4px; margin-top: 2px; }
    .sig-center { font-size: 10.5px; color: #94a3b8; text-align: center; }

    @media print {
      .wrap { padding: 0; }
      .page-break { page-break-before: always; }
    }
  </style>
</head>
<body>
<div class="wrap">

  <!-- HEADER -->
  <header class="header">
    <div class="header-left">
      ${logoSrc ? `<img src="${logoSrc}" alt="BSA Logo" />` : ""}
      <div>
        <div class="inst-name">Brainwave Science Academy</div>
        <div class="inst-tag">Excellence in Education • Performance Analysis Portal</div>
      </div>
    </div>
    <div class="badge">Parent Report Card</div>
  </header>

  <!-- STUDENT PROFILE -->
  <div class="profile">
    <div>
      <div class="pitem-lbl">Student Name</div>
      <div class="pitem-val">${studentName}</div>
    </div>
    <div>
      <div class="pitem-lbl">Email</div>
      <div class="pitem-val" style="font-size:11px;">${studentEmail || "—"}</div>
    </div>
    <div>
      <div class="pitem-lbl">Batch / Section</div>
      <div class="pitem-val">${batchName}</div>
    </div>
    <div>
      <div class="pitem-lbl">Class Level</div>
      <div class="pitem-val">Class ${className} — ${streamName}</div>
    </div>
    <div>
      <div class="pitem-lbl">Report Period</div>
      <div class="pitem-val" style="font-size:11px;">${periodLabel}</div>
    </div>
  </div>

  <!-- METRICS -->
  <div class="metrics">
    <div class="mcard">
      <div class="mcard-lbl">Exams Attempted</div>
      <div class="mcard-val c-dark">${totalExams}</div>
      <div class="mcard-sub">Timed Online Tests</div>
    </div>
    <div class="mcard">
      <div class="mcard-lbl">Average Accuracy</div>
      <div class="mcard-val ${overallAvg >= 70 ? "c-high" : overallAvg >= 45 ? "c-mid" : "c-low"}">${overallAvg.toFixed(1)}%</div>
      <div class="mcard-sub">Marks Accrued</div>
    </div>
    <div class="mcard">
      <div class="mcard-lbl">Class Average</div>
      <div class="mcard-val c-muted">${classAvg.toFixed(1)}%</div>
      <div class="mcard-sub">Cohort Peer Mean</div>
    </div>
    <div class="mcard">
      <div class="mcard-lbl">Batch Rank</div>
      <div class="mcard-val c-dark">${batchRank} <span style="font-size:14px;color:#64748b;">/ ${batchSize}</span></div>
      <div class="mcard-sub">Position in Batch</div>
    </div>
  </div>

  <!-- SUBJECT PROGRESS -->
  <h3 class="sec-title">Subject-wise Progress &amp; Class Comparison</h3>
  <p class="sec-note">Blue bar = student average · Red line = cohort peer mean</p>
  <table class="subj-tbl">
    <thead>
      <tr>
        <th>Subject</th>
        <th>Comparative Score Graph</th>
        <th style="text-align:right;">Student %</th>
        <th style="text-align:right;">Class Avg</th>
      </tr>
    </thead>
    <tbody>
      ${Object.values(subjectScores).map(s => {
        const sPct = s.count > 0 ? s.totalPct / s.count : 0;
        const cPct = s.classCount > 0 ? s.classSum / s.classCount : sPct;
        const svg = `<svg width="100%" height="22" viewBox="0 0 100 22" preserveAspectRatio="none"
          style="background:#f1f5f9;border-radius:4px;overflow:hidden;display:block;">
          <rect x="0" y="0" width="${sPct.toFixed(1)}" height="22" fill="#3b82f6"/>
          <rect x="${Math.max(0, cPct - 0.6).toFixed(1)}" y="0" width="1.2" height="22" fill="#dc2626"/>
        </svg>`;
        return `<tr>
          <td class="subj-name">${s.name}</td>
          <td style="width:55%;">${svg}</td>
          <td class="subj-pct">${sPct.toFixed(1)}%</td>
          <td class="subj-avg">${cPct.toFixed(1)}%</td>
        </tr>`;
      }).join("")}
    </tbody>
  </table>

  <!-- TOPIC MASTERY -->
  <h3 class="sec-title">Topic-level Mastery Analysis</h3>
  <div class="topic-grid">
    <div class="tcard strong">
      <div class="tcard-hdr strong">🌟 Mastered Topics (≥70% Accuracy)</div>
      ${strongTopics.length > 0
        ? `<ul>${strongTopics.slice(0, 7).map(t => `<li><strong>${t.name}</strong> — ${t.accuracy.toFixed(0)}% (${t.correct}/${t.total} qns)</li>`).join("")}</ul>`
        : `<p style="font-size:11.5px;color:#166534;font-style:italic;margin:0;">No mastered topics yet — complete more exams to unlock this list.</p>`}
    </div>
    <div class="tcard weak">
      <div class="tcard-hdr weak">⚠️ Priority Revision Topics (&lt;70% Accuracy)</div>
      ${weakTopics.length > 0
        ? `<ul>${weakTopics.slice(0, 7).map(t => `<li><strong>${t.name}</strong> — ${t.accuracy.toFixed(0)}% (${t.correct}/${t.total} qns)</li>`).join("")}</ul>`
        : `<p style="font-size:11.5px;color:#991b1b;font-style:italic;margin:0;">Excellent — no weak topics detected at this level!</p>`}
    </div>
  </div>

  <!-- GUIDANCE -->
  <div class="guidance">
    <div class="guidance-title">✍️ Professional Performance Guidance</div>
    <div class="guidance-body">"${guidance}"</div>
  </div>

  <!-- SIGNATURES -->
  <footer class="sigs">
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-title">Class Mentor</div>
      <div class="sig-sub">Department Faculty</div>
    </div>
    <div class="sig-center">
      Brainwave Science Academy<br/>
      <span style="font-size:9.5px;">Report generated on ${today}</span>
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-title">Academy Director</div>
      <div class="sig-sub">Brainwave Science Academy</div>
    </div>
  </footer>

</div>
</body>
</html>`;

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const buf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "12mm", bottom: "12mm", left: "12mm", right: "12mm" } });
    return Buffer.from(buf);
  } finally {
    await browser.close();
  }
}
