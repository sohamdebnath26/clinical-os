# Clinical OS — Medical EMR & Clinic Workspace

Clinical OS is an Electronic Medical Record (EMR) and clinic practice workspace built for physicians and outpatient clinics.

---

## 🚀 Live AI Studio Deployment

The application is already built, active, and deployed on Google Cloud Run:
- **Development App:** [https://ais-dev-sqc5yyppbgycxceo4ydytt-609028959806.asia-southeast1.run.app](https://ais-dev-sqc5yyppbgycxceo4ydytt-609028959806.asia-southeast1.run.app)
- **Shared App:** [https://ais-pre-sqc5yyppbgycxceo4ydytt-609028959806.asia-southeast1.run.app](https://ais-pre-sqc5yyppbgycxceo4ydytt-609028959806.asia-southeast1.run.app)

---

## 📦 How to Push this Code to a GitHub Repository

To push this codebase to your own GitHub account:

### Step 1: Create a New Repository on GitHub
1. Go to [github.com/new](https://github.com/new).
2. Name your repository (e.g. `clinical-os`).
3. Leave it empty (do **not** check "Add a README" or ".gitignore").
4. Click **Create repository**.

### Step 2: Initialize Git & Push
In your terminal (or from the project directory):

```bash
# 1. Initialize git if not already initialized
git init

# 2. Stage all files
git add .

# 3. Create your initial commit
git commit -m "feat: complete Clinical OS medical EMR application"

# 4. Set default branch to main
git branch -M main

# 5. Link your GitHub remote (replace with your repo URL)
git remote add origin https://github.com/<YOUR-USERNAME>/clinical-os.git

# 6. Push to GitHub
git push -u origin main
```

---

## 🌐 How to Deploy Anywhere

Clinical OS is a full-stack Node.js + Vite application powered by an Express backend (`server.ts`) that serves both REST APIs and the compiled frontend SPA.

### Option 1: Render.com (Auto-Deploy Blueprint)
This repository includes a `render.yaml` Blueprint specification with `autoDeploy: true`:
1. Push this repository to GitHub or GitLab.
2. In [Render Dashboard](https://dashboard.render.com), click **New +** > **Blueprint**.
3. Select your repository. Render automatically reads `render.yaml`, configures:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Auto-Deploy:** Enabled (any push to your default branch automatically triggers a redeploy)
4. (Optional) Set `GEMINI_API_KEY` under Environment Variables for AI features.

---

### Option 2: Docker Container (Any VPS / Cloud Run / AWS / DigitalOcean)

```bash
# Build the container
docker build -t clinical-os .

# Run the container
docker run -d -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/uploads:/app/uploads \
  -e GEMINI_API_KEY="YOUR_KEY_HERE" \
  clinical-os
```

---

### Option 3: Standard Node.js Server / Ubuntu VPS

```bash
# Install dependencies
npm install

# Build frontend
npm run build

# Start production server
npm start
```

---

## 🩺 Default Login Credentials
- **Doctor Email:** `demo@clinicalos.med`
- **Password:** `Demo@1234`
*(Or click "Sign in as Dr. Demo (One-Click)" on the login screen, or click "Create Doctor Account" to register yourself)*
