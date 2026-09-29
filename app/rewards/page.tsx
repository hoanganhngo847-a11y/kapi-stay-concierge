import * as React from "react";
import type { Metadata } from "next";
import { getRewardsSummary } from "@/lib/data/rewards";
import { RewardsClient } from "./RewardsClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kapi Rewards | Tích điểm, điểm danh & mở khóa đặc quyền",
  description:
    "Chương trình thành viên Kapi Rewards. Điểm danh mỗi ngày, duy trì chuỗi liên tục để mở khóa snack, bữa ăn tự chọn và voucher giảm giá đến 40%.",
};

export default async function RewardsPage() {
  const { data: summary, error } = await getRewardsSummary();

  return (
    <div className="w-full min-h-screen bg-[#FAFAFA]">
      <RewardsClient initialSummary={summary} initialError={error} />
    </div>
  );
}
