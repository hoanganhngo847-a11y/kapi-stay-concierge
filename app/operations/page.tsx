import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { verifyStaffRole, getStaffDashboardData } from "@/lib/data/admin";
import OperationsDashboardClient, {
  StaffDashboardDataPayload,
} from "./OperationsDashboardClient";

export const metadata = {
  title: "Bảng Điều Khiển Vận Hành | Kapi Stay Concierge",
  description: "Quản trị trạng thái buồng phòng, tiếp nhận sự cố và lịch đón trả khách 24/7.",
};

export const dynamic = "force-dynamic";

export default async function OperationsDashboardPage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Context trong Server Component
          }
        },
      },
    }
  );

  // 1. Kiểm tra Guest (Unauthenticated) trực tiếp qua Supabase Auth Session
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  // Nếu không có session user hoặc dính lỗi Auth -> Chắc chắn chưa đăng nhập
  if (!user || authError) {
    redirect("/login?next=/operations");
  }

  // 2. Đã đăng nhập -> Xác minh vai trò Staff / Admin
  let staffRoleInfo: { id: string; email?: string; role: "staff" | "admin" } | null = null;
  let isForbidden = false;
  let isBackendError = false;

  try {
    staffRoleInfo = await verifyStaffRole();
  } catch (error: unknown) {
    // Phân loại không dựa vào string substring matching
    if (error instanceof Error && error.message.toLowerCase().includes("backend")) {
      isBackendError = true;
    } else {
      isForbidden = true;
    }
  }

  // Render màn hình 403 cho Non-Staff
  if (isForbidden && !staffRoleInfo) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <h1 className="text-4xl font-bold text-red-600 mb-2">403 - Cấm truy cập</h1>
        <p className="text-gray-600 mb-4">
          Tài khoản của bạn không có quyền Staff/Admin để truy cập trang vận hành này.
        </p>
      </div>
    );
  }

  // Render màn hình lỗi hệ thống khi DB/Backend lookup fail
  if (isBackendError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Lỗi xác thực hệ thống</h1>
        <p className="text-gray-600 mb-4">
          Không thể kết nối máy chủ xác minh quyền hạn lúc này. Vui lòng thử lại sau.
        </p>
      </div>
    );
  }

  // 3. Tải dữ liệu Dashboard khi đã đủ quyền
  let dashboardData: StaffDashboardDataPayload | null = null;
  let loadError = false;

  try {
    const res = await getStaffDashboardData();
    if (res) {
      dashboardData = res as StaffDashboardDataPayload;
    } else {
      loadError = true;
    }
  } catch {
    loadError = true;
  }

  const safeEmail: string = staffRoleInfo?.email || user?.email || "";

  return (
    <OperationsDashboardClient
      initialData={dashboardData}
      loadError={loadError}
      staffEmail={safeEmail}
    />
  );
}