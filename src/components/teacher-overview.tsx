"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "./icons";
import { initialsOf, type Classroom, type Student } from "@/lib/student-data";
import { deadlineLabel, urgencyLabels, urgencyOf, type Assignment } from "@/lib/assignment-data";
import { smartLotusApi } from "@/lib/api";


const toneHexMap: Record<string, string> = {
  purple: "#8b5cf6",
  teal: "#14b8a6",
  pink: "#ec4899",
  amber: "#f59e0b",
  blue: "#3b82f6",
  green: "#22c55e",
};

function toneHex(tone: string) {
  return toneHexMap[tone] ?? "#8b5cf6";
}

function progressOf(student: Student) {
  if (student.totalLessons <= 0) return 0;
  return Math.round((student.lessonsCompleted / student.totalLessons) * 100);
}

export default function TeacherOverview({ teacherName, onToast, onCreateAssignment, onSendNotification }: { teacherName: string; onToast: (message: string) => void; onCreateAssignment: () => void; onSendNotification: (title: string, description: string) => void }) {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loadError, setLoadError] = useState("");
  const [quickTestOpen, setQuickTestOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [interventionOpen, setInterventionOpen] = useState(false);
  const [deadlinesOpen, setDeadlinesOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [classData, assignmentData] = await Promise.all([
          smartLotusApi.getClassrooms(),
          smartLotusApi.getAssignments(),
        ]);
        const rosters = await Promise.all(classData.classrooms.map((classroom) => smartLotusApi.getClassroom(classroom.id)));
        setClassrooms(classData.classrooms);
        setStudents(rosters.flatMap(({ students: members }) => members));
        setAssignments(assignmentData.assignments);
        setLoadError("");
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Không thể tải dữ liệu tổng quan");
      }
    })();
  }, []);

  const classStats = useMemo(() => {
    return classrooms.map((classroom) => {
      const list = students.filter((student) => student.className === classroom.label);
      const avgScore = list.length ? Math.round(list.reduce((sum, student) => sum + student.score, 0) / list.length) : 0;
      const avgProgress = list.length ? Math.round(list.reduce((sum, student) => sum + progressOf(student), 0) / list.length) : 0;
      const needSupport = list.filter((student) => student.status === "Cần hỗ trợ").length;
      const excellent = list.filter((student) => student.status === "Xuất sắc").length;
      return { classroom, count: list.length, avgScore, avgProgress, needSupport, excellent };
    });
  }, [classrooms, students]);

  const ranked = useMemo(
    () => [...classStats].sort((left, right) => right.avgScore - left.avgScore || right.avgProgress - left.avgProgress),
    [classStats],
  );

  const totals = useMemo(() => {
    const totalStudents = students.length;
    const avgScore = totalStudents ? Math.round(students.reduce((sum, student) => sum + student.score, 0) / totalStudents) : 0;
    const avgProgress = totalStudents ? Math.round(students.reduce((sum, student) => sum + progressOf(student), 0) / totalStudents) : 0;
    const needSupport = students.filter((student) => student.status === "Cần hỗ trợ").length;
    return { totalClasses: classrooms.length, totalStudents, avgScore, avgProgress, needSupport };
  }, [classrooms, students]);

  const leadingClass = ranked[0];
  const maxStudents = Math.max(1, ...classStats.map((item) => item.count));

  const deadlineStats = useMemo(() => {
    let expiringCount = 0;
    let overdueCount = 0;
    let ungradedCount = 0;
    let unsubmittedCount = 0;
    for (const assignment of assignments) {
      const urgency = urgencyOf(assignment.dueDate);
      if (urgency === "soon" || urgency === "near") expiringCount += 1;
      if (urgency === "overdue") overdueCount += 1;
      ungradedCount += Math.max(0, assignment.submittedCount - assignment.gradedCount);
      if (urgency !== "ok") unsubmittedCount += Math.max(0, assignment.totalStudents - assignment.submittedCount);
    }
    return { expiringCount, overdueCount, ungradedCount, unsubmittedCount };
  }, [assignments]);

  const interventionStudents = useMemo(() => {
    return students
      .filter((student) => student.status === "Cần hỗ trợ" || progressOf(student) < 55)
      .sort((left, right) => left.score - right.score)
      .slice(0, 8);
  }, [students]);

  return (
    <div className="view-stack">
      <section className="page-intro overview-intro">
        <div>
          <span className="eyebrow purple"><Icon name="school" size={16} /> TỔNG QUAN TOÀN KHỐI · {totals.totalClasses} LỚP</span>
          <h1>Chào {teacherName || "quý thầy cô"}!</h1>
          <p>Thống kê tổng quát tất cả lớp học, so sánh và xếp hạng từng lớp để hỗ trợ kịp thời.</p>
        </div>
        <button className="primary-button" onClick={onCreateAssignment}><Icon name="plus" /> Tạo bài tập</button>
      </section>

      {loadError && <p className="student-form-error" role="alert">{loadError}</p>}

      <section className="quick-actions">
        <button className="quick-action" onClick={() => onToast("Mở Lớp học để sao chép mã và chia sẻ cho học sinh tham gia.")}>
          <span className="quick-action-icon purple"><Icon name="users" /></span>
          <div><strong>Mời học sinh vào lớp</strong><small>Chia sẻ mã tham gia của lớp</small></div>
          <Icon name="arrow" className="quick-action-arrow" size={16} />
        </button>
        <button className="quick-action" onClick={() => setQuickTestOpen(true)}>
          <span className="quick-action-icon teal"><Icon name="clock" /></span>
          <div><strong>Tạo bài test nhanh</strong><small>Kiểm tra 15 phút cho lớp</small></div>
          <Icon name="arrow" className="quick-action-arrow" size={16} />
        </button>
        <button className="quick-action" onClick={() => setNotifyOpen(true)}>
          <span className="quick-action-icon pink"><Icon name="bell" /></span>
          <div><strong>Gửi thông báo cho lớp</strong><small>Nhắn tới học sinh và phụ huynh</small></div>
          <Icon name="arrow" className="quick-action-arrow" size={16} />
        </button>
      </section>

      <section className="stat-grid">
        <OverviewStat icon="school" tone="purple" value={String(totals.totalClasses)} label="Lớp học" change="Toàn khối" />
        <OverviewStat icon="users" tone="blue" value={String(totals.totalStudents)} label="Học sinh" change={`${classStats.length} lớp đang dạy`} />
        <OverviewStat icon="target" tone="green" value={String(totals.avgScore)} label="Điểm trung bình" change="Thang điểm 1750" />
        <OverviewStat icon="flame" tone="orange" value={String(totals.needSupport)} label="Cần hỗ trợ" change="Bấm để xem danh sách" onClick={() => setInterventionOpen(true)} />
      </section>

      <section className="monitor-cards">
        <button className="monitor-card" onClick={() => setInterventionOpen(true)}>
          <span className="monitor-badge danger">{interventionStudents.length}</span>
          <span className="quick-action-icon orange"><Icon name="users" /></span>
          <div><strong>Học sinh cần can thiệp</strong><small>Danh sách thụt lùi / cần hỗ trợ sớm</small></div>
          <Icon name="arrow" className="quick-action-arrow" size={16} />
        </button>
        <button className="monitor-card" onClick={() => setDeadlinesOpen(true)}>
          <span className="monitor-badge warning">{deadlineStats.expiringCount + deadlineStats.overdueCount}</span>
          <span className="quick-action-icon purple"><Icon name="clock" /></span>
          <div><strong>Mốc thời gian quan trọng</strong><small>Hạn nộp & chấm bài sắp tới</small></div>
          <Icon name="arrow" className="quick-action-arrow" size={16} />
        </button>
      </section>



      <div className="overview-grid">
        <section className="card class-ranking">
          <div className="card-heading">
            <div><span className="section-kicker">XẾP HẠNG LỚP HỌC</span><h2>So sánh điểm trung bình giữa các lớp</h2></div>
            {leadingClass && <span className="leading-chip"><Icon name="trophy" size={13} /> Dẫn đầu: {leadingClass.classroom.name}</span>}
          </div>
          {ranked.length === 0 ? (
            <div className="overview-empty">
              <Icon name="school" size={28} />
              <strong>Chưa có lớp học</strong>
              <p>Tạo lớp học đầu tiên để xem thống kê và xếp hạng.</p>
            </div>
          ) : (
            <div className="class-ranking-list">
              {ranked.map((item, index) => (
                <div className={`class-rank-row ${index === 0 ? "top" : ""}`} key={item.classroom.id}>
                  <span className={`class-rank-badge rank-${index + 1}`}>{index < 3 ? ["🥇", "🥈", "🥉"][index] : index + 1}</span>
                  <i className={`class-rank-dot tone-${item.classroom.color}`} />
                  <div className="class-rank-info">
                    <strong>{item.classroom.name}</strong>
                    <small>{item.count} học sinh · {item.needSupport} cần hỗ trợ · {item.excellent} xuất sắc</small>
                  </div>
                  <div className="class-rank-score">
                    <strong>{item.avgScore}</strong>
                    <small>điểm TB</small>
                  </div>
                  <div className="class-rank-progress">
                    <i><b style={{ width: `${item.avgProgress}%` }} /></i>
                    <span>{item.avgProgress}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card class-distribution">
          <div className="card-heading"><div><span className="section-kicker">PHÂN BỐ</span><h2>Học sinh theo lớp</h2></div></div>
          <div className="distribution-list">
            {classStats.map((item) => (
              <div className="distribution-row" key={item.classroom.id}>
                <span className="distribution-label"><i className={`class-rank-dot tone-${item.classroom.color}`} /> {item.classroom.name}</span>
                <div className="distribution-bar"><b style={{ width: `${Math.round((item.count / maxStudents) * 100)}%`, background: toneHex(item.classroom.color) }} /></div>
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>
          <div className="insight-note">
            <Icon name="sparkles" />
            <div>
              <strong>Gợi ý cho {teacherName || "thầy cô"}</strong>
              <p>{leadingClass ? `${leadingClass.classroom.name} đang dẫn đầu với ${leadingClass.avgScore} điểm trung bình. Tập trung kèm thêm cho lớp có nhiều học sinh cần hỗ trợ nhất.` : "Tạo lớp học đầu tiên để bắt đầu theo dõi và xếp hạng."}</p>
            </div>
          </div>
        </section>
      </div>

      {quickTestOpen && (
        <QuickTestModal
          classrooms={classrooms}
          onClose={() => setQuickTestOpen(false)}
          onCreate={(className) => {
            setQuickTestOpen(false);
            onCreateAssignment();
            onToast(`Hãy thêm câu hỏi và phát hành bài test 15 phút cho ${className}.`);
          }}
        />
      )}

      {notifyOpen && (
        <NotifyModal
          classrooms={classrooms}
          onClose={() => setNotifyOpen(false)}
          onSend={(title, description) => {
            setNotifyOpen(false);
            onSendNotification(title, description);
            onToast("Đã gửi thông báo");
          }}
        />
      )}

      {interventionOpen && (
        <div className="student-modal-backdrop" onClick={() => setInterventionOpen(false)}>
          <section className="student-modal overview-modal" onClick={(event) => event.stopPropagation()}>
            <div className="student-modal-heading">
              <div>
                <span className="section-kicker">CẦN CAN THIỆP SỚM</span>
                <h2>Học sinh thụt lùi hoặc cần hỗ trợ</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setInterventionOpen(false)} aria-label="Đóng"><Icon name="close" /></button>
            </div>
            <div className="modal-summary"><span className="deadline-total">{interventionStudents.length} học sinh cần quan tâm</span></div>
            {interventionStudents.length === 0 ? (
              <div className="overview-empty">
                <Icon name="check" size={28} />
                <strong>Không có học sinh nào cần can thiệp</strong>
                <p>Tất cả học sinh đều đang tiến bộ tốt.</p>
              </div>
            ) : (
              <div className="intervention-list">
                {interventionStudents.map((student) => {
                  const progress = progressOf(student);
                  const reason = student.status === "Cần hỗ trợ" ? "Điểm dưới trung bình" : "Tiến độ chậm";
                  return (
                    <div className="intervention-row" key={student.id}>
                      <i className="student-avatar smt-avatar">{initialsOf(student.fullName)}</i>
                      <div className="intervention-info">
                        <strong>{student.fullName}</strong>
                        <small>Lớp {student.className}</small>
                      </div>
                      <div className="intervention-score">
                        <strong>{student.score}</strong>
                        <small>điểm</small>
                      </div>
                      <div className="intervention-progress">
                        <i><b style={{ width: `${progress}%` }} /></i>
                        <span>{progress}%</span>
                      </div>
                      <span className={`intervention-reason ${student.status === "Cần hỗ trợ" ? "danger" : "warn"}`}>{reason}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {deadlinesOpen && (
        <div className="student-modal-backdrop" onClick={() => setDeadlinesOpen(false)}>
          <section className="student-modal overview-modal" onClick={(event) => event.stopPropagation()}>
            <div className="student-modal-heading">
              <div>
                <span className="section-kicker">MỐC THỜI GIAN QUAN TRỌNG</span>
                <h2>Hạn nộp & chấm bài sắp tới</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setDeadlinesOpen(false)} aria-label="Đóng"><Icon name="close" /></button>
            </div>
            <div className="deadline-stats">
              <div className={`deadline-stat ${deadlineStats.overdueCount > 0 ? "danger" : deadlineStats.expiringCount > 0 ? "warning" : ""}`}>
                <strong>{deadlineStats.expiringCount + deadlineStats.overdueCount}</strong>
                <span>Sắp hết hạn</span>
              </div>
              <div className="deadline-stat">
                <strong>{deadlineStats.ungradedCount}</strong>
                <span>Bài chưa chấm</span>
              </div>
              <div className="deadline-stat">
                <strong>{deadlineStats.unsubmittedCount}</strong>
                <span>Học sinh chưa nộp</span>
              </div>
            </div>
            <div className="deadline-list">
              {assignments.map((assignment) => {
                const urgency = urgencyOf(assignment.dueDate);
                const ungraded = Math.max(0, assignment.submittedCount - assignment.gradedCount);
                const unsubmitted = Math.max(0, assignment.totalStudents - assignment.submittedCount);
                const classStudents = students.filter((student) => student.className === assignment.className);
                const missingNames = classStudents.slice(assignment.submittedCount, assignment.submittedCount + 3).map((student) => student.fullName);
                return (
                  <div className="deadline-row" key={assignment.id}>
                    <span className={`urgency-badge ${urgency}`}>{urgencyLabels[urgency]}</span>
                    <div className="deadline-info">
                      <strong>{assignment.title}</strong>
                      <small><span className="class-chip">Lớp {assignment.className}</span> {deadlineLabel(assignment.dueDate)}</small>
                      {urgency !== "ok" && unsubmitted > 0 && (
                        <p className="deadline-missing"><Icon name="users" size={12} /> {unsubmitted} học sinh chưa nộp{missingNames.length > 0 ? `: ${missingNames.join(", ")}` : ""}</p>
                      )}
                    </div>
                    <div className="deadline-progress">
                      <span>{assignment.submittedCount}/{assignment.totalStudents} đã nộp</span>
                      <i><b style={{ width: `${Math.round((assignment.submittedCount / assignment.totalStudents) * 100)}%` }} /></i>
                    </div>
                    <div className="deadline-ungraded">
                      <strong>{ungraded}</strong>
                      <span>chưa chấm</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function OverviewStat({ icon, tone, value, label, change, onClick }: { icon: IconName; tone: string; value: string; label: string; change: string; onClick?: () => void }) {
  return (
    <article className={`stat-card ${onClick ? "stat-card-clickable" : ""}`} onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined} onKeyDown={onClick ? (event) => { if (event.key === "Enter") onClick(); } : undefined}>
      <span className={`stat-icon ${tone}`}><Icon name={icon} /></span>
      <div><strong>{value}</strong><p>{label}</p><small>{change}</small></div>
    </article>
  );
}

function QuickTestModal({ classrooms, onClose, onCreate }: { classrooms: Classroom[]; onClose: () => void; onCreate: (className: string) => void }) {
  const [className, setClassName] = useState("all");
  const [topic, setTopic] = useState("Cộng trừ trong phạm vi 10");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    onCreate(className === "all" ? "tất cả các lớp" : `lớp ${className}`);
  }

  return (
    <div className="student-modal-backdrop" onClick={onClose}>
      <form className="student-modal" onSubmit={handleSubmit} onClick={(event) => event.stopPropagation()}>
        <div className="student-modal-heading">
          <div>
            <span className="section-kicker">BÀI TEST NHANH</span>
            <h2>Tạo bài kiểm tra 15 phút</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Đóng"><Icon name="close" /></button>
        </div>
        <div className="student-form">
          <label className="full">
            Chọn lớp
            <select value={className} onChange={(event) => setClassName(event.target.value)}>
              <option value="all">Tất cả các lớp</option>
              {classrooms.map((classroom) => <option key={classroom.id} value={classroom.label}>{classroom.name}</option>)}
            </select>
          </label>
          <label className="full">
            Chủ đề
            <input type="text" value={topic} onChange={(event) => setTopic(event.target.value)} />
          </label>
          <div className="quick-test-info">
            <span><Icon name="clock" size={16} /> 15 phút</span>
            <span><Icon name="target" size={16} /> 10 câu hỏi</span>
          </div>
        </div>
        <div className="student-modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Hủy</button>
          <button type="submit" className="primary-button">Tạo bài test</button>
        </div>
      </form>
    </div>
  );
}

function NotifyModal({ classrooms, onClose, onSend }: { classrooms: Classroom[]; onClose: () => void; onSend: (title: string, description: string) => void }) {
  const [className, setClassName] = useState("all");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return setError("Vui lòng nhập tiêu đề thông báo.");
    if (!description.trim()) return setError("Vui lòng nhập nội dung thông báo.");
    onSend(title.trim(), description.trim());
  }

  return (
    <div className="student-modal-backdrop" onClick={onClose}>
      <form className="student-modal" onSubmit={handleSubmit} onClick={(event) => event.stopPropagation()}>
        <div className="student-modal-heading">
          <div>
            <span className="section-kicker">THÔNG BÁO</span>
            <h2>Gửi thông báo cho lớp</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Đóng"><Icon name="close" /></button>
        </div>
        <div className="student-form">
          <label className="full">
            Gửi đến
            <select value={className} onChange={(event) => setClassName(event.target.value)}>
              <option value="all">Tất cả các lớp</option>
              {classrooms.map((classroom) => <option key={classroom.id} value={classroom.label}>{classroom.name}</option>)}
            </select>
          </label>
          <label className="full">
            Tiêu đề
            <input type="text" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="VD: Nhắc nhở nộp bài tập" />
          </label>
          <label className="full">
            Nội dung
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Nhập nội dung thông báo..." />
          </label>
          {error && <p className="student-form-error">{error}</p>}
        </div>
        <div className="student-modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Hủy</button>
          <button type="submit" className="primary-button">Gửi thông báo</button>
        </div>
      </form>
    </div>
  );
}
