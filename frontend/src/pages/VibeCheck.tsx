import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePageMeta } from '@/hooks/usePageMeta';
import { useVibeMapStore } from '@/stores/vibemapStore';

export default function VibeCheck() {
  const navigate = useNavigate();
  const params = useParams();
  const getRoute = useVibeMapStore((s) => s.getRoute);
  const route = params.routeId ? getRoute(params.routeId) : undefined;
  const poi = route?.pois.find((p) => p.id === params.poiId);

  usePageMeta({
    title: poi ? `Kompas — Vibe Check · ${poi.name}` : 'Kompas — Vibe Check',
    description: 'Redirecting vibe check request to the assistant.',
  });

  useEffect(() => {
    if (poi) {
      navigate('/assistant', {
        replace: true,
        state: { source: 'vibe-check', focusPoi: poi },
      });
      return;
    }
    if (route) {
      navigate(`/results/${encodeURIComponent(route.id)}`, { replace: true });
      return;
    }
    navigate('/assistant', { replace: true });
  }, [navigate, poi, route]);

  return (
    <div className="h-full w-full flex items-center justify-center p-8 text-sm font-semibold text-on-surface-variant">
      Redirecting to Assistant…
    </div>
  );
}
