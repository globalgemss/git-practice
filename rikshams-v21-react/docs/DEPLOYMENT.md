# Production Deployment

## 1. GitHub

Commit all files except `.env.local` and `node_modules`.

```bash
git add .
git commit -m "RikshaMS React Supabase final migration"
git push origin <your-branch>
```

## 2. Vercel

Import the GitHub repository and configure:

- Framework: Vite
- Build command: `npm run build`
- Output: `dist`
- Environment variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`

## 3. Supabase Auth

Before public production launch, enable leaked-password protection in Auth password settings.

## 4. Public URLs

After Vercel domain is final, QR links created by the app use `window.location.origin`, so newly generated links automatically use the production domain.