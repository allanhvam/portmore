import { spawn } from "node:child_process";

/** @internal */
export function openInBrowser(url: string): void {
  const openCommand =
    process.platform === "darwin"
      ? { command: "open", args: [url] }
      : process.platform === "win32"
        ? { command: "cmd", args: ["/c", "start", "", url] }
        : { command: "xdg-open", args: [url] };

  const child = spawn(openCommand.command, openCommand.args, {
    detached: true,
    stdio: "ignore",
  });

  child.on("error", () => {
    // Ignore failures to open a browser in demo mode.
  });

  child.unref();
}