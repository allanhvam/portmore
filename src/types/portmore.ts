export type PortMoreOptions<T> = {
  name: string;
  title: string;
  icon?: string;
  metrics?: () => Promise<Record<string, unknown>>;
  start: (port: number) => Promise<T>;
  stop: (server: T) => Promise<void>;
};

/** @internal */
export type PortMoreAlias<T = unknown> = PortMoreOptions<T> & {
  port: number;
  server?: T;
  started?: Date;
  status?: "Starting" | "Running" | "Stopping" | "Stopped" | "Error";
};
