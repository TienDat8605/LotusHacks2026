import { Layers, LocateFixed, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePageMeta } from '@/hooks/usePageMeta';
import { useVibeMapStore } from '@/stores/vibemapStore';
import { MapCanvas } from '@/components/map/MapCanvas';
import { cn } from '@/lib/utils';

export default function MapDashboard() {
  usePageMeta({
    title: 'VibeMap — Ho Chi Minh City',
    description: 'Explore curated vibes and routes across HCMC.',
  });

  const navigate = useNavigate();
  const lastPlan = useVibeMapStore((s) => s.lastPlanRequest);
  const routesById = useVibeMapStore((s) => s.routesById);
  const route = Object.values(routesById).slice(-1)[0];

  return (
    <div className="h-full w-full overflow-hidden">
      <div className="h-full w-full grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 lg:p-8">
        <section className="lg:col-span-12 h-full relative">
          <MapCanvas
            className="h-full"
            title={route ? 'Current Route' : 'HCMC Canvas'}
            subtitle={route ? route.title : 'Floating overlays, curated layers'}
            route={route}
          />

          <div className="absolute top-6 left-6 z-20 space-y-3">
            <div className="glass-card p-1.5 rounded-2xl shadow-float flex flex-col gap-1 border border-white/50">
              <button
                type="button"
                className="p-3 hover:bg-surface-container-lowest/70 rounded-xl transition-colors"
                aria-label="Layers"
              >
                <Layers className="h-5 w-5 text-on-surface/70" />
              </button>
              <button
                type="button"
                className="p-3 hover:bg-surface-container-lowest/70 rounded-xl transition-colors"
                aria-label="Explore"
              >
                <Eye className="h-5 w-5 text-primary" />
              </button>
              <button
                type="button"
                className="p-3 hover:bg-surface-container-lowest/70 rounded-xl transition-colors"
                aria-label="Visibility"
              >
                <Eye className="h-5 w-5 text-on-surface/70" />
              </button>
            </div>
            <div className="glass-card p-1.5 rounded-2xl shadow-float border border-white/50">
              <button
                type="button"
                className="p-3 hover:bg-surface-container-lowest/70 rounded-xl transition-colors"
                aria-label="My location"
              >
                <LocateFixed className="h-5 w-5 text-on-surface/70" />
              </button>
            </div>
          </div>

          <div className="absolute bottom-6 left-6 right-6 lg:right-auto z-20">
            <div
              className={cn(
                'bg-white/90 backdrop-blur-2xl rounded-lg p-6 shadow-ambient border border-white/60',
                'w-full lg:w-96'
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="bg-secondary-container/30 text-on-secondary-container text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded">
                    {route ? 'Current Route' : 'Start Here'}
                  </span>
                  <h2 className="font-headline text-xl font-extrabold mt-2">
                    {route ? route.title : 'Plan a Curated Route'}
                  </h2>
                  <p className="text-sm text-on-surface-variant mt-1">
                    {route
                      ? `${route.totalDurationMinutes} mins · ${route.pois.length} stops`
                      : 'Design your perfect HCMC experience in minutes.'}
                  </p>
                </div>
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => navigate('/plan')}
                    className="bg-gradient-to-r from-primary to-primary-container text-white px-5 py-3 rounded-full font-headline font-extrabold shadow-float active:scale-95 transition-transform"
                  >
                    Plan New Route
                  </button>
                </div>
              </div>

              {lastPlan && (
                <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-surface-container-lowest/80 rounded-2xl p-4">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-outline">Last Origin</div>
                    <div className="text-sm font-semibold mt-1 text-on-surface">{lastPlan.origin}</div>
                  </div>
                  <div className="bg-surface-container-lowest/80 rounded-2xl p-4">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-outline">Last Destination</div>
                    <div className="text-sm font-semibold mt-1 text-on-surface">{lastPlan.destination}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

