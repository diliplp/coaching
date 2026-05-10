import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/client";
import { liveExamState } from "../data/mockExamContext";
import type { AdaptivePlan, BlueprintSummary, OverviewResponse, QuestionBankResponse } from "../types";

export function ExamBuilderPage() {
  const [blueprints, setBlueprints] = useState<BlueprintSummary[]>([]);
  const [questionBank, setQuestionBank] = useState<QuestionBankResponse | null>(null);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [adaptivePlan, setAdaptivePlan] = useState<AdaptivePlan | null>(null);
  const [status, setStatus] = useState<string>("Select a blueprint or build a weighted paper.");
  const [adaptiveStudentId, setAdaptiveStudentId] = useState("student-9-1");
  const [adaptiveSubjectId, setAdaptiveSubjectId] = useState("subject-class9-math");
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [customExamName, setCustomExamName] = useState("Class 9 Weighted Practice Test");
  const [selectionMode, setSelectionMode] = useState<"chapter" | "topic">("chapter");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [totalQuestions, setTotalQuestions] = useState(6);
  const [scheduledStartTime, setScheduledStartTime] = useState("");
  const [scheduledEndTime, setScheduledEndTime] = useState("");
  const [weightages, setWeightages] = useState<Record<string, string>>({});

  useEffect(() => {
    Promise.all([apiClient.getBlueprints(), apiClient.getQuestionBank(), apiClient.getOverview()])
      .then(([blueprintsResponse, questionBankResponse, overviewResponse]) => {
        setBlueprints(blueprintsResponse);
        setQuestionBank(questionBankResponse);
        setOverview(overviewResponse);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!overview?.batches.length) {
      return;
    }

    setSelectedBatchId((current) => current || overview.batches[0].id);
  }, [overview]);

  const selectedBatch = useMemo(
    () => overview?.batches.find((batch) => batch.id === selectedBatchId) ?? null,
    [overview, selectedBatchId]
  );

  const availableSubjects = useMemo(() => {
    if (!questionBank || !selectedBatch) {
      return [];
    }

    return questionBank.subjects.filter(
      (subject) => subject.classId === selectedBatch.classId && subject.streamId === selectedBatch.streamId
    );
  }, [questionBank, selectedBatch]);

  useEffect(() => {
    if (availableSubjects.length === 0) {
      return;
    }

    const stillValid = availableSubjects.some((subject) => subject.id === selectedSubjectId);
    const nextSubjectId = stillValid ? selectedSubjectId : availableSubjects[0].id;
    setSelectedSubjectId(nextSubjectId);

    const nextSubject = availableSubjects.find((subject) => subject.id === nextSubjectId);
    if (nextSubject) {
      setAdaptiveSubjectId(nextSubject.id);
      setCustomExamName(`${selectedBatch?.name ?? "Batch"} ${nextSubject.name} Weighted Test`);
    }
  }, [availableSubjects, selectedSubjectId, selectedBatch]);

  useEffect(() => {
    setWeightages({});
  }, [selectedSubjectId, selectionMode]);

  const availableChapters = useMemo(
    () => questionBank?.chapters.filter((chapter) => chapter.subjectId === selectedSubjectId) ?? [],
    [questionBank, selectedSubjectId]
  );

  const chapterNameById = useMemo(
    () => new Map(availableChapters.map((chapter) => [chapter.id, chapter.name])),
    [availableChapters]
  );

  const availableTopics = useMemo(
    () => questionBank?.topics.filter((topic) => topic.subjectId === selectedSubjectId) ?? [],
    [questionBank, selectedSubjectId]
  );

  const weightedEntities = selectionMode === "chapter" ? availableChapters : availableTopics;
  const weightageTotal = Object.values(weightages).reduce((sum, value) => sum + (Number(value) || 0), 0);

  const createExam = async (blueprintId: string) => {
    setStatus("Generating exam...");
    try {
      const payload = await apiClient.generateExam(blueprintId);
      liveExamState.generatedExam = payload;
      liveExamState.latestResult = null;
      setStatus(`Live exam created: ${payload.exam.name}. Open the Live Exam page to attempt it.`);
    } catch (error) {
      console.error(error);
      setStatus("Unable to generate exam.");
    }
  };

  const createCustomExam = async () => {
    if (!selectedBatchId || !selectedSubjectId) {
      setStatus("Select a batch and subject first.");
      return;
    }

    setStatus("Generating weighted exam...");
    try {
      const payload = await apiClient.generateCustomExam({
        name: customExamName,
        batchId: selectedBatchId,
        subjectId: selectedSubjectId,
        durationMinutes,
        totalQuestions,
        selectionMode,
        scheduledStartTime: scheduledStartTime || undefined,
        scheduledEndTime: scheduledEndTime || undefined,
        rules: Object.entries(weightages)
          .map(([entityId, weightagePercent]) => ({
            entityId,
            weightagePercent: Number(weightagePercent) || 0
          }))
          .filter((rule) => rule.weightagePercent > 0)
      });
      liveExamState.generatedExam = payload;
      liveExamState.latestResult = null;
      setStatus(`Weighted exam created: ${payload.exam.name}. Fresh questions and shuffled options are ready.`);
    } catch (error) {
      console.error(error);
      setStatus("Unable to generate weighted exam. Make sure the selected weightages total 100%.");
    }
  };

  const loadAdaptivePlan = async () => {
    setStatus("Analyzing past results...");
    try {
      const plan = await apiClient.getAdaptivePlan(adaptiveStudentId, adaptiveSubjectId);
      setAdaptivePlan(plan);
      setStatus(`Adaptive recommendation ready for ${plan.studentName}.`);
    } catch (error) {
      console.error(error);
      setAdaptivePlan(null);
      setStatus("No adaptive recommendation available yet. Submit at least one exam first for this student.");
    }
  };

  const createAdaptiveExam = async () => {
    setStatus("Generating adaptive exam...");
    try {
      const payload = await apiClient.generateAdaptiveExam({
        studentId: adaptiveStudentId,
        subjectId: adaptiveSubjectId
      });
      liveExamState.generatedExam = payload;
      liveExamState.latestResult = null;
      setAdaptivePlan(payload.plan ?? null);
      setStatus(`Adaptive exam created: ${payload.exam.name}.`);
    } catch (error) {
      console.error(error);
      setStatus("Unable to generate adaptive exam. The student may need past submissions first.");
    }
  };

  return (
    <div className="page">
      <section className="section-heading">
        <p className="eyebrow">Exam Builder</p>
        <h2>Create chapter-wise, topic-wise, and adaptive papers</h2>
        <p>{status}</p>
      </section>

      <article className="panel">
        <div className="row-between adaptive-header">
          <div>
            <p className="eyebrow">Teacher Weighted Paper Builder</p>
            <h3>Create papers by chapter or topic with percentage weightage</h3>
          </div>
          <span className={weightageTotal === 100 ? "tag" : "tag muted"}>{weightageTotal}% allocated</span>
        </div>

        <div className="adaptive-form-grid">
          <label className="field">
            <span>Batch</span>
            <select value={selectedBatchId} onChange={(event) => setSelectedBatchId(event.target.value)}>
              {overview?.batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Subject</span>
            <select value={selectedSubjectId} onChange={(event) => setSelectedSubjectId(event.target.value)}>
              {availableSubjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Exam Name</span>
            <input value={customExamName} onChange={(event) => setCustomExamName(event.target.value)} />
          </label>
          <label className="field">
            <span>Paper Style</span>
            <select value={selectionMode} onChange={(event) => setSelectionMode(event.target.value as "chapter" | "topic")}>
              <option value="chapter">Chapter-wise</option>
              <option value="topic">Topic-wise</option>
            </select>
          </label>
          <label className="field">
            <span>Total Questions</span>
            <input
              type="number"
              min="1"
              value={totalQuestions}
              onChange={(event) => setTotalQuestions(Number(event.target.value) || 1)}
            />
          </label>
          <label className="field">
            <span>Duration (minutes)</span>
            <input
              type="number"
              min="5"
              value={durationMinutes}
              onChange={(event) => setDurationMinutes(Number(event.target.value) || 5)}
            />
          </label>
          <label className="field">
            <span>Start Time</span>
            <input
              type="datetime-local"
              value={scheduledStartTime}
              onChange={(event) => setScheduledStartTime(event.target.value)}
            />
          </label>
          <label className="field">
            <span>End Time</span>
            <input
              type="datetime-local"
              value={scheduledEndTime}
              onChange={(event) => setScheduledEndTime(event.target.value)}
            />
          </label>
        </div>

        <div className="weightage-grid">
          {weightedEntities.map((entity) => (
            <label key={entity.id} className="weightage-card">
              <div>
                <strong>{entity.name}</strong>
                {selectionMode === "topic" && "chapterId" in entity ? (
                  <p className="muted-copy">Chapter: {chapterNameById.get(String(entity.chapterId)) ?? "Unknown"}</p>
                ) : null}
              </div>
              <div className="weightage-input">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={weightages[entity.id] ?? ""}
                  onChange={(event) =>
                    setWeightages((current) => ({
                      ...current,
                      [entity.id]: event.target.value
                    }))
                  }
                />
                <span>%</span>
              </div>
            </label>
          ))}
        </div>

        <div className="action-row">
          <button className="primary-button" disabled={weightageTotal !== 100} onClick={() => void createCustomExam()}>
            Generate Weighted Exam
          </button>
        </div>
      </article>

      <article className="panel">
        <div className="row-between adaptive-header">
          <div>
            <p className="eyebrow">Adaptive Engine</p>
            <h3>Create a rule-based improvement paper from past performance</h3>
          </div>
        </div>

        <div className="adaptive-form-grid">
          <label className="field">
            <span>Student Id</span>
            <input value={adaptiveStudentId} onChange={(event) => setAdaptiveStudentId(event.target.value)} />
          </label>
          <label className="field">
            <span>Subject Id</span>
            <input value={adaptiveSubjectId} onChange={(event) => setAdaptiveSubjectId(event.target.value)} />
          </label>
        </div>

        <div className="action-row">
          <button className="secondary-button" onClick={() => void loadAdaptivePlan()}>
            Analyze Student
          </button>
          <button className="primary-button" onClick={() => void createAdaptiveExam()}>
            Generate Adaptive Exam
          </button>
        </div>

        {adaptivePlan && (
          <div className="adaptive-plan-card">
            <h4>{adaptivePlan.studentName} Adaptive Plan</h4>
            <p className="muted-copy">{adaptivePlan.summary}</p>
            <ul className="plain-list compact">
              {adaptivePlan.topics.map((topic) => (
                <li key={topic.topicId}>
                  <strong>
                    {topic.topicName} • {topic.questionCount} question(s)
                  </strong>
                  <span>
                    {topic.reason} • accuracy {topic.averageAccuracy}% • weakness {topic.averageWeaknessScore}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </article>

      <div className="stack">
        {blueprints.map((blueprint) => (
          <article key={blueprint.id} className="panel blueprint-card">
            <div>
              <h3>{blueprint.name}</h3>
              <p className="muted-copy">
                {blueprint.className} • {blueprint.streamName} • {blueprint.subjectName}
              </p>
              <p className="muted-copy">
                {blueprint.batchName} • {blueprint.durationMinutes} minute timed exam
              </p>
            </div>
            <button className="primary-button" onClick={() => void createExam(blueprint.id)}>
              Generate Exam
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
