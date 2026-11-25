export {};

interface DesktopWindowAPI {
  isAppFocused: () => Promise<boolean>;
  onAppFocusChange: (callback: (focused: boolean) => void) => () => void;
}

declare global {
  interface Window {
    desktop?: {
      window: DesktopWindowAPI;
    };
  }
}
