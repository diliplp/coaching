import type {
  BatchNode,
  Chapter,
  ClassNode,
  Exam,
  ExamBlueprint,
  ExamSubmissionResult,
  Question,
  Student,
  StreamNode,
  Subject,
  SubjectBook,
  Topic,
  UserAccount
} from "../types.js";

export interface AppStore {
  classes: ClassNode[];
  streams: StreamNode[];
  batches: BatchNode[];
  students: Student[];
  subjects: Subject[];
  subjectBooks: SubjectBook[];
  chapters: Chapter[];
  topics: Topic[];
  questions: Question[];
  blueprints: ExamBlueprint[];
  exams: Exam[];
  submissions: ExamSubmissionResult[];
  users: UserAccount[];
}

export const seedData: AppStore = {
  classes: [
    { id: "class-9", name: "9th" },
    { id: "class-12", name: "12th" }
  ],
  streams: [
    { id: "stream-cbse", name: "CBSE", classId: "class-9" },
    { id: "stream-science", name: "Science", classId: "class-12" }
  ],
  batches: [
    { id: "batch-9-cbse", name: "9th CBSE Foundation", classId: "class-9", streamId: "stream-cbse" },
    { id: "batch-a1", name: "A1 Morning Batch", classId: "class-12", streamId: "stream-science" }
  ],
  students: [
    { id: "student-9-1", name: "Aarav Mehta", batchId: "batch-9-cbse", classId: "class-9", streamId: "stream-cbse" },
    { id: "student-9-2", name: "Diya Joshi", batchId: "batch-9-cbse", classId: "class-9", streamId: "stream-cbse" },
    { id: "student-1", name: "Riya Patel", batchId: "batch-a1", classId: "class-12", streamId: "stream-science" },
    { id: "student-2", name: "Harsh Shah", batchId: "batch-a1", classId: "class-12", streamId: "stream-science" }
  ],
  subjects: [
    { id: "subject-class9-math", name: "Mathematics", classId: "class-9", streamId: "stream-cbse" },
    { id: "subject-class9-science", name: "Science", classId: "class-9", streamId: "stream-cbse" },
    { id: "subject-math", name: "Mathematics", classId: "class-12", streamId: "stream-science" },
    { id: "subject-biology", name: "Biology", classId: "class-12", streamId: "stream-science" }
  ],
  subjectBooks: [],
  chapters: [
    { id: "chapter-real-numbers", subjectId: "subject-class9-math", name: "Real Numbers" },
    { id: "chapter-linear-equations", subjectId: "subject-class9-math", name: "Linear Equations in One Variable" },
    { id: "chapter-triangles", subjectId: "subject-class9-math", name: "Lines and Angles / Triangles" },
    { id: "chapter-cell-unit", subjectId: "subject-class9-science", name: "The Fundamental Unit of Life" },
    { id: "chapter-motion", subjectId: "subject-class9-science", name: "Motion" },
    { id: "chapter-matter", subjectId: "subject-class9-science", name: "Matter in Our Surroundings" },
    { id: "chapter-algebra", subjectId: "subject-math", name: "Algebra" },
    { id: "chapter-calculus", subjectId: "subject-math", name: "Calculus" },
    { id: "chapter-probability", subjectId: "subject-math", name: "Probability" },
    { id: "chapter-reproduction", subjectId: "subject-biology", name: "Reproduction" },
    { id: "chapter-genetics", subjectId: "subject-biology", name: "Genetics and Evolution" }
  ],
  topics: [
    { id: "topic-number-systems", subjectId: "subject-class9-math", chapterId: "chapter-real-numbers", name: "Number Systems" },
    { id: "topic-linear-equations", subjectId: "subject-class9-math", chapterId: "chapter-linear-equations", name: "Linear Equations" },
    { id: "topic-triangles", subjectId: "subject-class9-math", chapterId: "chapter-triangles", name: "Triangles" },
    { id: "topic-cells", subjectId: "subject-class9-science", chapterId: "chapter-cell-unit", name: "Cell Basics" },
    { id: "topic-motion", subjectId: "subject-class9-science", chapterId: "chapter-motion", name: "Motion" },
    { id: "topic-matter", subjectId: "subject-class9-science", chapterId: "chapter-matter", name: "Matter Around Us" },
    { id: "topic-algebra", subjectId: "subject-math", chapterId: "chapter-algebra", name: "Algebra" },
    { id: "topic-calculus", subjectId: "subject-math", chapterId: "chapter-calculus", name: "Calculus" },
    { id: "topic-probability", subjectId: "subject-math", chapterId: "chapter-probability", name: "Probability" },
    { id: "topic-human-reproduction", subjectId: "subject-biology", chapterId: "chapter-reproduction", name: "Human Reproduction" },
    { id: "topic-mendelian-genetics", subjectId: "subject-biology", chapterId: "chapter-genetics", name: "Principles of Inheritance" }
  ],
  questions: [
    {
      id: "q9m1",
      subjectId: "subject-class9-math",
      topicId: "topic-number-systems",
      type: "single_correct",
      prompt: "Which of the following is an irrational number?",
      difficulty: "medium",
      marks: 2,
      negativeMarks: 0.5,
      correctOptionIds: ["q9m1o3"],
      options: [
        { id: "q9m1o1", label: "A", value: "4" },
        { id: "q9m1o2", label: "B", value: "9/16" },
        { id: "q9m1o3", label: "C", value: "√2" },
        { id: "q9m1o4", label: "D", value: "0.25" }
      ],
      explanation: "√2 cannot be expressed as a ratio of integers."
    },
    {
      id: "q9m2",
      subjectId: "subject-class9-math",
      topicId: "topic-number-systems",
      type: "single_correct",
      prompt: "The decimal expansion of 1/8 is?",
      difficulty: "easy",
      marks: 2,
      negativeMarks: 0.5,
      correctOptionIds: ["q9m2o4"],
      options: [
        { id: "q9m2o1", label: "A", value: "0.8" },
        { id: "q9m2o2", label: "B", value: "0.18" },
        { id: "q9m2o3", label: "C", value: "0.0125" },
        { id: "q9m2o4", label: "D", value: "0.125" }
      ],
      explanation: "1 divided by 8 is 0.125."
    },
    {
      id: "q9m7",
      subjectId: "subject-class9-math",
      topicId: "topic-number-systems",
      type: "single_correct",
      prompt: "Which of the following has a terminating decimal expansion?",
      difficulty: "medium",
      marks: 2,
      negativeMarks: 0.5,
      correctOptionIds: ["q9m7o1"],
      options: [
        { id: "q9m7o1", label: "A", value: "3/25" },
        { id: "q9m7o2", label: "B", value: "2/3" },
        { id: "q9m7o3", label: "C", value: "7/9" },
        { id: "q9m7o4", label: "D", value: "11/6" }
      ],
      explanation: "A rational number with denominator of the form 2^m 5^n terminates."
    },
    {
      id: "q9m8",
      subjectId: "subject-class9-math",
      topicId: "topic-number-systems",
      type: "single_correct",
      prompt: "The rationalized form of 1/√5 is?",
      difficulty: "hard",
      marks: 2,
      negativeMarks: 0.5,
      correctOptionIds: ["q9m8o2"],
      options: [
        { id: "q9m8o1", label: "A", value: "1/5" },
        { id: "q9m8o2", label: "B", value: "√5/5" },
        { id: "q9m8o3", label: "C", value: "5√5" },
        { id: "q9m8o4", label: "D", value: "√5" }
      ],
      explanation: "Multiply numerator and denominator by √5."
    },
    {
      id: "q9m3",
      subjectId: "subject-class9-math",
      topicId: "topic-linear-equations",
      type: "single_correct",
      prompt: "If 3x + 7 = 22, then x equals?",
      difficulty: "easy",
      marks: 2,
      negativeMarks: 0.5,
      correctOptionIds: ["q9m3o2"],
      options: [
        { id: "q9m3o1", label: "A", value: "3" },
        { id: "q9m3o2", label: "B", value: "5" },
        { id: "q9m3o3", label: "C", value: "7" },
        { id: "q9m3o4", label: "D", value: "9" }
      ],
      explanation: "Subtract 7 and divide by 3."
    },
    {
      id: "q9m4",
      subjectId: "subject-class9-math",
      topicId: "topic-linear-equations",
      type: "single_correct",
      prompt: "Which equation is linear in one variable?",
      difficulty: "medium",
      marks: 2,
      negativeMarks: 0.5,
      correctOptionIds: ["q9m4o1"],
      options: [
        { id: "q9m4o1", label: "A", value: "2x + 5 = 11" },
        { id: "q9m4o2", label: "B", value: "x² + 1 = 0" },
        { id: "q9m4o3", label: "C", value: "xy = 6" },
        { id: "q9m4o4", label: "D", value: "1/x = 2" }
      ],
      explanation: "A linear equation has variable power 1 only."
    },
    {
      id: "q9m9",
      subjectId: "subject-class9-math",
      topicId: "topic-linear-equations",
      type: "single_correct",
      prompt: "Solve: 5x - 3 = 2x + 12",
      difficulty: "medium",
      marks: 2,
      negativeMarks: 0.5,
      correctOptionIds: ["q9m9o4"],
      options: [
        { id: "q9m9o1", label: "A", value: "2" },
        { id: "q9m9o2", label: "B", value: "3" },
        { id: "q9m9o3", label: "C", value: "4" },
        { id: "q9m9o4", label: "D", value: "5" }
      ],
      explanation: "Bring variable terms together to get 3x = 15."
    },
    {
      id: "q9m10",
      subjectId: "subject-class9-math",
      topicId: "topic-linear-equations",
      type: "single_correct",
      prompt: "If x/3 = 7, then x is?",
      difficulty: "easy",
      marks: 2,
      negativeMarks: 0.5,
      correctOptionIds: ["q9m10o3"],
      options: [
        { id: "q9m10o1", label: "A", value: "18" },
        { id: "q9m10o2", label: "B", value: "20" },
        { id: "q9m10o3", label: "C", value: "21" },
        { id: "q9m10o4", label: "D", value: "24" }
      ],
      explanation: "Multiply both sides by 3."
    },
    {
      id: "q9m5",
      subjectId: "subject-class9-math",
      topicId: "topic-triangles",
      type: "single_correct",
      prompt: "The sum of angles in a triangle is?",
      difficulty: "easy",
      marks: 2,
      negativeMarks: 0.5,
      correctOptionIds: ["q9m5o3"],
      options: [
        { id: "q9m5o1", label: "A", value: "90°" },
        { id: "q9m5o2", label: "B", value: "120°" },
        { id: "q9m5o3", label: "C", value: "180°" },
        { id: "q9m5o4", label: "D", value: "360°" }
      ],
      explanation: "Interior angles of any triangle sum to 180°."
    },
    {
      id: "q9m6",
      subjectId: "subject-class9-math",
      topicId: "topic-triangles",
      type: "single_correct",
      prompt: "An equilateral triangle has how many equal sides?",
      difficulty: "easy",
      marks: 2,
      negativeMarks: 0.5,
      correctOptionIds: ["q9m6o4"],
      options: [
        { id: "q9m6o1", label: "A", value: "1" },
        { id: "q9m6o2", label: "B", value: "2" },
        { id: "q9m6o3", label: "C", value: "0" },
        { id: "q9m6o4", label: "D", value: "3" }
      ],
      explanation: "All three sides are equal."
    },
    {
      id: "q9m11",
      subjectId: "subject-class9-math",
      topicId: "topic-triangles",
      type: "single_correct",
      prompt: "A triangle with two equal sides is called?",
      difficulty: "easy",
      marks: 2,
      negativeMarks: 0.5,
      correctOptionIds: ["q9m11o2"],
      options: [
        { id: "q9m11o1", label: "A", value: "Scalene" },
        { id: "q9m11o2", label: "B", value: "Isosceles" },
        { id: "q9m11o3", label: "C", value: "Right" },
        { id: "q9m11o4", label: "D", value: "Obtuse" }
      ],
      explanation: "An isosceles triangle has two equal sides."
    },
    {
      id: "q9m12",
      subjectId: "subject-class9-math",
      topicId: "topic-triangles",
      type: "single_correct",
      prompt: "If one angle of a triangle is 90°, the triangle is called?",
      difficulty: "easy",
      marks: 2,
      negativeMarks: 0.5,
      correctOptionIds: ["q9m12o4"],
      options: [
        { id: "q9m12o1", label: "A", value: "Acute triangle" },
        { id: "q9m12o2", label: "B", value: "Obtuse triangle" },
        { id: "q9m12o3", label: "C", value: "Equilateral triangle" },
        { id: "q9m12o4", label: "D", value: "Right triangle" }
      ],
      explanation: "A 90° angle defines a right triangle."
    },
    {
      id: "q9s1",
      subjectId: "subject-class9-science",
      topicId: "topic-cells",
      type: "single_correct",
      prompt: "Who discovered the cell?",
      difficulty: "easy",
      marks: 2,
      negativeMarks: 0.5,
      correctOptionIds: ["q9s1o1"],
      options: [
        { id: "q9s1o1", label: "A", value: "Robert Hooke" },
        { id: "q9s1o2", label: "B", value: "Newton" },
        { id: "q9s1o3", label: "C", value: "Einstein" },
        { id: "q9s1o4", label: "D", value: "Rutherford" }
      ],
      explanation: "Robert Hooke observed cork cells first."
    },
    {
      id: "q9s2",
      subjectId: "subject-class9-science",
      topicId: "topic-motion",
      type: "single_correct",
      prompt: "Speed is defined as distance divided by?",
      difficulty: "easy",
      marks: 2,
      negativeMarks: 0.5,
      correctOptionIds: ["q9s2o2"],
      options: [
        { id: "q9s2o1", label: "A", value: "mass" },
        { id: "q9s2o2", label: "B", value: "time" },
        { id: "q9s2o3", label: "C", value: "force" },
        { id: "q9s2o4", label: "D", value: "energy" }
      ],
      explanation: "Speed = distance / time."
    },
    {
      id: "q9s3",
      subjectId: "subject-class9-science",
      topicId: "topic-matter",
      type: "single_correct",
      prompt: "Which state of matter has a fixed volume but no fixed shape?",
      difficulty: "medium",
      marks: 2,
      negativeMarks: 0.5,
      correctOptionIds: ["q9s3o3"],
      options: [
        { id: "q9s3o1", label: "A", value: "Solid" },
        { id: "q9s3o2", label: "B", value: "Gas" },
        { id: "q9s3o3", label: "C", value: "Liquid" },
        { id: "q9s3o4", label: "D", value: "Plasma" }
      ],
      explanation: "Liquids have fixed volume but take the shape of the container."
    },
    {
      id: "q1",
      subjectId: "subject-math",
      topicId: "topic-algebra",
      type: "single_correct",
      prompt: "If x + 5 = 13, what is the value of x?",
      difficulty: "easy",
      marks: 4,
      negativeMarks: 1,
      correctOptionIds: ["q1o2"],
      options: [
        { id: "q1o1", label: "A", value: "6" },
        { id: "q1o2", label: "B", value: "8" },
        { id: "q1o3", label: "C", value: "10" },
        { id: "q1o4", label: "D", value: "18" }
      ],
      explanation: "Subtract 5 from both sides."
    },
    {
      id: "q2",
      subjectId: "subject-math",
      topicId: "topic-algebra",
      type: "single_correct",
      prompt: "Solve: 2x = 18",
      difficulty: "easy",
      marks: 4,
      negativeMarks: 1,
      correctOptionIds: ["q2o3"],
      options: [
        { id: "q2o1", label: "A", value: "6" },
        { id: "q2o2", label: "B", value: "8" },
        { id: "q2o3", label: "C", value: "9" },
        { id: "q2o4", label: "D", value: "12" }
      ],
      explanation: "Divide both sides by 2."
    },
    {
      id: "q3",
      subjectId: "subject-math",
      topicId: "topic-calculus",
      type: "single_correct",
      prompt: "Derivative of x^2 is?",
      difficulty: "medium",
      marks: 4,
      negativeMarks: 1,
      correctOptionIds: ["q3o1"],
      options: [
        { id: "q3o1", label: "A", value: "2x" },
        { id: "q3o2", label: "B", value: "x" },
        { id: "q3o3", label: "C", value: "x^3" },
        { id: "q3o4", label: "D", value: "2" }
      ],
      explanation: "Use the power rule."
    },
    {
      id: "q4",
      subjectId: "subject-math",
      topicId: "topic-calculus",
      type: "single_correct",
      prompt: "Integral of 1 dx is?",
      difficulty: "medium",
      marks: 4,
      negativeMarks: 1,
      correctOptionIds: ["q4o4"],
      options: [
        { id: "q4o1", label: "A", value: "0" },
        { id: "q4o2", label: "B", value: "x^2" },
        { id: "q4o3", label: "C", value: "1" },
        { id: "q4o4", label: "D", value: "x + C" }
      ],
      explanation: "Integral of a constant 1 is x + C."
    },
    {
      id: "q5",
      subjectId: "subject-math",
      topicId: "topic-probability",
      type: "single_correct",
      prompt: "Probability of getting heads on a fair coin toss is?",
      difficulty: "easy",
      marks: 4,
      negativeMarks: 1,
      correctOptionIds: ["q5o2"],
      options: [
        { id: "q5o1", label: "A", value: "0" },
        { id: "q5o2", label: "B", value: "1/2" },
        { id: "q5o3", label: "C", value: "1" },
        { id: "q5o4", label: "D", value: "2" }
      ],
      explanation: "One favorable outcome out of two total outcomes."
    },
    {
      id: "q6",
      subjectId: "subject-math",
      topicId: "topic-probability",
      type: "multi_correct",
      prompt: "Which of the following are valid probabilities?",
      difficulty: "hard",
      marks: 4,
      negativeMarks: 1,
      correctOptionIds: ["q6o1", "q6o3"],
      options: [
        { id: "q6o1", label: "A", value: "0.4" },
        { id: "q6o2", label: "B", value: "-0.5" },
        { id: "q6o3", label: "C", value: "1" },
        { id: "q6o4", label: "D", value: "1.5" }
      ],
      explanation: "A valid probability lies between 0 and 1 inclusive."
    },
    {
      id: "q-bio1",
      subjectId: "subject-biology",
      topicId: "topic-human-reproduction",
      type: "single_correct",
      prompt: "Which of the following is the primary male sex organ?",
      difficulty: "easy",
      marks: 4,
      negativeMarks: 1,
      correctOptionIds: ["q-bio1o1"],
      options: [
        { id: "q-bio1o1", label: "A", value: "Testis" },
        { id: "q-bio1o2", label: "B", value: "Penis" },
        { id: "q-bio1o3", label: "C", value: "Prostate gland" },
        { id: "q-bio1o4", label: "D", value: "Vas deferens" }
      ],
      explanation: "The testes are the primary sex organs in males as they produce sperm and testosterone."
    },
    {
      id: "q-chem-1",
      subjectId: "subject-class9-science",
      topicId: "topic-matter",
      type: "single_correct",
      prompt: "Identify the structure of Benzene, a common aromatic hydrocarbon.",
      difficulty: "medium",
      marks: 4,
      negativeMarks: 1,
      correctOptionIds: ["q-chem-1o1"],
      options: [
        { id: "q-chem-1o1", label: "A", value: "[SMILES: c1ccccc1]" },
        { id: "q-chem-1o2", label: "B", value: "[SMILES: CCO]" },
        { id: "q-chem-1o3", label: "C", value: "[SMILES: CC(=O)O]" },
        { id: "q-chem-1o4", label: "D", value: "[SMILES: C]" }
      ],
      explanation: "Benzene has a hexagonal ring structure with delocalized pi electrons, represented as c1ccccc1 in SMILES."
    },
    {
      id: "q-chem-2",
      subjectId: "subject-class9-science",
      topicId: "topic-matter",
      type: "single_correct",
      prompt: "Which of the following represents the molecular structure of Ethanol (Alcohol)?",
      difficulty: "easy",
      marks: 4,
      negativeMarks: 1,
      correctOptionIds: ["q-chem-2o2"],
      options: [
        { id: "q-chem-2o1", label: "A", value: "[SMILES: C]" },
        { id: "q-chem-2o2", label: "B", value: "[SMILES: CCO]" },
        { id: "q-chem-2o3", label: "C", value: "[SMILES: O]" },
        { id: "q-chem-2o4", label: "D", value: "[SMILES: CC(=O)O]" }
      ],
      explanation: "Ethanol (CH3CH2OH) is represented as CCO in SMILES notation."
    }
  ],
  blueprints: [
    {
      id: "bp-class9-math",
      name: "Class 9 CBSE Maths Unit Test",
      classId: "class-9",
      streamId: "stream-cbse",
      batchId: "batch-9-cbse",
      subjectId: "subject-class9-math",
      durationMinutes: 25,
      negativeMarkingEnabled: true,
      topicRules: [
        { topicId: "topic-number-systems", questionCount: 2 },
        { topicId: "topic-linear-equations", questionCount: 2 },
        { topicId: "topic-triangles", questionCount: 2 }
      ]
    },
    {
      id: "bp-class9-science",
      name: "Class 9 CBSE Science Quick Test",
      classId: "class-9",
      streamId: "stream-cbse",
      batchId: "batch-9-cbse",
      subjectId: "subject-class9-science",
      durationMinutes: 15,
      negativeMarkingEnabled: true,
      topicRules: [
        { topicId: "topic-cells", questionCount: 1 },
        { topicId: "topic-motion", questionCount: 1 },
        { topicId: "topic-matter", questionCount: 1 }
      ]
    },
    {
      id: "bp1",
      name: "Math Chapter Test",
      classId: "class-12",
      streamId: "stream-science",
      batchId: "batch-a1",
      subjectId: "subject-math",
      durationMinutes: 30,
      negativeMarkingEnabled: true,
      topicRules: [
        { topicId: "topic-algebra", questionCount: 2 },
        { topicId: "topic-calculus", questionCount: 2 },
        { topicId: "topic-probability", questionCount: 2 }
      ]
    },
    {
      id: "bp-biology",
      name: "Biology Unit Test (Reproduction)",
      classId: "class-12",
      streamId: "stream-science",
      batchId: "batch-a1",
      subjectId: "subject-biology",
      durationMinutes: 20,
      negativeMarkingEnabled: true,
      topicRules: [
        { topicId: "topic-human-reproduction", questionCount: 1 }
      ]
    }
  ],
  exams: [],
  submissions: [],
  users: [
    {
      id: "user-admin",
      name: "Institute Admin",
      email: "admin@coaching.local",
      role: "super_admin"
    },
    {
      id: "user-teacher",
      name: "Faculty Teacher",
      email: "teacher@coaching.local",
      role: "teacher"
    },
    {
      id: "user-student",
      name: "Aarav Mehta",
      email: "student@coaching.local",
      role: "student",
      studentId: "student-9-1"
    }
  ]
};
