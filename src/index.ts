import { findFreePort } from "./find-free-port.js";
import { startDashboard } from "./dashboard.js";
import { portless } from "./portless.js";
import type { PortMoreAlias, PortMoreOptions } from "./types/portmore.js";

export const aliases: Array<PortMoreAlias> = [];

export async function startAlias(alias: PortMoreAlias<unknown>): Promise<void> {
  if (alias.status === "Running" || alias.status === "Starting") {
    return;
  }

  alias.status = "Starting";
  try {
    alias.server = await alias.start(alias.port);
    alias.started = new Date();
    alias.status = "Running";

    await portless.alias(alias.name, alias.port);
  } catch (error) {
    alias.status = "Error";

    // If alias creation fails after the server started, clean up to avoid orphan listeners.
    if (alias.server !== undefined) {
      try {
        await alias.stop(alias.server);
      } catch {
        // Preserve original error path; alias is already marked Error.
      }
      alias.server = undefined;
    }

    throw error;
  }
}

export async function stopAlias(alias: PortMoreAlias<unknown>): Promise<void> {
  if (alias.status === "Stopped" || alias.status === "Stopping") {
    return;
  }

  if (alias.server === undefined) {
    alias.status = "Stopped";
    return;
  }

  alias.status = "Stopping";
  try {
    await alias.stop(alias.server);
    alias.server = undefined;

    await portless.removeAlias(alias.name);
    alias.status = "Stopped";
  } catch (error) {
    alias.status = "Error";
    throw error;
  }
}

export async function toggleAlias(alias: PortMoreAlias<unknown>): Promise<void> {
  if (alias.status === "Running" || alias.status === "Starting") {
    await stopAlias(alias);
    return;
  }

  await startAlias(alias);
}

/* eslint-disable no-redeclare */
export async function portmore<T>(options: PortMoreOptions<T>): Promise<void>;
export async function portmore(aliasName: string): Promise<string | undefined>;
export async function portmore<T>(
  optionsOrAliasName: PortMoreOptions<T> | string,
): Promise<void | string | undefined> {
  if (typeof optionsOrAliasName === "string") {
    const alias = aliases.find((entry) => entry.name === optionsOrAliasName);
    if (!alias) {
      return undefined;
    }

    return portless.getUrl(alias.name).catch(() => `http://localhost:${alias.port}`);
  }

  const options = optionsOrAliasName;
  const port = await findFreePort();

  const alias: PortMoreAlias<T> = Object.assign({}, { port }, options);
  aliases.push(alias as PortMoreAlias<unknown>);

  if (aliases.length === 1) {
    await startDashboard();
  }

  await startAlias(alias as PortMoreAlias<unknown>);
}
