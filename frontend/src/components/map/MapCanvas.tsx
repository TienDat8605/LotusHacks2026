import { cn } from '@/lib/utils';
import type { Poi, RoutePlan } from '@/api/types';

function markerStyle(i: number) {
  const positions = [
    { top: '48%', left: '18%' },
    { top: '38%', left: '34%' },
    { top: '54%', left: '54%' },
    { top: '36%', left: '72%' },
    { top: '44%', left: '84%' },
  ];
  return positions[i % positions.length];
}

export function MapCanvas(props: {
  className?: string;
  title?: string;
  subtitle?: string;
  route?: RoutePlan;
  activePoiId?: string;
  onPoiClick?: (poi: Poi) => void;
}) {
  const pois = props.route?.pois ?? [];

  return (
    <div
      className={cn(
        'relative h-full w-full overflow-hidden rounded-lg bg-surface-container map-mesh',
        props.className
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-background" />
      <div className="absolute inset-0 opacity-20 mix-blend-multiply bg-[radial-gradient(circle_at_20%_20%,rgba(0,75,227,0.15),transparent_40%),radial-gradient(circle_at_70%_40%,rgba(185,0,55,0.12),transparent_45%),radial-gradient(circle_at_40%_80%,rgba(0,103,99,0.10),transparent_50%)]" />

      {(props.title || props.subtitle) && (
        <div className="absolute top-4 left-4 z-10 glass-card rounded-full px-3 py-2 shadow-float">
          {props.title && <div className="text-xs font-bold text-on-surface">{props.title}</div>}
          {props.subtitle && <div className="text-[10px] font-semibold text-on-surface-variant">{props.subtitle}</div>}
        </div>
      )}

      {pois.map((poi, i) => {
        const active = poi.id === props.activePoiId;
        const pos = markerStyle(i + 1);
        const tone = active ? 'bg-tertiary text-white' : 'bg-primary-container/70 text-on-primary-container';
        return (
          <button
            key={poi.id}
            type="button"
            onClick={() => props.onPoiClick?.(poi)}
            className={cn(
              'absolute z-10 flex flex-col items-center group cursor-pointer',
              active ? 'scale-105' : 'hover:scale-105'
            )}
            style={pos}
          >
            <div
              className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center shadow-float ring-4 ring-white/50 transition-transform font-headline font-extrabold text-xs',
                tone
              )}
            >
              {i + 1}
            </div>
            <div className="mt-2 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold shadow-float border border-white/60">
              {poi.name}
            </div>
          </button>
        );
      })}
    </div>
  );
}

