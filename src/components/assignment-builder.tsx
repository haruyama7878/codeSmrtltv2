"use client";

import { useEffect, useState } from "react";
import type { Classroom } from "@/lib/student-data";
import { isAnswerModeCompatible, type AnswerMode, type QuizQuestion } from "@/lib/learning-data";
import { MODE_LABELS } from "./quiz-answer-modes";
import AssignmentImageEditor, { type LibraryImage } from "./assignment-image-editor";
import { QuizIllustration } from "./quiz-illustrations";
import { smartLotusApi, type AssignmentProject } from "@/lib/api";
import { Icon } from "./icons";

function defaultDueDate() {
  const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function createQuestion(id: number, topic: string): QuizQuestion {
  return {
    id,
    phase: "normal",
    difficulty: "A",
    skill: topic || "Kiến thức tổng hợp",
    prompt: "",
    options: ["", "", "", ""],
    correctAnswer: "",
    explanation: "",
  };
}

export default function AssignmentBuilder({ onBack, onToast }: { onBack: () => void; onToast: (message: string) => void }) {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [classroomId, setClassroomId] = useState("");
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState("1");
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [duration, setDuration] = useState("20");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [generationNotice, setGenerationNotice] = useState("");
  const [libraryImages, setLibraryImages] = useState<LibraryImage[]>([]);
  const [projects, setProjects] = useState<AssignmentProject[]>([]);
  const [projectId, setProjectId] = useState("");
  const [step, setStep] = useState<"questions" | "settings">("questions");
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);

  useEffect(() => {
    void smartLotusApi.getClassrooms().then(({ classrooms: items }) => {
      setClassrooms(items);
      if (items[0]) setClassroomId(items[0].id);
    }).catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : "Không thể tải lớp học");
    });
  }, []);

  useEffect(() => {
    void smartLotusApi.getAssignmentProjects().then(({ projects: items }) => {
      setProjects(items);
    }).catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : "Không thể tải bộ dự án");
    });
  }, []);

  useEffect(() => {
    void smartLotusApi.getLibraryImages().then(({ categories }) => {
      setLibraryImages(categories.flatMap(({ category, files }) => files.map((file) => ({ ...file, category }))));
    }).catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : "Không thể tải thư viện hình ảnh");
    });
  }, []);

  async function generateQuestions() {
    const selectedClassroom = classrooms.find((item) => item.id === classroomId);
    const selectedTopic = topic.trim() || selectedClassroom?.subject || "Toán học";
    setLoading(true);
    setError("");
    setGenerationNotice("");
    try {
      const generated = await smartLotusApi.generateQuiz({
        topic: selectedTopic,
        curriculumLevel: Number(level),
        difficulties: ["A", "B", "C"],
        count: 10,
      });
      setQuestions(generated.questions.map((question, index) => ({ ...question, id: index + 1 })));
      setActiveQuestionIndex(0);
      setGenerationNotice(
        generated.source === "ai"
          ? generated.questions.length === 10
            ? "Ollama đã tạo đủ 10 câu hỏi."
            : `Ollama chỉ tạo được ${generated.questions.length}/10 câu hỏi hợp lệ.`
          : "AI chưa tạo được đề hợp lệ; các câu dưới đây lấy từ kho câu hỏi có sẵn.",
      );
      if (!title.trim()) setTitle(`Bài tập: ${selectedTopic}`);
      setTopic(selectedTopic);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Không thể tạo câu hỏi");
    } finally {
      setLoading(false);
    }
  }

  function updateQuestion(index: number, update: Partial<QuizQuestion>) {
    setQuestions((current) => current.map((question, questionIndex) => (
      questionIndex === index ? { ...question, ...update } : question
    )));
  }

  function updateOption(questionIndex: number, optionIndex: number, value: string) {
    setQuestions((current) => current.map((question, index) => {
      if (index !== questionIndex) return question;
      const options = question.options.map((option, answerIndex) => answerIndex === optionIndex ? value : option);
      return {
        ...question,
        options,
        correctAnswer: question.correctAnswer === question.options[optionIndex] ? "" : question.correctAnswer,
      };
    }));
  }

  function updateAnswerMode(index: number, answerMode: AnswerMode) {
    updateQuestion(index, {
      answerMode,
      options: answerMode === "choice" ? ["", "", "", ""]
        : answerMode === "image-choice" || answerMode === "image-select" ? ["A", "B", "C", "D"] : [],
      correctAnswer: "",
      optionImageIds: answerMode === "image-choice" || answerMode === "image-select" ? [null, null, null, null] : undefined,
    });
  }

  function setImageChoiceCorrect(questionIndex: number, option: string, checked: boolean) {
    const question = questions[questionIndex];
    if (!question) return;
    if (question.answerMode === "image-select") {
      const selected = new Set(question.correctAnswer.split("|").filter(Boolean));
      if (checked) selected.add(option);
      else selected.delete(option);
      const correctAnswer = question.options.filter((item) => selected.has(item)).join("|");
      updateQuestion(questionIndex, { correctAnswer });
    } else {
      updateQuestion(questionIndex, { correctAnswer: checked ? option : "" });
    }
  }

  function setOptionImage(questionIndex: number, optionIndex: number, assetId: string) {
    const question = questions[questionIndex];
    if (!question) return;
    const optionImageIds = [...(question.optionImageIds ?? question.options.map(() => null))];
    optionImageIds[optionIndex] = assetId || null;
    updateQuestion(questionIndex, { optionImageIds });
  }

  function addQuestion() {
    if (questions.length >= 20) return;
    setQuestions((current) => [...current, createQuestion(current.length + 1, topic.trim())]);
    setActiveQuestionIndex(questions.length);
    setError("");
    setGenerationNotice("");
  }

  function removeQuestion(index: number) {
    setQuestions((current) => current
      .filter((_, questionIndex) => questionIndex !== index)
      .map((question, questionIndex) => ({ ...question, id: questionIndex + 1 })));
    setActiveQuestionIndex((active) => active > index ? active - 1 : active === index ? Math.max(0, index - 1) : active);
    setError("");
    setGenerationNotice("");
  }

  function questionValidationError() {
    if (!questions.length) return "Hãy tạo bộ câu hỏi trước khi tiếp tục.";
    const incompleteIndex = questions.findIndex((question) => {
      if (!question.prompt.trim()) return true;
      const mode = question.answerMode ?? "choice";
      if (mode === "image-choice" || mode === "image-select") {
        return question.options.length !== 4 || !isAnswerModeCompatible(question, mode);
      }
      if (mode !== "choice") return !question.correctAnswer.trim();
      return question.options.length !== 4
        || question.options.some((option) => !option.trim())
        || new Set(question.options.map((option) => option.trim())).size !== 4
        || !question.options.includes(question.correctAnswer);
    });
    if (incompleteIndex !== -1) {
      const question = questions[incompleteIndex];
      const mode = question.answerMode ?? "choice";
      return mode === "image-choice" || mode === "image-select"
        ? `Câu ${incompleteIndex + 1} cần đủ 4 ảnh đáp án và chọn đáp án đúng.`
        : mode === "choice"
          ? `Câu ${incompleteIndex + 1} cần có đề bài, 4 đáp án khác nhau và một đáp án đúng.`
          : `Câu ${incompleteIndex + 1} cần có đề bài và đáp án số.`;
    }
    const incompatibleIndex = questions.findIndex((question) =>
      !isAnswerModeCompatible(question, question.answerMode ?? "choice"),
    );
    if (incompatibleIndex !== -1) {
      return `Kiểu trả lời của câu ${incompatibleIndex + 1} không phù hợp với nội dung đáp án.`;
    }
    return "";
  }

  function continueToSettings() {
    const validationError = questionValidationError();
    if (validationError) return setError(validationError);
    setError("");
    setStep("settings");
  }

  async function openProject() {
    if (!projectId) return;
    setLoading(true);
    setError("");
    try {
      const { project } = await smartLotusApi.getAssignmentProject(projectId);
      if (!project.questions) throw new Error("Bộ dự án không có dữ liệu câu hỏi.");
      setQuestions(project.questions);
      setActiveQuestionIndex(0);
      setTopic(project.topic);
      setLevel(String(project.curriculumLevel));
      setTitle(project.name);
      setStep("questions");
      setGenerationNotice("Đã mở bộ dự án. Hãy cập nhật nội dung trước khi giao bài.");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Không thể mở bộ dự án");
    } finally {
      setLoading(false);
    }
  }

  async function saveProject() {
    const validationError = questionValidationError();
    if (validationError) return setError(validationError);
    const name = title.trim() || topic.trim();
    if (!name) return setError("Nhập tên bài tập trước khi lưu bộ dự án.");
    setLoading(true);
    setError("");
    try {
      const { project } = await smartLotusApi.saveAssignmentProject({
        ...(projectId ? { id: projectId } : {}),
        name,
        topic: topic.trim() || name,
        curriculumLevel: Number(level),
        questions,
      });
      setProjectId(project.id);
      const { projects: items } = await smartLotusApi.getAssignmentProjects();
      setProjects(items);
      onToast("Đã lưu bộ dự án vào tài khoản giáo viên.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Không thể lưu bộ dự án");
    } finally {
      setLoading(false);
    }
  }

  async function deleteProject() {
    if (!projectId) return;
    setLoading(true);
    setError("");
    try {
      await smartLotusApi.deleteAssignmentProject(projectId);
      setProjects((current) => current.filter((project) => project.id !== projectId));
      setProjectId("");
      onToast("Đã xóa bộ dự án.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Không thể xóa bộ dự án");
    } finally {
      setLoading(false);
    }
  }

  async function publish() {
    if (!classroomId) return setError("Hãy tạo lớp học trước khi giao bài.");
    if (!title.trim()) return setError("Vui lòng nhập tên bài tập.");
    if (!topic.trim()) return setError("Vui lòng nhập chủ đề bài tập.");
    const validationError = questionValidationError();
    if (validationError) return setError(validationError);
    const dueAt = new Date(dueDate);
    if (Number.isNaN(dueAt.getTime()) || dueAt.getTime() <= Date.now()) return setError("Hạn nộp phải ở thời điểm trong tương lai.");
    setLoading(true);
    setError("");
    try {
      await smartLotusApi.createAssignment({
        classroomId,
        title: title.trim(),
        topic: topic.trim(),
        curriculumLevel: Number(level),
        dueAt: dueAt.toISOString(),
        durationMinutes: Number(duration),
        questions,
      });
      onToast("Đã giao bài tập cho lớp.");
      onBack();
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Không thể giao bài tập");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="assignment-shell">
      <header className="assignment-header">
        <div className="assignment-header-left">
          <button className="icon-button" onClick={onBack} aria-label="Quay lại"><Icon name="arrow" className="rotate-left" /></button>
          <div>
            <span className="section-kicker">BÀI TẬP · BƯỚC {step === "questions" ? "1/2" : "2/2"}</span>
            <h1>{step === "questions" ? "Soạn đề bài" : "Cài đặt bài tập"}</h1>
          </div>
        </div>
        <div className="assignment-project-picker">
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)} aria-label="Bộ dự án đã lưu">
            <option value="">Mở bộ dự án đã lưu...</option>
            {projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}
          </select>
          <button type="button" className="secondary-button" onClick={() => void openProject()} disabled={!projectId || loading}>
            Mở dự án
          </button>
        </div>
      </header>

      {step === "questions" ? (
        <div className="assignment-layout assignment-compose-layout">
          <section className="assignment-panel assignment-questions assignment-compose">
          <div className="assignment-questions-heading">
            <div><h2>Đề bài và đáp án</h2><p>Chọn ảnh, sao chép, dán và sắp xếp như trong Paint.</p></div>
            <span className="assignment-count">{questions.length}/20 câu</span>
          </div>
          {questions.length > 0 && (
            <nav className="assignment-question-tabs" aria-label="Chọn câu hỏi để chỉnh sửa">
              {questions.map((question, index) => (
                <button
                  type="button"
                  key={`${question.id}-tab`}
                  className={activeQuestionIndex === index ? "active" : ""}
                  onClick={() => setActiveQuestionIndex(index)}
                  aria-current={activeQuestionIndex === index ? "step" : undefined}
                >
                  Câu {index + 1}
                  {!question.prompt.trim() && <i aria-label="Chưa nhập đề bài" />}
                </button>
              ))}
            </nav>
          )}
          {questions.length ? (
            <ol className="assignment-question-list">
              {questions.map((question, index) => index === activeQuestionIndex ? (
                <li key={`${question.id}-${index}`} className="assignment-question-editor">
                  <div className="assignment-question-editor-heading">
                    <strong>Câu {index + 1}</strong>
                    <button type="button" className="assignment-remove-question" onClick={() => removeQuestion(index)} aria-label={`Xóa câu ${index + 1}`}>
                      <Icon name="trash" size={15} /> Xóa câu
                    </button>
                  </div>
                  <label className="assignment-question-prompt">
                    Đề bài
                    <textarea
                      value={question.prompt}
                      onChange={(event) => updateQuestion(index, { prompt: event.target.value })}
                      placeholder="Nhập nội dung câu hỏi..."
                      rows={2}
                    />
                  </label>
                  <label className="assignment-question-mode">
                    Kiểu trả lời
                    <select
                      value={question.answerMode ?? "choice"}
                      onChange={(event) => updateAnswerMode(index, event.target.value as AnswerMode)}
                    >
                      {Object.entries(MODE_LABELS).map(([mode, label]) => (
                        <option key={mode} value={mode}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <AssignmentImageEditor
                    question={question}
                    libraryImages={libraryImages}
                    onChange={(update) => updateQuestion(index, update)}
                  />
                  {(question.answerMode ?? "choice") === "choice" ? (
                    <fieldset className="assignment-answer-options">
                      <legend>Đáp án <span>Chọn đáp án đúng</span></legend>
                      {question.options.map((option, optionIndex) => (
                        <label className={`assignment-answer-option${question.correctAnswer === option && option ? " is-correct" : ""}`} key={optionIndex}>
                          <input
                            type="radio"
                            name={`assignment-question-${index}-correct`}
                            checked={Boolean(option) && question.correctAnswer === option}
                            disabled={!option.trim()}
                            onChange={() => updateQuestion(index, { correctAnswer: option })}
                            aria-label={`Đánh dấu lựa chọn ${String.fromCharCode(65 + optionIndex)} là đáp án đúng cho câu ${index + 1}`}
                          />
                          <span className="assignment-answer-letter">{String.fromCharCode(65 + optionIndex)}</span>
                          <input
                            value={option}
                            onChange={(event) => updateOption(index, optionIndex, event.target.value)}
                            placeholder={`Nhập đáp án ${String.fromCharCode(65 + optionIndex)}`}
                            aria-label={`Đáp án ${String.fromCharCode(65 + optionIndex)} của câu ${index + 1}`}
                          />
                          {question.correctAnswer === option && option && <Icon name="check" size={16} />}
                        </label>
                      ))}
                    </fieldset>
                  ) : question.answerMode === "image-choice" || question.answerMode === "image-select" ? (
                    <fieldset className="assignment-answer-options assignment-image-answer-options">
                      <legend>Ảnh đáp án <span>Chọn ảnh trong thư viện đề bài</span></legend>
                      {question.options.map((option, optionIndex) => (
                        <div className="assignment-image-answer-option" key={option}>
                          <input
                            type={question.answerMode === "image-select" ? "checkbox" : "radio"}
                            name={`assignment-question-${index}-image-correct`}
                            checked={question.correctAnswer.split("|").includes(option)}
                            onChange={(event) => setImageChoiceCorrect(index, option, event.target.checked)}
                            aria-label={`${question.answerMode === "image-select" ? "Đánh dấu" : "Chọn"} ảnh ${option} là đáp án đúng cho câu ${index + 1}`}
                          />
                          <strong>{option}</strong>
                          <select
                            value={question.optionImageIds?.[optionIndex] ?? ""}
                            onChange={(event) => setOptionImage(index, optionIndex, event.target.value)}
                            aria-label={`Ảnh đáp án ${option} của câu ${index + 1}`}
                          >
                            <option value="">Chọn ảnh...</option>
                            {(question.imageAssets ?? [])
                              .filter((asset) => asset.id === question.optionImageIds?.[optionIndex]
                                || !question.optionImageIds?.some((id, index) => index !== optionIndex && id === asset.id))
                              .map((asset) => (
                              <option key={asset.id} value={asset.id}>{asset.name}</option>
                            ))}
                          </select>
                          {question.optionImageIds?.[optionIndex] && (
                            <img
                              src={question.imageAssets?.find((asset) => asset.id === question.optionImageIds?.[optionIndex])?.src}
                              alt={`Xem trước ảnh ${option}`}
                            />
                          )}
                        </div>
                      ))}
                      <small>{question.answerMode === "image-select" ? "Chọn tất cả ảnh đúng." : "Chọn một ảnh đúng."} Thêm ảnh vào thư viện/cảnh ở trên trước.</small>
                    </fieldset>
                  ) : (
                    <label className="assignment-question-prompt assignment-question-correct-answer">
                      Đáp án đúng
                      <input
                        type="number"
                        step="1"
                        value={question.correctAnswer}
                        onChange={(event) => updateQuestion(index, { correctAnswer: event.target.value })}
                        placeholder="Nhập đáp án số"
                        aria-label={`Đáp án đúng bằng số cho câu ${index + 1}`}
                      />
                      <small>{MODE_LABELS[question.answerMode ?? "choice"]} dùng đáp án số; học sinh sẽ trả lời theo kiểu này.</small>
                    </label>
                  )}
                  <label className="assignment-question-prompt assignment-question-explanation">
                    Lời giải (không bắt buộc)
                    <textarea
                      value={question.explanation}
                      onChange={(event) => updateQuestion(index, { explanation: event.target.value })}
                      placeholder="Giải thích đáp án đúng..."
                      rows={2}
                    />
                  </label>
                  <aside className="assignment-live-preview" aria-label={`Xem trước câu hỏi ${index + 1}`}>
                    <div className="assignment-live-preview-heading">
                      <div><span className="assignment-preview-eyebrow">GIAO DIỆN HỌC SINH</span><strong>Xem trước câu {index + 1}</strong></div>
                      <span>{MODE_LABELS[question.answerMode ?? "choice"]}</span>
                    </div>
                    <p>{question.prompt || "Nội dung đề bài sẽ hiển thị ở đây."}</p>
                    <QuizIllustration question={question} />
                    {(question.answerMode ?? "choice") === "choice" && (
                      <div className="assignment-live-preview-options">
                        {question.options.map((option, optionIndex) => (
                          <div key={optionIndex}><b>{String.fromCharCode(65 + optionIndex)}</b><span>{option || `Đáp án ${String.fromCharCode(65 + optionIndex)}`}</span></div>
                        ))}
                      </div>
                    )}
                    {(question.answerMode === "image-choice" || question.answerMode === "image-select") && (
                      <div className="assignment-live-preview-options image">
                        {question.options.map((option, optionIndex) => {
                          const assetId = question.optionImageIds?.[optionIndex];
                          const asset = question.imageAssets?.find((item) => item.id === assetId);
                          return (
                            <div key={option}>
                              {asset && <img src={asset.src} alt={asset.name} />}
                              <span>{option}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {!["choice", "image-choice", "image-select"].includes(question.answerMode ?? "choice") && (
                      <div className="assignment-live-preview-answer">
                        {question.answerMode === "type" ? <><span>Nhập câu trả lời</span><i /></>
                          : question.answerMode === "line" ? <><span>Trục số để chọn đáp án</span><i /></>
                            : question.answerMode === "complete" ? <><span>Các ô ghép phép tính</span><i /></>
                              : question.answerMode === "match" ? <><span>Bảng nối cặp đáp án</span><i /></>
                                : <><span>Các lựa chọn để chọn</span><i /></>}
                      </div>
                    )}
                  </aside>
                </li>
              ) : null)}
            </ol>
          ) : <div className="assignment-question-empty"><Icon name="sparkles" size={24} /><p>Tạo đề bằng AI hoặc tự thêm câu hỏi, đáp án phù hợp với kiểu trả lời.</p></div>}
          <div className="assignment-question-actions">
            <button className="secondary-button assignment-add-question" onClick={() => void generateQuestions()} disabled={loading}>
              <Icon name="sparkles" /> {loading ? "Đang xử lý..." : "Tạo 10 câu bằng AI"}
            </button>
            <button className="assignment-add-manual" onClick={addQuestion} disabled={loading || questions.length >= 20}>
              <Icon name="plus" /> Thêm câu hỏi
            </button>
          </div>
          {generationNotice && (
            <p
              className={`assignment-generation-status${generationNotice.startsWith("AI chưa") || generationNotice.startsWith("Ollama chỉ") ? " fallback" : ""}`}
              role="status"
            >
              {generationNotice}
            </p>
          )}
          </section>
        </div>
      ) : (
        <div className="assignment-layout assignment-settings-layout">
          <section className="assignment-panel assignment-settings-panel">
            <h2>Cài đặt bài tập</h2>
            <div className="assignment-form">
              <label>Tên bài tập<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="VD: Ôn tập cộng trừ" /></label>
              <label>Chọn lớp
                <select value={classroomId} onChange={(event) => setClassroomId(event.target.value)}>
                  <option value="">Chọn lớp học</option>
                  {classrooms.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name} · {classroom.label}</option>)}
                </select>
              </label>
              <label>Chủ đề<input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="VD: Cộng trừ trong phạm vi 10" /></label>
              <label>Khối lớp<select value={level} onChange={(event) => setLevel(event.target.value)}>{[1, 2, 3, 4, 5, 6].map((item) => <option key={item} value={item}>Khối {item}</option>)}</select></label>
              <label>Hạn nộp bài<input type="datetime-local" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
              <label>Thời gian làm bài
                <span className="assignment-duration"><input type="number" min={1} max={240} value={duration} onChange={(event) => setDuration(event.target.value)} /><em>phút</em></span>
              </label>
            </div>
          </section>
          <section className="assignment-panel assignment-project-panel">
            <span className="section-kicker">DÙNG LẠI LẦN SAU</span>
            <h2>Bộ dự án của tôi</h2>
            <p>Lưu câu hỏi, ảnh và cách sắp xếp vào tài khoản giáo viên để mở lại trên thiết bị khác.</p>
            <label>Tên bộ dự án<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Tên bộ dự án" /></label>
            <div className="assignment-project-actions">
              <button type="button" className="primary-button" onClick={() => void saveProject()} disabled={loading}>
                {loading ? "Đang lưu..." : projectId ? "Cập nhật bộ dự án" : "Lưu thành bộ dự án"}
              </button>
              {projectId && <button type="button" className="assignment-project-delete" onClick={() => void deleteProject()} disabled={loading}>Xóa bộ dự án</button>}
            </div>
            <div className="assignment-project-summary">
              <strong>Đề hiện tại</strong>
              <span>{questions.length} câu hỏi · Khối {level} · {topic || "Chưa đặt chủ đề"}</span>
              <button type="button" className="secondary-button" onClick={() => setStep("questions")}>Quay lại chỉnh sửa đề</button>
            </div>
          </section>
        </div>
      )}

      {error && <p className="student-form-error" role="alert">{error}</p>}
      <footer className="assignment-footer">
        {step === "questions" ? (
          <>
            <button className="secondary-button" onClick={onBack}>Hủy</button>
            <button className="primary-button" onClick={continueToSettings}>Xong đề · Cài đặt bài tập <Icon name="arrow" /></button>
          </>
        ) : (
          <>
            <button className="secondary-button" onClick={() => setStep("questions")}>Chỉnh sửa đề</button>
            <button className="primary-button" onClick={() => void publish()} disabled={loading}>{loading ? "Đang lưu..." : "Phát hành bài tập"}</button>
          </>
        )}
      </footer>
    </div>
  );
}
