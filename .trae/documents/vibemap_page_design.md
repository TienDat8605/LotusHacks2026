# Page Design Spec (Desktop-first)

## Global Styles
- Design North Star: “Digital Curator” — map as canvas + floating editorial overlays.
- Typography:
  - Headlines/Display: Plus Jakarta Sans (bold, high contrast, editorial)
  - Body/Labels: Inter (legibility for directions + metadata)
- Color tokens (key):
  - Primary: #004be3 (core actions, active nav, route accents)
  - Secondary: #006763 (support accents)
  - Tertiary: #b90037 (trending/social accents)
  - Background/Surface: #f5f6f7, layered containers (no 1px dividers)
- Surfaces & depth:
  - Prefer tonal layering over heavy shadows; allow glassmorphism overlays on map (85% opacity + blur ~12px).
- Components:
  - Buttons: pill/fully-rounded, gradient for primary CTAs.
  - Cards: large radius (2rem), whitespace separation, no divider lines.

## Layout & Responsiveness
- Desktop-first layout with:
  - Left fixed sidebar (Map/Discovery/Social/Profile) on wide screens.
  - Top app bar (search, notifications, filters).
  - Map occupies remaining canvas; floating overlays (route card, controls) positioned absolute.
- Breakpoints:
  - Tablet: collapse sidebar into icon rail; keep top bar.
  - Mobile: switch to bottom navigation (Map/Discovery/Social/Profile) + full-screen sheets for overlays.

---

## 1) Map Dashboard
<img src="../UI-design/stitch_route_planner_setup/vibemap_desktop_dashboard/screen.png" style="max-width:100%;border-radius:12px;" />

### Meta Information
- Title: “VibeMap — Ho Chi Minh City”
- Description: “Explore curated vibes and routes across HCMC.”
- Open Graph: title/description + screenshot preview.

### Page Structure
- Two-axis layout: Sidebar (fixed) + Main canvas (map) with floating control stack and a floating route summary card.

### Sections & Components
- Sidebar
  - Brand block (VibeMap / edition)
  - Nav links: Map, Discovery, Social, Profile
  - Primary CTA: “Plan New Route”
  - Secondary links: Settings, Help
- Top app bar
  - Search input (“Search vibes…”)
  - Notification + filter/tune icons
  - User avatar entry point
- Map canvas
  - Base map container (real map integration later)
  - Route polyline overlay + numbered POI markers + origin/destination markers
  - Hover/click marker: show small label pill; click focuses route card section
- Floating controls
  - Stack: layers, explore, visibility; plus “my location” button
- Floating route summary card
  - Route badge (“Current Route”), title, next stop preview, quick actions (e.g., more)

---

## 2) Route Planner & Discovery
<img src="../UI-design/stitch_route_planner_setup/route_planner_discovery_desktop/screen.png" style="max-width:100%;border-radius:12px;" />

### Meta Information
- Title: “VibeMap — Route Planner”
- Description: “Design a time-boxed curated route.”

### Page Structure
- Split view: left planner panel (scrollable) + right map preview.

### Sections & Components
- Planner form
  - Start point + destination inputs, swap control
  - Time budget slider with labeled extremes
  - Transport mode selector (segmented or icon grid)
  - “Trending” curation toggle card
  - Primary CTA: “Let’s Go / Generate Route”
- Curated suggestions (optional panel section)
  - Editorial cards for suggested vibes/POIs; selecting a suggestion fills destination or adds stops
- Map preview
  - Lightweight preview of selected points and tentative route overlay

---

## 3) Route Results & Directions
<img src="../UI-design/stitch_route_planner_setup/route_results_map_v2/screen.png" style="max-width:100%;border-radius:12px;" />

### Meta Information
- Title: “VibeMap — Your Route”
- Description: “Review itinerary, stops, and turn-by-turn directions.”

### Page Structure
- Map-first with a floating itinerary sheet/card; deep-dive directions opens as a panel/sheet.

### Sections & Components
- Results header summary
  - Route title, total duration, transport mode chip, “edit plan” link
- Itinerary list
  - Numbered stops matching map markers
  - Active stop highlight via background shift (no borders)
- Directions panel
  - Select a leg to view step list
  - Show distance/time per step when available
- Street-view vibe check
  - Button on stop/leg to open a street-view preview page/overlay

---

## 4) AI Assistant
<img src="../UI-design/stitch_route_planner_setup/ai_assistant_v2/screen.png" style="max-width:100%;border-radius:12px;" />

### Meta Information
- Title: “VibeMap — AI Assistant”
- Description: “Ask for places and routes by vibe.”

### Page Structure
- Full-screen map backdrop + bottom floating glass sheet containing assistant UI.

### Sections & Components
- Mode tabs
  - “Ask POI” and “Plan Route” tabs (segmented control)
- Chat thread
  - Assistant bubbles + user bubbles; smooth scroll; loading placeholder state
- POI editorial cards
  - Image header, badges (e.g., “Trending”), short description, CTA “Plan route here”
- Input bar
  - Text input, send button, optional attach/add button
- Handoff behavior
  - Clicking CTA generates a prefilled planner request and navigates to results

---

## 5) Social Meetup Hub
<img src="../UI-design/stitch_route_planner_setup/social_meetup_hub_desktop/screen.png" style="max-width:100%;border-radius:12px;" />

### Meta Information
- Title: “VibeMap — Social”
- Description: “Join live meetups and coordinate on the move.”

### Page Structure
- 3-column editorial dashboard grid: session card, participants list, session feed/chat.

### Sections & Components
- Live session card
  - Status badge (Live Now), destination, map snippet, participant count
  - CTAs: Join Session, Send Ping
- Participants
  - Scrollable list with avatar, online indicator, ETA/status label, quick chat icon
- Session chat/feed
  - Messages list + composer; lightweight reactions/metadata optional

---

## 6) Profile & Settings
### Meta Information
- Title: “VibeMap — Profile”
- Description: “Your identity and preferences.”

### Page Structure
- Single-column settings layout; cards grouped by theme.

### Sections & Components
- Profile card
  - Avatar, display name editor, save state feedback
- Preferences
  - Theme toggle, default transport mode, default time budget
  - Offline/cache controls (show offline status, clear cached assets)
- Help
  - Links + app version/build info