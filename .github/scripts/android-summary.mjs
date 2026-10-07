// Writes the status report of one Android build as Markdown (run page) and JSON (machines), so a run can be judged
// without opening its logs. Runs with `if: always()`, so it must tolerate steps that never ran.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const env = process.env;
const outDir = env.SUMMARY_DIR;
mkdirSync(outDir, { recursive: true });

const steps = Object.entries(JSON.parse(env.STEPS_JSON)).map(([id, step]) => ({ id, outcome: step.outcome }));
const failed = steps.filter((step) => step.outcome === "failure").map((step) => step.id);
const result = failed.length > 0 ? "failure" : "success";

// TIMINGS holds `name=epochSeconds` marks; a phase lasts from the previous mark to its own.
const marks = existsSync(env.TIMINGS)
  ? readFileSync(env.TIMINGS, "utf8").trim().split("\n").filter(Boolean).map((line) => line.split("="))
  : [];
const phases = marks.slice(1).map(([name, at], i) => ({ name, seconds: Number(at) - Number(marks[i][1]) }));

let artifact = null;
if (env.ARTIFACT_PATH && existsSync(env.ARTIFACT_PATH)) {
  const bytes = readFileSync(env.ARTIFACT_PATH);
  artifact = {
    file: env.ARTIFACT_PATH.split(/[\\/]/).pop(),
    megabytes: Number((statSync(env.ARTIFACT_PATH).size / 1048576).toFixed(1)),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

const version = (command, args) => {
  const run = spawnSync(command, args, { encoding: "utf8" });
  return ((run.stdout || "") + (run.stderr || "")).split("\n")[0].trim() || "not found";
};

const report = {
  result,
  environment: env.ENVIRONMENT,
  ref: env.REF_NAME,
  commit: env.SHA.slice(0, 7),
  actor: env.ACTOR,
  run: env.RUN_URL,
  runner: { choice: env.RUNNER_REASON, os: env.RUNNER_OS, name: env.RUNNER_NAME, kind: env.RUNNER_ENVIRONMENT },
  build: { format: env.FORMAT, abis: env.ABIS, signing: "debug keystore (Expo template default)" },
  toolchain: { node: process.version, java: version("java", ["-version"]), ndk: env.ANDROID_NDK },
  phases,
  steps,
  artifact,
};
writeFileSync(join(outDir, "android-build-summary.json"), JSON.stringify(report, null, 2));

const markdown = [
  `# Android build: ${result}`,
  "",
  "| Item | Value |",
  "|---|---|",
  `| Environment | ${report.environment} |`,
  `| Branch / commit | ${report.ref} / ${report.commit} |`,
  `| Triggered by | ${report.actor} |`,
  `| Run | ${report.run} |`,
  `| Runner | ${report.runner.kind} (${report.runner.name}, ${report.runner.os}): ${report.runner.choice} |`,
  `| Format / ABIs | ${report.build.format} / ${report.build.abis} |`,
  `| Signing | ${report.build.signing} |`,
  `| Node / JDK / NDK | ${report.toolchain.node} / ${report.toolchain.java} / ${report.toolchain.ndk} |`,
  artifact
    ? `| Artifact | ${artifact.file}, ${artifact.megabytes} MB, sha256 ${artifact.sha256} |`
    : "| Artifact | none |",
  "",
  "| Phase | Seconds |",
  "|---|---|",
  ...phases.map((phase) => `| ${phase.name} | ${phase.seconds} |`),
  "",
  "| Step | Outcome |",
  "|---|---|",
  ...steps.map((step) => `| ${step.id} | ${step.outcome} |`),
  "",
].join("\n");
writeFileSync(join(outDir, "android-build-summary.md"), markdown);
if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, markdown);
