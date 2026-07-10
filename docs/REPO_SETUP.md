# Repo Setup

GitHub repository:

```text
https://github.com/BeltoAI/AI_Operating_System_For_Not_Android.git
```

Clone:

```bash
git clone https://github.com/BeltoAI/AI_Operating_System_For_Not_Android.git
cd AI_Operating_System_For_Not_Android
npm install
npm run dev
```

If you are pushing this existing local folder:

```bash
cd /Users/emilshirokikh/Downloads/BADSCIENTIST
git remote add origin https://github.com/BeltoAI/AI_Operating_System_For_Not_Android.git
git branch -M main
git push -u origin main
```

If `origin` already exists:

```bash
git remote set-url origin https://github.com/BeltoAI/AI_Operating_System_For_Not_Android.git
git push -u origin main
```

Before pushing, run:

```bash
npm run typecheck
npm run build
git status --short --branch
```
