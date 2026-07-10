# CLAUDE.md - Bidnam Lee Portfolio Website

## Project Overview

Personal portfolio website featuring an interactive 3D terrain navigation. Built with Three.js, the terrain uses Roger Martin's "rugged landscapes" strategy metaphor as a literal navigation interface.

## Tech Stack

- **HTML/CSS/JS** - Static site, no build tools
- **Three.js r178** (ES module via importmap, jsdelivr CDN) - 3D terrain rendering. `THREE.ColorManagement.enabled = false` preserves legacy color behavior for the custom shaders.
- **Custom GLSL Shaders** - Elevation coloring, grain, raymarched sun shadows, weather fog, hover effects

## File Structure

```
bidnam-website/
├── index.html        # Main page
├── css/
│   └── style.css     # All styles
├── js/
│   └── main.js       # Three.js terrain code
├── assets/           # Images, fonts (if needed)
├── CLAUDE.md         # This file
└── README.md
```

## Key Features

- **4 interactive peaks**: About, Work, Explorations, Contact
- **Drag to rotate** terrain (with release inertia); **arrow keys** cycle peaks; idle **observer drift** (swelling rotation + camera dolly breath), not a constant turntable
- **Hover/click peaks** to navigate (fully wired); hover fires a ripple + a light-catch sweep in sun color
- **The sun follows visitor local time** (clamped to a dawn–dusk band; capped below ~47° so relief never flattens). Low sun goes warm gold with alpenglow on high ground. Dev override: `?sun=14.5` (hours). Sun is world-fixed: dragging rotates terrain (and its shadows) under it.
- **Raymarched soft self-shadows** against the analytic heightfield (12 steps desktop / 6 touch, dithered start). The GLSL `terrainH()` mirrors JS `dynamicHeight()` — change both together.
- **Living terrain**: main peaks breathe, 4 ambient "competitor peaks" rise and fall on independent phases
- **Weather fog**: fBM-shaped valley mist with wind drift and minutes-scale weather states; inherits sun warmth; tuned via `uFog`/`uFogHeight`/`uFogDensity` uniforms
- **Mesh**: 96-segment plane (48 on touch devices), jitter scaled to density; slope-based rock tint on steep faces; flat shading via screen-space-derivative face normals (no vertex normals used)
- **Landform is a RANGE SYSTEM, not placed cones**: uplift masses around each anchor scale ridged/folded noise (creases = colliding slopes/arêtes); summits are elongated crest segments on per-peak azimuths; connecting ridgelines join the masses. JS `dynamicHeight()` and GLSL `terrainH()` implement it in lockstep — change both together. Dev overrides: `?sun=14.5` (hours), `?rot=0.85` (radians).
- **Reduced motion respected**: time freezes at a good pose, no auto-rotate/dolly; interaction still works

## Edit Mode (dev-only tweaks panel)

The homepage includes a fog-tuning panel hidden behind a postMessage protocol:

- Page posts `{ type: '__edit_mode_available' }` to its parent on load.
- Parent sends `{ type: '__activate_edit_mode' }` → panel becomes visible.
- Parent sends `{ type: '__deactivate_edit_mode' }` → panel hides.
- On slider change, page posts `{ type: '__edit_mode_set_keys', edits: {...} }` so the parent can persist values.

Defaults live in `index.html` inside a block delimited by `/*EDITMODE-BEGIN*/` and `/*EDITMODE-END*/` — any editor/agent can locate and rewrite just that block.

Because the panel is gated on a parent postMessage, public visitors never see it. Only meaningful when the page is embedded in an editor iframe.

## Content Resources

Career content lives in a separate repository. Reference these files when building out pages:

### Career Strategy Documentation
- `/Users/bidnamlee/career-strategy/career-work-experience-analysis.md` - Comprehensive strategic analysis, positioning frameworks
- `/Users/bidnamlee/career-strategy/career-snapshot.md` - Professional profile overview
- `/Users/bidnamlee/career-strategy/voice-and-tone-guide.md` - Writing voice guidelines (for narrative content, not resumes)

### Work Experience Details
- `/Users/bidnamlee/career-strategy/work-experience/` - 22 markdown files documenting specific consulting engagements across COLLINS, Ogilvy Consulting, R/GA

## Design Tokens

```css
--bg-primary: #F8F6F1;      /* Warm cream background */
--accent: #4A5D4A;          /* Green accent */
--accent-warm: #B8956B;     /* Terracotta for hover */
--text-primary: #1A1A1A;
--text-secondary: #4A4A4A;
--text-muted: #7A7A7A;
```

## Terrain Color Palette

- **Peaks (high)**: Deep dark green `#1A4D2E`
- **Mid-high**: Forest green `#3D7A3D`
- **Mid**: Medium green `#5A9E5A`
- **Valleys (low)**: Pale sage `#8FBC8F`

## Development

A local HTTP server is REQUIRED (ES modules don't load over `file://`):
```bash
python3 -m http.server 8000
# or
npx serve
```
No build step. Non-JS pages still open directly, but anything using the terrain (homepage, inner-page mini terrain) needs the server.

## Deployment

Static files - deploy anywhere:
- GitHub Pages
- Netlify (drag & drop)
- Vercel
- Any static host
