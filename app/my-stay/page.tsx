import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MyStayClient } from "./MyStayClient";

export const metadata = {
  title: "Kỳ nghỉ của tôi | Kapi Stay Concierge",
  description: "Tra cứu thông tin nhận phòng, hướng dẫn mật mã và tiện ích homestay tại Kapi House.",
};

export default async function MyStayPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  // Server-side route authorization check using getClaims()
  if (error || !data?.claims?.sub) {
    redirect("/login?next=/my-stay");
  }

  return <MyStayClient />;
}
