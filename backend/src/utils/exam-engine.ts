import { getAppState, upsertRecord } from "../data/database.js";
import type {
  AdaptiveExamPlan,
  AdaptiveExamPlanTopic,
  BatchAdaptivePlan,
  Chapter,
  Exam,
  ExamBlueprint,
  ExamSubmissionResult,
  GeneratedExamQuestion,
  Question,
  StudentAnswerInput,
  TeacherCustomExamRequest,
  Topic,
  TopicInsight,
  WeightedExamRule
} from "../types.js";

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

function formatQuestionsForExam(selectedQuestions: Question[]): GeneratedExamQuestion[] {
  return randomize(selectedQuestions).map((question, index) => ({
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
}) {
  const exam: Exam = {
    id: `exam-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    ...input.exam,
    questions: formatQuestionsForExam(input.questions)
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
      (question) => question.topicId === rule.topicId && question.subjectId === blueprint.subjectId
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
      sourceSignature
    },
    questions: selectedQuestions
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
  let subjectQuestions = state.questions.filter((question) => targetSubjectIds.includes(question.subjectId));
  
  // Apply Source Filtering
  if (Array.isArray(request.allowedSourceTypes) && request.allowedSourceTypes.length > 0) {
    subjectQuestions = subjectQuestions.filter(q => request.allowedSourceTypes?.includes(q.sourceType || "custom"));
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
    questions: selectedQuestions
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
  const relevantQuestions = state.questions.filter((question) => question.subjectId === preferredSubjectId);

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
      .filter((question) => question.subjectId === plan.subjectId && question.topicId === topic.topicId)
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
    questions: selectedQuestions
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
  const relevantQuestions = state.questions.filter((question) => question.subjectId === preferredSubjectId);
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
  let obtainedMarks = 0;
  let totalMarks = 0;
  let correctAnswers = 0;
  let incorrectAnswers = 0;
  let unattemptedAnswers = 0;

  const insightsMap = new Map<string, TopicInsight>();

  questions.forEach((question) => {
    totalMarks += question.marks;

    const answer = answers.find((item) => item.questionId === question.id);
    const selectedOptionIds = answer?.selectedOptionIds ?? [];
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

    if (selectedOptionIds.length === 0) {
      unattemptedAnswers += 1;
      currentTopic.unattemptedAnswers += 1;
    } else if (sameSelections(selectedOptionIds, question.correctOptionIds)) {
      obtainedMarks += question.marks;
      correctAnswers += 1;
      currentTopic.correctAnswers += 1;
    } else {
      obtainedMarks -= question.negativeMarks;
      incorrectAnswers += 1;
      currentTopic.incorrectAnswers += 1;
    }

    insightsMap.set(question.topicId, currentTopic);
  });

  const review = questions.map(question => {
    const answer = answers.find(a => a.questionId === question.id);
    const selectedOptionIds = answer?.selectedOptionIds ?? [];
    const isCorrect = sameSelections(selectedOptionIds, question.correctOptionIds);
    return {
      questionId: question.id,
      prompt: question.prompt,
      selectedOptionIds,
      correctOptionIds: question.correctOptionIds,
      explanation: question.explanation,
      isCorrect,
      options: question.options
    };
  });

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
    review
  };

  await upsertRecord("submissions", result);
  return result;
}
