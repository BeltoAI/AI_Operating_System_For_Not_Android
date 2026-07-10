# Repo Setup

Planned GitHub repository:

```text
https://github.com/BeltoAI/AI_Operating_System_For_Not_Android.git
```

Once the remote repo exists, this local folder can be pushed with:

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

Do not push until the GitHub repo has been created or the remote push will fail.

