import { NavLink, useNavigate } from 'react-router-dom';
import { HelpCircle, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { navItems } from '@/components/layout/NavItems';

export function DesktopSidebar() {
  const navigate = useNavigate();

  return (
    <aside className="hidden lg:flex fixed left-0 top-0 h-full w-64 z-40 bg-surface-container-lowest/90 backdrop-blur-xl border-r border-surface-container flex-col py-8 px-4">
      <div className="mb-10 px-4">
        <h1 className="font-headline text-2xl font-black tracking-tighter text-primary">Kompas</h1>
        <div className="mt-4">
          <p className="text-xs uppercase tracking-[0.24em] text-outline font-bold">The Curator</p>
          <p className="text-[10px] text-primary/60 font-bold">HCMC Edition</p>
        </div>
      </div>

      <nav className="flex-1 space-y-2">
        {navItems.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 py-3 px-4 rounded-xl transition-all duration-300 hover:translate-x-1',
                isActive
                  ? 'bg-primary/10 text-primary font-bold'
                  : 'text-on-surface/70 hover:text-primary hover:bg-primary/5'
              )
            }
            end={to === '/'}
          >
            <Icon className="h-5 w-5" />
            <span className="text-sm">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto space-y-4 pt-6 px-4">
        <button
          type="button"
          onClick={() => navigate('/plan')}
          className="w-full bg-gradient-to-r from-primary to-primary-container text-white py-4 rounded-full font-headline font-extrabold text-sm shadow-float active:scale-95 transition-transform"
        >
          Plan New Route
        </button>

        <div className="space-y-1">
          <button
            type="button"
            onClick={() => navigate('/profile')}
            className="w-full flex items-center gap-3 py-2 px-2 text-on-surface/60 hover:text-primary transition-colors"
          >
            <Settings className="h-4 w-4" />
            <span className="text-xs font-semibold">Settings</span>
          </button>
          <a
            href="#"
            className="flex items-center gap-3 py-2 px-2 text-on-surface/60 hover:text-primary transition-colors"
          >
            <HelpCircle className="h-4 w-4" />
            <span className="text-xs font-semibold">Help</span>
          </a>
        </div>
      </div>
    </aside>
  );
}
