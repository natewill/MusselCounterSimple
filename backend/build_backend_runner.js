/**
 * Runs backend/build_backend.py from npm scripts.
 * It uses Python from the project .venv if available, otherwise system Python,
 * and forwards success/failure back to npm or CI.
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const PROJECT_ROOT = path.resolve(__dirname, "..");

function select_python_command() {
  // Returns the command string used to run Python
  // (for example: .../.venv/bin/python, python, or python3).
  // Prefer project-local virtualenv when available.
  const venvCandidate = process.platform === "win32"
    ? path.join(PROJECT_ROOT, ".venv", "Scripts", "python.exe")
    : path.join(PROJECT_ROOT, ".venv", "bin", "python");
  if (fs.existsSync(venvCandidate)) {
    return venvCandidate;
  }

  // Fall back to system Python command names by platform.
  return process.platform === "win32" ? "python" : "python3";
}

const pythonCommand = select_python_command();
// Run the Python packager script synchronously so npm exits only after build completes.
const result = spawnSync(pythonCommand, [path.join(__dirname, "build_backend.py")], {
  cwd: PROJECT_ROOT,
  stdio: "inherit",
  env: process.env,
});

// Propagate Python process exit code directly to this Node wrapper.
if (typeof result.status === "number") {
  process.exit(result.status);
}

// If process creation failed, surface the underlying error.
if (result.error) {
  throw result.error;
}

// Fallback non-zero exit if neither status nor error was provided.
process.exit(1);
