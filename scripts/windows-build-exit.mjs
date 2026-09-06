// Vinext explicitly exits immediately after HTTP prerendering. On Windows,
// Node can race fetch/socket teardown and abort in libuv (nodejs/node#56645).
// Yield briefly before the CLI's exit; preserve its exact success/failure code.
// This preload affects only the build subprocess, never the application.
const exit = process.exit.bind(process);
let exiting = false;
process.exit = (code = process.exitCode ?? 0) => {
  if (exiting) return;
  exiting = true;
  setTimeout(() => exit(code), 250);
};
