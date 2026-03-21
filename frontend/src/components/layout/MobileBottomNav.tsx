import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { navItems } from '@/components/layout/NavItems';

export function MobileBottomNav() {
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface-container-lowest/90 backdrop-blur-xl rounded-t-[2.25rem] shadow-float px-3 pb-6 pt-3">
      <div className="flex items-center justify-between gap-1">
        {navItems.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center justify-center gap-1 rounded-full px-2 py-2 transition-colors',
                isActive ? 'bg-primary/10 text-primary' : 'text-on-surface/70 hover:bg-primary/5'
              )
            }
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] font-bold tracking-tight">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

