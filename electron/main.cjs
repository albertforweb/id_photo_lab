const { app, BrowserWindow, Menu, net, protocol, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const isDev = Boolean(process.env.ELECTRON_START_URL);
const isMac = process.platform === "darwin";
const appProtocol = "id-photo-lab";
const appHost = "app";
const appOrigin = `${appProtocol}://${appHost}`;

protocol.registerSchemesAsPrivileged([
  {
    scheme: appProtocol,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

function getIconPath() {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, "icon.png")
    : path.join(__dirname, "..", "build", "icon.png");

  return fs.existsSync(iconPath) ? iconPath : undefined;
}

function isSafeNavigation(url) {
  if (isDev && url.startsWith(process.env.ELECTRON_START_URL)) {
    return true;
  }

  return !isDev && url.startsWith(`${appOrigin}/`);
}

function safeResolve(rootDir, requestPath) {
  const normalizedRoot = path.resolve(rootDir);
  const resolvedPath = path.resolve(normalizedRoot, requestPath);

  if (resolvedPath !== normalizedRoot && !resolvedPath.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new Error("Request path is outside the allowed asset directory.");
  }

  return resolvedPath;
}

function resolveAppProtocolPath(requestUrl) {
  const parsedUrl = new URL(requestUrl);
  const requestPath = decodeURIComponent(parsedUrl.pathname);

  if (requestPath.startsWith("/background-removal/")) {
    return safeResolve(
      path.join(process.resourcesPath, "background-removal"),
      requestPath.replace("/background-removal/", ""),
    );
  }

  return safeResolve(
    path.join(__dirname, "..", "dist"),
    requestPath === "/" ? "index.html" : requestPath.replace(/^\//, ""),
  );
}

function registerAppProtocol() {
  protocol.handle(appProtocol, (request) => {
    try {
      return net.fetch(pathToFileURL(resolveAppProtocolPath(request.url)).toString());
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}

function sendMenuCommand(command) {
  const targetWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  targetWindow?.webContents.send("menu-command", command);
}

function createApplicationMenu() {
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "Upload Photo...",
          accelerator: "CmdOrCtrl+O",
          click: () => sendMenuCommand("upload-photo"),
        },
        { type: "separator" },
        {
          label: "Download Current Photo",
          accelerator: "CmdOrCtrl+S",
          click: () => sendMenuCommand("download-photo"),
        },
        {
          label: "Download Transparent PNG",
          accelerator: "Shift+CmdOrCtrl+S",
          click: () => sendMenuCommand("download-transparent"),
        },
        {
          label: "Download 4x6 Sheet",
          accelerator: "Alt+CmdOrCtrl+S",
          click: () => sendMenuCommand("download-sheet"),
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        {
          label: "Reset Edits",
          accelerator: "CmdOrCtrl+Alt+R",
          click: () => sendMenuCommand("reset-edits"),
        },
        {
          label: "Remove Background",
          accelerator: "CmdOrCtrl+Shift+B",
          click: () => sendMenuCommand("remove-background"),
        },
      ],
    },
    ...(!isMac
      ? [
          {
            label: "Help",
            submenu: [{ role: "about" }],
          },
        ]
      : []),
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createMainWindow() {
  const iconPath = getIconPath();
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 1000,
    minWidth: 1100,
    minHeight: 760,
    title: "ID Photo Lab",
    backgroundColor: "#f3f5f2",
    icon: iconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isSafeNavigation(url)) {
      return;
    }

    event.preventDefault();
    shell.openExternal(url);
  });

  if (isDev) {
    mainWindow.loadURL(process.env.ELECTRON_START_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadURL(`${appOrigin}/index.html`);
  }
}

app.setName("ID Photo Lab");

app.whenReady().then(() => {
  if (!isDev) {
    registerAppProtocol();
  }

  const iconPath = getIconPath();
  if (iconPath) {
    app.setAboutPanelOptions({
      applicationName: "ID Photo Lab",
      applicationVersion: app.getVersion(),
      credits: "Desktop ID photo editor and country document photo exporter.",
      iconPath,
    });

    if (isMac) {
      app.dock.setIcon(iconPath);
    }
  }

  createApplicationMenu();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
