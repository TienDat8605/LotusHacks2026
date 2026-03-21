import { Moon, Sun, Trash2, WifiOff } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { usePageMeta } from '@/hooks/usePageMeta';
import type { TransportMode } from '@/api/types';
import { cn } from '@/lib/utils';
import { useVibeMapStore } from '@/stores/vibemapStore';

export default function ProfileSettings() {
  usePageMeta({
    title: 'VibeMap — Profile',
    description: 'Your identity and preferences.',
  });

  const { theme, toggleTheme, isDark } = useTheme();
  const profile = useVibeMapStore((s) => s.profile);
  const prefs = useVibeMapStore((s) => s.preferences);
  const setProfile = useVibeMapStore((s) => s.setProfile);
  const setPreferences = useVibeMapStore((s) => s.setPreferences);
  const resetLocal = useVibeMapStore((s) => s.resetLocal);

  const [displayName, setDisplayName] = useState(profile.displayName);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const version = useMemo(() => (import.meta.env.VITE_APP_VERSION as string | undefined) ?? 'dev', []);

  return (
    <div className="h-full w-full overflow-y-auto p-4 lg:p-10">
      <div className="max-w-3xl mx-auto space-y-8">
        <header>
          <h1 className="font-headline text-3xl font-extrabold tracking-tight">Profile & Settings</h1>
          <p className="text-on-surface-variant mt-2">Tune your defaults and keep the interface curator-grade.</p>
        </header>

        <section className="bg-surface-container-lowest rounded-lg shadow-float p-6 lg:p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-outline">Identity</div>
              <h2 className="font-headline text-xl font-extrabold mt-2">Explorer card</h2>
            </div>
            <div className="h-12 w-12 rounded-full bg-primary-container/40 ring-2 ring-white flex items-center justify-center">
              <span className="text-xs font-extrabold text-on-primary-container">
                {profile.displayName.slice(0, 2).toUpperCase()}
              </span>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-bold text-outline uppercase tracking-wider mb-2 block ml-2">
                Display name
              </label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-surface-container-low rounded-xl px-4 py-3 text-sm font-semibold focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => setProfile({ displayName: displayName.trim() || 'Explorer' })}
                className="w-full bg-gradient-to-r from-primary to-primary-container text-white py-3 rounded-full font-headline font-extrabold shadow-float active:scale-95 transition-transform"
              >
                Save
              </button>
            </div>
          </div>
        </section>

        <section className="bg-surface-container-lowest rounded-lg shadow-float p-6 lg:p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-outline">Preferences</div>
              <h2 className="font-headline text-xl font-extrabold mt-2">Defaults</h2>
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              className={cn(
                'h-11 px-4 rounded-full font-headline font-extrabold flex items-center gap-2 shadow-float transition-colors',
                isDark ? 'bg-surface-container-low text-on-surface' : 'bg-primary/10 text-primary'
              )}
            >
              {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              {theme === 'dark' ? 'Dark' : 'Light'}
            </button>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-bold text-outline uppercase tracking-wider mb-2 block ml-2">
                Default transport
              </label>
              <select
                value={prefs.defaultTransportMode}
                onChange={(e) => setPreferences({ defaultTransportMode: e.target.value as TransportMode })}
                className="w-full bg-surface-container-low rounded-xl px-4 py-3 text-sm font-semibold"
              >
                <option value="bike">Bike</option>
                <option value="car">Car</option>
                <option value="walk">Walk</option>
                <option value="bus">Bus</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-outline uppercase tracking-wider mb-2 block ml-2">
                Default time budget (mins)
              </label>
              <input
                type="number"
                min={30}
                step={15}
                value={prefs.defaultTimeBudgetMinutes}
                onChange={(e) => setPreferences({ defaultTimeBudgetMinutes: Number(e.target.value) })}
                className="w-full bg-surface-container-low rounded-xl px-4 py-3 text-sm font-semibold"
              />
            </div>
          </div>
        </section>

        <section className="bg-surface-container-lowest rounded-lg shadow-float p-6 lg:p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-outline">Offline</div>
              <h2 className="font-headline text-xl font-extrabold mt-2">PWA status</h2>
            </div>
            {!online && (
              <div className="flex items-center gap-2 text-tertiary font-extrabold">
                <WifiOff className="h-4 w-4" />
                <span className="text-sm">Offline</span>
              </div>
            )}
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-surface-container-low rounded-2xl p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-outline">Cache</div>
              <div className="text-sm font-extrabold mt-2">Enabled</div>
            </div>
            <div className="bg-surface-container-low rounded-2xl p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-outline">Version</div>
              <div className="text-sm font-extrabold mt-2">{version}</div>
            </div>
            <button
              type="button"
              onClick={resetLocal}
              className="bg-tertiary-container/20 text-on-tertiary-container rounded-2xl p-4 text-left hover:bg-tertiary-container/30 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-outline">Local data</div>
                  <div className="text-sm font-extrabold mt-2">Reset</div>
                </div>
                <Trash2 className="h-5 w-5" />
              </div>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
