"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icons";
import StudentManagement from "./student-management";
import { classColorPalette, type Classroom } from "@/lib/student-data";
import { smartLotusApi } from "@/lib/api";

type ClassModalState = { mode: "create" } | { mode: "edit"; classroom: Classroom } | null;

export default function Classroom() {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selectedClass, setSelectedClass] = useState<Classroom | null>(null);
  const [modal, setModal] = useState<ClassModalState>(null);
  const [createdClassroom, setCreatedClassroom] = useState<Classroom | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Classroom | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void smartLotusApi.getClassrooms().then(({ classrooms: items }) => {
      if (active) setClassrooms(items);
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Không thể tải danh sách lớp học");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  async function saveClassroom(input: Classroom) {
    if (modal?.mode === "edit") {
      const { classroom } = await smartLotusApi.updateClassroom(input);
      setClassrooms((current) => current.map((item) => item.id === classroom.id ? classroom : item));
    } else {
      const { classroom } = await smartLotusApi.createClassroom(input);
      setClassrooms((current) => [...current, classroom]);
      setCreatedClassroom(classroom);
    }
    setModal(null);
  }

  async function removeClassroom(id: string) {
    try {
      await smartLotusApi.deleteClassroom(id);
      setClassrooms((current) => current.filter((classroom) => classroom.id !== id));
      setSelectedClass(null);
      setConfirmDelete(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Không thể xoá lớp học");
      setConfirmDelete(null);
    }
  }

  if (selectedClass) {
    return (
      <StudentManagement
        classId={selectedClass.id}
        classLabel={selectedClass.label}
        classTitle={selectedClass.name}
        classSubtitle={selectedClass.description}
        onBack={() => setSelectedClass(null)}
        serverManaged
      />
    );
  }

  return (
    <div className="view-stack">
      <section className="page-intro classroom-intro">
        <div>
          <span className="eyebrow purple"><Icon name="school" size={16} /> LỚP HỌC CỦA TÔI</span>
          <h1>Lớp học</h1>
          <p>Tạo lớp, chia sẻ mã tham gia và theo dõi học sinh đã vào lớp.</p>
        </div>
        <button className="primary-button" onClick={() => setModal({ mode: "create" })}>
          <Icon name="plus" /> Tạo lớp học
        </button>
      </section>
      {error && <p className="student-form-error" role="alert">{error}</p>}

      <section className="classroom-grid">
        {loading && <p>Đang tải lớp học...</p>}
        {classrooms.map((classroom) => (
          <ClassCard
            key={classroom.id}
            classroom={classroom}
            studentCount={classroom.studentCount ?? 0}
            onOpen={() => setSelectedClass(classroom)}
            onRename={() => setModal({ mode: "edit", classroom })}
            onDelete={() => setConfirmDelete(classroom)}
          />
        ))}
        <button className="classroom-card classroom-create" onClick={() => setModal({ mode: "create" })}>
          <span className="classroom-create-icon"><Icon name="plus" size={22} /></span>
          <strong>Tạo lớp học mới</strong>
          <small>Thêm lớp và học sinh của bạn</small>
        </button>
      </section>

      {modal && <ClassFormModal modal={modal} onClose={() => setModal(null)} onSaved={saveClassroom} />}
      {createdClassroom && (
        <ClassCreatedModal classroom={createdClassroom} onClose={() => setCreatedClassroom(null)} />
      )}
      {confirmDelete && <ConfirmDeleteClass classroom={confirmDelete} onCancel={() => setConfirmDelete(null)} onConfirm={() => removeClassroom(confirmDelete.id)} />}
    </div>
  );
}

function ClassCard({ classroom, studentCount, onOpen, onRename, onDelete }: { classroom: Classroom; studentCount: number; onOpen: () => void; onRename: () => void; onDelete: () => void }) {
  return (
    <article className="classroom-card">
      <div className={`classroom-card-banner tone-${classroom.color}`}>
        <span className="classroom-card-banner-title">{classroom.name}</span>
        <div className="classroom-card-menu">
          <button onClick={(event) => { event.stopPropagation(); onRename(); }} aria-label={`Đổi tên ${classroom.name}`}><Icon name="edit" size={14} /></button>
          <button onClick={(event) => { event.stopPropagation(); onDelete(); }} aria-label={`Xoá ${classroom.name}`}><Icon name="trash" size={14} /></button>
        </div>
      </div>
      <button className="classroom-card-body" onClick={onOpen}>
        <span className="classroom-card-info">
          <strong>{classroom.name}</strong>
          <small>{classroom.subject}</small>
          <p>{classroom.description || "Chưa có mô tả"}</p>
          <span className="classroom-card-count">{studentCount} học sinh</span>
          {classroom.joinCode && <span className="classroom-join-code">Mã tham gia: <strong>{classroom.joinCode}</strong></span>}
        </span>
        <span className="classroom-card-arrow"><Icon name="arrow" size={16} /></span>
      </button>
    </article>
  );
}

function ClassFormModal({ modal, onClose, onSaved }: { modal: Exclude<ClassModalState, null>; onClose: () => void; onSaved: (classroom: Classroom) => Promise<void> }) {
  const editing = modal.mode === "edit" ? modal.classroom : null;
  const [name, setName] = useState(editing?.name ?? "");
  const [subject, setSubject] = useState(editing?.subject ?? "Toán");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [color, setColor] = useState(editing?.color ?? classColorPalette[0]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError("Vui lòng nhập tên lớp học.");
    setSaving(true);
    setError("");
    try {
      await onSaved({
        id: editing?.id ?? "",
        name: name.trim(),
        label: editing?.label ?? name.trim().slice(0, 40).toUpperCase(),
        subject: subject.trim() || "Toán",
        description: description.trim(),
        color,
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Không thể lưu lớp học");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="student-modal-backdrop" onClick={onClose}>
      <form className="student-modal" onSubmit={handleSubmit} onClick={(event) => event.stopPropagation()}>
        <div className="student-modal-heading">
          <div>
            <span className="section-kicker">{editing ? "CẬP NHẬT LỚP HỌC" : "LỚP HỌC MỚI"}</span>
            <h2>{editing ? "Sửa thông tin lớp học" : "Tạo lớp học mới"}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Đóng"><Icon name="close" /></button>
        </div>

        <div className="student-form">
          <label className="full">
            Tên lớp học
            <input type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="VD: Lớp 2A" />
          </label>
          <label>
            Môn học
            <input type="text" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="VD: Toán" />
          </label>
          <label className="full">
            Mô tả
            <input type="text" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="VD: Buổi sáng · GVCN Cô Thuỷ" />
          </label>
          <div className="class-color-picker">
            <span>Màu sắc</span>
            <div className="class-color-options">
              {classColorPalette.map((tone) => (
                <button key={tone} type="button" className={`class-color-dot tone-${tone} ${color === tone ? "selected" : ""}`} onClick={() => setColor(tone)} aria-label={`Màu ${tone}`} aria-pressed={color === tone} />
              ))}
            </div>
          </div>
          {error && <p className="student-form-error">{error}</p>}
        </div>

        <div className="student-modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Hủy</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? "Đang lưu..." : editing ? "Lưu thay đổi" : "Tạo lớp học"}</button>
        </div>
      </form>
    </div>
  );
}

function ClassCreatedModal({ classroom, onClose }: { classroom: Classroom; onClose: () => void }) {
  const [copyNotice, setCopyNotice] = useState("");

  async function copyJoinCode() {
    if (!classroom.joinCode) {
      setCopyNotice("Không tìm thấy mã tham gia của lớp.");
      return;
    }
    try {
      await navigator.clipboard.writeText(classroom.joinCode);
      setCopyNotice("Đã sao chép mã tham gia.");
    } catch {
      setCopyNotice("Không thể sao chép tự động. Hãy chọn và sao chép mã hiển thị.");
    }
  }

  return (
    <div className="student-modal-backdrop" onClick={onClose}>
      <section className="student-modal class-created-modal" role="dialog" aria-modal="true" aria-labelledby="class-created-title" onClick={(event) => event.stopPropagation()}>
        <span className="section-kicker">TẠO LỚP THÀNH CÔNG</span>
        <h2 id="class-created-title">Mã tham gia lớp {classroom.name}</h2>
        <p>Chia sẻ mã này với học sinh để các em tham gia lớp.</p>
        <div className="class-created-code" aria-label={`Mã tham gia ${classroom.joinCode ?? "chưa có"}`}>
          {classroom.joinCode ?? "Chưa có mã"}
        </div>
        {copyNotice && <p className="class-created-copy-notice" role="status">{copyNotice}</p>}
        <div className="student-modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Đóng</button>
          <button type="button" className="primary-button" onClick={() => void copyJoinCode()} disabled={!classroom.joinCode}>Sao chép mã</button>
        </div>
      </section>
    </div>
  );
}

function ConfirmDeleteClass({ classroom, onCancel, onConfirm }: { classroom: Classroom; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="student-modal-backdrop" onClick={onCancel}>
      <div className="student-modal confirm-modal" onClick={(event) => event.stopPropagation()}>
        <span className="confirm-icon"><Icon name="trash" size={22} /></span>
        <h2>Xoá lớp học?</h2>
        <p>Bạn sắp xoá <strong>{classroom.name}</strong>. Thành viên, bài tập và kết quả nộp thuộc lớp này cũng sẽ bị xoá.</p>
        <div className="student-modal-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>Giữ lại</button>
          <button type="button" className="primary-button danger" onClick={onConfirm}>Xoá lớp học</button>
        </div>
      </div>
    </div>
  );
}
