import { getAuthenticatedSupabaseUser, getOrCreateAppUser } from "@/lib/server-user";
import { formatStudentCode } from "@/lib/student-code";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authUser = await getAuthenticatedSupabaseUser(request);
  if (!authUser) return Response.json({ message: "Vui lòng đăng nhập" }, { status: 401 });

  try {
    const user = await getOrCreateAppUser(authUser);
    if (user.role !== "student") return Response.json({ message: "Mã ID chỉ dành cho học sinh" }, { status: 403 });
    return Response.json({ studentCode: formatStudentCode(user.id) });
  } catch (error) {
    console.error("Load student ID error", error);
    return Response.json({ message: "Không thể tải mã ID học sinh" }, { status: 500 });
  }
}
