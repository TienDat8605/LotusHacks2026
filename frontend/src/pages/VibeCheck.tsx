import { ArrowLeft, Camera, MapPin } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { usePageMeta } from '@/hooks/usePageMeta';
import { useVibeMapStore } from '@/stores/vibemapStore';
import { cn } from '@/lib/utils';

export default function VibeCheck() {
  const params = useParams();
  const getRoute = useVibeMapStore((s) => s.getRoute);
  const route = params.routeId ? getRoute(params.routeId) : undefined;
  const poi = route?.pois.find((p) => p.id === params.poiId);

  usePageMeta({
    title: poi ? `Kompas — Vibe Check · ${poi.name}` : 'Kompas — Vibe Check',
    description: 'Quick street-view style preview for a stop on your route.',
  });

  const backTo = route ? `/results/${encodeURIComponent(route.id)}` : '/';

  return (
    <div className="h-full w-full p-4 lg:p-8">
      <div className="h-full grid grid-cols-1 lg:grid-cols-12 gap-4">
        <section className="lg:col-span-8 h-full overflow-hidden rounded-lg shadow-float relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(0,75,227,0.12),transparent_45%),radial-gradient(circle_at_65%_60%,rgba(185,0,55,0.10),transparent_48%)]" />
          <div className="absolute inset-0 bg-gradient-to-b from-white/40 via-white/20 to-background" />

          <div className="absolute top-6 left-6 z-20">
            <Link
              to={backTo}
              className="glass-card rounded-full px-4 py-2 shadow-float border border-white/60 flex items-center gap-2 text-sm font-bold text-primary"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </div>

          <div className="h-full w-full flex items-center justify-center p-6">
            <div className="max-w-md w-full bg-white/90 backdrop-blur-2xl rounded-lg p-8 shadow-ambient border border-white/60">
              <div className="h-12 w-12 rounded-full bg-tertiary-container/25 flex items-center justify-center text-tertiary">
                <Camera className="h-6 w-6" />
              </div>
              <h1 className="font-headline text-2xl font-extrabold mt-4">Street-view vibe check</h1>
              <p className="text-on-surface-variant mt-2 text-sm">
                This is a frontend placeholder. When the Go backend is wired, this panel can render a real street-view image
                or panorama for the selected stop.
              </p>

              <div className={cn('mt-6 rounded-2xl p-5', 'bg-surface-container-low')}> 
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-outline">Selected stop</div>
                    <div className="text-sm font-extrabold mt-1">{poi?.name ?? 'Unknown stop'}</div>
                    <div className="text-xs text-on-surface-variant mt-1">
                      {poi?.category ?? 'Curated'}
                      {poi?.rating ? ` · ${poi.rating.toFixed(1)}` : ''}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <Link
                  to={backTo}
                  className="bg-surface-container-high hover:bg-surface-container-highest text-on-surface py-3 rounded-full font-headline font-extrabold text-sm text-center transition-colors"
                >
                  Return
                </Link>
                <Link
                  to="/assistant"
                  state={poi ? { source: 'vibe-check', focusPoi: poi } : undefined}
                  className="bg-gradient-to-r from-primary to-primary-container text-white py-3 rounded-full font-headline font-extrabold text-sm text-center shadow-float"
                >
                  Ask Assistant
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="lg:col-span-4 h-full overflow-hidden rounded-lg bg-surface-container-lowest shadow-float">
          <div className="p-6 lg:p-8">
            <div className="text-[10px] font-bold uppercase tracking-widest text-outline">Notes</div>
            <h2 className="font-headline text-xl font-extrabold mt-2">What to look for</h2>
            <div className="mt-6 space-y-3">
              {[
                'Lighting + crowd density for your time window',
                'Entry vibe: loud vs intimate',
                'Walking comfort and nearby crosswalks',
                'Photo angles if “Trending” is enabled',
              ].map((t) => (
                <div key={t} className="bg-surface-container-low rounded-2xl p-4 text-sm font-semibold text-on-surface">
                  {t}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
