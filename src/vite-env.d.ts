/// <reference types="vite/client" />

interface Window {
  idPhotoLab?: {
    onMenuCommand(callback: (command: string) => void): () => void;
  };
}
