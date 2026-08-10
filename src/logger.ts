// Logger utility: adds ISO timestamps to all console output
const orig = {
  log: console.log,
  error: console.error,
  warn: console.warn,
};

function ts(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 23);
}

console.log = (...args: any[]) => orig.log(`[${ts()}]`, ...args);
console.error = (...args: any[]) => orig.error(`[${ts()}]`, ...args);
console.warn = (...args: any[]) => orig.warn(`[${ts()}]`, ...args);
