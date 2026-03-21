import { Outlet } from 'react-router-dom';
import { DesktopSidebar } from '@/components/layout/DesktopSidebar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { TopBar } from '@/components/layout/TopBar';

export function AppLayout() {
  return (
    <div className="min-h-screen bg-background text-on-surface">
      <DesktopSidebar />
      <TopBar />

      <main className="pt-16 pb-28 lg:pb-10 lg:ml-64 min-h-screen">
        <div className="h-[calc(100vh-4rem)] lg:h-[calc(100vh-4rem)]">
          <Outlet />
        </div>
      </main>

      <MobileBottomNav />
    </div>
  );
}

