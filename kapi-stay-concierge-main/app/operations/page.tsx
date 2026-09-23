import { redirect } from 'next/navigation';
import { verifyStaffRole, getStaffDashboardData } from '@/lib/data/admin';
import OperationsDashboardClient from './OperationsDashboardClient';

export default async function OperationsPage() {
  // 1. Server Auth Guard (Chặn từ Server theo Blocker 2)
  const authCheck = await verifyStaffRole();
  if (!authCheck.authorized) {
    redirect('/unauthorized');
  }

  // 2. Load Dữ liệu thật từ DB qua RPC trên main (Sửa Blocker 3)
  const dashboardData = await getStaffDashboardData();

  return (
    <OperationsDashboardClient
      initialRooms={dashboardData.rooms || []}
      initialTickets={dashboardData.tickets || []}
      todayBookings={dashboardData.todayBookings || []}
    />
  );
}