const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("idPhotoLab", {
  onMenuCommand(callback) {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on("menu-command", listener);
    return () => ipcRenderer.removeListener("menu-command", listener);
  },
});
