"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "./icons";
import {
  deriveStatus,
  initialsOf,
  seedStudents,
  studentStatuses,
  type Student,
  type StudentStatus,
} from "@/lib/student-data";
import { smartLotusApi } from "@/lib/api";

const STORAGE_KEY = "smart-lotus-students-v2";
const MAX_SCORE = 1750;

export type ModalState = { mode: "add" } | { mode: "edit"; student: Student } | null;

function formatDate(iso: string) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function ageOf(birthDate: string) {
  if (!birthDate) return "";
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1;
  return `${age} tuổi`;
}

function loadStudents(): Student[] {
  if (typeof window === "undefined") return seedStudents;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedStudents;
    const parsed = JSON.parse(raw) as Student[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : seedStudents;
  } catch {
    return seedStudents;
  }
}

type StudentManagementProps = {
  classId?: string;
  classLabel?: string;
  classTitle?: string;
  classSubtitle?: string;
  onBack?: () => void;
  serverManaged?: boolean;
};

export default function StudentManagement({ classId, classLabel, classTitle, classSubtitle, onBack, serverManaged = false }: StudentManagementProps = {}) {
  const [students, setStudents] = useState<Student[]>(serverManaged ? [] : loadStudents);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | StudentStatus>("all");
  const [classFilter, setClassFilter] = useState("all");
  const [modal, setModal] = useState<ModalState>(null);
  const [detail, setDetail] = useState<Student | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Student | null>(null);
  const [loadError, setLoadError] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteNotice, setInviteNotice] = useState("");
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    if (!serverManaged || !classId) return;
    void smartLotusApi.getClassroom(classId).then(({ students: members }) => {
      setStudents(members);
      setLoadError("");
    }).catch((error: unknown) => {
      setLoadError(error instanceof Error ? error.message : "Không thể tải danh sách học sinh");
    });
  }, [classId, serverManaged]);

  useEffect(() => {
    if (serverManaged) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(students));
    } catch {
      // ignore write errors (private browsing etc.)
    }
  }, [students, serverManaged]);

  const scopedStudents = useMemo(
    () => (classId ? students.filter((student) => student.className === (classLabel ?? classId)) : students),
    [students, classId, classLabel],
  );

  const classes = useMemo(
    () => Array.from(new Set(scopedStudents.map((student) => student.className))).sort(),
    [scopedStudents],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return scopedStudents
      .filter((student) => {
        if (statusFilter !== "all" && student.status !== statusFilter) return false;
        if (!classId && classFilter !== "all" && student.className !== classFilter) return false;
        if (!normalizedQuery) return true;
        return (
          student.fullName.toLowerCase().includes(normalizedQuery) ||
          student.email.toLowerCase().includes(normalizedQuery) ||
          student.parentName.toLowerCase().includes(normalizedQuery)
        );
      })
      .sort((left, right) => right.score - left.score);
  }, [scopedStudents, query, statusFilter, classFilter, classId]);

  const stats = useMemo(() => {
    const averageScore = scopedStudents.length
      ? Math.round(scopedStudents.reduce((sum, student) => sum + student.score, 0) / scopedStudents.length)
      : 0;
    const averageProgress = scopedStudents.length
      ? Math.round(scopedStudents.reduce((sum, student) => sum + progressOf(student), 0) / scopedStudents.length)
      : 0;
    const needSupport = scopedStudents.filter((student) => student.status === "Cần hỗ trợ").length;
    return { total: scopedStudents.length, averageScore, averageProgress, needSupport };
  }, [scopedStudents]);

  function saveStudent(input: Student) {
    setStudents((current) => {
      const exists = current.some((student) => student.id === input.id);
      return exists ? current.map((student) => (student.id === input.id ? input : student)) : [...current, input];
    });
  }

  function removeStudent(id: string) {
    setStudents((current) => current.filter((student) => student.id !== id));
    setDetail((current) => (current?.id === id ? null : current));
    setConfirmDelete(null);
  }

  function updateStatus(id: string, status: StudentStatus) {
    setStudents((current) =>
      current.map((student) => (student.id === id ? { ...student, status } : student)),
    );
    setDetail((current) => (current?.id === id ? { ...current, status } : current));
  }

  async function inviteStudent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!classId || !inviteCode.trim()) {
      setInviteNotice("Nhập mã ID học sinh để gửi lời mời.");
      return;
    }
    setInviting(true);
    setInviteNotice("");
    try {
      await smartLotusApi.inviteStudent(classId, inviteCode.trim());
      setInviteCode("");
      setInviteNotice("Đã gửi lời mời. Học sinh cần chấp nhận để vào lớp.");
    } catch (error) {
      setInviteNotice(error instanceof Error ? error.message : "Không thể gửi lời mời.");
    } finally {
      setInviting(false);
    }
  }

  return (
    <div className="view-stack">
      <section className="page-intro student-mgmt-intro">
        <div className="student-mgmt-heading">
          {onBack && <button className="icon-button" onClick={onBack} aria-label="Quay lại"><Icon name="arrow" className="rotate-left" /></button>}
          <div>
            <span className="eyebrow purple"><Icon name="school" size={16} /> {classId ? `LỚP ${classLabel ?? classId} · ${scopedStudents.length} HỌC SINH` : "QUẢN LÝ HỌC SINH"}</span>
            <h1>{classTitle ?? "Hồ sơ lớp học"}</h1>
            <p>{classSubtitle ?? "Xem thông tin cá nhân, theo dõi điểm số, tiến độ và trạng thái của từng học sinh."}</p>
          </div>
        </div>
        {!serverManaged && <button className="primary-button" onClick={() => setModal({ mode: "add" })}>
          <Icon name="plus" /> Thêm học sinh
        </button>}
      </section>
      {loadError && <p className="student-form-error" role="alert">{loadError}</p>}
      {serverManaged && (
        <form className="classroom-invite-form card" onSubmit={(event) => void inviteStudent(event)}>
          <div>
            <span className="section-kicker">MỜI HỌC SINH VÀO LỚP</span>
            <p>Nhập mã ID học sinh để gửi lời mời chờ xác nhận.</p>
          </div>
          <input aria-label="Mã ID học sinh" value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} maxLength={11} placeholder="HS-00000001" />
          <button className="primary-button" type="submit" disabled={inviting}>{inviting ? "Đang gửi..." : "Gửi lời mời"}</button>
          {inviteNotice && <p className="classroom-invite-notice" role="status">{inviteNotice}</p>}
        </form>
      )}

      <section className="stat-grid">
        <MiniStat icon="users" tone="purple" value={String(stats.total)} label="Tổng học sinh" change={classId ? `Lớp ${classId}` : `${classes.length} lớp học`} />
        <MiniStat icon="target" tone="green" value={String(stats.averageScore)} label="Điểm trung bình" change={`Thang điểm ${MAX_SCORE}`} />
        <MiniStat icon="chart" tone="blue" value={`${stats.averageProgress}%`} label="Tiến độ trung bình" change="Toàn khối" />
        <MiniStat icon="flame" tone="orange" value={String(stats.needSupport)} label="Cần hỗ trợ" change="Cần quan tâm sớm" />
      </section>

      <section className="card student-mgmt-card">
        <div className="card-heading">
          <div>
            <span className="section-kicker">DANH SÁCH HỌC SINH</span>
            <h2>Quản lý điểm · tiến độ · trạng thái</h2>
          </div>
          <span className="student-mgmt-count">{filtered.length} / {scopedStudents.length} học sinh</span>
        </div>

        <div className="student-mgmt-toolbar">
          <div className="search-box">
            <Icon name="search" size={16} />
            <input
              type="text"
              placeholder="Tìm theo tên, email, phụ huynh..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Tìm kiếm học sinh"
            />
          </div>
          {!classId && (
            <select className="toolbar-select" value={classFilter} onChange={(event) => setClassFilter(event.target.value)} aria-label="Lọc theo lớp">
              <option value="all">Tất cả lớp</option>
              {classes.map((className) => <option key={className} value={className}>Lớp {className}</option>)}
            </select>
          )}
          <select className="toolbar-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | StudentStatus)} aria-label="Lọc theo trạng thái">
            <option value="all">Tất cả trạng thái</option>
            {studentStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </div>

        <div className="student-mgmt-table-wrap">
          <div className="student-mgmt-table">
            <div className={`smt-head ${serverManaged ? "smt-readonly" : ""}`}>
              <span>Học sinh</span>
              <span>Thông tin cá nhân</span>
              <span>Điểm</span>
              <span>Tiến độ</span>
              <span>Trạng thái</span>
              {!serverManaged && <span>Thao tác</span>}
            </div>
            {filtered.length === 0 ? (
              <div className="smt-empty">
                <Icon name="search" size={26} />
                <strong>Không tìm thấy học sinh</strong>
                <p>Thử thay đổi bộ lọc hoặc từ khoá tìm kiếm.</p>
              </div>
            ) : (
              filtered.map((student) => (
                <div className={`smt-row ${serverManaged ? "smt-readonly" : ""}`} key={student.id} onClick={() => { if (!serverManaged) setDetail(student); }} role={serverManaged ? undefined : "button"} tabIndex={serverManaged ? undefined : 0} onKeyDown={(event) => { if (!serverManaged && event.key === "Enter") setDetail(student); }}>
                  <span className="smt-student">
                    <i className="student-avatar smt-avatar">{initialsOf(student.fullName)}</i>
                    <span className="smt-student-copy">
                      <strong>{student.fullName}</strong>
                      <small>{student.email}</small>
                      {serverManaged && student.studentCode && <small className="student-code">Mã ID: <strong>{student.studentCode}</strong></small>}
                      <span className="class-chip">Lớp {student.className}</span>
                    </span>
                  </span>
                  <span className="smt-info">
                    <span><Icon name="calendar" /> {formatDate(student.birthDate)} · {ageOf(student.birthDate)} · {student.gender}</span>
                    <span><Icon name="users" /> {student.parentName}</span>
                    <span><Icon name="phone" /> {student.parentPhone}</span>
                  </span>
                  <span className="smt-score">
                    {student.score}
                    <small>Điểm tích luỹ</small>
                  </span>
                  <span className="smt-progress">
                    <i><b style={{ width: `${progressOf(student)}%` }} /></i>
                    <span>{progressOf(student)}%</span>
                  </span>
                  {serverManaged ? <span className="student-status-readonly">{student.status}</span> : <StatusSelect value={student.status} onChange={(status) => updateStatus(student.id, status)} />}
                  {!serverManaged && <span className="smt-actions" onClick={(event) => event.stopPropagation()}>
                    <button className="smt-action" aria-label={`Sửa ${student.fullName}`} onClick={() => setModal({ mode: "edit", student })}><Icon name="edit" size={15} /></button>
                    <button className="smt-action danger" aria-label={`Xoá ${student.fullName}`} onClick={() => setConfirmDelete(student)}><Icon name="trash" size={15} /></button>
                  </span>}
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {modal && (
        <StudentFormModal
          modal={modal}
          classes={classes}
          lockedClass={classId}
          onClose={() => setModal(null)}
          onSaved={(student) => {
            saveStudent(student);
            setModal(null);
          }}
        />
      )}

      {detail && (
        <StudentDrawer
          student={detail}
          onClose={() => setDetail(null)}
          onEdit={() => { setModal({ mode: "edit", student: detail }); setDetail(null); }}
          onDelete={() => { setConfirmDelete(detail); setDetail(null); }}
          onStatusChange={(status) => updateStatus(detail.id, status)}
        />
      )}

      {confirmDelete && (
        <ConfirmDeleteDialog
          student={confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => removeStudent(confirmDelete.id)}
        />
      )}
    </div>
  );
}

function progressOf(student: Student) {
  if (student.totalLessons <= 0) return 0;
  return Math.round((student.lessonsCompleted / student.totalLessons) * 100);
}

function MiniStat({ icon, tone, value, label, change }: { icon: "users" | "target" | "chart" | "flame"; tone: string; value: string; label: string; change: string }) {
  return (
    <article className="stat-card">
      <span className={`stat-icon ${tone}`}><Icon name={icon} /></span>
      <div><strong>{value}</strong><p>{label}</p><small>{change}</small></div>
    </article>
  );
}

function statusTone(status: StudentStatus) {
  switch (status) {
    case "Xuất sắc": return "excellent";
    case "Đang tiến bộ": return "progressing";
    case "Ổn định": return "stable";
    case "Cần hỗ trợ": return "support";
  }
}

function StatusSelect({ value, onChange }: { value: StudentStatus; onChange: (status: StudentStatus) => void }) {
  return (
    <select
      className={`status-select ${statusTone(value)}`}
      value={value}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => onChange(event.target.value as StudentStatus)}
      aria-label="Thay đổi trạng thái"
    >
      {studentStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
    </select>
  );
}

export function StudentFormModal({ modal, classes, lockedClass, onClose, onSaved }: { modal: Exclude<ModalState, null>; classes: string[]; lockedClass?: string; onClose: () => void; onSaved: (student: Student) => void }) {
  const editing = modal.mode === "edit" ? modal.student : null;
  const [form, setForm] = useState({
    fullName: editing?.fullName ?? "",
    email: editing?.email ?? "",
    birthDate: editing?.birthDate ?? "",
    gender: (editing?.gender ?? "Nữ") as "Nam" | "Nữ",
    className: editing?.className ?? lockedClass ?? classes[0] ?? "1A",
    parentName: editing?.parentName ?? "",
    parentPhone: editing?.parentPhone ?? "",
    score: editing ? String(editing.score) : "0",
    lessonsCompleted: editing ? String(editing.lessonsCompleted) : "0",
    totalLessons: editing ? String(editing.totalLessons) : "40",
    status: editing?.status ?? "Ổn định",
  });
  const [error, setError] = useState("");
  const [statusTouched, setStatusTouched] = useState(Boolean(editing));

  function setField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleScoreChange(value: string) {
    setField("score", value);
    if (!statusTouched) {
      setForm((current) => ({ ...current, status: deriveStatus(Number(value) || 0) }));
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const score = Math.max(0, Math.min(MAX_SCORE, Math.round(Number(form.score) || 0)));
    const lessonsCompleted = Math.max(0, Math.round(Number(form.lessonsCompleted) || 0));
    const totalLessons = Math.max(1, Math.round(Number(form.totalLessons) || 1));

    if (!form.fullName.trim()) return setError("Vui lòng nhập họ và tên học sinh.");
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setError("Email không hợp lệ.");
    if (!form.parentPhone.trim()) return setError("Vui lòng nhập số điện thoại phụ huynh.");

    onSaved({
      id: editing?.id ?? `hs-${Date.now().toString(36)}`,
      fullName: form.fullName.trim(),
      email: form.email.trim(),
      birthDate: form.birthDate,
      gender: form.gender,
      className: lockedClass ?? (form.className.trim() || "1A"),
      parentName: form.parentName.trim(),
      parentPhone: form.parentPhone.trim(),
      score,
      lessonsCompleted,
      totalLessons,
      lastActive: editing?.lastActive ?? new Date().toISOString().slice(0, 10),
      status: form.status as StudentStatus,
    });
  }

  return (
    <div className="student-modal-backdrop" onClick={onClose}>
      <form className="student-modal" onSubmit={handleSubmit} onClick={(event) => event.stopPropagation()}>
        <div className="student-modal-heading">
          <div>
            <span className="section-kicker">{editing ? "CẬP NHẬT HỒ SƠ" : "HỒ SƠ MỚI"}</span>
            <h2>{editing ? "Sửa thông tin học sinh" : "Thêm học sinh mới"}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Đóng"><Icon name="close" /></button>
        </div>

        <div className="student-form">
          <label className="full">
            Họ và tên
            <input type="text" value={form.fullName} onChange={(event) => setField("fullName", event.target.value)} placeholder="VD: Nguyễn Minh Anh" />
          </label>
          <label className="full">
            Email
            <input type="email" value={form.email} onChange={(event) => setField("email", event.target.value)} placeholder="VD: minhanh@smartlotus.edu.vn" />
          </label>
          <label>
            Ngày sinh
            <input type="date" value={form.birthDate} onChange={(event) => setField("birthDate", event.target.value)} />
          </label>
          <label>
            Giới tính
            <select value={form.gender} onChange={(event) => setField("gender", event.target.value)}>
              <option value="Nữ">Nữ</option>
              <option value="Nam">Nam</option>
            </select>
          </label>
          <label>
            Lớp
            {lockedClass ? (
              <input type="text" value={`Lớp ${lockedClass}`} readOnly />
            ) : (
              <>
                <input type="text" value={form.className} onChange={(event) => setField("className", event.target.value)} list="student-classes" placeholder="VD: 1A" />
                <datalist id="student-classes">{classes.map((className) => <option key={className} value={className} />)}</datalist>
              </>
            )}
          </label>
          <label>
            Tên phụ huynh
            <input type="text" value={form.parentName} onChange={(event) => setField("parentName", event.target.value)} placeholder="VD: Nguyễn Văn Tuấn" />
          </label>
          <label>
            SĐT phụ huynh
            <input type="tel" value={form.parentPhone} onChange={(event) => setField("parentPhone", event.target.value)} placeholder="VD: 0912 345 678" />
          </label>
          <label>
            Điểm tích luỹ
            <input type="number" min={0} max={MAX_SCORE} value={form.score} onChange={(event) => handleScoreChange(event.target.value)} />
          </label>
          <label>
            Số bài hoàn thành
            <input type="number" min={0} value={form.lessonsCompleted} onChange={(event) => setField("lessonsCompleted", event.target.value)} />
          </label>
          <label>
            Tổng số bài
            <input type="number" min={1} value={form.totalLessons} onChange={(event) => setField("totalLessons", event.target.value)} />
          </label>
          <label>
            Trạng thái
            <select value={form.status} onChange={(event) => { setStatusTouched(true); setField("status", event.target.value); }}>
              {studentStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          {error && <p className="student-form-error">{error}</p>}
        </div>

        <div className="student-modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Hủy</button>
          <button type="submit" className="primary-button">{editing ? "Lưu thay đổi" : "Thêm học sinh"}</button>
        </div>
      </form>
    </div>
  );
}

function StudentDrawer({ student, onClose, onEdit, onDelete, onStatusChange }: { student: Student; onClose: () => void; onEdit: () => void; onDelete: () => void; onStatusChange: (status: StudentStatus) => void }) {
  const progress = progressOf(student);
  return (
    <div className="student-drawer-backdrop" onClick={onClose}>
      <aside className="student-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="student-drawer-top">
          <span className="section-kicker">HỒ SƠ HỌC SINH</span>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Đóng"><Icon name="close" /></button>
        </div>

        <div className="student-drawer-head">
          <i className="student-avatar smt-avatar lg">{initialsOf(student.fullName)}</i>
          <div>
            <strong>{student.fullName}</strong>
            <span className="class-chip">Lớp {student.className}</span>
          </div>
        </div>

        <div className="student-drawer-status">
          <span>Trạng thái học tập</span>
          <StatusSelect value={student.status} onChange={onStatusChange} />
        </div>

        <div className="student-drawer-section">
          <h3><Icon name="users" size={15} /> Thông tin cá nhân</h3>
          <dl>
            <div><dt>Email</dt><dd>{student.email}</dd></div>
            <div><dt>Ngày sinh</dt><dd>{formatDate(student.birthDate)} · {ageOf(student.birthDate)}</dd></div>
            <div><dt>Giới tính</dt><dd>{student.gender}</dd></div>
            <div><dt>Phụ huynh</dt><dd>{student.parentName}</dd></div>
            <div><dt>SĐT phụ huynh</dt><dd>{student.parentPhone}</dd></div>
            <div><dt>Hoạt động gần nhất</dt><dd>{formatDate(student.lastActive)}</dd></div>
          </dl>
        </div>

        <div className="student-drawer-section">
          <h3><Icon name="chart" size={15} /> Kết quả học tập</h3>
          <div className="drawer-metric"><div><strong>{student.score}</strong><span>Điểm tích luỹ</span></div><div><strong>{progress}%</strong><span>Tiến độ</span></div><div><strong>{student.lessonsCompleted}/{student.totalLessons}</strong><span>Bài hoàn thành</span></div></div>
          <div className="drawer-progress"><i><b style={{ width: `${progress}%` }} /></i></div>
        </div>

        <div className="student-drawer-actions">
          <button type="button" className="secondary-button" onClick={onEdit}><Icon name="edit" size={16} /> Sửa hồ sơ</button>
          <button type="button" className="drawer-delete" onClick={onDelete}><Icon name="trash" size={16} /> Xoá</button>
        </div>
      </aside>
    </div>
  );
}

function ConfirmDeleteDialog({ student, onCancel, onConfirm }: { student: Student; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="student-modal-backdrop" onClick={onCancel}>
      <div className="student-modal confirm-modal" onClick={(event) => event.stopPropagation()}>
        <span className="confirm-icon"><Icon name="trash" size={22} /></span>
        <h2>Xoá học sinh?</h2>
        <p>Bạn sắp xoá hồ sơ của <strong>{student.fullName}</strong>. Hành động này không thể hoàn tác.</p>
        <div className="student-modal-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>Giữ lại</button>
          <button type="button" className="primary-button danger" onClick={onConfirm}>Xoá học sinh</button>
        </div>
      </div>
    </div>
  );
}
