const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const LOG_FILE = path.join(process.env.TEMP || os.tmpdir(), "wsl_install_log.txt");

class SetupService {
  constructor() {
    this.MAX_RETRY = 3;
  }

  _cleanLog() {
    if (fs.existsSync(LOG_FILE)) fs.unlinkSync(LOG_FILE);
  }

  _readLog() {
    if (!fs.existsSync(LOG_FILE)) return "";
    return fs.readFileSync(LOG_FILE, "utf8");
  }

  _wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  _installWSL(onProgress) {
    this._cleanLog();

    const psScript = `
$ErrorActionPreference = 'Stop'
$logFile = "$env:TEMP\\wsl_install_log.txt"

function Log($msg) {
  $time = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  "$time - $msg" | Out-File -FilePath $logFile -Append
}

try {
  Log "START"
  Log "Running WSL install command"
  wsl --install --no-distribution
  Log "WSL installed successfully"
  Start-Sleep -Seconds 3
  Log "Restarting system in 10 seconds"
  shutdown /r /t 10 /c "WSL installation complete. Restarting..."
  Log "DONE"
  exit 0
} catch {
  Log "ERROR: $($_.Exception.Message)"
  exit 1
}
`.trim();

    const encoded = Buffer.from(psScript, "utf16le").toString("base64");
    const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}' -Wait`;

    return new Promise((resolve, reject) => {
      exec(cmd, (err, stdout, stderr) => {
        if (err) {
          return reject({ type: "PROCESS_ERROR", message: err.message, stdout, stderr });
        }

        const content = this._readLog();

        if (!content) {
          return reject({ type: "NO_LOG", message: "No log file was created. UAC may have been denied." });
        }

        if (content.includes("DONE")) {
          return resolve({ success: true, needsRestart: true, log: content });
        }

        const errorLine = content.split("\n").find((l) => l.includes("ERROR:")) || "";
        return reject({
          type: "INCOMPLETE",
          message: errorLine || "WSL install did not complete.",
          log: content,
        });
      });
    });
  }

  async _installWSLWithRetry(onProgress) {
    for (let attempt = 1; attempt <= this.MAX_RETRY; attempt++) {
      const isLastAttempt = attempt === this.MAX_RETRY;
      onProgress({
        stage: "uac_denied",
        message:
          attempt === 1
            ? 'A Windows permission dialog will appear. Please click "Yes" to continue.'
            : `Attempt ${attempt} of ${this.MAX_RETRY}: Please click "Yes" on the permission dialog.`,
        attempt: attempt - 1,
        maxAttempts: this.MAX_RETRY,
      });

      await this._wait(4_000);

      onProgress({
        stage: "installing_wsl",
        message: "Installing WSL — do not close the new window that opens.",
        attempt: attempt - 1,
        maxAttempts: this.MAX_RETRY,
      });

      try {
        const result = await this._installWSL(onProgress);
        return result;
      } catch (err) {
        const isUacDenied = err.type === "NO_LOG" || err.type === "PROCESS_ERROR";

        if (isLastAttempt) {
          onProgress({
            stage: "wsl_error",
            message: isUacDenied
              ? 'Permission was denied 3 times. Please restart the app and click "Yes" when prompted — this is required to install WSL.'
              : "Please do not close the WSL installer window. Restart the app to try again.",
            error: err.message,
            fatalUac: true,
            allAttemptsExhausted: true,
          });
          return null;
        }

        if (isUacDenied) {
          // After a failure, now we show the actual attempt number as used
          onProgress({
            stage: "uac_denied",
            message: `Permission denied (attempt ${attempt}/${this.MAX_RETRY}). Retrying in 4 seconds — please click "Yes" when the dialog appears.`,
            attempt: attempt, // attempt N just failed, show N pips used
            maxAttempts: this.MAX_RETRY,
          });
        } else {
          onProgress({
            stage: "wsl_error",
            message: `WSL installation failed on attempt ${attempt}/${this.MAX_RETRY}: ${err.message}. Retrying in 4 seconds.`,
            error: err.message,
            attempt: attempt,
            maxAttempts: this.MAX_RETRY,
          });
        }

        await this._wait(4_000);
      }
    }
  }

  isWslInstalled() {
    return new Promise((resolve) => {
      exec("wsl --list --quiet", { timeout: 10_000 }, (err) => resolve(!err));
    });
  }

  isManimDistroInstalled() {
    return new Promise((resolve) => {
      exec("wsl --list --quiet", { timeout: 10_000, encoding: "buffer" }, (err, stdout) => {
        if (err) return resolve(false);
        const text = stdout.toString("utf16le");
        const distros = text
          .split(/\r?\n/)
          .map((d) => d.trim().toLowerCase())
          .filter(Boolean);
        resolve(distros.includes("manim-distro"));
      });
    });
  }

  installManimDistro(onProgress) {
    const distroPath = path.join(
      process.env.USERPROFILE,
      "AppData",
      "ubuntu-22.04.tar"
    );

    if (!fs.existsSync(distroPath)) {
      return Promise.resolve({
        success: false,
        error: `Distro file not found at: ${distroPath}`,
      });
    }

    const installDir = path.join(process.env.LOCALAPPDATA, "manim-distro");
    fs.mkdirSync(installDir, { recursive: true });

    onProgress({
      stage: "installing_distro",
      message: "Importing Manim environment into WSL (this may take a few minutes)...",
    });

    return new Promise((resolve) => {
      const cmd = `wsl --import manim-distro "${installDir}" "${distroPath}"`;

      exec(cmd, { timeout: 300_000 }, (err, stdout, stderr) => {
        if (err) {
          resolve({ success: false, error: stderr || err.message });
        } else {
          resolve({ success: true });
        }
      });
    });
  }

  async runSetup(onProgress) {
    onProgress({ stage: "checking_wsl", message: "Checking WSL installation..." });
    const wslInstalled = await this.isWslInstalled();

    if (!wslInstalled) {
      onProgress({ stage: "installing_wsl", message: "WSL not found. Starting installation..." });

      const result = await this._installWSLWithRetry(onProgress);

      if (!result) return;

      if (result.needsRestart) {
        onProgress({
          stage: "wsl_installed",
          message: "WSL installed. Restarting in ~10 seconds.",
          needsRestart: true,
        });
        return;
      }
    }

    onProgress({ stage: "checking_distro", message: "WSL found. Checking for Manim environment..." });
    const distroInstalled = await this.isManimDistroInstalled();

    if (distroInstalled) {
      onProgress({ stage: "ready", message: "Everything is set up. Starting app..." });
      return;
    }

    onProgress({ stage: "installing_distro", message: "Manim environment not found. Installing..." });
    const distroResult = await this.installManimDistro(onProgress);

    if (!distroResult.success) {
      onProgress({
        stage: "distro_error",
        message: `Failed to install Manim environment: ${distroResult.error}`,
        error: distroResult.error,
      });
      return;
    }

    onProgress({ stage: "ready", message: "Manim environment installed. Starting app..." });
  }
}

module.exports = new SetupService();