import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** @internal */
export const portless = {
  async alias(name: string, port: number): Promise<void> {
    await execFileAsync("portless", ["alias", name, String(port)]);
  },

  async getUrl(name: string): Promise<string> {
    const { stdout } = await execFileAsync("portless", ["get", name, "--no-worktree"]);
    return stdout.trim();
  },

  async removeAlias(name: string): Promise<void> {
    await execFileAsync("portless", ["alias", "--remove", name]);
  },
};
