import { useEffect, useState } from "react";
import "./SetupScreen.css";

const STAGE_CONFIG = {
    checking_wsl: { icon: null, label: "Checking WSL", spin: true },
    installing_wsl: { icon: null, label: "Installing WSL", spin: true },
    wsl_installed: { icon: "ok", label: "WSL Installed", spin: false },
    uac_denied: { icon: "warn", label: "Permission Required", spin: false },
    wsl_error: { icon: "err", label: "WSL Error", spin: false },
    checking_distro: { icon: null, label: "Checking Manim", spin: true },
    installing_distro: { icon: null, label: "Installing Manim", spin: true },
    distro_error: { icon: "err", label: "Install Error", spin: false },
    fatal_uac: { icon: "err", label: "Permission Denied", spin: false },
    ready: { icon: "ok", label: "Ready", spin: false },
};

const STEPS = [
    { key: "wsl", label: "WSL", stages: ["checking_wsl", "installing_wsl", "wsl_installed"] },
    { key: "distro", label: "Manim Environment", stages: ["checking_distro", "installing_distro"] },
    { key: "ready", label: "Ready", stages: ["ready"] },
];

// Explicit linear progress order — error/warning stages don't advance the step tracker
const PROGRESS_ORDER = [
    "checking_wsl",
    "installing_wsl",
    "wsl_installed",
    "checking_distro",
    "installing_distro",
    "ready",
];

function getStepStatus(stepStages, currentStage) {
    const progressStages = stepStages.filter((s) => PROGRESS_ORDER.includes(s));
    const currentIdx = PROGRESS_ORDER.indexOf(currentStage);
    const stepMaxIdx = Math.max(...progressStages.map((s) => PROGRESS_ORDER.indexOf(s)));
    const stepMinIdx = Math.min(...progressStages.map((s) => PROGRESS_ORDER.indexOf(s)));

    if (currentIdx > stepMaxIdx) return "done";
    if (currentIdx >= stepMinIdx) return "active";
    return "pending";
}

export default function SetupScreen({ onReady }) {
    const [stage, setStage] = useState("checking_wsl");
    const [progressStage, setProgressStage] = useState("checking_wsl");
    const [message, setMessage] = useState("Checking your environment...");
    const [attempt, setAttempt] = useState(0);
    const [maxAttempts, setMaxAttempts] = useState(3);
    const [isFatal, setIsFatal] = useState(false);
    const [needsRestart, setNeedsRestart] = useState(false);
    const [logs, setLogs] = useState([]);

    useEffect(() => {
        window.api.onSetupProgress((progress) => {
            setStage(progress.stage);
            if (PROGRESS_ORDER.includes(progress.stage)) {
                setProgressStage(progress.stage);
            }
            setMessage(progress.message);
            setLogs((prev) => [...prev, `[${progress.stage}] ${progress.message}`]);

            if (progress.attempt !== undefined) setAttempt(progress.attempt);
            if (progress.maxAttempts !== undefined) setMaxAttempts(progress.maxAttempts);
            if (progress.fatalUac) setIsFatal(true);
            if (progress.needsRestart) setNeedsRestart(true);

            if (progress.stage === "ready") {
                setTimeout(() => onReady?.(), 1200);
            }
        });
    }, []);

    const cfg = STAGE_CONFIG[stage] ?? STAGE_CONFIG.checking_wsl;

    return (
        <div className="setup-root">
            <div className="setup-card">
                <div className="setup-header">
                    <div className="setup-logo">
                        <span onClick={() => window.api.runSetup()} className="setup-bolt">
                            Setup
                        </span>
                    </div>
                    <h1 className="setup-title">Setting Up Your Environment</h1>
                    <p className="setup-subtitle">This only happens once. Please keep the app open.</p>
                </div>

                <div className="setup-steps">
                    {STEPS.map((step, i) => {
                        const status = getStepStatus(step.stages, progressStage);
                        return (
                            <div key={step.key} className={`setup-step setup-step--${status}`}>
                                <div className="setup-step-indicator">
                                    {status === "done" ? (
                                        <span className="step-check">✓</span>
                                    ) : status === "active" ? (
                                        <span className="step-dot step-dot--pulse" />
                                    ) : (
                                        <span className="step-dot step-dot--idle" />
                                    )}
                                </div>
                                <span className="setup-step-label">{step.label}</span>
                                {i < STEPS.length - 1 && <div className="setup-step-line" />}
                            </div>
                        );
                    })}
                </div>

                <div className={`setup-status-box ${isFatal || needsRestart ? "setup-status-box--alert" : ""}`}>
                    <div className="setup-status-icon">
                        {cfg.spin ? (
                            <span className="setup-spinner" />
                        ) : (
                            <span className={`setup-status-badge setup-status-badge--${cfg.icon}`}>
                                {cfg.icon === "ok" ? "OK" : cfg.icon === "warn" ? "!" : "X"}
                            </span>
                        )}
                    </div>
                    <div className="setup-status-text">
                        <div className="setup-status-label">{cfg.label}</div>
                        <div className="setup-status-message">{message}</div>
                    </div>
                </div>

                {stage === "uac_denied" && attempt > 0 && (
                    <div className="setup-uac-bar">
                        {Array.from({ length: maxAttempts }).map((_, i) => (
                            <div
                                key={i}
                                className={`setup-uac-pip ${i < attempt ? "setup-uac-pip--used" : ""}`}
                            />
                        ))}
                        <span className="setup-uac-hint">
                            {maxAttempts - attempt} attempt{maxAttempts - attempt !== 1 ? "s" : ""} remaining
                            — click <strong>Yes</strong> when Windows asks for permission
                        </span>
                    </div>
                )}

                {isFatal && (
                    <div className="setup-fatal">
                        <p>Administrator permission was denied {attempt} times.</p>
                        <p>WSL is required for Manim to run animations.</p>
                        <p>
                            <strong>Please restart the app and click "Yes"</strong> when Windows asks for
                            administrator permission.
                        </p>
                    </div>
                )}

                {needsRestart && (
                    <div className="setup-restart-banner">
                        <div className="setup-restart-icon">[restart]</div>
                        <div>
                            <strong>Restart required</strong>
                            <p>Your computer will restart in ~10 seconds to finish WSL setup.</p>
                            <p>Reopen the app after restarting — Manim will install automatically.</p>
                        </div>
                    </div>
                )}

                <details className="setup-log-details" open>
                    <summary>Setup log</summary>
                    <div className="setup-log">
                        {logs.length === 0 ? (
                            <div className="setup-log-line setup-log-line--empty">No log entries yet.</div>
                        ) : (
                            logs.map((l, i) => (
                                <div key={i} className="setup-log-line">{l}</div>
                            ))
                        )}
                    </div>
                </details>
            </div>
        </div>
    );
}