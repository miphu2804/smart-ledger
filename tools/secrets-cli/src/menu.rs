//! The interactive menu. It draws with the terminal's own 16 colors, so it follows the user's theme, and leaves
//! the full-screen view while a script runs, so the script's output and prompts stay in the normal scrollback.

use std::io::{self, BufRead};
use std::process::Command;

use ratatui::crossterm::event::{self, Event, KeyCode, KeyEventKind};
use ratatui::layout::{Constraint, Layout};
use ratatui::style::{Color, Modifier, Style, Stylize};
use ratatui::text::{Line, Span};
use ratatui::widgets::Paragraph;
use ratatui::{DefaultTerminal, Frame};

use crate::{confirm, members, script};

const BANNER: [&str; 6] = [
    "███████╗██╗     ",
    "██╔════╝██║     ",
    "███████╗██║     ",
    "╚════██║██║     ",
    "███████║███████╗",
    "╚══════╝╚══════╝",
];
const ENVIRONMENTS: [&str; 2] = ["staging", "production"];
const ACTIONS: [(&str, &str); 5] = [
    ("Pull", "Download and decrypt every environment you can read"),
    ("Push", "Encrypt env/ and upload it to R2"),
    ("History", "Recent versions and which keys changed"),
    ("Apply", "Copy env files between staging and this machine"),
    ("Members", "Who can decrypt this environment"),
];
const DIRECTIONS: [(&str, &str); 2] = [
    ("staging → dev", "Write backend/*/.env from staging with your local keys"),
    ("dev → staging", "Send keys edited in backend/*/.env to secrets/staging/env"),
];
const BACKUP: [(&str, &str); 2] = [("Keep .bak", "Save each replaced file as <file>.bak"), ("No backup", "Replace the files in place")];

/// One row the user can pick, with an optional tick for multi-select lists.
struct Choice {
    label: String,
    detail: String,
    ticked: Option<bool>,
}

pub fn run() -> io::Result<()> {
    let mut environment = 0;
    let mut selected = 0;
    loop {
        let status = statuses();
        let mut terminal = ratatui::init();
        // A fresh terminal assumes a blank screen, but the alternate screen can still hold the last frame.
        terminal.clear()?;
        let picked = pick_action(&mut terminal, &status, &mut environment, &mut selected);
        let Some(action) = picked? else {
            ratatui::restore();
            return Ok(());
        };
        terminal.clear()?;
        let finished = act(&mut terminal, action, ENVIRONMENTS[environment]);
        ratatui::restore();
        if finished? {
            pause();
        }
    }
}

fn pick_action(terminal: &mut DefaultTerminal, status: &[String], environment: &mut usize, selected: &mut usize) -> io::Result<Option<usize>> {
    let choices: Vec<Choice> = ACTIONS.iter().map(|(label, detail)| choice(label, detail, None)).collect();
    loop {
        let footer = "↑↓  |  Enter  |  1-5 Jump  |  E Env  |  Q Quit";
        let header = format!("Environment: {}", ENVIRONMENTS[*environment]);
        terminal.draw(|frame| draw(frame, &header, status, &choices, *selected, footer, true))?;
        let Some(key) = next_key()? else { continue };
        match key {
            KeyCode::Up | KeyCode::Char('k') => *selected = selected.checked_sub(1).unwrap_or(choices.len() - 1),
            KeyCode::Down | KeyCode::Char('j') => *selected = (*selected + 1) % choices.len(),
            KeyCode::Char(digit @ '1'..='5') => {
                *selected = digit as usize - '1' as usize;
                return Ok(Some(*selected));
            }
            KeyCode::Char('e' | 'E') => *environment = (*environment + 1) % ENVIRONMENTS.len(),
            KeyCode::Enter => return Ok(Some(*selected)),
            KeyCode::Char('q' | 'Q') | KeyCode::Esc => return Ok(None),
            _ => {}
        }
    }
}

/// Runs one action. Returns false when the user backed out before anything ran, so there is nothing to read.
fn act(terminal: &mut DefaultTerminal, action: usize, environment: &str) -> io::Result<bool> {
    let env = vec![environment.to_string()];
    match action {
        0 => leave_and(|| script("pull.sh", &[])),
        1 => leave_and(|| confirm(&format!("Encrypt secrets/{environment}/env and upload it to R2?")) && script("push.sh", &env)),
        2 => leave_and(|| script("check.sh", &env)),
        3 => apply(terminal),
        _ => leave_and(|| members(environment)),
    }
}

fn apply(terminal: &mut DefaultTerminal) -> io::Result<bool> {
    let directions: Vec<Choice> = DIRECTIONS.iter().map(|(label, detail)| choice(label, detail, None)).collect();
    let Some(direction) = pick(terminal, "Apply: copy from", &directions, "↑↓  |  Enter  |  Esc Back")? else {
        return Ok(false);
    };
    let mut args: Vec<String> = if direction == 0 { vec!["staging".into(), "dev".into()] } else { vec!["dev".into(), "staging".into()] };
    if direction == 0 {
        let mut keys = local_keys();
        if !keys.is_empty() && !tick(terminal, &mut keys)? {
            return Ok(false);
        }
        for key in keys.iter().filter(|key| key.ticked == Some(false)) {
            args.extend(["--use-staging".to_string(), key.label.clone()]);
        }
        let backup: Vec<Choice> = BACKUP.iter().map(|(label, detail)| choice(label, detail, None)).collect();
        match pick(terminal, "Apply: replaced files", &backup, "↑↓  |  Enter  |  Esc Back")? {
            None => return Ok(false),
            Some(1) => args.push("--no-backup".into()),
            Some(_) => {}
        }
    }
    leave_and(|| {
        if !script("apply.sh", &args) || !confirm("Write these files?") {
            return false;
        }
        args.push("--apply".into());
        let written = script("apply.sh", &args);
        if written && direction == 1 {
            println!("Now push staging (menu 2) and commit secrets/staging/env.age.dvc.");
        }
        written
    })
}

/// Lets the user untick the local keys that should keep their staging value. Returns false on Esc.
fn tick(terminal: &mut DefaultTerminal, keys: &mut [Choice]) -> io::Result<bool> {
    let mut selected = 0;
    loop {
        let footer = "↑↓  |  Space Tick  |  A All  |  Enter Done  |  Esc Back";
        terminal.draw(|frame| draw(frame, "Apply: keep these local values (unticked ones take staging's)", &[], keys, selected, footer, false))?;
        let Some(key) = next_key()? else { continue };
        match key {
            KeyCode::Up | KeyCode::Char('k') => selected = selected.checked_sub(1).unwrap_or(keys.len() - 1),
            KeyCode::Down | KeyCode::Char('j') => selected = (selected + 1) % keys.len(),
            KeyCode::Char(' ') => keys[selected].ticked = keys[selected].ticked.map(|ticked| !ticked),
            KeyCode::Char('a' | 'A') => {
                let all = keys.iter().all(|key| key.ticked == Some(true));
                keys.iter_mut().for_each(|key| key.ticked = Some(!all));
            }
            KeyCode::Enter => return Ok(true),
            KeyCode::Esc | KeyCode::Char('q') => return Ok(false),
            _ => {}
        }
    }
}

fn pick(terminal: &mut DefaultTerminal, header: &str, choices: &[Choice], footer: &str) -> io::Result<Option<usize>> {
    let mut selected = 0;
    loop {
        terminal.draw(|frame| draw(frame, header, &[], choices, selected, footer, false))?;
        let Some(key) = next_key()? else { continue };
        match key {
            KeyCode::Up | KeyCode::Char('k') => selected = selected.checked_sub(1).unwrap_or(choices.len() - 1),
            KeyCode::Down | KeyCode::Char('j') => selected = (selected + 1) % choices.len(),
            KeyCode::Enter => return Ok(Some(selected)),
            KeyCode::Esc | KeyCode::Char('q') => return Ok(None),
            _ => {}
        }
    }
}

fn draw(frame: &mut Frame, header: &str, status: &[String], choices: &[Choice], selected: usize, footer: &str, numbered: bool) {
    let mut lines: Vec<Line> = vec![Line::raw("")];
    for (row, art) in BANNER.iter().enumerate() {
        let side = match row {
            1 => Span::styled("SmartLedger secrets", Style::new().fg(Color::Blue).bold()),
            2 => Span::styled("pull, push, apply and audit env files", Style::new().fg(Color::DarkGray)),
            _ => Span::raw(""),
        };
        lines.push(Line::from(vec![Span::raw("  "), Span::styled(*art, Style::new().fg(Color::Yellow)), Span::raw("  "), side]));
    }
    lines.push(Line::raw(""));
    for text in status {
        lines.push(Line::from(vec![Span::raw("  "), Span::styled(text.clone(), Style::new().fg(Color::DarkGray))]));
    }
    if !status.is_empty() {
        lines.push(Line::raw(""));
    }
    lines.push(Line::from(vec![Span::raw("  "), Span::styled(header.to_string(), Style::new().add_modifier(Modifier::BOLD))]));
    lines.push(Line::raw(""));
    let width = choices.iter().map(|choice| choice.label.chars().count()).max().unwrap_or(0);
    for (index, choice) in choices.iter().enumerate() {
        let current = index == selected;
        let accent = if current { Style::new().fg(Color::Cyan).bold() } else { Style::new() };
        let mut spans = vec![Span::styled(if current { "  ➤ " } else { "    " }, Style::new().fg(Color::Cyan))];
        match choice.ticked {
            // The filled and empty squares of clack-style prompts, which read better than [x] at a glance.
            Some(true) => spans.push(Span::styled("◼ ", Style::new().fg(Color::Green))),
            Some(false) => spans.push(Span::styled("◻ ", Style::new().fg(Color::DarkGray))),
            None if numbered => spans.push(Span::styled(format!("{}. ", index + 1), accent)),
            None => {}
        }
        spans.push(Span::styled(format!("{:<width$}", choice.label), accent));
        spans.push(Span::raw("   "));
        spans.push(Span::styled(choice.detail.clone(), if current { Style::new() } else { Style::new().fg(Color::DarkGray) }));
        lines.push(Line::from(spans));
    }
    let [body, foot] = Layout::vertical([Constraint::Min(0), Constraint::Length(2)]).areas(frame.area());
    frame.render_widget(Paragraph::new(lines), body);
    frame.render_widget(Paragraph::new(Line::styled(format!("  {footer}"), Style::new().fg(Color::DarkGray))), foot);
}

fn choice(label: &str, detail: &str, ticked: Option<bool>) -> Choice {
    Choice { label: label.to_string(), detail: detail.to_string(), ticked }
}

/// Waits for one key press; other events such as a resize return None so the caller redraws.
fn next_key() -> io::Result<Option<KeyCode>> {
    match event::read()? {
        Event::Key(key) if key.kind == KeyEventKind::Press => Ok(Some(key.code)),
        _ => Ok(None),
    }
}

/// The version each environment's pointer names and the state of its env/, using the checks in lib.sh.
fn statuses() -> Vec<String> {
    let check = r#". scripts/secrets/lib.sh
      if [ ! -d "$1/env" ]; then echo "not pulled"
      elif has_unpushed_edits "$1"; then echo "edits not pushed"
      elif matches_pointer "$1"; then echo "in sync"
      else echo "behind the pointer; run Pull"; fi"#;
    ENVIRONMENTS
        .iter()
        .map(|environment| {
            let folder = format!("secrets/{environment}");
            let pointer = std::fs::read_to_string(format!("{folder}/env.age.dvc")).unwrap_or_default();
            let version = pointer.lines().find_map(|line| line.trim().strip_prefix("md5: ")).map_or("none", |md5| &md5[..8.min(md5.len())]).to_string();
            let state = Command::new("sh").args(["-c", check, "sh", &folder]).output();
            let state = state.map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string()).unwrap_or_default();
            format!("{environment:<11} version {version}   env/ {state}")
        })
        .collect()
}

/// The keys of secrets/local.env.*, all ticked, for the staging → dev tick list.
fn local_keys() -> Vec<Choice> {
    let mut keys = Vec::new();
    for name in [".env.core", ".env.ai"] {
        let text = std::fs::read_to_string(format!("secrets/local{name}")).unwrap_or_default();
        for line in text.lines().filter(|line| !line.starts_with('#')) {
            if let Some((key, _)) = line.split_once('=') {
                keys.push(choice(key, &format!("local in {name}"), Some(true)));
            }
        }
    }
    keys
}

/// Leaves the full-screen view, runs the step on the plain terminal and reports that something ran.
fn leave_and(step: impl FnOnce() -> bool) -> io::Result<bool> {
    ratatui::restore();
    step();
    Ok(true)
}

fn pause() {
    println!("\nPress Enter to return to the menu.");
    let _ = io::stdin().lock().read_line(&mut String::new());
}
