import { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import type { QuestionBankResponse } from "../types";

export function QuestionBankPage() {
  const [data, setData] = useState<QuestionBankResponse | null>(null);

  useEffect(() => {
    apiClient.getQuestionBank().then(setData).catch(console.error);
  }, []);

  if (!data) {
    return <p>Loading question bank...</p>;
  }

  return (
    <div className="page">
      <section className="section-heading">
        <p className="eyebrow">Question Bank</p>
        <h2>Subject and topic organized MCQ library</h2>
      </section>

      <div className="question-grid">
        {data.questions.map((question) => (
          <article className="panel question-card" key={question.id}>
            <div className="row-between">
              <span className="tag">{question.subjectName}</span>
              <span className="tag muted">{question.topicName}</span>
            </div>
            <h3>{question.prompt}</h3>
            <p className="muted-copy">
              {question.type === "multi_correct" ? "Multi correct" : "Single correct"} • {question.difficulty} • {question.marks} marks • -{question.negativeMarks}
            </p>
            <ul className="option-list">
              {question.options.map((option) => (
                <li key={option.id}>
                  {option.label}. {option.value}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}
