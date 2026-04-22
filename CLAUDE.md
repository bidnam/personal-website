# CLAUDE.md - Bidnam Lee Portfolio Website

## Project Overview

Personal portfolio website featuring an interactive 3D terrain navigation. Built with Three.js, the terrain uses Roger Martin's "rugged landscapes" strategy metaphor as a literal navigation interface.

## Tech Stack

- **HTML/CSS/JS** - Static site, no build tools
- **Three.js** (CDN) - 3D terrain rendering
- **Custom GLSL Shaders** - Elevation-based coloring, grain texture, hover effects

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
- **Drag to rotate** terrain; **arrow keys** cycle peaks; **auto-rotate** when idle
- **Hover/click peaks** to navigate (fully wired)
- **Living terrain**: main peaks breathe, 4 ambient "competitor peaks" rise and fall on independent phases, overhead light slowly arcs
- **Hover ripples**: hovering a new peak emits a radial pulse that decays over ~1.3s
- **Valley fog**: elevation-based shader fog with time-based drift; tuned via `uFog`/`uFogHeight`/`uFogDensity` uniforms
- **Mesh**: 32-segment plane with reduced jitter (0.08) for smooth dynamic motion — no longer pure low-poly, but still faceted

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

Just open `index.html` in a browser. No build step required.

For local server (optional, for testing):
```bash
python3 -m http.server 8000
# or
npx serve
```

## Deployment

Static files - deploy anywhere:
- GitHub Pages
- Netlify (drag & drop)
- Vercel
- Any static host
