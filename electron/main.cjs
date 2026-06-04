const { app, BrowserWindow, session } = require("electron");
const fs = require("fs");
const path = require("path");

const PORT = 3000;
const APP_URL = `http://127.0.0.1:${PORT}`;

function getAppRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "app")
    : path.join(__dirname, "..");
}

async function waitForServer(maxAttempts = 40) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${APP_URL}/api/health`);
      if (res.ok) return;
    } catch {
      // server still starting
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Không khởi động được máy chủ ứng dụng.");
}

function hasConfiguredApiKey(envPath) {
  if (!fs.existsSync(envPath)) return false;
  const content = fs.readFileSync(envPath, "utf8");
  const match = content.match(/^\s*GEMINI_API_KEY\s*=\s*["']?([^"'\s#]+)/m);
  if (!match) return false;
  const value = match[1].trim();
  return value.length > 0 && value !== "MY_GEMINI_API_KEY";
}

function resolveEnvPath(appRoot) {
  const bundledEnv = path.join(appRoot, ".env");
  if (hasConfiguredApiKey(bundledEnv)) {
    return bundledEnv;
  }

  const userEnv = path.join(app.getPath("userData"), ".env");
  const bundledExample = path.join(appRoot, ".env.example");

  if (!fs.existsSync(userEnv) && fs.existsSync(bundledExample)) {
    fs.mkdirSync(path.dirname(userEnv), { recursive: true });
    fs.copyFileSync(bundledExample, userEnv);
  }

  return userEnv;
}

function ensureUserEnv(appRoot) {
  process.env.USER_ENV_PATH = resolveEnvPath(appRoot);
}

async function startBackend() {
  const appRoot = getAppRoot();
  ensureUserEnv(appRoot);
  process.env.APP_ROOT = appRoot;
  process.env.NODE_ENV = "production";
  process.chdir(appRoot);

  const { startServer } = require(path.join(appRoot, "dist", "server.cjs"));
  await startServer();
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 900,
    minHeight: 640,
    title: "Quét CCCD và Lưu Google Sheets",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL(APP_URL);

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === "media" || permission === "camera") {
      callback(true);
      return;
    }
    callback(false);
  });
}

let backendStarted = false;

app.whenReady().then(async () => {
  if (!backendStarted) {
    backendStarted = true;
    await startBackend();
    await waitForServer();
  }
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
