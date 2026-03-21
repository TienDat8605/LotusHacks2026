# Design System Strategy: The Urban Pulse

## 1. Overview & Creative North Star: "The Digital Curator"
This design system moves away from the rigid, utility-first aesthetics of traditional navigation apps. Our Creative North Star is **The Digital Curator**. We are not just building a map; we are building a high-end social editorial of Ho Chi Minh City. 

The experience must feel like a premium lifestyle magazine transposed onto a dynamic geospatial interface. We break the "template" look through **intentional asymmetry**, where content cards overlap map elements, and a high-contrast typography scale that prioritizes "vibe" over mere data. By using a "Floating UI" logic, we treat the map as a living canvas and the interface as a series of curated overlays that breathe with the city’s energy.

---

## 2. Colors: Depth & Electric Accents
Our palette balances the trustworthiness of deep urban blues with the electric "hacker-spirit" of HCMC’s nightlife.

*   **The Foundation:** Use `primary` (#004be3) and `on_primary_container` (#001b61) to establish authority and map legibility.
*   **The Energy:** `secondary` (#006763) and `tertiary` (#b90037) function as our "Trendsetter" accents. Use these for social proof badges (e.g., "Trending on TikTok") and active route paths.
*   **The "No-Line" Rule:** 1px solid borders are strictly prohibited for sectioning. Definition must be achieved through background shifts. Place a `surface_container_low` card against a `surface` background to create a boundary.
*   **Surface Hierarchy & Nesting:** Treat the UI as stacked sheets of frosted glass. An "Explore" drawer should use `surface_container_low`, while the search bar nested within it should rise to `surface_container_lowest` to appear physically closer to the user.
*   **The "Glass & Gradient" Rule:** Main CTAs and hero headers should utilize a subtle linear gradient from `primary` (#004be3) to `primary_container` (#819bff). For floating map overlays, use `surface_container_lowest` at 85% opacity with a `backdrop-blur` of 12px to create a premium glassmorphism effect.

---

## 3. Typography: Editorial Authority
We utilize **Plus Jakarta Sans** for high-impact displays and **Inter** for precision-grade utility.

*   **Display & Headlines (Plus Jakarta Sans):** Use `display-lg` and `headline-lg` for "Vibe" titles (e.g., "District 1: Late Night Eats"). The generous x-height and modern geometry of Jakarta Sans signal a trendsetter persona.
*   **Body & Utility (Inter):** Use `body-md` for navigation instructions and `label-sm` for map metadata. Inter provides the "Trustworthy" anchor, ensuring that even complex route details remain legible at a glance.
*   **The Social Scale:** Social proof badges should use `label-md` in **Bold**, paired with `tertiary_container` backgrounds to ensure they pop against the urban blue map.

---

## 4. Elevation & Depth: Tonal Layering
We reject the heavy drop-shadows of the early 2010s. We define space through light and tone.

*   **The Layering Principle:** Depth is achieved by "stacking" tiers. A `surface_container_highest` element (like a ride-hailing modal) should only sit atop a `surface_container` or lower. 
*   **Ambient Shadows:** If a floating action button (FAB) requires lift, use a shadow with a 24px blur, 4% opacity, and a tint derived from `on_surface` (#2c2f30). It should feel like an atmospheric glow, not a dark stain.
*   **The "Ghost Border" Fallback:** For accessibility in dark map areas, use the `outline_variant` (#abadae) at **15% opacity**. It should be felt, not seen.
*   **Glassmorphism:** All map-based overlays (weather, traffic toggles) must use a semi-transparent `surface_container_lowest` to allow the vibrant colors of the map to bleed through, softening the interface's footprint.

---

## 5. Components: The Urban Kit

### Buttons & Chips
*   **Primary Action:** Use `roundedness.full` with a gradient of `primary` to `primary_container`. Padding: `spacing.4` (vertical) and `spacing.8` (horizontal).
*   **Social Chips:** Selection chips for "Street Food" or "Hidden Gems" use `roundedness.md`. When active, they switch to `secondary_container` with `on_secondary_container` text.

### Cards & Lists
*   **Editorial Cards:** Forbid divider lines. Use `spacing.6` of vertical whitespace to separate items. Cards should have `roundedness.lg` (2rem) to feel approachable and "soft-tech."
*   **Route List Items:** Use background shifts (e.g., `surface_container_low` for the active leg of the journey) instead of borders.

### Specialized Map Components
*   **Vibe-Point Markers:** Custom pins with a `tertiary` pulse animation to indicate "Trending Now" locations.
*   **Transport Mode Toggles:** Segmented controls using `surface_container_highest` as the track and `surface_container_lowest` as the active thumb, using `roundedness.full`.

---

## 6. Do’s and Don’ts

### Do
*   **Do** embrace white space. Use `spacing.10` or `spacing.12` to separate major content blocks to maintain an editorial feel.
*   **Do** use asymmetrical layouts for photo galleries of HCMC locations—overlap images slightly to break the "grid" feel.
*   **Do** use `primary_fixed` for essential map icons (bike/car) to ensure high contrast against the `background`.

### Don’t
*   **Don’t** use 100% black text. Always use `on_surface` (#2c2f30) for a softer, more premium reading experience.
*   **Don’t** use sharp corners. Every interactive element must use at least `roundedness.sm` (0.5rem) to maintain the "Approachable" vibe.
*   **Don’t** use standard "drop shadows." If an element needs to stand out, try increasing the tonal contrast of the background surface first.

---

## 7. Spacing & Rhythm
The system relies on a mathematical 4px baseline, but we prefer "breathing" over "packing."
*   **Standard Container Padding:** `spacing.6` (1.5rem).
*   **Tight Metadata:** `spacing.2` (0.5rem).
*   **Section Gaps:** `spacing.12` (3rem) to ensure the "Urban Explorer" feels they have room to breathe and explore.