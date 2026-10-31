export type Logger = {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
};

export const consoleLogger = (scope: string): Logger => ({
  info: (m) => console.log(`${new Date().toISOString().slice(11, 23)} INFO  [${scope}] ${m}`),
  warn: (m) => console.warn(`${new Date().toISOString().slice(11, 23)} WARN  [${scope}] ${m}`),
  error: (m) => console.error(`${new Date().toISOString().slice(11, 23)} ERROR [${scope}] ${m}`),
});

export const silentLogger: Logger = { info() {}, warn() {}, error() {} };

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));
