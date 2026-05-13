# Team Workflow & Conflict Prevention

Working in a shared repository with multiple developers requires a few "Golden Rules" to prevent code loss and broken deployments.

### 1. The "Golden Rule" of Pushing
**NEVER use `--force` (or force-push)** unless you are 100% sure you are the only one who has made changes. Force-pushing overwrites whatever is on GitHub with your local version, which is how the `railway.json` file was likely lost.

### 2. Daily Routine
Always start your work session by getting the latest changes from your teammate:
```bash
git checkout main
git pull origin main
```
*Do this before you start writing any code.*

### 3. Use Feature Branches (Best Practice)
Instead of both working directly on `main`, use branches. This keeps your work separate until it's ready.

1.  **Create a branch:** `git checkout -b my-new-feature`
2.  **Do your work and commit:** `git commit -m "Add new logic"`
3.  **Push the branch:** `git push origin my-new-feature`
4.  **Merge via Pull Request (PR):** Go to GitHub and merge the branch into `main`. This allows you to see if any files (like `railway.json`) are being accidentally deleted.

### 4. Communication is Key
If you are about to make a major change or a deployment fix (like switching to Railway), send a quick message to your teammate:
> "I just added the Railway config to main, please pull before you push your next changes."

### 5. Protect the Main Branch (GitHub Settings)
You can prevent accidental deletions by "Protecting" the main branch:
1.  Go to your GitHub Repo -> **Settings** -> **Branches**.
2.  Click **"Add branch protection rule"**.
3.  Pattern: `main`.
4.  Check: **"Restrict pushes"** or **"Require a pull request before merging"**. 
*This forces you to use branches and prevents force-pushes that delete files.*
