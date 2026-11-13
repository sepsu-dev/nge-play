# Nge-Plays

A clean, fast, and ad-free web player for YouTube Music. Built with Next.js 16, React 19, and Tailwind CSS.

## Features

- **Ad-Free Playback**: Stream audio and videos directly from YouTube with zero interruptions.
- **Unified Music Search**: Search for songs, albums, and artists in real time.
- **Synced Lyrics**: Follow along with timed lyrics when available.
- **Listen Together**: Create or join synchronized rooms to listen with friends via real-time sync.
- **Offline-First Library**: Manage playlists, favorite tracks, and history stored locally in your browser.
- **Modern Minimalist UI**: Fast, responsive layout with native dark and light mode support.

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) 16 (App Router)
- **Library**: [React](https://react.dev/) 19
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) v4
- **Icons**: [Lucide React](https://lucide.dev/)
- **Backend**: Next.js Server Actions & Route Handlers with Server-Sent Events (SSE)

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v20 or higher recommended) or [Bun](https://bun.sh/)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/nge-play.git
   cd nge-play
   ```

2. Install dependencies:
   ```bash
   bun install
   # or
   npm install
   ```

3. Run the development server:
   ```bash
   bun dev
   # or
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
bun run build
bun start
# or
npm run build
npm start
```

## Project Structure

```text
nge-plays/
├── public/                 # Static assets and icons
├── src/
│   ├── actions/            # Server actions (YouTube search, lyrics, albums)
│   ├── app/                # Next.js App Router pages & API routes
│   │   ├── api/room/       # Synchronized room SSE endpoint
│   │   ├── layout.tsx      # Root layout and theme configuration
│   │   └── page.tsx        # Main web player interface
│   ├── components/         # UI and feature components
│   │   ├── layout/         # Header, sidebar, and navigation
│   │   ├── library/        # Playlists, track lists, and dashboard
│   │   ├── player/         # Audio controls and now-playing modal
│   │   ├── room/           # Synchronized listening room modal
│   │   └── ui/             # Reusable primitives (tooltips, covers)
│   ├── hooks/              # Custom hooks for state and player sync
│   └── lib/                # Audio engine, room logic, and helpers
└── package.json            # Scripts and dependencies
```

## License

MIT