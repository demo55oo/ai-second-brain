const { contextBridge, ipcRenderer } = require("electron");

// Minimal, safe bridge used only by the first-run setup screen.
contextBridge.exposeInMainWorld("jarvisSetup", {
  recheckClaude: () => ipcRenderer.invoke("recheck-claude"),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
});
