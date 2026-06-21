const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

const ROOT = app.isPackaged ? __dirname : path.join(__dirname, "..");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "LeafLock Sales",
    icon: path.join(ROOT, "icons", "icon-512.png"),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.loadFile(path.join(ROOT, "index.html"));
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});