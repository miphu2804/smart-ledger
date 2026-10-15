// Checks that a machine has the toolchain pinned in mobile-release.yml. It only verifies and never installs, so every
// build, on a runner or a teammate's laptop, uses the same versions whatever the OS. scripts/android-release.sh runs it
// before every build; EXPECT_* variables override the versions read from the workflow.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The workflow's top-level `env:` block is the single source of the versions.
const workflow = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "workflows", "mobile-release.yml"), "utf8");
const envBlock = workflow.split(/\njobs:/)[0];
const pinned = (key) => new RegExp(`^  ${key}:\\s*"?([^"\\s]+)"?\\s*$`, "m").exec(envBlock)?.[1];
const expect = {
  node: process.env.EXPECT_NODE_MAJOR ?? pinned("NODE_MAJOR"),
  java: process.env.EXPECT_JAVA_MAJOR ?? pinned("JAVA_MAJOR"),
  platform: process.env.EXPECT_PLATFORM ?? pinned("ANDROID_PLATFORM"),
  buildTools: process.env.EXPECT_BUILD_TOOLS ?? pinned("ANDROID_BUILD_TOOLS"),
  ndk: process.env.EXPECT_NDK ?? pinned("ANDROID_NDK"),
};
const errors = Object.entries(expect)
  .filter(([, value]) => !value)
  .map(([name]) => `no pinned ${name} version found in mobile-release.yml`);

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor !== Number(expect.node)) {
  errors.push(`Node ${expect.node} required, found ${process.versions.node}`);
}

// `java -version` prints to stderr, e.g. `openjdk version "17.0.20" ...`. JAVA_HOME wins over PATH, as in Gradle.
const javaBin = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, "bin", "java") : "java";
const java = spawnSync(javaBin, ["-version"], { encoding: "utf8" });
if (java.error) {
  errors.push(`java not found (${javaBin})`);
} else {
  const raw = /version "(\d+)(?:\.(\d+))?/.exec(java.stderr)?.slice(1, 3) ?? [];
  const major = raw[0] === "1" ? raw[1] : raw[0];
  if (major !== expect.java) errors.push(`JDK ${expect.java} required, found ${major ?? "unknown"} (${javaBin})`);
}

const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
if (!sdk) {
  errors.push("ANDROID_HOME (or ANDROID_SDK_ROOT) is not set");
} else {
  const required = [
    join("platforms", `android-${expect.platform}`),
    join("build-tools", expect.buildTools),
    join("ndk", expect.ndk),
  ];
  for (const dir of required) {
    if (!existsSync(join(sdk, dir))) errors.push(`missing ${dir} in ${sdk} (install it with the SDK Manager)`);
  }
}

if (errors.length > 0) {
  const prefix = process.env.GITHUB_ACTIONS === "true" ? "::error::Preflight: " : "✗ Preflight: ";
  for (const message of errors) console.log(`${prefix}${message}`);
  process.exit(1);
}
console.log(
  `Preflight passed: Node ${expect.node}, JDK ${expect.java}, platform ${expect.platform}, ` +
    `build-tools ${expect.buildTools}, NDK ${expect.ndk} (pinned in mobile-release.yml)`,
);
