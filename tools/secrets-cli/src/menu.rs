//! The interactive menu. It draws with the terminal's own 16 colors, so it follows the user's theme, and leaves
//! the full-screen view while a script runs, so the script's output and prompts stay in the normal scrollback.

use std::io;
use std::process::Command;

use ratatui::crossterm::event::{self, Event, KeyCode, KeyEventKind};
use ratatui::layout::{Constraint, Layout};
use ratatui::style::{Color, Modifier, Style, Stylize};
use ratatui::text::{Line, Span};
use ratatui::widgets::Paragraph;
use ratatui::{DefaultTerminal, Frame};


const BANNER: [&str; 6] = [
    "███████╗██╗     ",
    "██╔════╝██║     ",
    "███████╗██║     ",
    "╚════██║██║     ",
    "███████║███████╗",
    "╚══════╝╚══════╝",
];
const ENVIRONMENTS: [&str; 2] = ["staging", "production"];
const ACTIONS: [(&str, &str); 7] = [
    ("Pull", "Download and decrypt every environment you can read"),
    ("Push", "Encrypt env/ and upload it to R2"),
    ("History", "Recent versions and which keys changed"),
    ("Apply", "Copy env files between staging and this machine"),
    ("Members", "Who can decrypt this environment"),
    ("Config", "R2 bucket, endpoint and token of this environment"),
    ("Migrate", "Move this environment to a new R2 bucket, or empty the old one"),
];
const CONFIG_FIELDS: [(&str, &str, &str); 4] = [
    ("Bucket", "--url", "s3://bucket-name"),
    ("Endpoint", "--endpoint", "https://<account id>.r2.cloudflarestorage.com"),
    ("Access key ID", "--key-id", "from the R2 API token"),
    ("Secret access key", "--secret", "from the R2 API token"),
];
const MIGRATE: [(&str, &str); 2] = [
    ("Copy to a new bucket", "Upload every version there and switch this environment to it"),
    ("Empty the old bucket", "Delete everything in the bucket used before the last migrate"),
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
    let mut terminal = ratatui::init();
    let result = menu(&mut terminal);
    ratatui::restore();
    result
}

fn menu(terminal: &mut DefaultTerminal) -> io::Result<()> {
    let mut environment = 0;
    let mut selected = 0;
    loop {
        let status = statuses();
        let Some(action) = pick_action(terminal, &status, &mut environment, &mut selected)? else { return Ok(()) };
        act(terminal, action, ENVIRONMENTS[environment])?;
    }
}

fn pick_action(terminal: &mut DefaultTerminal, status: &[String], environment: &mut usize, selected: &mut usize) -> io::Result<Option<usize>> {
    let choices: Vec<Choice> = ACTIONS.iter().map(|(label, detail)| choice(label, detail, None)).collect();
    loop {
        let footer = "↑↓  |  Enter  |  1-7 Jump  |  E Env  |  Q Quit";
        let header = format!("Environment: {}", ENVIRONMENTS[*environment]);
        terminal.draw(|frame| draw(frame, &header, status, &choices, *selected, footer, true))?;
        let Some(key) = next_key()? else { continue };
        match key {
            KeyCode::Up | KeyCode::Char('k') => *selected = selected.checked_sub(1).unwrap_or(choices.len() - 1),
            KeyCode::Down | KeyCode::Char('j') => *selected = (*selected + 1) % choices.len(),
            KeyCode::Char(digit @ '1'..='7') => {
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

fn act(terminal: &mut DefaultTerminal, action: usize, environment: &str) -> io::Result<()> {
    let env = vec![environment.to_string()];
    match action {
        0 => run_and_show(terminal, "Pull", "pull.sh", &[]),
        1 => {
            if ask(terminal, &format!("Push: encrypt secrets/{environment}/env and upload it to R2?"))? {
                run_and_show(terminal, "Push", "push.sh", &env)?;
            }
            Ok(())
        }
        2 => run_and_show(terminal, "History", "check.sh", &env),
        3 => apply(terminal),
        4 => {
            let text = crate::members(environment).unwrap_or_else(|error| error);
            show(terminal, "Members", &text)
        }
        5 | 6 if !is_admin() => show(terminal, ACTIONS[action].0, "Only keys in secrets/admins.txt can use this; ask the maintainer."),
        5 => config(terminal, environment),
        _ => migrate(terminal, environment),
    }
}

/// Shows the current storage settings, then lets the user change one field at a time.
fn config(terminal: &mut DefaultTerminal, environment: &str) -> io::Result<()> {
    let env = vec![environment.to_string()];
    loop {
        // config.sh prints the remote name, then one "  <field>  <value>" line per field in CONFIG_FIELDS order.
        let (_, current) = capture("config.sh", &env);
        let values: Vec<String> = current.lines().skip(1).map(|line| line.trim().split_once("  ").map_or("", |(_, value)| value.trim()).to_string()).collect();
        let fields: Vec<Choice> = CONFIG_FIELDS
            .iter()
            .zip(values.iter().chain(std::iter::repeat(&String::new())))
            .map(|((label, _, _), value)| choice(label, value, None))
            .collect();
        let header = format!("Config: where {environment} is stored");
        let Some(field) = pick(terminal, &header, &fields, "↑↓  |  Enter Edit  |  Esc Back")? else { return Ok(()) };
        let (label, option, hint) = CONFIG_FIELDS[field];
            let Some(value) = input(terminal, &format!("Config: new {label} for {environment} ({hint})"), option == "--secret")? else { continue };
        if value.is_empty() {
            continue;
        }
        let (_, output) = capture("config.sh", &[environment.to_string(), option.to_string(), value]);
        show(terminal, "Config", &output)?;
    }
}

fn migrate(terminal: &mut DefaultTerminal, environment: &str) -> io::Result<()> {
    let choices: Vec<Choice> = MIGRATE.iter().map(|(label, detail)| choice(label, detail, None)).collect();
    let Some(step) = pick(terminal, &format!("Migrate {environment}"), &choices, "↑↓  |  Enter  |  Esc Back")? else { return Ok(()) };
    if step == 1 {
        let (ok, preview) = capture("clean.sh", &[environment.to_string()]);
        show(terminal, "Migrate: old bucket", &preview)?;
        if !ok || !preview.contains("--apply") {
            return Ok(());
        }
        // Deleting a bucket's contents cannot be undone, so it takes the environment's name typed out, not a key press.
        let typed = input(terminal, &format!("Type {environment} to delete every object in the old bucket"), false)?;
        if typed.as_deref() == Some(environment) {
            return run_and_show(terminal, "Migrate", "clean.sh", &[environment.to_string(), "--apply".into()]);
        }
        return show(terminal, "Migrate", "Nothing deleted.");
    }
    let mut args = vec![environment.to_string()];
    for (label, option, hint) in CONFIG_FIELDS {
        let prompt = format!("Migrate: new {label}, {hint}{}", if option == "--endpoint" { " (empty keeps the current one)" } else { "" });
        let Some(value) = input(terminal, &prompt, option == "--secret")? else { return Ok(()) };
        if !value.is_empty() {
            args.extend([option.to_string(), value]);
        }
    }
    if ask(terminal, &format!("Migrate: copy every version of {environment} to the new bucket and switch to it?"))? {
        run_and_show(terminal, "Migrate", "migrate.sh", &args)?;
    }
    Ok(())
}

/// Whether this machine's key is in secrets/admins.txt, by the same check the scripts run.
fn is_admin() -> bool {
    Command::new("sh").args(["-c", ". scripts/secrets/lib.sh && require_admin 2>/dev/null"]).status().is_ok_and(|status| status.success())
}

/// One line of text input; a secret shows as dots. Esc cancels, so None means the user backed out.
fn input(terminal: &mut DefaultTerminal, prompt: &str, secret: bool) -> io::Result<Option<String>> {
    let mut value = String::new();
    loop {
        let shown = if secret { "•".repeat(value.chars().count()) } else { value.clone() };
        terminal.draw(|frame| {
            let lines = vec![
                Line::raw(""),
                Line::from(vec![Span::raw("  "), Span::styled(prompt.to_string(), Style::new().add_modifier(Modifier::BOLD))]),
                Line::raw(""),
                Line::from(vec![Span::styled("  ➤ ", Style::new().fg(Color::Cyan)), Span::raw(shown), Span::styled("▏", Style::new().fg(Color::Cyan))]),
            ];
            let [body, foot] = Layout::vertical([Constraint::Min(0), Constraint::Length(2)]).areas(frame.area());
            frame.render_widget(Paragraph::new(lines), body);
            frame.render_widget(Paragraph::new(Line::styled("  Type or paste  |  Enter Done  |  Esc Cancel", Style::new().fg(Color::DarkGray))), foot);
        })?;
        let Some(key) = next_key()? else { continue };
        match key {
            KeyCode::Char(character) => value.push(character),
            KeyCode::Backspace => {
                value.pop();
            }
            KeyCode::Enter => return Ok(Some(value.trim().to_string())),
            KeyCode::Esc => return Ok(None),
            _ => {}
        }
    }
}

fn apply(terminal: &mut DefaultTerminal) -> io::Result<()> {
    let directions: Vec<Choice> = DIRECTIONS.iter().map(|(label, detail)| choice(label, detail, None)).collect();
    let Some(direction) = pick(terminal, "Apply: copy from", &directions, "↑↓  |  Enter  |  Esc Back")? else {
        return Ok(());
    };
    let mut args: Vec<String> = if direction == 0 { vec!["staging".into(), "dev".into()] } else { vec!["dev".into(), "staging".into()] };
    if direction == 0 {
        let mut keys = local_keys();
        if !keys.is_empty() && !tick(terminal, &mut keys)? {
            return Ok(());
        }
        for key in keys.iter().filter(|key| key.ticked == Some(false)) {
            args.extend(["--use-staging".to_string(), key.label.clone()]);
        }
        let backup: Vec<Choice> = BACKUP.iter().map(|(label, detail)| choice(label, detail, None)).collect();
        match pick(terminal, "Apply: replaced files", &backup, "↑↓  |  Enter  |  Esc Back")? {
            None => return Ok(()),
            Some(1) => args.push("--no-backup".into()),
            Some(_) => {}
        }
    }
    let (ok, preview) = capture("apply.sh", &args);
    if !ok || preview.lines().all(|line| line.ends_with("up to date") || line.starts_with("dry run")) {
        return show(terminal, "Apply", &preview);
    }
    show(terminal, "Apply: dry run", &preview)?;
    if !ask(terminal, "Apply: write these files?")? {
        return Ok(());
    }
    args.push("--apply".into());
    let (_, mut output) = capture("apply.sh", &args);
    if direction == 1 {
        output += "\nNow push staging (menu 2) and commit secrets/staging/env.age.dvc.\n";
    }
    show(terminal, "Apply", &output)
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

/// Runs a script with its output captured, since the menu owns the screen, then shows that output.
fn run_and_show(terminal: &mut DefaultTerminal, title: &str, name: &str, args: &[String]) -> io::Result<()> {
    terminal.draw(|frame| frame.render_widget(Paragraph::new(format!("\n  {title}: running scripts/secrets/{name}…")), frame.area()))?;
    let (_, output) = capture(name, args);
    show(terminal, title, &output)
}

/// Runs scripts/secrets/<name> with stderr merged into stdout and stdin closed, so a script never waits on a prompt.
fn capture(name: &str, args: &[String]) -> (bool, String) {
    let result = Command::new("sh")
        .args(["-c", "exec sh \"$0\" \"$@\" 2>&1", &format!("scripts/secrets/{name}")])
        .args(args)
        .stdin(std::process::Stdio::null())
        .output();
    match result {
        Ok(output) => (output.status.success(), String::from_utf8_lossy(&output.stdout).into_owned()),
        Err(error) => (false, format!("cannot run {name}: {error}")),
    }
}

/// A scrollable view of text; any of Enter, Esc or Q goes back.
fn show(terminal: &mut DefaultTerminal, title: &str, text: &str) -> io::Result<()> {
    let lines: Vec<&str> = text.lines().collect();
    let mut top = 0usize;
    loop {
        let mut height = 0;
        terminal.draw(|frame| {
            let [head, body, foot] = Layout::vertical([Constraint::Length(2), Constraint::Min(0), Constraint::Length(2)]).areas(frame.area());
            height = body.height as usize;
            frame.render_widget(Paragraph::new(Line::from(vec![Span::raw("  "), Span::styled(title.to_string(), Style::new().fg(Color::Cyan).bold())])), head);
            let visible: Vec<Line> = lines.iter().skip(top).take(height).map(|line| Line::raw(format!("  {line}"))).collect();
            frame.render_widget(Paragraph::new(visible), body);
            let footer = format!("  ↑↓ PgUp PgDn Scroll  |  Enter Back      {}-{} of {}", top + 1, (top + height).min(lines.len()), lines.len());
            frame.render_widget(Paragraph::new(Line::styled(footer, Style::new().fg(Color::DarkGray))), foot);
        })?;
        let last = lines.len().saturating_sub(height);
        let Some(key) = next_key()? else { continue };
        match key {
            KeyCode::Up | KeyCode::Char('k') => top = top.saturating_sub(1),
            KeyCode::Down | KeyCode::Char('j') => top = (top + 1).min(last),
            KeyCode::PageUp => top = top.saturating_sub(height),
            KeyCode::PageDown | KeyCode::Char(' ') => top = (top + height).min(last),
            KeyCode::Enter | KeyCode::Esc | KeyCode::Char('q') => return Ok(()),
            _ => {}
        }
    }
}

/// A Yes/No question inside the menu; No is selected first so Enter alone never writes.
fn ask(terminal: &mut DefaultTerminal, question: &str) -> io::Result<bool> {
    let choices = [choice("No", "Go back without changing anything", None), choice("Yes", "Go ahead", None)];
    Ok(pick(terminal, question, &choices, "↑↓  |  Enter  |  Esc Back")? == Some(1))
}
