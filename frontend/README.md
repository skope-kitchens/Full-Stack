# Skope Kitchens - Frontend UI

React + Tailwind CSS implementation of the vendor onboarding flow. This build is **UI-only**—all forms, loaders, and result screens are visually faithful but intentionally disconnected from authentication, APIs, or persistence.

## Getting Started

```bash
npm install
npm run dev
```

Runs at `http://localhost:3000`.

## Project Structure

```
src/
├── components/       # Layout + navigation shells
├── pages/            # Screen-level components
├── App.jsx           # Route definitions
├── main.jsx          # Entry file
└── index.css         # Tailwind layers + tokens
```

## What’s Included

- Marketing landing page with feature cards + process steps
- Auth-style screens (Login, Sign Up, Forgot/Reset Password) with inline validation messages
- Eligibility form with responsive two-column layout and rich input controls
- Skeleton “Analyzing” state
- Result view showcasing both success and “needs improvement” states via toggles

All submit buttons display friendly placeholder banners instead of performing network calls. Hook up real APIs later by adding service functions and form handlers.

## Customization Notes

- Tailwind configuration (`tailwind.config.js`) defines the warm food-brand palette and typography scale.
- Component-level utility classes keep spacing and rounded-card treatments consistent.
- Replace placeholder copy in `src/pages/*` to match your brand voice.

