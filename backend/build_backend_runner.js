const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const PROJECT_ROOT = path.resolve(__dirname, "..");

function getPythonCommand() {
  if (process.env.PYTHON_BIN) {
    return process.env.PYTHON_BIN;
  }

  const venvCandidate = process.platform === "win32"
    ? path.join(PROJECT_ROOT, ".venv", "Scripts", "python.exe")
    : path.join(PROJECT_ROOT, ".venv", "bin", "python");
  if (fs.existsSync(venvCandidate)) {
    return venvCandidate;
  }

  return process.platform === "win32" ? "python" : "python3";
}

const pythonCommand = getPythonCommand();
const result = spawnSync(pythonCommand, [path.join(__dirname, "build_backend.py")], {
  cwd: PROJECT_ROOT,
  stdio: "inherit",
  env: process.env,
});

if (typeof result.status === "number") {
  process.exit(result.status);
}

if (result.error) {
  throw result.error;
}

process.exit(1);
