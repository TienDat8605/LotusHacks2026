import { Bell, Menu, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVibeMapStore } from '@/stores/vibemapStore';

export function TopBar(props: { searchPlaceholder?: string; onMenuClick?: () => void }) {
  const profile = useVibeMapStore((s) => s.profile);
  const searchPlaceholder = props.searchPlaceholder ?? 'Search vibes in District 1...';

  return (
    <header className="fixed top-0 left-0 right-0 lg:left-64 z-30 h-16 bg-surface-container-lowest/85 backdrop-blur-xl border-b border-surface-container flex items-center justify-between px-4 lg:px-8">
      <div className="flex items-center gap-3 flex-1">
        <button
          type="button"
          onClick={props.onMenuClick}
          className="lg:hidden h-10 w-10 rounded-full flex items-center justify-center hover:bg-primary/5 transition-colors"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5 text-on-surface/70" />
        </button>
        <div className="relative max-w-xl w-full">
          <input
            className="w-full bg-surface-container-low border-none rounded-full py-2.5 pl-4 pr-4 text-sm font-medium focus:ring-2 focus:ring-primary/20"
            placeholder={searchPlaceholder}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 lg:gap-4">
        <button
          type="button"
          className={cn(
            'h-10 w-10 rounded-full flex items-center justify-center transition-colors',
            'text-on-surface/70 hover:text-primary hover:bg-primary/5'
          )}
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
        </button>
        <button
          type="button"
          className={cn(
            'h-10 w-10 rounded-full flex items-center justify-center transition-colors',
            'text-on-surface/70 hover:text-primary hover:bg-primary/5'
          )}
          aria-label="Filters"
        >
          <SlidersHorizontal className="h-5 w-5" />
        </button>
        <div className="h-9 w-9 rounded-full bg-primary-container/40 overflow-hidden ring-2 ring-white flex items-center justify-center">
          <span className="text-[11px] font-extrabold text-on-primary-container">
            {profile.displayName.slice(0, 2).toUpperCase()}
          </span>
        </div>
      </div>
    </header>
  );
}

