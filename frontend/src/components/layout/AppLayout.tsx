import { Outlet } from 'react-router-dom';
import { DesktopSidebar } from '@/components/layout/DesktopSidebar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';

export function AppLayout() {
  return (
    <div className="min-h-screen bg-background text-on-surface">
      <DesktopSidebar />

      <main className="pb-28 lg:pb-10 lg:ml-64 min-h-screen">
        <div className="h-screen">
          <Outlet />
        </div>
      </main>

      <MobileBottomNav />
    </div>
  );
}
