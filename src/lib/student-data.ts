export type StudentStatus = "Xuất sắc" | "Đang tiến bộ" | "Ổn định" | "Cần hỗ trợ";

export type Student = {
  id: string;
  studentCode?: string;
  fullName: string;
  email: string;
  birthDate: string; // YYYY-MM-DD
  gender: "Nam" | "Nữ" | "Chưa cập nhật";
  className: string;
  parentName: string;
  parentPhone: string;
  score: number;
  lessonsCompleted: number;
  totalLessons: number;
  lastActive: string; // YYYY-MM-DD
  status: StudentStatus;
};

export const studentStatuses: StudentStatus[] = ["Xuất sắc", "Đang tiến bộ", "Ổn định", "Cần hỗ trợ"];

export function deriveStatus(score: number): StudentStatus {
  if (score >= 1000) return "Xuất sắc";
  if (score >= 800) return "Đang tiến bộ";
  if (score >= 600) return "Ổn định";
  return "Cần hỗ trợ";
}

export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "HS";
  return parts
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export type Classroom = {
  id: string;
  name: string; // "Lớp 1A"
  label: string; // "1A"
  subject: string;
  description: string;
  color: string;
  joinCode?: string;
  teacherName?: string;
  studentCount?: number;
};

export const classColorPalette = ["purple", "teal", "pink", "amber", "blue", "green"];

export const seedClassrooms: Classroom[] = [
  { id: "class-1a", name: "Lớp 1A", label: "1A", subject: "Toán", description: "Buổi sáng · GVCN Cô Thuỷ", color: "purple" },
  { id: "class-1b", name: "Lớp 1B", label: "1B", subject: "Toán", description: "Buổi chiều · GVCN Cô Thuỷ", color: "teal" },
];

export const seedStudents: Student[] = [
  {
    id: "hs-01",
    fullName: "Nguyễn Minh Anh",
    email: "minhanh@smartlotus.edu.vn",
    birthDate: "2018-03-12",
    gender: "Nữ",
    className: "1A",
    parentName: "Nguyễn Văn Tuấn",
    parentPhone: "0912 345 678",
    score: 920,
    lessonsCompleted: 29,
    totalLessons: 40,
    lastActive: "2026-09-16",
    status: "Đang tiến bộ",
  },
  {
    id: "hs-02",
    fullName: "Trần Gia Hân",
    email: "giahan@smartlotus.edu.vn",
    birthDate: "2018-06-24",
    gender: "Nữ",
    className: "1A",
    parentName: "Trần Quốc Bảo",
    parentPhone: "0987 654 321",
    score: 1080,
    lessonsCompleted: 35,
    totalLessons: 40,
    lastActive: "2026-09-17",
    status: "Xuất sắc",
  },
  {
    id: "hs-03",
    fullName: "Lê Hoàng Nam",
    email: "hoangnam@smartlotus.edu.vn",
    birthDate: "2017-11-02",
    gender: "Nam",
    className: "1A",
    parentName: "Lê Thị Mai",
    parentPhone: "0903 111 222",
    score: 760,
    lessonsCompleted: 21,
    totalLessons: 40,
    lastActive: "2026-09-12",
    status: "Cần hỗ trợ",
  },
  {
    id: "hs-04",
    fullName: "Phạm Bảo Ngọc",
    email: "baongoc@smartlotus.edu.vn",
    birthDate: "2018-01-18",
    gender: "Nữ",
    className: "1A",
    parentName: "Phạm Đức Huy",
    parentPhone: "0935 222 333",
    score: 990,
    lessonsCompleted: 32,
    totalLessons: 40,
    lastActive: "2026-09-15",
    status: "Ổn định",
  },
  {
    id: "hs-05",
    fullName: "Đỗ Khánh Linh",
    email: "khanhlinh@smartlotus.edu.vn",
    birthDate: "2018-08-30",
    gender: "Nữ",
    className: "1A",
    parentName: "Đỗ Minh Sơn",
    parentPhone: "0916 333 444",
    score: 1120,
    lessonsCompleted: 37,
    totalLessons: 40,
    lastActive: "2026-09-17",
    status: "Xuất sắc",
  },
  {
    id: "hs-06",
    fullName: "Vũ Tuấn Kiệt",
    email: "tuankiet@smartlotus.edu.vn",
    birthDate: "2018-02-14",
    gender: "Nam",
    className: "1A",
    parentName: "Vũ Thị Hồng",
    parentPhone: "0948 444 555",
    score: 840,
    lessonsCompleted: 26,
    totalLessons: 40,
    lastActive: "2026-09-14",
    status: "Đang tiến bộ",
  },
  {
    id: "hs-07",
    fullName: "Bùi Ngọc Diệp",
    email: "ngocdiep@smartlotus.edu.vn",
    birthDate: "2017-12-05",
    gender: "Nữ",
    className: "1B",
    parentName: "Bùi Văn Long",
    parentPhone: "0909 555 666",
    score: 680,
    lessonsCompleted: 19,
    totalLessons: 40,
    lastActive: "2026-09-10",
    status: "Cần hỗ trợ",
  },
  {
    id: "hs-08",
    fullName: "Hoàng Gia Bảo",
    email: "giabao@smartlotus.edu.vn",
    birthDate: "2018-05-21",
    gender: "Nam",
    className: "1B",
    parentName: "Hoàng Thu Hà",
    parentPhone: "0979 666 777",
    score: 1050,
    lessonsCompleted: 34,
    totalLessons: 40,
    lastActive: "2026-09-16",
    status: "Xuất sắc",
  },
  {
    id: "hs-09",
    fullName: "Trịnh Quỳnh Chi",
    email: "quynhchi@smartlotus.edu.vn",
    birthDate: "2018-04-03",
    gender: "Nữ",
    className: "1A",
    parentName: "Trịnh Văn Đức",
    parentPhone: "0918 777 888",
    score: 870,
    lessonsCompleted: 27,
    totalLessons: 40,
    lastActive: "2026-09-15",
    status: "Đang tiến bộ",
  },
  {
    id: "hs-10",
    fullName: "Đặng Minh Quân",
    email: "minhquan@smartlotus.edu.vn",
    birthDate: "2017-09-19",
    gender: "Nam",
    className: "1A",
    parentName: "Đặng Thu Trang",
    parentPhone: "0922 888 999",
    score: 640,
    lessonsCompleted: 18,
    totalLessons: 40,
    lastActive: "2026-09-09",
    status: "Cần hỗ trợ",
  },
  {
    id: "hs-11",
    fullName: "Ngô Thuỳ Dương",
    email: "thuyduong@smartlotus.edu.vn",
    birthDate: "2018-07-11",
    gender: "Nữ",
    className: "1A",
    parentName: "Ngô Văn Bình",
    parentPhone: "0901 222 345",
    score: 950,
    lessonsCompleted: 30,
    totalLessons: 40,
    lastActive: "2026-09-16",
    status: "Đang tiến bộ",
  },
  {
    id: "hs-12",
    fullName: "Phan Hải Đăng",
    email: "haidang@smartlotus.edu.vn",
    birthDate: "2018-10-25",
    gender: "Nam",
    className: "1A",
    parentName: "Phan Thị Ngọc",
    parentPhone: "0966 333 456",
    score: 1010,
    lessonsCompleted: 33,
    totalLessons: 40,
    lastActive: "2026-09-17",
    status: "Xuất sắc",
  },
  {
    id: "hs-13",
    fullName: "Đinh Bảo Châu",
    email: "baochau@smartlotus.edu.vn",
    birthDate: "2018-01-08",
    gender: "Nữ",
    className: "1B",
    parentName: "Đinh Công Minh",
    parentPhone: "0941 444 567",
    score: 900,
    lessonsCompleted: 28,
    totalLessons: 40,
    lastActive: "2026-09-14",
    status: "Đang tiến bộ",
  },
  {
    id: "hs-14",
    fullName: "Lý Gia Khiêm",
    email: "giakhiem@smartlotus.edu.vn",
    birthDate: "2017-12-22",
    gender: "Nam",
    className: "1B",
    parentName: "Lý Hoàng Yến",
    parentPhone: "0905 555 678",
    score: 710,
    lessonsCompleted: 20,
    totalLessons: 40,
    lastActive: "2026-09-11",
    status: "Cần hỗ trợ",
  },
  {
    id: "hs-15",
    fullName: "Trương Ngọc Ánh",
    email: "ngocanh@smartlotus.edu.vn",
    birthDate: "2018-03-30",
    gender: "Nữ",
    className: "1B",
    parentName: "Trương Quang Hải",
    parentPhone: "0973 666 789",
    score: 960,
    lessonsCompleted: 31,
    totalLessons: 40,
    lastActive: "2026-09-16",
    status: "Đang tiến bộ",
  },
  {
    id: "hs-16",
    fullName: "Đoàn Quốc Hưng",
    email: "quochung@smartlotus.edu.vn",
    birthDate: "2018-06-17",
    gender: "Nam",
    className: "1B",
    parentName: "Đoàn Thị Lan",
    parentPhone: "0910 777 890",
    score: 820,
    lessonsCompleted: 25,
    totalLessons: 40,
    lastActive: "2026-09-13",
    status: "Đang tiến bộ",
  },
  {
    id: "hs-17",
    fullName: "Hà Phương Thảo",
    email: "phuongthao@smartlotus.edu.vn",
    birthDate: "2018-09-02",
    gender: "Nữ",
    className: "1B",
    parentName: "Hà Văn Tùng",
    parentPhone: "0985 888 901",
    score: 1040,
    lessonsCompleted: 34,
    totalLessons: 40,
    lastActive: "2026-09-17",
    status: "Xuất sắc",
  },
  {
    id: "hs-18",
    fullName: "Mai Đức Anh",
    email: "ducanh@smartlotus.edu.vn",
    birthDate: "2017-10-14",
    gender: "Nam",
    className: "1B",
    parentName: "Mai Thu Huyền",
    parentPhone: "0930 999 012",
    score: 750,
    lessonsCompleted: 22,
    totalLessons: 40,
    lastActive: "2026-09-12",
    status: "Cần hỗ trợ",
  },
  {
    id: "hs-19",
    fullName: "Võ Minh Thư",
    email: "minhthu@smartlotus.edu.vn",
    birthDate: "2018-05-06",
    gender: "Nữ",
    className: "1B",
    parentName: "Võ Thanh Phong",
    parentPhone: "0908 111 123",
    score: 890,
    lessonsCompleted: 27,
    totalLessons: 40,
    lastActive: "2026-09-15",
    status: "Đang tiến bộ",
  },
  {
    id: "hs-20",
    fullName: "Nguyễn Khánh Vy",
    email: "khanhvy@smartlotus.edu.vn",
    birthDate: "2018-11-29",
    gender: "Nữ",
    className: "1B",
    parentName: "Nguyễn Hữu Phước",
    parentPhone: "0970 222 234",
    score: 980,
    lessonsCompleted: 32,
    totalLessons: 40,
    lastActive: "2026-09-16",
    status: "Đang tiến bộ",
  },
];
