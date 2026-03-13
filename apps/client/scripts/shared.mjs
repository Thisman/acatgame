import childProcess from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function applyWindowsViteWorkaround() {
  const originalExec = childProcess.exec;
  const originalExecFile = childProcess.execFile;

  childProcess.exec = ((command, options, callback) => {
    const cb = typeof options === 'function' ? options : callback;

    if (typeof command === 'string' && command.trim().startsWith('net use')) {
      queueMicrotask(() => cb?.(null, '', ''));
      return {
        kill() {},
        on() {
          return this;
        },
        once() {
          return this;
        },
      };
    }

    return originalExec(command, options, callback);
  });

  childProcess.execFile = ((file, args, options, callback) => {
    const normalizedArgs = Array.isArray(args) ? args : [];
    const cb =
      typeof args === 'function'
        ? args
        : typeof options === 'function'
          ? options
          : callback;
    const commandLine = [file, ...normalizedArgs].join(' ');

    if (commandLine.includes('net use')) {
      queueMicrotask(() => cb?.(null, '', ''));
      return {
        kill() {},
        on() {
          return this;
        },
        once() {
          return this;
        },
      };
    }

    return originalExecFile(file, args, options, callback);
  });
}

export const clientViteConfig = {
  root: fileURLToPath(new URL('../', import.meta.url)),
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
};
