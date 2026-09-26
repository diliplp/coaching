import { getAppState, upsertRecord } from "../data/database.js";
import type {
  AdaptiveExamPlan,
  AdaptiveExamPlanTopic,
  BatchAdaptivePlan,
  Chapter,
  Exam,
  ExamBlueprint,
  ExamSection,
  ExamSubmissionResult,
  GeneratedExamQuestion,
  Question,
  QuestionSource,
  StudentAnswerInput,
  Subject,
  TeacherCustomExamRequest,
  Topic,
  TopicInsight,
  WeightedExamRule
} from "../types.js";

export interface SubjectAllocationRule {
  subjectId: string;
  questionCount: number;
}

export interface CombinedExamRequest {
  name: string;
  batchId: string;
  durationMinutes: number;
  subjectAllocations: SubjectAllocationRule[];
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  allowedSourceTypes?: QuestionSource[];
  sections?: ExamSection[];
  subjectTypeAllocations?: { subjectId: string; mcqCount: number; integerCount: number }[];
}

function sortedIds(values: string[]) {
  return [...values].sort();
}

function sameSelections(a: string[], b: string[]) {
  return JSON.stringify(sortedIds(a)) === JSON.stringify(sortedIds(b));
}

function uniqueById<T extends { id: string }>(records: T[]) {
  const seen = new Set<string>();
  return records.filter((record) => {
    if (seen.has(record.id)) {
      return false;
    }
    seen.add(record.id);
    return true;
  });
}

function randomize<T>(values: T[]) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function buildOptionOrderIds(question: Question) {
  return randomize(question.options.map((option) => option.id));
}

// Canonical section order matching how real exam papers are laid out — Physics first,
// then Chemistry, then Mathematics/Biology (only one of the two applies per exam type,
// so tying them at the same rank is fine; neither ever co-occurs with the other in
// practice). Anything else (e.g. a "General" subject) sorts last, alphabetically among
// ties. A flat cross-subject shuffle doesn't match how students expect a real paper to
// read, so questions are grouped into subject sections in this fixed order, and only
// shuffled *within* each section.
function subjectSectionRank(subjectName: string): number {
  const name = subjectName.toLowerCase();
  if (name.includes("physics")) return 0;
  if (name.includes("chemistry")) return 1;
  if (name.includes("math") || name.includes("bio")) return 2;
  return 3;
}

function orderQuestionsBySection(questions: Question[], subjects: Subject[]): Question[] {
  const subjectNameById = new Map(subjects.map((s) => [s.id, s.name]));
  const groups = new Map<string, Question[]>();
  for (const question of questions) {
    const list = groups.get(question.subjectId) ?? [];
    list.push(question);
    groups.set(question.subjectId, list);
  }

  const orderedSubjectIds = [...groups.keys()].sort((a, b) => {
    const nameA = subjectNameById.get(a) ?? "";
    const nameB = subjectNameById.get(b) ?? "";
    const rankDiff = subjectSectionRank(nameA) - subjectSectionRank(nameB);
    return rankDiff !== 0 ? rankDiff : nameA.localeCompare(nameB);
  });

  return orderedSubjectIds.flatMap((subjectId) => randomize(groups.get(subjectId)!));
}

function formatQuestionsForExam(selectedQuestions: Question[], subjects: Subject[]): GeneratedExamQuestion[] {
  return orderQuestionsBySection(selectedQuestions, subjects).map((question, index) => ({
    questionId: question.id,
    order: index + 1,
    optionOrderIds: buildOptionOrderIds(question)
  }));
}

function buildPlanTopics(
  rankedTopics: Array<{
    topicId: string;
    topicName: string;
    averageAccuracy: number;
    averageWeaknessScore: number;
  }>,
  fallbackTopics: Array<{ id: string; name: string }>,
  relevantQuestions: Question[]
) {
  const selectedTopics = rankedTopics.slice(0, 3);
  if (selectedTopics.length === 0 && fallbackTopics.length === 0) {
    return [];
  }

  return (selectedTopics.length > 0
    ? selectedTopics
    : fallbackTopics.map((topic) => ({
        topicId: topic.id,
        topicName: topic.name,
        averageAccuracy: 0,
        averageWeaknessScore: 1
      })))
    .slice(0, 3)
    .map((topic, index) => {
      const availableQuestionCount = relevantQuestions.filter((question) => question.topicId === topic.topicId).length;
      const requestedQuestionCount = Math.min(availableQuestionCount, index === 0 ? 3 : 2);

      return {
        topicId: topic.topicId,
        topicName: topic.topicName,
        questionCount: Math.max(1, requestedQuestionCount),
        reason:
          topic.averageAccuracy <= 40
            ? "Low recent accuracy"
            : topic.averageWeaknessScore >= 1.2
              ? "High weakness score across recent tests"
              : "Needs additional reinforcement",
        averageAccuracy: topic.averageAccuracy,
        averageWeaknessScore: topic.averageWeaknessScore
      };
    });
}

function buildAllocation(
  totalQuestions: number,
  rules: WeightedExamRule[],
  availabilityByEntity: Map<string, number>
) {
  const validRules = rules.filter((rule) => rule.weightagePercent > 0 && (availabilityByEntity.get(rule.entityId) ?? 0) > 0);
  if (totalQuestions <= 0 || validRules.length === 0) {
    return new Map<string, number>();
  }

  const totalWeight = validRules.reduce((sum, rule) => sum + rule.weightagePercent, 0);
  if (totalWeight <= 0) {
    return new Map<string, number>();
  }

  const rawAllocations = validRules.map((rule) => {
    const rawCount = (totalQuestions * rule.weightagePercent) / totalWeight;
    const available = availabilityByEntity.get(rule.entityId) ?? 0;
    return {
      entityId: rule.entityId,
      rawCount,
      count: Math.min(available, Math.floor(rawCount)),
      fraction: rawCount - Math.floor(rawCount),
      available
    };
  });

  let allocated = rawAllocations.reduce((sum, rule) => sum + rule.count, 0);

  rawAllocations
    .sort((left, right) => right.fraction - left.fraction)
    .forEach((rule) => {
      if (allocated >= totalQuestions) {
        return;
      }
      if (rule.count < rule.available) {
        rule.count += 1;
        allocated += 1;
      }
    });

  if (allocated < totalQuestions) {
    rawAllocations
      .sort((left, right) => right.available - left.available)
      .forEach((rule) => {
        while (allocated < totalQuestions && rule.count < rule.available) {
          rule.count += 1;
          allocated += 1;
        }
      });
  }

  return new Map(rawAllocations.filter((rule) => rule.count > 0).map((rule) => [rule.entityId, rule.count]));
}

function pickQuestions(
  candidates: Question[],
  count: number,
  usedQuestionIds: Set<string>,
  selectedQuestionIds: Set<string>
) {
  const unusedCandidates = randomize(
    candidates.filter((question) => !usedQuestionIds.has(question.id) && !selectedQuestionIds.has(question.id))
  );
  const fallbackCandidates = randomize(
    candidates.filter((question) => !selectedQuestionIds.has(question.id) && usedQuestionIds.has(question.id))
  );
  const selected = [...unusedCandidates, ...fallbackCandidates].slice(0, count);
  selected.forEach((question) => selectedQuestionIds.add(question.id));
  return selected;
}

function getUsedQuestionIds(state: Awaited<ReturnType<typeof getAppState>>, sourceSignature: string) {
  const relatedExamQuestionIds = state.exams
    .filter((exam) => exam.sourceSignature === sourceSignature)
    .flatMap((exam) => exam.questions.map((question) => question.questionId));
  return new Set(relatedExamQuestionIds);
}

function createExamFromQuestions(input: {
  exam: Omit<Exam, "id" | "generatedAt" | "questions">;
  questions: Question[];
  subjects: Subject[];
}) {
  const exam: Exam = {
    id: `exam-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    ...input.exam,
    questions: formatQuestionsForExam(input.questions, input.subjects)
  };

  return exam;
}

function topicDisplayName(topicId: string, topics: Topic[]) {
  return topics.find((topic) => topic.id === topicId)?.name ?? "Unknown Topic";
}

function chapterDisplayName(chapterId: string, chapters: Chapter[]) {
  return chapters.find((chapter) => chapter.id === chapterId)?.name ?? "Unknown Chapter";
}

function buildCustomSourceSignature(request: TeacherCustomExamRequest) {
  const rulesSignature = [...request.rules]
    .filter((rule) => rule.weightagePercent > 0)
    .sort((left, right) => left.entityId.localeCompare(right.entityId))
    .map((rule) => `${rule.entityId}:${rule.weightagePercent}`)
    .join("|");
  const subjectIds = request.subjectIds || (request.subjectId ? [request.subjectId] : []);
  const subjectsStr = subjectIds.sort().join(",");
  return `custom:${request.batchId}:${subjectsStr}:${request.selectionMode}:${request.totalQuestions}:${rulesSignature}`;
}

export async function generateExamFromBlueprint(blueprintId: string): Promise<Exam | null> {
  const state = await getAppState();
  const blueprint = state.blueprints.find((item) => item.id === blueprintId);
  if (!blueprint) {
    return null;
  }

  const sourceSignature = `blueprint:${blueprint.id}`;
  const usedQuestionIds = getUsedQuestionIds(state, sourceSignature);
  const selectedQuestionIds = new Set<string>();

  const selectedQuestions = blueprint.topicRules.flatMap((rule) => {
    const candidates = state.questions.filter(
      (question) => question.topicId === rule.topicId && question.subjectId === blueprint.subjectId && question.qaStatus !== "rejected"
    );
    return pickQuestions(candidates, rule.questionCount, usedQuestionIds, selectedQuestionIds);
  });

  const exam = createExamFromQuestions({
    exam: {
      blueprintId: blueprint.id,
      name: `${blueprint.name} - Live Test`,
      classId: blueprint.classId,
      streamId: blueprint.streamId,
      batchId: blueprint.batchId,
      subjectId: blueprint.subjectId,
      durationMinutes: blueprint.durationMinutes,
      generationMode: "blueprint",
      sourceSignature,
      ...(blueprint.examPattern ? { examPattern: blueprint.examPattern } : {}),
      ...(blueprint.sections ? { sections: blueprint.sections } : {})
    },
    questions: selectedQuestions,
    subjects: state.subjects
  });

  await upsertRecord("exams", exam);
  return exam;
}

export async function generateCustomExam(request: TeacherCustomExamRequest): Promise<Exam | { error: string } | null> {
  const state = await getAppState();
  const batch = state.batches.find((item) => item.id === request.batchId);
  const targetSubjectIds = request.subjectIds || (request.subjectId ? [request.subjectId] : []);
  const subjects = state.subjects.filter((item) => targetSubjectIds.includes(item.id));

  if (!batch || subjects.length === 0) {
    return { error: "Batch or subjects not found" };
  }

  // Verify all subjects match the batch class/stream
  for (const subject of subjects) {
    if (batch.classId !== subject.classId || batch.streamId !== subject.streamId) {
      return { error: `Subject ${subject.name} does not match the selected batch class/stream` };
    }
  }

  const normalizedRules = request.rules.filter((rule) => rule.weightagePercent > 0);
  const weightageSum = normalizedRules.reduce((sum, rule) => sum + rule.weightagePercent, 0);
  if (normalizedRules.length === 0) {
    return { error: "At least one weighted chapter or topic must be selected" };
  }

  if (Math.abs(weightageSum - 100) > 0.1) {
    return { error: "Selected weightages must total 100%" };
  }

  const subjectTopics = state.topics.filter((topic) => targetSubjectIds.includes(topic.subjectId));
  let subjectQuestions = state.questions.filter((question) => targetSubjectIds.includes(question.subjectId) && question.qaStatus !== "rejected");

  // Apply Source Filtering
  if (Array.isArray(request.allowedSourceTypes) && request.allowedSourceTypes.length > 0) {
    subjectQuestions = subjectQuestions.filter(q => request.allowedSourceTypes?.includes(q.sourceType || "custom"));
  }

  // Apply Difficulty Filtering
  if (request.difficulty && request.difficulty !== "mixed") {
    subjectQuestions = subjectQuestions.filter(q => q.difficulty === request.difficulty);
  }

  // Apply Tag Filtering
  if (request.tag) {
    const filterTagLower = request.tag.toLowerCase();
    subjectQuestions = subjectQuestions.filter(q => q.tags?.some(t => t.toLowerCase().includes(filterTagLower)));
  } else if (Array.isArray(request.tags) && request.tags.length > 0) {
    subjectQuestions = subjectQuestions.filter(q => q.tags?.some(t => request.tags!.includes(t)));
  }

  // Opt-in hard exclusion of questions already used in ANY previous exam for this batch
  // (distinct from the softer sourceSignature-based preference below, which only avoids
  // repeats across identically-shaped re-generations of the same exam).
  if (request.excludeUsedQuestions) {
    const batchUsedQuestionIds = new Set(
      state.exams
        .filter((exam) => exam.batchId === request.batchId)
        .flatMap((exam) => exam.questions.map((question) => question.questionId))
    );
    subjectQuestions = subjectQuestions.filter((question) => !batchUsedQuestionIds.has(question.id));
  }

  const availabilityByEntity = new Map<string, number>();

  if (request.selectionMode === "topic") {
    normalizedRules.forEach((rule) => {
      availabilityByEntity.set(
        rule.entityId,
        subjectQuestions.filter((question) => question.topicId === rule.entityId).length
      );
    });
  } else {
    normalizedRules.forEach((rule) => {
      const chapterTopicIds = subjectTopics
        .filter((topic) => topic.chapterId === rule.entityId)
        .map((topic) => topic.id);
      availabilityByEntity.set(
        rule.entityId,
        subjectQuestions.filter((question) => chapterTopicIds.includes(question.topicId)).length
      );
    });
  }

  const allocations = buildAllocation(request.totalQuestions, normalizedRules, availabilityByEntity);
  if (allocations.size === 0) {
    return { error: "No questions are available for the selected chapters/topics" };
  }

  const sourceSignature = buildCustomSourceSignature(request);
  const usedQuestionIds = getUsedQuestionIds(state, sourceSignature);
  const selectedQuestionIds = new Set<string>();
  const selectedQuestions: Question[] = [];

  if (request.selectionMode === "topic") {
    allocations.forEach((count, topicId) => {
      const candidates = subjectQuestions.filter((question) => question.topicId === topicId);
      selectedQuestions.push(...pickQuestions(candidates, count, usedQuestionIds, selectedQuestionIds));
    });
  } else {
    allocations.forEach((count, chapterId) => {
      const chapterTopics = subjectTopics.filter((topic) => topic.chapterId === chapterId);
      const chapterAvailability = new Map(
        chapterTopics.map((topic) => [
          topic.id,
          subjectQuestions.filter((question) => question.topicId === topic.id).length
        ])
      );
      const chapterTopicRules = chapterTopics.map((topic) => ({
        entityId: topic.id,
        weightagePercent: (chapterAvailability.get(topic.id) ?? 0) * 100
      }));
      const topicAllocations = buildAllocation(count, chapterTopicRules, chapterAvailability);

      topicAllocations.forEach((topicCount, topicId) => {
        const candidates = subjectQuestions.filter((question) => question.topicId === topicId);
        selectedQuestions.push(...pickQuestions(candidates, topicCount, usedQuestionIds, selectedQuestionIds));
      });
    });
  }

  const coverageText =
    request.selectionMode === "topic"
      ? normalizedRules
          .map((rule) => `${topicDisplayName(rule.entityId, subjectTopics)} ${rule.weightagePercent}%`)
          .join(", ")
      : normalizedRules
          .map((rule) => `${chapterDisplayName(rule.entityId, state.chapters)} ${rule.weightagePercent}%`)
          .join(", ");

  const exam = createExamFromQuestions({
    exam: {
      blueprintId: `custom-${targetSubjectIds.join("-")}`,
      name: request.name,
      classId: batch.classId,
      streamId: batch.streamId,
      batchId: batch.id,
      subjectId: (() => {
        // Find which subject has the most questions in the final selection
        const subjectCounts = new Map<string, number>();
        selectedQuestions.forEach(q => {
          subjectCounts.set(q.subjectId, (subjectCounts.get(q.subjectId) || 0) + 1);
        });
        let maxSubject = targetSubjectIds[0] || "";
        let maxCount = -1;
        subjectCounts.forEach((count, subId) => {
          if (count > maxCount) {
            maxCount = count;
            maxSubject = subId;
          }
        });
        return maxSubject;
      })(),
      durationMinutes: request.durationMinutes,
      generationMode: "custom",
      adaptiveSummary: `${request.selectionMode === "chapter" ? "Chapter-wise" : "Topic-wise"} weighted paper: ${coverageText}`,
      sourceSignature,
      scheduledStartTime: request.scheduledStartTime,
      scheduledEndTime: request.scheduledEndTime
    },
    questions: selectedQuestions,
    subjects: state.subjects
  });

  await upsertRecord("exams", exam);
  return exam;
}

export async function generateCombinedExam(request: CombinedExamRequest): Promise<Exam | { error: string } | null> {
  const state = await getAppState();
  const batch = state.batches.find((b) => b.id === request.batchId);
  if (!batch) return { error: "Batch not found" };

  const allocations = request.subjectAllocations;
  if (!allocations?.length) return { error: "No subject allocations provided" };

  const selectedQuestions: Question[] = [];
  const allocationSummary: string[] = [];

  if (request.subjectTypeAllocations?.length) {
    // Type-aware picking: MCQ first, then integer — preserves section order for preset exams
    for (const typeAlloc of request.subjectTypeAllocations) {
      let pool = state.questions.filter((q) => q.subjectId === typeAlloc.subjectId && q.qaStatus !== "rejected");
      if (request.allowedSourceTypes?.length) {
        pool = pool.filter((q) => request.allowedSourceTypes!.includes((q.sourceType || "custom") as QuestionSource));
      }
      const mcqPool = randomize(pool.filter((q) => q.type !== "integer"));
      const intPool = randomize(pool.filter((q) => q.type === "integer"));
      const mcqs = mcqPool.slice(0, typeAlloc.mcqCount);
      const ints = intPool.slice(0, typeAlloc.integerCount);
      // Fill any integer shortfall with extra MCQ questions
      const intShortfall = typeAlloc.integerCount - ints.length;
      const extraMcqs = intShortfall > 0 ? mcqPool.filter((q) => !mcqs.includes(q)).slice(0, intShortfall) : [];
      selectedQuestions.push(...mcqs, ...ints, ...extraMcqs);
      const subjectName = state.subjects.find((s) => s.id === typeAlloc.subjectId)?.name ?? typeAlloc.subjectId;
      allocationSummary.push(`${subjectName}: ${mcqs.length}MCQ+${ints.length + extraMcqs.length}int`);
    }
  } else {
    for (const alloc of allocations) {
      let pool = state.questions.filter((q) => q.subjectId === alloc.subjectId && q.qaStatus !== "rejected");
      if (request.allowedSourceTypes?.length) {
        pool = pool.filter((q) => request.allowedSourceTypes!.includes((q.sourceType || "custom") as QuestionSource));
      }
      const picked = randomize(pool).slice(0, alloc.questionCount);
      selectedQuestions.push(...picked);
      const subjectName = state.subjects.find((s) => s.id === alloc.subjectId)?.name ?? alloc.subjectId;
      allocationSummary.push(`${subjectName}: ${picked.length}Q`);
    }
  }

  if (selectedQuestions.length === 0) {
    return { error: "No questions available for the selected subjects" };
  }

  const subjectIds = allocations.map((a) => a.subjectId);
  const subjectCounts = new Map<string, number>();
  selectedQuestions.forEach((q) => subjectCounts.set(q.subjectId, (subjectCounts.get(q.subjectId) || 0) + 1));
  let primarySubjectId = subjectIds[0];
  let maxCount = -1;
  subjectCounts.forEach((count, subId) => { if (count > maxCount) { maxCount = count; primarySubjectId = subId; } });

  const exam = createExamFromQuestions({
    exam: {
      blueprintId: `combined-${subjectIds.join("-")}`,
      name: request.name,
      classId: batch.classId,
      streamId: batch.streamId,
      batchId: batch.id,
      subjectId: primarySubjectId,
      durationMinutes: request.durationMinutes,
      generationMode: "custom",
      adaptiveSummary: `Combined: ${allocationSummary.join(" | ")}`,
      scheduledStartTime: request.scheduledStartTime,
      scheduledEndTime: request.scheduledEndTime,
      ...(request.sections ? { sections: request.sections } : {})
    },
    questions: selectedQuestions,
    subjects: state.subjects
  });

  await upsertRecord("exams", exam);
  return exam;
}

export async function buildAdaptiveExamPlan(studentId: string, subjectId?: string): Promise<AdaptiveExamPlan | null> {
  const state = await getAppState();
  const student = state.students.find((item) => item.id === studentId);
  if (!student) {
    return null;
  }

  const studentSubmissions = state.submissions.filter((submission) => submission.studentId === studentId);
  if (studentSubmissions.length === 0) {
    return null;
  }

  const studentExamIds = new Set(studentSubmissions.map((submission) => submission.examId));
  const attemptedExams = state.exams.filter((exam) => studentExamIds.has(exam.id));
  const filteredExams = subjectId
    ? attemptedExams.filter((exam) => exam.subjectId === subjectId)
    : attemptedExams;

  if (filteredExams.length === 0) {
    return null;
  }

  const preferredSubjectId =
    subjectId ??
    filteredExams
      .map((exam) => exam.subjectId)
      .sort(
        (left, right) =>
          filteredExams.filter((exam) => exam.subjectId === right).length -
          filteredExams.filter((exam) => exam.subjectId === left).length
      )[0];

  if (!preferredSubjectId) {
    return null;
  }

  const relevantExamIds = new Set(
    filteredExams.filter((exam) => exam.subjectId === preferredSubjectId).map((exam) => exam.id)
  );
  const relevantSubmissions = studentSubmissions.filter((submission) => relevantExamIds.has(submission.examId));
  if (relevantSubmissions.length === 0) {
    return null;
  }

  const subject = state.subjects.find((item) => item.id === preferredSubjectId);
  const relevantQuestions = state.questions.filter((question) => question.subjectId === preferredSubjectId && question.qaStatus !== "rejected");

  const topicMetrics = new Map<
    string,
    {
      topicId: string;
      topicName: string;
      totalAccuracy: number;
      totalWeaknessScore: number;
      appearances: number;
    }
  >();

  relevantSubmissions.forEach((submission) => {
    submission.insights.forEach((insight) => {
      const current = topicMetrics.get(insight.topicId) ?? {
        topicId: insight.topicId,
        topicName: insight.topicName,
        totalAccuracy: 0,
        totalWeaknessScore: 0,
        appearances: 0
      };

      current.totalAccuracy += insight.accuracy;
      current.totalWeaknessScore += insight.weaknessScore;
      current.appearances += 1;
      topicMetrics.set(insight.topicId, current);
    });
  });

  const rankedTopics = Array.from(topicMetrics.values())
    .map((metric) => ({
      topicId: metric.topicId,
      topicName: metric.topicName,
      averageAccuracy: Number((metric.totalAccuracy / metric.appearances).toFixed(2)),
      averageWeaknessScore: Number((metric.totalWeaknessScore / metric.appearances).toFixed(2))
    }))
    .sort((left, right) => {
      if (right.averageWeaknessScore !== left.averageWeaknessScore) {
        return right.averageWeaknessScore - left.averageWeaknessScore;
      }
      return left.averageAccuracy - right.averageAccuracy;
    });

  const fallbackTopics = uniqueById(
    relevantQuestions
      .map((question) => state.topics.find((topic) => topic.id === question.topicId))
      .filter((topic): topic is NonNullable<typeof topic> => Boolean(topic))
  );

  const planTopics = buildPlanTopics(rankedTopics, fallbackTopics, relevantQuestions);
  if (planTopics.length === 0) {
    return null;
  }

  return {
    studentId: student.id,
    studentName: student.name,
    subjectId: preferredSubjectId,
    subjectName: subject?.name ?? "Unknown Subject",
    basedOnSubmissionCount: relevantSubmissions.length,
    durationMinutes: Math.max(15, planTopics.reduce((sum, topic) => sum + topic.questionCount, 0) * 4),
    topics: planTopics,
    summary: `Adaptive practice focused on ${planTopics
      .map((topic) => topic.topicName)
      .join(", ")} based on ${relevantSubmissions.length} past submission(s).`
  };
}

export async function generateAdaptiveExam(studentId: string, subjectId?: string): Promise<{ exam: Exam; plan: AdaptiveExamPlan } | null> {
  const state = await getAppState();
  const plan = await buildAdaptiveExamPlan(studentId, subjectId);
  if (!plan) {
    return null;
  }

  const sourceSignature = `adaptive:${plan.studentId}:${plan.subjectId}`;
  const usedQuestionIds = getUsedQuestionIds(state, sourceSignature);
  const selectedQuestionIds = new Set<string>();
  const selectedQuestions = plan.topics.flatMap((topic) => {
    const candidates = state.questions
      .filter((question) => question.subjectId === plan.subjectId && question.topicId === topic.topicId && question.qaStatus !== "rejected")
      .sort((left, right) => left.marks - right.marks);
    return pickQuestions(candidates, topic.questionCount, usedQuestionIds, selectedQuestionIds);
  });

  const student = state.students.find((item) => item.id === plan.studentId);
  const exam = createExamFromQuestions({
    exam: {
      blueprintId: `adaptive-${plan.subjectId}`,
      name: `${plan.studentName} Adaptive Practice`,
      classId: student?.classId ?? "",
      streamId: student?.streamId ?? "",
      batchId: student?.batchId ?? "",
      subjectId: plan.subjectId,
      durationMinutes: plan.durationMinutes,
      generationMode: "adaptive",
      adaptiveForStudentId: plan.studentId,
      adaptiveSummary: plan.summary,
      sourceSignature
    },
    questions: selectedQuestions,
    subjects: state.subjects
  });

  await upsertRecord("exams", exam);
  return { exam, plan };
}

export async function buildBatchAdaptivePlan(batchId: string, subjectId?: string): Promise<BatchAdaptivePlan | null> {
  const state = await getAppState();
  const batch = state.batches.find((item) => item.id === batchId);
  if (!batch) {
    return null;
  }

  const batchStudents = state.students.filter((student) => student.batchId === batchId);
  if (batchStudents.length === 0) {
    return null;
  }

  const batchStudentIds = new Set(batchStudents.map((student) => student.id));
  const batchSubmissions = state.submissions.filter((submission) => batchStudentIds.has(submission.studentId));
  if (batchSubmissions.length === 0) {
    return null;
  }

  const examIds = new Set(batchSubmissions.map((submission) => submission.examId));
  const attemptedExams = state.exams.filter((exam) => examIds.has(exam.id));
  const filteredExams = subjectId ? attemptedExams.filter((exam) => exam.subjectId === subjectId) : attemptedExams;
  if (filteredExams.length === 0) {
    return null;
  }

  const preferredSubjectId =
    subjectId ??
    filteredExams
      .map((exam) => exam.subjectId)
      .sort(
        (left, right) =>
          filteredExams.filter((exam) => exam.subjectId === right).length -
          filteredExams.filter((exam) => exam.subjectId === left).length
      )[0];

  if (!preferredSubjectId) {
    return null;
  }

  const relevantExamIds = new Set(
    filteredExams.filter((exam) => exam.subjectId === preferredSubjectId).map((exam) => exam.id)
  );
  const relevantSubmissions = batchSubmissions.filter((submission) => relevantExamIds.has(submission.examId));
  if (relevantSubmissions.length === 0) {
    return null;
  }

  const subject = state.subjects.find((item) => item.id === preferredSubjectId);
  const relevantQuestions = state.questions.filter((question) => question.subjectId === preferredSubjectId && question.qaStatus !== "rejected");
  const topicMetrics = new Map<
    string,
    {
      topicId: string;
      topicName: string;
      totalAccuracy: number;
      totalWeaknessScore: number;
      appearances: number;
    }
  >();

  relevantSubmissions.forEach((submission) => {
    submission.insights.forEach((insight) => {
      const current = topicMetrics.get(insight.topicId) ?? {
        topicId: insight.topicId,
        topicName: insight.topicName,
        totalAccuracy: 0,
        totalWeaknessScore: 0,
        appearances: 0
      };
      current.totalAccuracy += insight.accuracy;
      current.totalWeaknessScore += insight.weaknessScore;
      current.appearances += 1;
      topicMetrics.set(insight.topicId, current);
    });
  });

  const rankedTopics = Array.from(topicMetrics.values())
    .map((metric) => ({
      topicId: metric.topicId,
      topicName: metric.topicName,
      averageAccuracy: Number((metric.totalAccuracy / metric.appearances).toFixed(2)),
      averageWeaknessScore: Number((metric.totalWeaknessScore / metric.appearances).toFixed(2))
    }))
    .sort((left, right) => {
      if (right.averageWeaknessScore !== left.averageWeaknessScore) {
        return right.averageWeaknessScore - left.averageWeaknessScore;
      }
      return left.averageAccuracy - right.averageAccuracy;
    });

  const fallbackTopics = uniqueById(
    relevantQuestions
      .map((question) => state.topics.find((topic) => topic.id === question.topicId))
      .filter((topic): topic is NonNullable<typeof topic> => Boolean(topic))
  );

  const planTopics = buildPlanTopics(rankedTopics, fallbackTopics, relevantQuestions);
  if (planTopics.length === 0) {
    return null;
  }

  return {
    batchId: batch.id,
    batchName: batch.name,
    subjectId: preferredSubjectId,
    subjectName: subject?.name ?? "Unknown Subject",
    basedOnSubmissionCount: relevantSubmissions.length,
    studentsConsidered: new Set(relevantSubmissions.map((submission) => submission.studentId)).size,
    durationMinutes: Math.max(15, planTopics.reduce((sum, topic) => sum + topic.questionCount, 0) * 4),
    topics: planTopics,
    summary: `Batch adaptive focus for ${batch.name}: ${planTopics.map((topic) => topic.topicName).join(", ")} based on ${relevantSubmissions.length} submission(s).`
  };
}

export async function listBatchAdaptivePlans(subjectId?: string): Promise<BatchAdaptivePlan[]> {
  const state = await getAppState();
  const plans = await Promise.all(state.batches.map((batch) => buildBatchAdaptivePlan(batch.id, subjectId)));
  return plans.filter((plan): plan is BatchAdaptivePlan => Boolean(plan));
}

export async function getExamQuestions(examId: string): Promise<Question[]> {
  const state = await getAppState();
  const exam = state.exams.find((item) => item.id === examId);
  if (!exam) {
    return [];
  }

  return exam.questions
    .slice()
    .sort((left, right) => left.order - right.order)
    .map((entry) => {
      const question = state.questions.find((item) => item.id === entry.questionId);
      if (!question) {
        return null;
      }

      const orderedOptions = entry.optionOrderIds?.length
        ? entry.optionOrderIds
            .map((optionId) => question.options.find((option) => option.id === optionId))
            .filter((option): option is NonNullable<typeof option> => Boolean(option))
            .map((option, index) => ({
              ...option,
              label: String.fromCharCode(65 + index)
            }))
        : question.options;

      return {
        ...question,
        options: orderedOptions
      };
    })
    .filter((question): question is Question => Boolean(question));
}

function isAnswerAttempted(question: Question, answer: StudentAnswerInput | undefined): boolean {
  if (!answer) return false;
  if (question.type === "integer") return answer.integerAnswer !== undefined && answer.integerAnswer !== null;
  return (answer.selectedOptionIds ?? []).length > 0;
}

function isAnswerCorrect(question: Question, answer: StudentAnswerInput | undefined): boolean {
  if (!answer) return false;
  if (question.type === "integer") {
    return answer.integerAnswer !== undefined && answer.integerAnswer === question.integerAnswer;
  }
  return sameSelections(answer.selectedOptionIds ?? [], question.correctOptionIds);
}

export async function evaluateExamSubmission(
  examId: string,
  studentId: string,
  answers: StudentAnswerInput[]
): Promise<ExamSubmissionResult | null> {
  const state = await getAppState();
  const exam = state.exams.find((item) => item.id === examId);
  if (!exam) {
    return null;
  }

  const questions = await getExamQuestions(examId);

  // Build section membership: questionId → section index (when exam has sections)
  // Questions are assigned to sections in order: first section.totalQuestions go to section[0], next to section[1], etc.
  const questionSectionIndex = new Map<string, number>();
  if (exam.sections && exam.sections.length > 0) {
    let pos = 0;
    exam.sections.forEach((section, sIdx) => {
      for (let i = 0; i < section.totalQuestions && pos < questions.length; i++, pos++) {
        questionSectionIndex.set(questions[pos].id, sIdx);
      }
    });
  }

  // For optional sections (attemptQuestions < totalQuestions), track how many attempted per section
  // Only grade up to attemptQuestions per section (in question order)
  const sectionAttemptedCount = new Map<number, number>();

  let obtainedMarks = 0;
  let totalMarks = 0;
  let correctAnswers = 0;
  let incorrectAnswers = 0;
  let unattemptedAnswers = 0;

  // Track per-question marks for negative marking analysis
  const questionMarkMap = new Map<string, { marksGained: number; marksLost: number }>();

  const insightsMap = new Map<string, TopicInsight>();

  questions.forEach((question) => {
    const answer = answers.find((item) => item.questionId === question.id);
    const attempted = isAnswerAttempted(question, answer);
    const correct = attempted && isAnswerCorrect(question, answer);

    // Determine marks/negative for this question based on section or question-level config
    let qMarks = question.marks;
    let qNegative = question.negativeMarks;
    let countForTotal = true;

    const sIdx = questionSectionIndex.get(question.id);
    if (sIdx !== undefined && exam.sections) {
      const section = exam.sections[sIdx];
      qMarks = section.marksCorrect;
      qNegative = section.marksIncorrect;

      // Optional section: only grade up to attemptQuestions (in question order)
      if (section.attemptQuestions < section.totalQuestions) {
        const alreadyAttempted = sectionAttemptedCount.get(sIdx) ?? 0;
        if (attempted) {
          if (alreadyAttempted >= section.attemptQuestions) {
            // This question is beyond the attempt limit — skip from grading
            countForTotal = false;
          } else {
            sectionAttemptedCount.set(sIdx, alreadyAttempted + 1);
          }
        }
      }
    }

    // Per-question overrides (set by manual exam builder) take highest priority
    const genQ = exam.questions.find((eq) => eq.questionId === question.id);
    if (genQ?.marksOverride !== undefined) qMarks = genQ.marksOverride;
    if (genQ?.negativeMarksOverride !== undefined) qNegative = genQ.negativeMarksOverride;

    if (countForTotal) totalMarks += qMarks;

    const topic = state.topics.find((item) => item.id === question.topicId);
    const topicName = topic?.name ?? "Unknown Topic";
    const currentTopic = insightsMap.get(question.topicId) ?? {
      topicId: question.topicId,
      topicName,
      totalQuestions: 0,
      correctAnswers: 0,
      incorrectAnswers: 0,
      unattemptedAnswers: 0,
      accuracy: 0,
      weaknessScore: 0
    };

    currentTopic.totalQuestions += 1;

    // JEE Advanced partial marking: multi_correct with markingScheme = "jee_advanced_partial"
    const sectionMarkingScheme = sIdx !== undefined && exam.sections ? exam.sections[sIdx].markingScheme : undefined;
    const isJeeAdvancedPartial = sectionMarkingScheme === "jee_advanced_partial" && question.type === "multi_correct";

    if (!attempted) {
      unattemptedAnswers += 1;
      currentTopic.unattemptedAnswers += 1;
      questionMarkMap.set(question.id, { marksGained: 0, marksLost: 0 });
    } else if (isJeeAdvancedPartial) {
      const selected = answer?.selectedOptionIds ?? [];
      const correctIds = question.correctOptionIds;
      const hasWrong = selected.some((id) => !correctIds.includes(id));
      if (hasWrong) {
        // Any wrong option selected → full negative marks
        obtainedMarks -= qNegative;
        incorrectAnswers += 1;
        currentTopic.incorrectAnswers += 1;
        questionMarkMap.set(question.id, { marksGained: 0, marksLost: qNegative });
      } else if (sameSelections(selected, correctIds)) {
        // All correct options selected, none wrong → full marks
        obtainedMarks += qMarks;
        correctAnswers += 1;
        currentTopic.correctAnswers += 1;
        questionMarkMap.set(question.id, { marksGained: qMarks, marksLost: 0 });
      } else {
        // Partial: +1 per correct option selected (none wrong)
        const partialGain = selected.filter((id) => correctIds.includes(id)).length;
        obtainedMarks += partialGain;
        correctAnswers += 1;
        currentTopic.correctAnswers += 1;
        questionMarkMap.set(question.id, { marksGained: partialGain, marksLost: 0 });
      }
    } else if (correct) {
      obtainedMarks += qMarks;
      correctAnswers += 1;
      currentTopic.correctAnswers += 1;
      questionMarkMap.set(question.id, { marksGained: qMarks, marksLost: 0 });
    } else {
      obtainedMarks -= qNegative;
      incorrectAnswers += 1;
      currentTopic.incorrectAnswers += 1;
      questionMarkMap.set(question.id, { marksGained: 0, marksLost: qNegative });
    }

    insightsMap.set(question.topicId, currentTopic);
  });

  const review = questions.map(question => {
    const answer = answers.find(a => a.questionId === question.id);
    const correct = isAnswerCorrect(question, answer);
    const attempted = isAnswerAttempted(question, answer);
    const sIdx = questionSectionIndex.get(question.id);
    const timeSecs = answer?.timeSpentSeconds;
    const speedZone: "fast" | "normal" | "slow" | undefined = timeSecs !== undefined
      ? timeSecs < 60 ? "fast" : timeSecs <= 180 ? "normal" : "slow"
      : undefined;
    return {
      questionId: question.id,
      prompt: question.prompt,
      type: question.type,
      selectedOptionIds: answer?.selectedOptionIds ?? [],
      integerAnswer: answer?.integerAnswer,
      correctOptionIds: question.correctOptionIds,
      correctIntegerAnswer: question.integerAnswer,
      explanation: question.explanation,
      isCorrect: correct,
      attempted,
      options: question.options,
      sectionName: sIdx !== undefined && exam.sections ? exam.sections[sIdx].name : undefined,
      timeSpentSeconds: timeSecs,
      speedZone,
      marksLost: questionMarkMap.get(question.id)?.marksLost || undefined,
      marksGained: questionMarkMap.get(question.id)?.marksGained || undefined,
    };
  });

  // Timing stats — only computed when at least some time data was sent
  const answeredTimes = review.filter(r => r.timeSpentSeconds !== undefined && r.attempted);
  let timingStats = undefined;
  if (answeredTimes.length > 0) {
    const totalTimeSeconds = review.reduce((s, r) => s + (r.timeSpentSeconds ?? 0), 0);
    const sorted = [...answeredTimes].sort((a, b) => (b.timeSpentSeconds ?? 0) - (a.timeSpentSeconds ?? 0));
    const fastAnswered = [...answeredTimes].sort((a, b) => (a.timeSpentSeconds ?? 0) - (b.timeSpentSeconds ?? 0));
    const impulseErrors = review.filter(r => (r.timeSpentSeconds ?? 99) < 30 && r.attempted && !r.isCorrect).length;
    const stuckCount = review.filter(r => (r.timeSpentSeconds ?? 0) > 180 && r.attempted && !r.isCorrect).length;
    timingStats = {
      totalTimeSeconds,
      avgTimePerQuestion: Math.round(totalTimeSeconds / Math.max(1, review.length)),
      slowestQuestionId: sorted[0]?.questionId ?? null,
      fastestAnsweredQuestionId: fastAnswered[0]?.questionId ?? null,
      impulseErrors,
      stuckCount
    };
  }

  // Negative marking strategy analysis — only meaningful when some marks were deducted
  let negativeMarkingAnalysis = undefined;
  const wrongWithNegative = review.filter(r => r.attempted && !r.isCorrect && (r.marksLost ?? 0) > 0);
  if (wrongWithNegative.length > 0) {
    const recoverableMarks = wrongWithNegative.reduce((sum, r) => sum + (r.marksLost ?? 0), 0);
    const counterfactualScore = Math.max(0, obtainedMarks + recoverableMarks);
    negativeMarkingAnalysis = {
      totalNegativeMarks: recoverableMarks,
      recoverableMarks,
      counterfactualScore,
      counterfactualPercentage: Number(((counterfactualScore / Math.max(1, totalMarks)) * 100).toFixed(2)),
      skipCandidates: wrongWithNegative.map(r => {
        const t = r.timeSpentSeconds;
        const category: "impulse" | "stuck" | "uncertain" =
          t !== undefined && t < 30 ? "impulse" :
          t !== undefined && t > 180 ? "stuck" : "uncertain";
        return { questionId: r.questionId, marksLost: r.marksLost ?? 0, timeSpentSeconds: t, category };
      })
    };
  }

  const insights = Array.from(insightsMap.values()).map((topic) => {
    const accuracy = topic.totalQuestions === 0 ? 0 : (topic.correctAnswers / topic.totalQuestions) * 100;
    const weaknessScore =
      topic.incorrectAnswers * 1 +
      topic.unattemptedAnswers * 0.7 +
      ((topic.incorrectAnswers / Math.max(1, topic.totalQuestions)) * 0.5);

    return {
      ...topic,
      accuracy: Number(accuracy.toFixed(2)),
      weaknessScore: Number(weaknessScore.toFixed(2))
    };
  });

  const result: ExamSubmissionResult = {
    id: `submission-${Date.now()}`,
    examId,
    studentId,
    totalMarks,
    obtainedMarks,
    correctAnswers,
    incorrectAnswers,
    unattemptedAnswers,
    percentage: Number(((obtainedMarks / Math.max(1, totalMarks)) * 100).toFixed(2)),
    weakestTopics: [...insights].sort((a, b) => b.weaknessScore - a.weaknessScore).slice(0, 3),
    insights,
    timingStats,
    negativeMarkingAnalysis,
    review
  };

  await upsertRecord("submissions", result);
  return result;
}

export interface ManualExamRequest {
  name: string;
  batchId: string;
  durationMinutes: number;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  questions: Array<{
    questionId: string;
    marks: number;
    negativeMarks: number;
  }>;
}

export async function buildManualExam(request: ManualExamRequest): Promise<Exam | { error: string }> {
  if (!request.questions || request.questions.length === 0) {
    return { error: "No questions selected" };
  }

  const state = await getAppState();
  const batch = state.batches.find((b) => b.id === request.batchId);
  if (!batch) {
    return { error: "Batch not found" };
  }

  const questionIds = new Set(request.questions.map((q) => q.questionId));
  const foundQuestions = state.questions.filter((q) => questionIds.has(q.id));
  if (foundQuestions.length === 0) {
    return { error: "None of the selected questions were found" };
  }

  const questionLookup = new Map(foundQuestions.map((q) => [q.id, q]));
  const subjectId = foundQuestions[0].subjectId;

  const examQuestions: GeneratedExamQuestion[] = request.questions
    .filter((req) => questionLookup.has(req.questionId))
    .map((req, idx) => {
      const q = questionLookup.get(req.questionId)!;
      return {
        questionId: req.questionId,
        order: idx + 1,
        optionOrderIds: buildOptionOrderIds(q),
        marksOverride: req.marks,
        negativeMarksOverride: req.negativeMarks
      };
    });

  const exam: Exam = {
    id: `exam-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    blueprintId: `manual-${Date.now()}`,
    name: request.name,
    classId: batch.classId,
    streamId: batch.streamId,
    batchId: request.batchId,
    subjectId,
    durationMinutes: request.durationMinutes,
    generationMode: "custom",
    questions: examQuestions,
    ...(request.scheduledStartTime ? { scheduledStartTime: request.scheduledStartTime } : {}),
    ...(request.scheduledEndTime ? { scheduledEndTime: request.scheduledEndTime } : {})
  };

  await upsertRecord("exams", exam);
  return exam;
}
