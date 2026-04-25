import fs from "node:fs/promises";
import path from "node:path";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const WIDTH = 1280;
const HEIGHT = 720;

const COLORS = {
  navy: "#0F172A",
  slate: "#1E293B",
  ink: "#111827",
  blue: "#0EA5E9",
  teal: "#14B8A6",
  saffron: "#F59E0B",
  emerald: "#10B981",
  rose: "#FB7185",
  white: "#FFFFFF",
  paper: "#F8FAFC",
  mist: "#E2E8F0",
  smoke: "#CBD5E1",
  softBlue: "#E0F2FE",
  softTeal: "#CCFBF1",
  softAmber: "#FEF3C7",
  softGreen: "#DCFCE7",
};

const FONT = {
  title: "Poppins",
  body: "Lato",
};

const outDir = path.resolve("client_presentation/outputs");
const tmpDir = path.resolve("client_presentation/tmp/slides");
await fs.mkdir(outDir, { recursive: true });
await fs.mkdir(tmpDir, { recursive: true });

const presentation = Presentation.create({
  slideSize: { width: WIDTH, height: HEIGHT },
});

presentation.theme.colorScheme = {
  name: "Gujarat Tuition Theme",
  themeColors: {
    accent1: COLORS.blue,
    accent2: COLORS.teal,
    accent3: COLORS.saffron,
    accent4: COLORS.emerald,
    bg1: COLORS.paper,
    bg2: COLORS.white,
    tx1: COLORS.ink,
    tx2: COLORS.slate,
  },
};

function addShape(slide, {
  geometry = "roundRect",
  left,
  top,
  width,
  height,
  fill = COLORS.white,
  line = { width: 0, fill: fill },
  radius,
  rotation,
}) {
  const shape = slide.shapes.add({ geometry, fill, line });
  shape.position = { left, top, width, height, rotation };
  if (radius) {
    shape.adjustmentList = [{ name: "adj", formula: `val ${radius}` }];
  }
  return shape;
}

function addTextBox(slide, {
  left,
  top,
  width,
  height,
  text,
  fontSize = 24,
  color = COLORS.ink,
  bold = false,
  typeface = FONT.body,
  fill = "#FFFFFF00",
  line = { width: 0, fill: "#FFFFFF00" },
  alignment = "left",
  verticalAlignment = "top",
  insets = { left: 12, right: 12, top: 10, bottom: 10 },
}) {
  const shape = slide.shapes.add({ geometry: "rect", fill, line });
  shape.position = { left, top, width, height };
  shape.text = text;
  shape.text.fontSize = fontSize;
  shape.text.color = color;
  shape.text.bold = bold;
  shape.text.typeface = typeface;
  shape.text.alignment = alignment;
  shape.text.verticalAlignment = verticalAlignment;
  shape.text.insets = insets;
  return shape;
}

function addTitle(slide, title, subtitle) {
  addTextBox(slide, {
    left: 72,
    top: 56,
    width: 760,
    height: 78,
    text: title,
    fontSize: 28,
    bold: true,
    typeface: FONT.title,
    color: COLORS.navy,
    insets: { left: 0, right: 0, top: 0, bottom: 0 },
  });

  if (subtitle) {
    addTextBox(slide, {
      left: 72,
      top: 116,
      width: 760,
      height: 46,
      text: subtitle,
      fontSize: 15,
      color: COLORS.slate,
      typeface: FONT.body,
      insets: { left: 0, right: 0, top: 0, bottom: 0 },
    });
  }
}

function addBulletList(slide, { left, top, width, items, color = COLORS.ink, fontSize = 22 }) {
  const text = items.map((item) => `• ${item}`).join("\n");
  return addTextBox(slide, {
    left,
    top,
    width,
    height: items.length * (fontSize + 14) + 24,
    text,
    fontSize,
    color,
    typeface: FONT.body,
    insets: { left: 0, right: 0, top: 0, bottom: 0 },
  });
}

function addPill(slide, { left, top, width, text, fill, color }) {
  addShape(slide, {
    left,
    top,
    width,
    height: 34,
    fill,
    radius: 32000,
  });
  addTextBox(slide, {
    left,
    top: top + 3,
    width,
    height: 26,
    text,
    fontSize: 14,
    color,
    bold: true,
    alignment: "center",
    verticalAlignment: "middle",
  });
}

function addFooter(slide, text = "Confidential Proposal") {
  addTextBox(slide, {
    left: 72,
    top: 684,
    width: 300,
    height: 20,
    text,
    fontSize: 11,
    color: "#64748B",
    insets: { left: 0, right: 0, top: 0, bottom: 0 },
  });
}

function baseSlide(bg = COLORS.paper) {
  const slide = presentation.slides.add();
  slide.background.fill = bg;
  addShape(slide, {
    geometry: "rect",
    left: 0,
    top: 0,
    width: WIDTH,
    height: 14,
    fill: COLORS.saffron,
    line: { width: 0, fill: COLORS.saffron },
  });
  addFooter(slide);
  return slide;
}

// Slide 1
{
  const slide = presentation.slides.add();
  slide.background.fill = COLORS.navy;

  addShape(slide, {
    geometry: "rect",
    left: 0,
    top: 0,
    width: WIDTH,
    height: HEIGHT,
    fill: COLORS.navy,
    line: { width: 0, fill: COLORS.navy },
  });
  addShape(slide, {
    geometry: "ellipse",
    left: 760,
    top: 100,
    width: 420,
    height: 420,
    fill: "#123A74",
    line: { width: 0, fill: "#123A74" },
  });
  addShape(slide, {
    geometry: "ellipse",
    left: 900,
    top: 260,
    width: 210,
    height: 210,
    fill: COLORS.teal,
    line: { width: 0, fill: COLORS.teal },
  });
  addShape(slide, {
    geometry: "ellipse",
    left: 680,
    top: 420,
    width: 240,
    height: 240,
    fill: COLORS.saffron,
    line: { width: 0, fill: COLORS.saffron },
  });

  addPill(slide, {
    left: 80,
    top: 92,
    width: 210,
    text: "Client Presentation",
    fill: COLORS.softAmber,
    color: COLORS.saffron,
  });

  addTextBox(slide, {
    left: 80,
    top: 160,
    width: 620,
    height: 150,
    text: "Smart Exam Portal for Gujarat Tuition Classes",
    fontSize: 34,
    color: COLORS.white,
    bold: true,
    typeface: FONT.title,
    insets: { left: 0, right: 0, top: 0, bottom: 0 },
  });

  addTextBox(slide, {
    left: 80,
    top: 310,
    width: 560,
    height: 90,
    text: "A test, analysis, and improvement system that helps coaching institutes conduct exams, evaluate instantly, and identify weak topics automatically.",
    fontSize: 19,
    color: "#DCE7F7",
    typeface: FONT.body,
    insets: { left: 0, right: 0, top: 0, bottom: 0 },
  });

  addShape(slide, {
    left: 80,
    top: 470,
    width: 530,
    height: 112,
    fill: "#FFFFFF14",
    line: { width: 1, fill: "#FFFFFF20" },
    radius: 18000,
  });
  addBulletList(slide, {
    left: 104,
    top: 494,
    width: 486,
    fontSize: 18,
    color: COLORS.white,
    items: [
      "Dynamic exam paper generation",
      "Instant evaluation with analytics",
      "Student and batch weak-topic detection",
    ],
  });

  addTextBox(slide, {
    left: 80,
    top: 668,
    width: 320,
    height: 18,
    text: "Prepared for local coaching and tuition institutes",
    fontSize: 11,
    color: "#CBD5E1",
    insets: { left: 0, right: 0, top: 0, bottom: 0 },
  });
}

// Slide 2
{
  const slide = baseSlide();
  addTitle(slide, "Why Tuition Classes Need More Than a Basic Exam Tool", "Current pain points in daily coaching operations");

  const cards = [
    { x: 72, y: 190, w: 260, h: 210, fill: COLORS.white, tag: "Manual Work", title: "Paper creation takes too much time", body: "Teachers often prepare tests manually chapter by chapter, which slows down academic planning and makes standardization difficult." },
    { x: 354, y: 190, w: 260, h: 210, fill: COLORS.white, tag: "Limited Visibility", title: "Weak topics stay hidden", body: "After tests, marks are visible but real topic-level weaknesses are not clearly identified for each student or batch." },
    { x: 636, y: 190, w: 260, h: 210, fill: COLORS.white, tag: "Low Engagement", title: "Students do not get targeted follow-up", body: "Most systems stop at score calculation instead of using exam data to create smart remediation and practice." },
    { x: 918, y: 190, w: 290, h: 210, fill: COLORS.white, tag: "Parent Value", title: "Parents need visible progress proof", body: "Institutes want better reporting to show improvement, rank, consistency, and academic discipline to parents." },
  ];

  cards.forEach((card) => {
    addShape(slide, {
      left: card.x,
      top: card.y,
      width: card.w,
      height: card.h,
      fill: card.fill,
      line: { width: 1, fill: COLORS.mist },
      radius: 18000,
    });
    addPill(slide, {
      left: card.x + 20,
      top: card.y + 20,
      width: 110,
      text: card.tag,
      fill: COLORS.softBlue,
      color: COLORS.blue,
    });
    addTextBox(slide, {
      left: card.x + 20,
      top: card.y + 70,
      width: card.w - 40,
      height: 56,
      text: card.title,
      fontSize: 20,
      bold: true,
      typeface: FONT.title,
      color: COLORS.navy,
      insets: { left: 0, right: 0, top: 0, bottom: 0 },
    });
    addTextBox(slide, {
      left: card.x + 20,
      top: card.y + 128,
      width: card.w - 40,
      height: 68,
      text: card.body,
      fontSize: 15,
      color: COLORS.slate,
      insets: { left: 0, right: 0, top: 0, bottom: 0 },
    });
  });

  addShape(slide, {
    left: 72,
    top: 450,
    width: 1136,
    height: 170,
    fill: COLORS.navy,
    line: { width: 0, fill: COLORS.navy },
    radius: 18000,
  });
  addTextBox(slide, {
    left: 102,
    top: 485,
    width: 350,
    height: 32,
    text: "What this means for the institute",
    fontSize: 22,
    bold: true,
    typeface: FONT.title,
    color: COLORS.white,
    insets: { left: 0, right: 0, top: 0, bottom: 0 },
  });
  addBulletList(slide, {
    left: 102,
    top: 530,
    width: 1020,
    fontSize: 18,
    color: "#E2E8F0",
    items: [
      "More time spent on teaching than manual test operations",
      "Better academic control across classes, streams, and batches",
      "Stronger proof of value to students and parents",
    ],
  });
}

// Slide 3
{
  const slide = baseSlide();
  addTitle(slide, "Our Proposed Solution", "A smart exam platform built for coaching-class operations");

  addShape(slide, {
    left: 72,
    top: 178,
    width: 1136,
    height: 430,
    fill: COLORS.white,
    line: { width: 1, fill: COLORS.mist },
    radius: 22000,
  });

  const pillars = [
    { x: 112, title: "Organize", color: COLORS.blue, fill: COLORS.softBlue, body: "Manage classes, streams, batches, students, and subjects in one structured system." },
    { x: 400, title: "Conduct", color: COLORS.teal, fill: COLORS.softTeal, body: "Generate exams dynamically, schedule tests, and deliver a reliable timed exam experience." },
    { x: 688, title: "Evaluate", color: COLORS.saffron, fill: COLORS.softAmber, body: "Score instantly with negative marking, topic-level analysis, and answer insights." },
    { x: 976, title: "Improve", color: COLORS.emerald, fill: COLORS.softGreen, body: "Identify weak topics and recommend targeted practice for students and batches." },
  ];

  pillars.forEach((pillar) => {
    addShape(slide, {
      left: pillar.x,
      top: 235,
      width: 208,
      height: 285,
      fill: pillar.fill,
      line: { width: 0, fill: pillar.fill },
      radius: 18000,
    });
    addShape(slide, {
      geometry: "ellipse",
      left: pillar.x + 70,
      top: 265,
      width: 68,
      height: 68,
      fill: pillar.color,
      line: { width: 0, fill: pillar.color },
    });
    addTextBox(slide, {
      left: pillar.x + 16,
      top: 350,
      width: 176,
      height: 34,
      text: pillar.title,
      fontSize: 22,
      bold: true,
      typeface: FONT.title,
      color: COLORS.navy,
      alignment: "center",
      insets: { left: 0, right: 0, top: 0, bottom: 0 },
    });
    addTextBox(slide, {
      left: pillar.x + 18,
      top: 395,
      width: 172,
      height: 96,
      text: pillar.body,
      fontSize: 15,
      color: COLORS.slate,
      alignment: "center",
      insets: { left: 0, right: 0, top: 0, bottom: 0 },
    });
  });
}

// Slide 4
{
  const slide = baseSlide();
  addTitle(slide, "Who Uses the Platform", "Simple value for owners, teachers, and students");

  const roles = [
    {
      left: 78,
      top: 200,
      width: 350,
      fill: COLORS.white,
      label: "Institute Admin",
      color: COLORS.blue,
      pill: COLORS.softBlue,
      bullets: ["Creates classes, streams, and batches", "Manages users and student enrollments", "Gets institute-wide academic visibility"],
    },
    {
      left: 464,
      top: 200,
      width: 350,
      fill: COLORS.white,
      label: "Faculty / Teacher",
      color: COLORS.teal,
      pill: COLORS.softTeal,
      bullets: ["Builds question bank by subject and topic", "Creates dynamic tests and schedules exams", "Reviews weak topics and batch performance"],
    },
    {
      left: 850,
      top: 200,
      width: 350,
      fill: COLORS.white,
      label: "Student",
      color: COLORS.emerald,
      pill: COLORS.softGreen,
      bullets: ["Attempts timed online exams", "Sees instant score and solutions", "Gets focused practice for weaker chapters"],
    },
  ];

  roles.forEach((role) => {
    addShape(slide, {
      left: role.left,
      top: role.top,
      width: role.width,
      height: 330,
      fill: role.fill,
      line: { width: 1, fill: COLORS.mist },
      radius: 22000,
    });
    addPill(slide, {
      left: role.left + 24,
      top: role.top + 24,
      width: 150,
      text: role.label,
      fill: role.pill,
      color: role.color,
    });
    addBulletList(slide, {
      left: role.left + 26,
      top: role.top + 88,
      width: role.width - 52,
      items: role.bullets,
      fontSize: 18,
      color: COLORS.slate,
    });
  });

  addShape(slide, {
    left: 190,
    top: 565,
    width: 900,
    height: 70,
    fill: COLORS.navy,
    line: { width: 0, fill: COLORS.navy },
    radius: 18000,
  });
  addTextBox(slide, {
    left: 220,
    top: 586,
    width: 840,
    height: 26,
    text: "Phase 2 can also introduce a parent summary view for better communication and retention.",
    fontSize: 18,
    color: COLORS.white,
    alignment: "center",
    insets: { left: 0, right: 0, top: 0, bottom: 0 },
  });
}

// Slide 5
{
  const slide = baseSlide();
  addTitle(slide, "Core MVP Features", "What is included in the first strong release");

  const features = [
    ["Academic Structure", "Classes, streams, batches, and student assignment"],
    ["Question Bank", "MCQ single and multi-correct organized by subject and topic"],
    ["Dynamic Papers", "Blueprint-based question selection with marks and difficulty mix"],
    ["Live Exam Runner", "Timer, palette, auto-save, and auto-submit"],
    ["Auto Evaluation", "Instant scoring with negative marking"],
    ["Deep Analytics", "Weak-topic detection and student/batch insights"],
  ];

  features.forEach((feature, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const left = 72 + col * 378;
    const top = 205 + row * 180;
    const tone = [COLORS.softBlue, COLORS.softTeal, COLORS.softAmber, COLORS.softGreen, "#FCE7F3", "#EDE9FE"][index];
    const accent = [COLORS.blue, COLORS.teal, COLORS.saffron, COLORS.emerald, COLORS.rose, "#8B5CF6"][index];
    addShape(slide, {
      left,
      top,
      width: 340,
      height: 148,
      fill: COLORS.white,
      line: { width: 1, fill: COLORS.mist },
      radius: 18000,
    });
    addShape(slide, {
      geometry: "ellipse",
      left: left + 22,
      top: top + 24,
      width: 42,
      height: 42,
      fill: accent,
      line: { width: 0, fill: accent },
    });
    addShape(slide, {
      left: left + 78,
      top: top + 26,
      width: 120,
      height: 28,
      fill: tone,
      line: { width: 0, fill: tone },
      radius: 26000,
    });
    addTextBox(slide, {
      left: left + 86,
      top: top + 31,
      width: 110,
      height: 18,
      text: "MVP Module",
      fontSize: 12,
      color: accent,
      bold: true,
      alignment: "center",
      insets: { left: 0, right: 0, top: 0, bottom: 0 },
    });
    addTextBox(slide, {
      left: left + 22,
      top: top + 78,
      width: 298,
      height: 28,
      text: feature[0],
      fontSize: 21,
      bold: true,
      typeface: FONT.title,
      color: COLORS.navy,
      insets: { left: 0, right: 0, top: 0, bottom: 0 },
    });
    addTextBox(slide, {
      left: left + 22,
      top: top + 110,
      width: 298,
      height: 30,
      text: feature[1],
      fontSize: 14,
      color: COLORS.slate,
      insets: { left: 0, right: 0, top: 0, bottom: 0 },
    });
  });
}

// Slide 6
{
  const slide = baseSlide();
  addTitle(slide, "How Dynamic Exam Generation Works", "A practical workflow for faculty and institute admins");

  const steps = [
    { title: "Select Batch", body: "Teacher chooses class, stream, batch, and exam type." },
    { title: "Define Blueprint", body: "Rules for topic coverage, marks, difficulty mix, and duration are configured." },
    { title: "Generate Paper", body: "System pulls approved questions from the bank and creates the paper snapshot." },
    { title: "Conduct Exam", body: "Students attempt a timed test with palette, review, and autosave." },
    { title: "Evaluate Instantly", body: "Marks, negative score deductions, and topic analytics are calculated." },
  ];

  steps.forEach((step, index) => {
    const left = 88 + index * 232;
    addShape(slide, {
      left,
      top: 260,
      width: 200,
      height: 210,
      fill: COLORS.white,
      line: { width: 1, fill: COLORS.mist },
      radius: 18000,
    });
    addShape(slide, {
      geometry: "ellipse",
      left: left + 70,
      top: 220,
      width: 60,
      height: 60,
      fill: COLORS.navy,
      line: { width: 0, fill: COLORS.navy },
    });
    addTextBox(slide, {
      left: left + 82,
      top: 236,
      width: 36,
      height: 20,
      text: String(index + 1),
      fontSize: 20,
      bold: true,
      color: COLORS.white,
      alignment: "center",
      insets: { left: 0, right: 0, top: 0, bottom: 0 },
    });
    addTextBox(slide, {
      left: left + 18,
      top: 306,
      width: 164,
      height: 34,
      text: step.title,
      fontSize: 20,
      bold: true,
      typeface: FONT.title,
      alignment: "center",
      color: COLORS.navy,
      insets: { left: 0, right: 0, top: 0, bottom: 0 },
    });
    addTextBox(slide, {
      left: left + 18,
      top: 350,
      width: 164,
      height: 78,
      text: step.body,
      fontSize: 14,
      alignment: "center",
      color: COLORS.slate,
      insets: { left: 0, right: 0, top: 0, bottom: 0 },
    });
  });

  for (let i = 0; i < 4; i += 1) {
    addShape(slide, {
      geometry: "rightArrow",
      left: 276 + i * 232,
      top: 340,
      width: 44,
      height: 28,
      fill: COLORS.softBlue,
      line: { width: 0, fill: COLORS.softBlue },
    });
  }
}

// Slide 7
{
  const slide = baseSlide();
  addTitle(slide, "Automated Evaluation and Analytics", "The platform should not stop at marks. It should guide improvement.");

  addShape(slide, {
    left: 72,
    top: 190,
    width: 520,
    height: 390,
    fill: COLORS.white,
    line: { width: 1, fill: COLORS.mist },
    radius: 22000,
  });
  addTextBox(slide, {
    left: 102,
    top: 220,
    width: 240,
    height: 28,
    text: "Sample topic weakness view",
    fontSize: 20,
    bold: true,
    typeface: FONT.title,
    color: COLORS.navy,
    insets: { left: 0, right: 0, top: 0, bottom: 0 },
  });

  const chart = slide.charts.add("bar");
  chart.position = { left: 110, top: 280, width: 430, height: 220 };
  chart.title = "Weakness by Topic";
  chart.categories = ["Algebra", "Trigonometry", "Organic Chem", "Accountancy"];
  chart.barOptions.direction = "column";
  chart.barOptions.grouping = "standard";
  chart.hasLegend = false;
  chart.titleTextStyle.typeface = FONT.title;
  chart.titleTextStyle.fontSize = 18;
  chart.xAxis.textStyle.typeface = FONT.body;
  chart.xAxis.textStyle.fontSize = 11;
  chart.yAxis.textStyle.typeface = FONT.body;
  chart.yAxis.textStyle.fontSize = 11;
  chart.plotAreaFill = COLORS.paper;
  const series = chart.series.add("Weakness Score");
  series.values = [72, 58, 81, 49];
  series.fill = COLORS.saffron;
  series.stroke = { width: 1, style: "solid", fill: COLORS.saffron };

  addShape(slide, {
    left: 636,
    top: 190,
    width: 572,
    height: 390,
    fill: COLORS.navy,
    line: { width: 0, fill: COLORS.navy },
    radius: 22000,
  });
  addTextBox(slide, {
    left: 674,
    top: 226,
    width: 300,
    height: 30,
    text: "What the institute gets",
    fontSize: 22,
    bold: true,
    typeface: FONT.title,
    color: COLORS.white,
    insets: { left: 0, right: 0, top: 0, bottom: 0 },
  });
  addBulletList(slide, {
    left: 674,
    top: 278,
    width: 470,
    fontSize: 19,
    color: "#E2E8F0",
    items: [
      "Instant score and negative-mark calculation",
      "Topic-wise student and batch performance",
      "Most wrongly answered questions",
      "At-risk students and high-potential students",
      "Data-backed follow-up practice planning",
    ],
  });

  addPill(slide, {
    left: 674,
    top: 500,
    width: 210,
    text: "High-Impact Feature",
    fill: COLORS.softGreen,
    color: COLORS.emerald,
  });
  addTextBox(slide, {
    left: 674,
    top: 544,
    width: 470,
    height: 34,
    text: "The system identifies weak topics automatically instead of leaving analysis entirely to teachers.",
    fontSize: 16,
    color: COLORS.white,
    insets: { left: 0, right: 0, top: 0, bottom: 0 },
  });
}

// Slide 8
{
  const slide = baseSlide();
  addTitle(slide, "Why This Is Stronger Than a Normal Exam Portal", "Business differentiators for Gujarat tuition classes");

  const items = [
    { top: 200, title: "Weak-topic practice generation", body: "After each exam, a small practice paper can be generated from the student’s weakest areas.", accent: COLORS.emerald, tone: COLORS.softGreen },
    { top: 290, title: "Gujarati + English friendly experience", body: "Useful for local institutes with mixed student comfort levels and parent communication needs.", accent: COLORS.blue, tone: COLORS.softBlue },
    { top: 380, title: "Template-based academic operations", body: "Board-style, chapter test, unit test, and mock test templates reduce teacher effort.", accent: COLORS.saffron, tone: COLORS.softAmber },
    { top: 470, title: "Parent-visible progress reporting", body: "Institutes can later show marks, trends, ranks, and consistency in a much clearer way.", accent: COLORS.teal, tone: COLORS.softTeal },
  ];

  addShape(slide, {
    left: 72,
    top: 184,
    width: 720,
    height: 410,
    fill: COLORS.white,
    line: { width: 1, fill: COLORS.mist },
    radius: 22000,
  });

  items.forEach((item) => {
    addShape(slide, {
      left: 104,
      top: item.top,
      width: 656,
      height: 72,
      fill: item.tone,
      line: { width: 0, fill: item.tone },
      radius: 18000,
    });
    addShape(slide, {
      geometry: "ellipse",
      left: 124,
      top: item.top + 18,
      width: 36,
      height: 36,
      fill: item.accent,
      line: { width: 0, fill: item.accent },
    });
    addTextBox(slide, {
      left: 178,
      top: item.top + 12,
      width: 548,
      height: 22,
      text: item.title,
      fontSize: 18,
      bold: true,
      typeface: FONT.title,
      color: COLORS.navy,
      insets: { left: 0, right: 0, top: 0, bottom: 0 },
    });
    addTextBox(slide, {
      left: 178,
      top: item.top + 36,
      width: 548,
      height: 22,
      text: item.body,
      fontSize: 13,
      color: COLORS.slate,
      insets: { left: 0, right: 0, top: 0, bottom: 0 },
    });
  });

  addShape(slide, {
    left: 834,
    top: 184,
    width: 374,
    height: 410,
    fill: COLORS.navy,
    line: { width: 0, fill: COLORS.navy },
    radius: 22000,
  });
  addTextBox(slide, {
    left: 870,
    top: 228,
    width: 300,
    height: 32,
    text: "Positioning statement",
    fontSize: 22,
    bold: true,
    typeface: FONT.title,
    color: COLORS.white,
    insets: { left: 0, right: 0, top: 0, bottom: 0 },
  });
  addTextBox(slide, {
    left: 870,
    top: 290,
    width: 286,
    height: 180,
    text: "This should be pitched as a test + analysis + improvement platform, not only as an online exam portal.\n\nThat makes the value clearer for institute owners, teachers, students, and parents.",
    fontSize: 18,
    color: "#E2E8F0",
    insets: { left: 0, right: 0, top: 0, bottom: 0 },
  });
}

// Slide 9
{
  const slide = baseSlide();
  addTitle(slide, "Suggested Delivery Roadmap", "A phased approach that keeps MVP realistic and valuable");

  const phases = [
    { left: 90, fill: COLORS.softBlue, accent: COLORS.blue, title: "Phase 1", body: "Foundation\nAuth, roles, academic hierarchy, question bank" },
    { left: 360, fill: COLORS.softTeal, accent: COLORS.teal, title: "Phase 2", body: "Exam Engine\nBlueprints, paper generation, exam runner, evaluation" },
    { left: 630, fill: COLORS.softAmber, accent: COLORS.saffron, title: "Phase 3", body: "Analytics\nWeak topics, student dashboard, teacher dashboard" },
    { left: 900, fill: COLORS.softGreen, accent: COLORS.emerald, title: "Phase 4", body: "Growth Features\nPractice tests, Gujarati support, reports, parent view" },
  ];

  addShape(slide, {
    geometry: "rect",
    left: 150,
    top: 390,
    width: 980,
    height: 8,
    fill: COLORS.smoke,
    line: { width: 0, fill: COLORS.smoke },
  });

  phases.forEach((phase, index) => {
    addShape(slide, {
      left: phase.left,
      top: 250,
      width: 220,
      height: 200,
      fill: phase.fill,
      line: { width: 0, fill: phase.fill },
      radius: 18000,
    });
    addShape(slide, {
      geometry: "ellipse",
      left: phase.left + 84,
      top: 364,
      width: 52,
      height: 52,
      fill: phase.accent,
      line: { width: 0, fill: phase.accent },
    });
    addTextBox(slide, {
      left: phase.left + 24,
      top: 280,
      width: 172,
      height: 28,
      text: phase.title,
      fontSize: 24,
      bold: true,
      typeface: FONT.title,
      alignment: "center",
      color: COLORS.navy,
      insets: { left: 0, right: 0, top: 0, bottom: 0 },
    });
    addTextBox(slide, {
      left: phase.left + 22,
      top: 324,
      width: 176,
      height: 74,
      text: phase.body,
      fontSize: 16,
      alignment: "center",
      color: COLORS.slate,
      insets: { left: 0, right: 0, top: 0, bottom: 0 },
    });
    if (index < phases.length - 1) {
      addShape(slide, {
        geometry: "rightArrow",
        left: phase.left + 228,
        top: 378,
        width: 28,
        height: 18,
        fill: COLORS.slate,
        line: { width: 0, fill: COLORS.slate },
      });
    }
  });
}

// Slide 10
{
  const slide = presentation.slides.add();
  slide.background.fill = COLORS.navy;

  addShape(slide, {
    geometry: "rect",
    left: 0,
    top: 0,
    width: WIDTH,
    height: HEIGHT,
    fill: COLORS.navy,
    line: { width: 0, fill: COLORS.navy },
  });

  addTextBox(slide, {
    left: 82,
    top: 120,
    width: 700,
    height: 60,
    text: "Next Step Recommendation",
    fontSize: 36,
    color: COLORS.white,
    bold: true,
    typeface: FONT.title,
    insets: { left: 0, right: 0, top: 0, bottom: 0 },
  });

  addTextBox(slide, {
    left: 82,
    top: 206,
    width: 640,
    height: 84,
    text: "Start with a focused MVP that solves daily test operations first, then expand into analytics-led academic improvement features.",
    fontSize: 22,
    color: "#DCE7F7",
    insets: { left: 0, right: 0, top: 0, bottom: 0 },
  });

  addShape(slide, {
    left: 82,
    top: 340,
    width: 520,
    height: 170,
    fill: "#FFFFFF14",
    line: { width: 1, fill: "#FFFFFF20" },
    radius: 18000,
  });
  addBulletList(slide, {
    left: 108,
    top: 370,
    width: 470,
    fontSize: 20,
    color: COLORS.white,
    items: [
      "Finalize MVP scope",
      "Freeze schema and modules",
      "Begin UI and backend implementation",
    ],
  });

  addShape(slide, {
    geometry: "ellipse",
    left: 850,
    top: 120,
    width: 290,
    height: 290,
    fill: COLORS.teal,
    line: { width: 0, fill: COLORS.teal },
  });
  addShape(slide, {
    geometry: "ellipse",
    left: 930,
    top: 250,
    width: 180,
    height: 180,
    fill: COLORS.saffron,
    line: { width: 0, fill: COLORS.saffron },
  });
  addShape(slide, {
    geometry: "ellipse",
    left: 760,
    top: 340,
    width: 140,
    height: 140,
    fill: "#113A72",
    line: { width: 0, fill: "#113A72" },
  });

  addTextBox(slide, {
    left: 82,
    top: 668,
    width: 200,
    height: 16,
    text: "Thank you",
    fontSize: 11,
    color: "#CBD5E1",
    insets: { left: 0, right: 0, top: 0, bottom: 0 },
  });
}

const outputPath = path.join(outDir, "gujarat-tuition-exam-portal-client-presentation.pptx");
const pptx = await PresentationFile.exportPptx(presentation);
await pptx.save(outputPath);

console.log(outputPath);
