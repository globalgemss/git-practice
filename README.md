# RikshaMS

Modern migration of the Transport + Labour Management application.

## Target stack
- React + Vite
- React Router
- Supabase PostgreSQL
- Supabase Auth
- Supabase Realtime
- Supabase Storage
- GitHub
- Vercel

## Current branch
Development is being prepared on `react-migration` so the previous Git history remains safe.

## Run locally
```bash
npm install
cp .env.example .env
npm run dev
```

Add your Supabase project values to `.env`:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

## Production build
```bash
npm run build
```

## Migration policy
The React version must preserve the approved RikshaMS UI, modules, field order, workflows and business logic. The existing legacy `index.html` and `Code.gs` should be audited before any legacy behavior is declared fully migrated.
