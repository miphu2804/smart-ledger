//! `sl`: one entry point for the scripts in `scripts/secrets/`.
//!
//! With no arguments it opens a menu; with arguments it runs the matching script directly, for example
//! `sl push staging` or `sl apply staging dev --apply`. The scripts keep all the logic; this binary only
//! picks the script, its arguments and asks before anything that writes.

mod menu;

use std::io::{self, BufRead, Write};
use std::process::{Command, ExitCode};

const USAGE: &str = "usage: sl [pull | push <env> | history <env> [count] | apply <from> <to> [options] | members <env>]";

fn main() -> ExitCode {
    let Some(root) = repo_root() else {
        eprintln!("sl: run it inside the smart-ledger repository");
        return ExitCode::FAILURE;
    };
    if std::env::set_current_dir(&root).is_err() {
        eprintln!("sl: cannot enter {root}");
        return ExitCode::FAILURE;
    }
    let args: Vec<String> = std::env::args().skip(1).collect();
    let Some((command, rest)) = args.split_first() else {
        return match menu::run() {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("sl: {error}");
                ExitCode::FAILURE
            }
        };
    };
    let ok = match command.as_str() {
        "pull" => script("pull.sh", rest),
        "push" => script("push.sh", rest),
        "history" => script("check.sh", rest),
        "apply" => script("apply.sh", rest),
        "members" if rest.len() == 1 => members(&rest[0]),
        _ => {
            eprintln!("{USAGE}");
            false
        }
    };
    if ok { ExitCode::SUCCESS } else { ExitCode::FAILURE }
}

fn repo_root() -> Option<String> {
    let output = Command::new("git").args(["rev-parse", "--show-toplevel"]).output().ok()?;
    output.status.success().then(|| String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Runs `scripts/secrets/<name>` with the terminal attached, so its own output and errors show as they are.
pub fn script(name: &str, args: &[String]) -> bool {
    Command::new("sh")
        .arg(format!("scripts/secrets/{name}"))
        .args(args)
        .status()
        .is_ok_and(|status| status.success())
}

/// Prints who can decrypt an environment: one age public key per line of its recipients.txt.
pub fn members(environment: &str) -> bool {
    let Ok(text) = std::fs::read_to_string(format!("secrets/{environment}/recipients.txt")) else {
        eprintln!("sl: secrets/{environment}/recipients.txt not found");
        return false;
    };
    let keys: Vec<&str> = text.lines().filter(|line| line.starts_with("age1") || line.starts_with("ssh-")).collect();
    println!("Keys that can decrypt {environment} ({}):", keys.len());
    for key in keys {
        let shown: String = key.chars().take(24).collect();
        println!("  {shown}…");
    }
    println!("To add one, append their public key to secrets/{environment}/recipients.txt and push {environment}.");
    true
}

/// Asks a yes/no question on the plain terminal; anything but y or yes is no.
pub fn confirm(question: &str) -> bool {
    print!("{question} [y/N] ");
    let _ = io::stdout().flush();
    let mut answer = String::new();
    let _ = io::stdin().lock().read_line(&mut answer);
    matches!(answer.trim().to_lowercase().as_str(), "y" | "yes")
}
