import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import RoutePlanner from '@/pages/RoutePlanner';
import RouteResults from '@/pages/RouteResults';
import VibeCheck from '@/pages/VibeCheck';
import AiAssistant from '@/pages/AiAssistant';
import SocialHub from '@/pages/SocialHub';
import UploadLocation from '@/pages/UgcUpload';
import ProfileSettings from '@/pages/ProfileSettings';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/plan" replace />} />
          <Route path="/plan" element={<RoutePlanner />} />
          <Route path="/results/:routeId" element={<RouteResults />} />
          <Route path="/results/:routeId/vibe/:poiId" element={<VibeCheck />} />
          <Route path="/assistant" element={<AiAssistant />} />
          <Route path="/social" element={<SocialHub />} />
          <Route path="/ugc" element={<UploadLocation />} />
          <Route path="/profile" element={<ProfileSettings />} />
        </Route>
        <Route path="*" element={<Navigate to="/plan" replace />} />
      </Routes>
    </Router>
  );
}
