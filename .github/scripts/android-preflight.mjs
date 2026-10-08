// Checks that a self-hosted machine has the toolchain pinned in mobile-release.yml. It only verifies and never
// installs, so every teammate's machine builds with the same versions whatever their OS.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const { EXPECT_NODE_MAJOR, EXPECT_JAVA_MAJOR, EXPECT_PLATFORM, EXPECT_BUILD_TOOLS, EXPECT_NDK } = process.env;
const errors = [];

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor !== Number(EXPECT_NODE_MAJOR)) {
  errors.push(`Node ${EXPECT_NODE_MAJOR} required, found ${process.versions.node}`);
}

// `java -version` prints to stderr, e.g. `openjdk version "17.0.20" ...`.
const java = spawnSync("java", ["-version"], { encoding: "utf8" });
if (java.error) {
  errors.push("java not found on PATH");
} else {
  const raw = /version "(\d+)(?:\.(\d+))?/.exec(java.stderr)?.slice(1, 3) ?? [];
  const major = raw[0] === "1" ? raw[1] : raw[0];
  if (major !== EXPECT_JAVA_MAJOR) errors.push(`JDK ${EXPECT_JAVA_MAJOR} required, found ${major ?? "unknown"}`);
}

const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
if (!sdk) {
  errors.push("ANDROID_HOME (or ANDROID_SDK_ROOT) is not set");
} else {
  const required = [
    join("platforms", `android-${EXPECT_PLATFORM}`),
    join("build-tools", EXPECT_BUILD_TOOLS),
    join("ndk", EXPECT_NDK),
  ];
  for (const dir of required) {
    if (!existsSync(join(sdk, dir))) errors.push(`missing ${dir} in ${sdk}`);
  }
}

if (errors.length > 0) {
  for (const message of errors) console.log(`::error::Preflight: ${message}`);
  process.exit(1);
}
console.log("Preflight passed: toolchain matches mobile-release.yml");
