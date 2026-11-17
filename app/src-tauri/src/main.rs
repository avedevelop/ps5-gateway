// No console window next to the app in release builds on Windows (debug builds keep it for the [ui] log lines).
#![cfg_attr(all(not(debug_assertions), windows), windows_subsystem = "windows")]
// PS5 Gateway desktop app: a thin shell. The interface is HTML (app/ui); this file only gives it a few
// commands: talk to the running gateway, run the project's own scripts, and a few macOS conveniences.
// Local development on macOS first; the Windows branches (clip, start) come later.
use std::io::{BufRead, BufReader, Read, Write};
use std::sync::Mutex;
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::Duration;

fn root() -> PathBuf {
    if let Ok(p) = std::env::var("PS5GW_ROOT") {
        return p.into();
    }
    // A packaged program sits inside the project folder (PS5 Gateway.app/Contents/MacOS/..., or PS5 Gateway.exe next to
    // scripts/): walk up from the program until the folder with scripts/start.sh is found.
    if let Ok(exe) = std::env::current_exe() {
        let mut d = exe.parent().map(|p| p.to_path_buf());
        for _ in 0..6 {
            match d {
                Some(dir) => { if dir.join("scripts").join("start.sh").exists() { return dir; } d = dir.parent().map(|p| p.to_path_buf()); }
                None => break,
            }
        }
    }
    // macOS runs a freshly downloaded app from a hidden temporary copy ("App Translocation"), where the project folder
    // is not next to the program any more: look for it in the usual places instead.
    if let Some(p) = find_project_nearby() { return p; }
    // development: app/src-tauri -> project root
    std::env::current_dir().map(|d| d.join("../..")).unwrap_or_default()
}

fn is_project(d: &std::path::Path) -> bool { d.join("scripts").join("start.sh").exists() && d.join("package.json").exists() }

/// A folder named like "ps5-gateway" (or "ps5-gateway-macos-v1.2.0") in Downloads, on the Desktop, in Documents, in the
/// home folder or in Applications. A configured one (it has a .env) wins, then the most recently changed.
fn find_project_nearby() -> Option<PathBuf> {
    let home = PathBuf::from(std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).ok()?);
    let bases = [home.join("Downloads"), home.join("Desktop"), home.join("Documents"), home.clone(), PathBuf::from("/Applications")];
    let mut found: Vec<(bool, std::time::SystemTime, PathBuf)> = Vec::new();
    for base in bases.iter() {
        let Ok(rd) = std::fs::read_dir(base) else { continue };
        for e in rd.flatten() {
            let p = e.path();
            if !e.file_name().to_string_lossy().to_lowercase().starts_with("ps5-gateway") || !is_project(&p) { continue; }
            let when = std::fs::metadata(p.join("package.json")).and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH);
            found.push((p.join(".env").exists(), when, p));
        }
    }
    found.sort_by(|a, b| (b.0, b.1).cmp(&(a.0, a.1)));
    found.into_iter().next().map(|f| f.2)
}

fn port() -> u16 {
    std::env::var("PS5GW_PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8787)
}

// GUI apps start with a minimal PATH, so add the usual places of Node and Homebrew.
fn path_env() -> String {
    if cfg!(windows) { return std::env::var("PATH").unwrap_or_default(); }
    format!("/opt/homebrew/bin:/usr/local/bin:{}", std::env::var("PATH").unwrap_or_default())
}

/// A command that never flashes a console window on Windows.
fn cmd(program: &str) -> Command {
    let mut c = Command::new(program);
    #[cfg(windows)]
    { use std::os::windows::process::CommandExt; c.creation_flags(0x0800_0000); } // CREATE_NO_WINDOW
    c
}

/// Run a PowerShell script text (Windows). Output is UTF-8.
fn ps(script: &str) -> Result<String, String> {
    let full = format!("[Console]::OutputEncoding=[Text.Encoding]::UTF8; $ProgressPreference='SilentlyContinue'; {script}");
    run("powershell.exe", &["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", &full])
}

/// Run one of the project's scripts: scripts/<name>.ps1 on Windows, scripts/<name>.sh elsewhere.
fn run_script(name: &str, args: &[&str]) -> Result<String, String> {
    if cfg!(windows) {
        let file = format!("scripts\\{name}.ps1");
        let mut a: Vec<&str> = vec!["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", &file];
        a.extend_from_slice(args);
        // The script may start a background program (start.ps1 starts node), and that program inherits our pipes:
        // reading a pipe until it closes would then wait for as long as the gateway runs. So the output goes to a file.
        let out_file = std::env::temp_dir().join(format!("ps5gw-script-{}-{name}.txt", std::process::id()));
        let f = std::fs::File::create(&out_file).map_err(|e| e.to_string())?;
        let f2 = f.try_clone().map_err(|e| e.to_string())?;
        let st = cmd("powershell.exe").args(&a).current_dir(root()).stdin(Stdio::null()).stdout(f).stderr(f2).status()
            .map_err(|e| format!("cannot run powershell: {e}"))?;
        let mut text = std::fs::read(&out_file).map(|b| String::from_utf8_lossy(&b).to_string()).unwrap_or_default();
        let _ = std::fs::remove_file(&out_file);
        if !st.success() { text.push_str(&format!("\n(exit code {})", st.code().unwrap_or(-1))); }
        Ok(text)
    } else {
        let file = format!("scripts/{name}.sh");
        let mut a: Vec<&str> = vec![&file];
        a.extend_from_slice(args);
        run("sh", &a)
    }
}

fn run(program: &str, args: &[&str]) -> Result<String, String> {
    let out = cmd(program)
        .args(args)
        .current_dir(root())
        .env("PATH", path_env())
        .stdin(Stdio::null())
        .output()
        .map_err(|e| format!("cannot run {program}: {e}"))?;
    let mut text = String::from_utf8_lossy(&out.stdout).to_string();
    text.push_str(&String::from_utf8_lossy(&out.stderr));
    Ok(text)
}

/// The gateway's own status (JSON text), read from its dashboard API. Error when it is not running.
// Blocking commands use `command(async)`: they run on a thread pool, not on the window's main thread,
// so the interface keeps responding while a script runs (a plain command would freeze the window).
#[tauri::command(async)]
fn gateway_status() -> Result<String, String> {
    let addr = format!("127.0.0.1:{}", port());
    let mut s = TcpStream::connect_timeout(&addr.parse().map_err(|_| "bad address".to_string())?, Duration::from_millis(800))
        .map_err(|e| e.to_string())?;
    s.set_read_timeout(Some(Duration::from_millis(1500))).ok();
    // HTTP/1.0 so the server answers without chunked framing and closes the connection when done
    write!(s, "GET /api/status HTTP/1.0\r\nHost: 127.0.0.1:{}\r\n\r\n", port()).map_err(|e| e.to_string())?;
    let mut buf = String::new();
    s.read_to_string(&mut buf).map_err(|e| e.to_string())?;
    let body = buf.split("\r\n\r\n").nth(1).ok_or_else(|| "empty answer".to_string())?;
    // keep only the JSON object (also survives chunk-size lines if a server ever sends them)
    match (body.find('{'), body.rfind('}')) {
        (Some(a), Some(z)) if z > a => Ok(body[a..=z].to_string()),
        _ => Err("no JSON in answer".to_string()),
    }
}

/// PC_LAN_IP and PS5_IP from the project's .env, as JSON. {"exists":false} when there is no .env yet.
#[tauri::command]
fn read_env() -> String {
    let text = std::fs::read_to_string(root().join(".env"));
    let (mut pc, mut ps5, mut up, mut awake, mut ttl, mut lvl) = (String::new(), String::new(), String::new(), String::new(), String::new(), String::new());
    let exists = text.is_ok();
    for line in text.unwrap_or_default().lines() {
        if let Some(v) = line.strip_prefix("PC_LAN_IP=") { pc = v.trim().to_string(); }
        if let Some(v) = line.strip_prefix("PS5_IP=") { ps5 = v.trim().to_string(); }
        if let Some(v) = line.strip_prefix("UPSTREAM_DNS=") { up = v.trim().to_string(); }
        if let Some(v) = line.strip_prefix("KEEP_AWAKE=") { awake = v.trim().to_string(); }
        if let Some(v) = line.strip_prefix("DNS_CACHE_TTL=") { ttl = v.trim().to_string(); }
        if let Some(v) = line.strip_prefix("MTX_LOG_LEVEL=") { lvl = v.trim().to_string(); }
    }
    serde_json::json!({ "exists": exists, "pc": pc, "ps5": ps5, "upstream": up, "keepAwake": awake != "0", "cacheTtl": ttl, "logLevel": lvl }).to_string()
}

/// Which streaming programs are installed. macOS only for now.
#[tauri::command]
fn detect_apps() -> String {
    #[cfg(windows)]
    {
        return serde_json::json!({ "obs": win_app_path("obs").is_some(), "streamlabs": win_app_path("streamlabs").is_some() }).to_string();
    }
    #[cfg(not(windows))]
    {
    let home = std::env::var("HOME").unwrap_or_default();
    let has = |p: &str| std::path::Path::new(p).exists();
    let obs = has("/Applications/OBS.app") || has(&format!("{home}/Applications/OBS.app"));
    let sl = has("/Applications/Streamlabs Desktop.app") || has(&format!("{home}/Applications/Streamlabs Desktop.app"));
    serde_json::json!({ "obs": obs, "streamlabs": sl }).to_string()
    }
}

#[tauri::command(async)]
fn gateway_start() -> Result<String, String> { run_script("start", &[]) }

#[tauri::command(async)]
fn gateway_stop() -> Result<String, String> { run_script("stop", &[]) }

#[tauri::command(async)]
fn run_check() -> Result<String, String> { run("node", &["scripts/doctor.mjs"]) }

#[tauri::command(async)]
fn run_setup(ps5_ip: String) -> Result<String, String> {
    if !ps5_ip.chars().all(|c| c.is_ascii_digit() || c == '.') { return Err("bad address".into()); }
    if !is_project(&root()) { return Err("NOFOLDER".into()); }
    *SETUP_PROGRESS.lock().unwrap() = String::new();
    // setup.mjs prints "@@progress {json}" lines while it downloads; the interface reads the latest one with setup_progress()
    let mut child = cmd("node").args(["scripts/setup.mjs", "--yes", &format!("--ps5-ip={ps5_ip}")])
        .current_dir(root()).env("PATH", path_env())
        .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped())
        .spawn().map_err(|e| format!("cannot run node: {e}"))?;
    let err_reader = child.stderr.take().map(|mut e| std::thread::spawn(move || { let mut s = String::new(); let _ = e.read_to_string(&mut s); s }));
    let mut out = String::new();
    if let Some(o) = child.stdout.take() {
        for line in BufReader::new(o).lines().map_while(Result::ok) {
            if let Some(j) = line.strip_prefix("@@progress ") { *SETUP_PROGRESS.lock().unwrap() = j.to_string(); }
            else { out.push_str(&line); out.push('\n'); }
        }
    }
    let _ = child.wait();
    if let Some(h) = err_reader { out.push_str(&h.join().unwrap_or_default()); }
    Ok(out)
}

static SETUP_PROGRESS: Mutex<String> = Mutex::new(String::new());

/// The tray menu entries, kept so the interface can translate them.
struct TrayLabels { open: tauri::menu::MenuItem<tauri::Wry>, quit: tauri::menu::MenuItem<tauri::Wry> }

#[tauri::command]
fn tray_labels(state: tauri::State<TrayLabels>, open: String, quit: String) {
    let _ = state.open.set_text(open);
    let _ = state.quit.set_text(quit);
}

/// The latest progress line of the running setup (JSON text), or an empty string.
#[tauri::command]
fn setup_progress() -> String { SETUP_PROGRESS.lock().map(|s| s.clone()).unwrap_or_default() }

/// Windows: make sure the firewall lets the PS5 reach the gateway. Asks Windows for administrator rights (the
/// "do you want to allow" window) only when the rules are missing or point to another PS5 address.
/// Returns "ok", "already" or "skipped"; an error text "cancelled" when the person declined, otherwise the reason.
#[tauri::command(async)]
fn firewall_setup() -> Result<String, String> {
    if !cfg!(windows) { return Ok("skipped".into()); }
    let r = root();
    let script = r.join("scripts").join("firewall.ps1");
    let rp = script.to_string_lossy().to_string();
    if rp.contains('\'') || rp.contains('"') { return Err("the project folder name has quotes in it".into()); }
    let ps5 = std::fs::read_to_string(r.join(".env")).unwrap_or_default().lines().find_map(|l| l.strip_prefix("PS5_IP=").map(|v| v.trim().to_string())).unwrap_or_default();
    if ps5.is_empty() || !ps5.chars().all(|c| c.is_ascii_digit() || c == '.') { return Err("PS5 address is not set".into()); }
    let check = format!("$r=@(Get-NetFirewallRule -DisplayName 'ps5gw-dns','ps5gw-dnst','ps5gw-rtmp' -ErrorAction SilentlyContinue); if($r.Count -ge 3 -and (($r | Get-NetFirewallAddressFilter).RemoteAddress | Select-Object -Unique) -eq '{ps5}'){{ 'yes' }} else {{ 'no' }}");
    if ps(&check)?.trim().ends_with("yes") { return Ok("already".into()); }
    let elevate = format!("try {{ Start-Process powershell.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','\"{rp}\"','-Ps5Ip','{ps5}' }} catch {{ 'cancelled' }}");
    let out = ps(&elevate)?;
    if out.contains("cancelled") { return Err("cancelled".into()); }
    if ps(&check)?.trim().ends_with("yes") { Ok("ok".into()) } else { Err("the firewall rules were not created".into()) }
}

/// Save the help report as a text file in the Desktop folder (or the home folder) and show it in the file manager. Returns the path.
#[tauri::command]
fn save_report(text: String) -> Result<String, String> {
    let home = std::env::var(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map_err(|_| "no home folder".to_string())?;
    let mut dir = PathBuf::from(&home).join("Desktop");
    if !dir.is_dir() { dir = PathBuf::from(&home); }
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    // civil date from the unix time (UTC), so the name sorts and needs no extra crate
    let (days, rem) = ((secs / 86400) as i64, secs % 86400);
    let z = days + 719468; let era = z.div_euclid(146097); let doe = z.rem_euclid(146097);
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365; let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153; let d = doy - (153 * mp + 2) / 5 + 1; let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
    let path = dir.join(format!("PS5-Gateway-report-{y:04}{m:02}{d:02}-{:02}{:02}{:02}.txt", rem / 3600, rem % 3600 / 60, rem % 60));
    std::fs::write(&path, text).map_err(|e| e.to_string())?;
    if cfg!(windows) { let _ = cmd("explorer.exe").arg(format!("/select,{}", path.display())).spawn(); }
    else { let _ = Command::new("open").arg("-R").arg(&path).spawn(); }
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command(async)]
fn autostart_set(on: bool) -> Result<String, String> {
    if cfg!(windows) {
        return if on { run_script("install-autostart", &[]) } else { ps("Unregister-ScheduledTask -TaskName ps5gw -Confirm:$false -ErrorAction SilentlyContinue; 'removed'") };
    }
    run("sh", &["scripts/install-autostart.sh", if on { "--install" } else { "--remove" }])
}

/// Is the login item (LaunchAgent on macOS, scheduled task "ps5gw" on Windows) installed?
#[tauri::command]
fn autostart_state() -> bool {
    if cfg!(windows) { return cmd("schtasks").args(["/query", "/tn", "ps5gw"]).stdin(Stdio::null()).output().map(|o| o.status.success()).unwrap_or(false); }
    let home = std::env::var("HOME").unwrap_or_default();
    std::path::Path::new(&format!("{home}/Library/LaunchAgents/com.ps5gateway.plist")).exists()
}

/// Development aid: the interface reports its real size here, written to the app's stderr log.
#[tauri::command]
fn ui_metrics(info: String) {
    eprintln!("[ui] {info}");
}

#[tauri::command]
fn copy_text(text: String) -> Result<(), String> {
    if cfg!(windows) {
        let mut child = cmd("powershell.exe").args(["-NoProfile", "-NonInteractive", "-Command", "[Console]::InputEncoding=[Text.Encoding]::UTF8; Set-Clipboard -Value ([Console]::In.ReadToEnd())"]).stdin(Stdio::piped()).spawn().map_err(|e| e.to_string())?;
        child.stdin.take().ok_or("no stdin")?.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
        child.wait().map_err(|e| e.to_string())?;
        return Ok(());
    }
    let mut child = Command::new("pbcopy").stdin(Stdio::piped()).spawn().map_err(|e| e.to_string())?;
    child.stdin.take().ok_or("no stdin")?.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
    child.wait().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://") { return Err("only https links".into()); }
    if cfg!(windows) { cmd("rundll32").args(["url.dll,FileProtocolHandler", &url]).spawn().map_err(|e| e.to_string())?; return Ok(()); }
    Command::new("open").arg(&url).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

fn app_name_ok(name: &str) -> bool {
    let n = name.trim();
    !n.is_empty() && n.chars().count() <= 60 && !n.contains('/') && !n.contains('\\') && !n.starts_with('-') && !n.chars().any(|c| c.is_control())
}

/// Is an application with this name installed (in /Applications, ~/Applications or /System/Applications)?
#[tauri::command]
fn app_exists(name: String) -> bool {
    if !app_name_ok(&name) { return false; }
    if cfg!(windows) { return win_app_path(&name).is_some(); }
    let n = name.trim().trim_end_matches(".app").to_string();
    let home = std::env::var("HOME").unwrap_or_default();
    [format!("/Applications/{n}.app"), format!("{home}/Applications/{n}.app"), format!("/System/Applications/{n}.app"), format!("/Applications/Utilities/{n}.app")]
        .iter().any(|p| std::path::Path::new(p).exists())
}

/// Windows: the program file of a well-known application, by the name the interface uses.
/// Windows: the Steam "common" folders (default library and the extra libraries from libraryfolders.vdf).
fn steam_common_dirs() -> Vec<String> {
    let mut roots: Vec<String> = Vec::new();
    if let Ok(o) = cmd("reg").args(["query", "HKCU\\Software\\Valve\\Steam", "/v", "SteamPath"]).stdin(Stdio::null()).output() {
        let t = String::from_utf8_lossy(&o.stdout).to_string();
        if let Some(l) = t.lines().find(|l| l.contains("SteamPath")) {
            if let Some(i) = l.find("REG_SZ") { roots.push(l[i + 6..].trim().replace('/', "\\")); }
        }
    }
    for pf in [std::env::var("ProgramFiles(x86)").ok(), std::env::var("ProgramFiles").ok()].into_iter().flatten() { roots.push(format!("{pf}\\Steam")); }
    let mut libs: Vec<String> = roots.clone();
    for r in &roots {
        if let Ok(t) = std::fs::read_to_string(format!("{r}\\steamapps\\libraryfolders.vdf")) {
            for l in t.lines() {
                let parts: Vec<&str> = l.split('"').collect();
                if parts.len() >= 4 && parts[1] == "path" { libs.push(parts[3].replace("\\\\", "\\")); }
            }
        }
    }
    libs.sort(); libs.dedup();
    libs.into_iter().map(|l| format!("{l}\\steamapps\\common")).collect()
}

fn win_app_path(name: &str) -> Option<PathBuf> {
    let pf = std::env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".into());
    let pf86 = std::env::var("ProgramFiles(x86)").unwrap_or_else(|_| "C:\\Program Files (x86)".into());
    let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let steam = steam_common_dirs();
    let cands: Vec<String> = match name.trim().trim_end_matches(".app").to_lowercase().as_str() {
        "obs" | "obs studio" => {
            let mut v = vec![format!("{pf}\\obs-studio\\bin\\64bit\\obs64.exe"), format!("{pf86}\\obs-studio\\bin\\64bit\\obs64.exe")];
            for s in &steam { v.push(format!("{s}\\OBS Studio\\bin\\64bit\\obs64.exe")); }
            v
        }
        "streamlabs desktop" | "streamlabs" => vec![format!("{pf}\\Streamlabs Desktop\\Streamlabs Desktop.exe"), format!("{local}\\Programs\\streamlabs-desktop\\Streamlabs Desktop.exe"), format!("{pf}\\Streamlabs OBS\\Streamlabs OBS.exe")],
        _ => vec![],
    };
    if let Some(p) = cands.into_iter().map(PathBuf::from).find(|p| p.exists()) { return Some(p); }
    // any other program: its shortcut in the Start menu (all users, then this user), up to two folders deep
    let want = name.trim().trim_end_matches(".exe").trim_end_matches(".lnk").to_lowercase();
    let starts = [std::env::var("ProgramData").unwrap_or_default(), std::env::var("APPDATA").unwrap_or_default()];
    fn find_lnk(dir: &std::path::Path, want: &str, depth: u8) -> Option<PathBuf> {
        for e in std::fs::read_dir(dir).ok()?.flatten() {
            let p = e.path();
            if p.is_dir() { if depth > 0 { if let Some(f) = find_lnk(&p, want, depth - 1) { return Some(f); } } }
            else if p.extension().map(|x| x.eq_ignore_ascii_case("lnk")).unwrap_or(false) && p.file_stem().map(|s| s.to_string_lossy().to_lowercase() == want).unwrap_or(false) { return Some(p); }
        }
        None
    }
    if want.is_empty() { return None; }
    starts.iter().filter(|s| !s.is_empty()).find_map(|s| find_lnk(&PathBuf::from(s).join("Microsoft\\Windows\\Start Menu\\Programs"), &want, 2))
}

#[tauri::command]
fn open_app(name: String) -> Result<(), String> {
    if !app_name_ok(&name) { return Err("bad name".into()); }
    if cfg!(windows) {
        let p = win_app_path(&name).ok_or("not found")?;
        if p.extension().map(|x| x.eq_ignore_ascii_case("lnk")).unwrap_or(false) { cmd("explorer.exe").arg(&p).spawn().map_err(|e| e.to_string())?; return Ok(()); }
        // OBS must start in its own folder, or it cannot find its data files
        cmd(p.to_str().unwrap_or("")).current_dir(p.parent().unwrap_or(&p)).spawn().map_err(|e| e.to_string())?;
        return Ok(());
    }
    let st = Command::new("open").args(["-a", name.trim()]).status().map_err(|e| e.to_string())?;
    if st.success() { Ok(()) } else { Err("not found".into()) }
}

/// Change one setting in the project's .env (PC_LAN_IP, PS5_IP, UPSTREAM_DNS, KEEP_AWAKE, DNS_CACHE_TTL, MTX_LOG_LEVEL); the value is checked first.
#[tauri::command]
fn write_env(key: String, value: String) -> Result<(), String> {
    let v = value.trim().to_string();
    let ipv4 = |a: &str| a.split('.').count() == 4 && a.split('.').all(|n| !n.is_empty() && n.len() <= 3 && n.chars().all(|c| c.is_ascii_digit()) && n.parse::<u16>().map(|x| x <= 255).unwrap_or(false));
    let ok = match key.as_str() {
        "PC_LAN_IP" => v.is_empty() || ipv4(&v),
        "PS5_IP" => ipv4(&v),
        "UPSTREAM_DNS" => v.is_empty() || { let l: Vec<&str> = v.split(|c: char| c == ' ' || c == ',').filter(|x| !x.is_empty()).collect(); (1..=4).contains(&l.len()) && l.iter().all(|a| ipv4(a)) },
        "KEEP_AWAKE" => v.is_empty() || v == "0" || v == "1",
        "DNS_CACHE_TTL" => v.is_empty() || (v.len() <= 4 && v.chars().all(|c| c.is_ascii_digit()) && v.parse::<u16>().map(|x| x <= 3600).unwrap_or(false)),
        "MTX_LOG_LEVEL" => v.is_empty() || matches!(v.as_str(), "error" | "warn" | "info" | "debug"),
        _ => return Err("unknown key".into()),
    };
    if !ok { return Err("invalid value".into()); }
    let v = v.replace(',', " ").split_whitespace().collect::<Vec<_>>().join(" ");
    let path = root().join(".env");
    let text = std::fs::read_to_string(&path).unwrap_or_default();
    let prefix = format!("{key}=");
    let mut found = false;
    let mut lines: Vec<String> = text.lines().map(|l| if l.starts_with(&prefix) { found = true; format!("{prefix}{v}") } else { l.to_string() }).collect();
    if !found { lines.push(format!("{prefix}{v}")); }
    std::fs::write(&path, lines.join("\n") + "\n").map_err(|e| e.to_string())
}

/// Open the logs folder, the project folder or the settings file in Finder. macOS only for now.
#[tauri::command]
fn open_path(which: String) -> Result<(), String> {
    if cfg!(windows) {
        if which == "env" { cmd("explorer.exe").arg(format!("/select,{}", root().join(".env").display())).spawn().map_err(|e| e.to_string())?; return Ok(()); }
        let dir = match which.as_str() { "logs" => root().join("logs"), "project" => root(), _ => return Err("unknown folder".into()) };
        std::fs::create_dir_all(&dir).ok();
        cmd("explorer.exe").arg(&dir).spawn().map_err(|e| e.to_string())?;
        return Ok(());
    }
    if which == "env" { Command::new("open").arg("-R").arg(root().join(".env")).spawn().map_err(|e| e.to_string())?; return Ok(()); }
    let dir = match which.as_str() { "logs" => root().join("logs"), "project" => root(), _ => return Err("unknown folder".into()) };
    std::fs::create_dir_all(&dir).ok();
    Command::new("open").arg(&dir).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

/// Delete the gateway's *.log files (the folder itself and everything else stays). Returns how many were removed.
#[tauri::command]
fn clear_logs() -> Result<usize, String> {
    let dir = root().join("logs");
    let mut n = 0;
    if let Ok(rd) = std::fs::read_dir(&dir) {
        for e in rd.flatten() {
            let p = e.path();
            if p.extension().map(|x| x == "log").unwrap_or(false) && std::fs::remove_file(&p).is_ok() { n += 1; }
        }
    }
    Ok(n)
}

/// The window starts hidden and is shown once the interface has painted its start screen, so there is no empty window.
#[tauri::command]
fn ui_ready(window: tauri::WebviewWindow) { let _ = window.show(); }

/// Run one small command and return its (shortened) output; never fails, so a missing tool just shows up as text.
fn sh_out(script: &str) -> String {
    let out = Command::new("sh").arg("-c").arg(script).current_dir(root()).env("PATH", path_env()).stdin(Stdio::null()).output();
    match out {
        Ok(o) => {
            let mut t = String::from_utf8_lossy(&o.stdout).to_string();
            let e = String::from_utf8_lossy(&o.stderr);
            if t.trim().is_empty() && !e.trim().is_empty() { t = e.to_string(); }
            let t = t.trim_end().to_string();
            if t.len() > 6000 { format!("{}\n… (shortened)", &t[..t.char_indices().nth(6000).map(|(i, _)| i).unwrap_or(t.len())]) } else { t }
        }
        Err(e) => format!("(cannot run: {e})"),
    }
}

/// Everything that can help to find a problem, section by section, as plain text. Reads only; changes nothing.
/// Sensitive values (stream keys, the user's name in paths, optionally IP addresses) are masked by the interface afterwards.
#[tauri::command(async)]
fn collect_diagnostics() -> String {
    if cfg!(windows) { return collect_diagnostics_windows(); }
    // only a plain IPv4 address from .env may reach a shell command
    let plain = |v: String| if !v.is_empty() && v.chars().all(|c| c.is_ascii_digit() || c == '.') { v } else { String::new() };
    let env_pc = plain(sh_out("grep -E '^PC_LAN_IP=' .env 2>/dev/null | cut -d= -f2"));
    let env_ps5 = plain(sh_out("grep -E '^PS5_IP=' .env 2>/dev/null | cut -d= -f2"));
    let mut sections: Vec<(&str, String)> = Vec::new();
    sections.push(("Computer", sh_out("sw_vers; echo \"arch: $(uname -m)\"; echo \"model: $(sysctl -n hw.model 2>/dev/null)\"; echo \"cpu: $(sysctl -n machdep.cpu.brand_string 2>/dev/null)\"; echo \"memory: $(( $(sysctl -n hw.memsize 2>/dev/null || echo 0) / 1073741824 )) GB\"; uptime; date; echo \"locale: $LANG\"")));
    sections.push(("Power and sleep", sh_out("pmset -g 2>/dev/null | head -25; echo '--- assertions'; pmset -g assertions 2>/dev/null | head -20")));
    sections.push(("Tools", sh_out("for t in node ffmpeg ffprobe brew; do printf '%s: ' $t; command -v $t || echo 'not found'; done; node --version 2>&1; ffmpeg -version 2>&1 | head -1; bin/coredns/coredns -version 2>&1 | head -2; bin/mediamtx/mediamtx --version 2>&1 | head -1; ls -la bin 2>&1 | head -12")));
    sections.push(("Programs", sh_out("for a in '/Applications/OBS.app' '/Applications/Streamlabs Desktop.app' \"$HOME/Applications/OBS.app\"; do if [ -d \"$a\" ]; then printf '%s: ' \"$a\"; /usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' \"$a/Contents/Info.plist\" 2>/dev/null || echo present; else echo \"$a: not installed\"; fi; done; echo '--- OBS scenes'; ls -la \"$HOME/Library/Application Support/obs-studio/basic/scenes\" 2>&1 | head -12")));
    sections.push(("Network interfaces", sh_out("ifconfig | grep -E '^[a-z0-9]+:|inet |status:' | head -60")));
    sections.push(("Default route", sh_out("route -n get default 2>&1 | grep -E 'gateway|interface|destination'; echo '--- networksetup'; networksetup -listallhardwareports 2>/dev/null | grep -E 'Hardware Port|Device' | head -24")));
    sections.push(("DNS of this Mac", sh_out("scutil --dns 2>/dev/null | grep -E 'resolver #|nameserver|domain|search' | head -40")));
    sections.push(("Ports in use (53, 1935, 8787)", sh_out("echo 'TCP 1935 / 8787:'; lsof -nP -iTCP:1935 -iTCP:8787 -sTCP:LISTEN 2>&1 | head -10; echo 'UDP/TCP 53:'; lsof -nP -i:53 2>&1 | head -10")));
    sections.push(("Firewall", sh_out("/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>&1; /usr/libexec/ApplicationFirewall/socketfilterfw --getstealthmode 2>&1; /usr/libexec/ApplicationFirewall/socketfilterfw --listapps 2>&1 | grep -iE -A1 'coredns|mediamtx|node|ffmpeg' | head -20")));
    sections.push(("Reachability", sh_out(&format!("echo 'internet (1.1.1.1):'; ping -c 2 -t 4 1.1.1.1 2>&1 | tail -3; echo 'PS5 ({ps5}):'; ping -c 3 -t 4 {ps5} 2>&1 | tail -3", ps5 = if env_ps5.is_empty() { "127.0.0.1".to_string() } else { env_ps5.clone() }))));
    let pc = if env_pc.is_empty() { plain(sh_out("ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null")) } else { env_pc.clone() };
    sections.push(("DNS test against the gateway", sh_out(&format!("nslookup -timeout=3 ingest.global-contribute.live-video.net {pc} 2>&1 | head -12; echo '--- an ordinary name through the gateway'; nslookup -timeout=3 example.com {pc} 2>&1 | head -10", pc = if pc.is_empty() { "127.0.0.1".to_string() } else { pc.clone() }))));
    sections.push(("Login item and processes", sh_out("ls -la \"$HOME/Library/LaunchAgents/com.ps5gateway.plist\" 2>&1; launchctl list 2>/dev/null | grep -i ps5gateway; echo '--- processes'; ps -axo pid,etime,pcpu,pmem,command | grep -iE 'coredns|mediamtx|ffmpeg|orchestrator|caffeinate' | grep -v grep | head -12")));
    sections.push(("Settings file (.env, names only for secrets)", sh_out("if [ -f .env ]; then sed -E 's/^(.*(KEY|TOKEN|SECRET|PASSWORD)[^=]*)=.*/\\1=<hidden>/' .env; else echo '.env not found'; fi; echo '--- config/Corefile'; cat config/Corefile 2>&1 | head -40; echo '--- config/mediamtx.yml (first lines)'; head -25 config/mediamtx.yml 2>&1")));
    sections.push(("Log files", sh_out("ls -la logs 2>&1 | head -20")));
    for (title, file) in [("logs/orch.err.log (last 40)", "orch.err.log"), ("logs/orch.out.log (last 60)", "orch.out.log"), ("logs/dns.log (last 40)", "dns.log"), ("logs/ingest.log (last 40)", "ingest.log"), ("logs/relay.log (last 30)", "relay.log")] {
        let n = if file == "orch.out.log" { 60 } else if file == "relay.log" { 30 } else { 40 };
        sections.push((title, sh_out(&format!("[ -f logs/{file} ] && tail -n {n} logs/{file} || echo '(no such file)'"))));
    }
    sections.into_iter().map(|(t, b)| format!("=== {t} ===\n{}\n", if b.trim().is_empty() { "(empty)".to_string() } else { b })).collect::<Vec<_>>().join("\n")
}

/// One PowerShell snippet, output shortened; never fails (a missing tool shows up as text).
fn ps_out(script: &str) -> String {
    let t = match ps(script) { Ok(t) => t.trim_end().to_string(), Err(e) => format!("(cannot run: {e})") };
    if t.chars().count() > 6000 { format!("{}\n... (shortened)", t.chars().take(6000).collect::<String>()) } else { t }
}

/// Windows twin of collect_diagnostics: same sections, PowerShell instead of sh. Reads only; changes nothing.
fn collect_diagnostics_windows() -> String {
    let plain = |v: String| { let v = v.trim().to_string(); if !v.is_empty() && v.chars().all(|c| c.is_ascii_digit() || c == '.') { v } else { String::new() } };
    let envv = |k: &str| -> String { plain(std::fs::read_to_string(root().join(".env")).unwrap_or_default().lines().find_map(|l| l.strip_prefix(&format!("{k}=")).map(|v| v.to_string())).unwrap_or_default()) };
    let (env_pc, env_ps5) = (envv("PC_LAN_IP"), envv("PS5_IP"));
    let mut s: Vec<(String, String)> = Vec::new();
    s.push(("Computer".into(), ps_out("$o=Get-CimInstance Win32_OperatingSystem; \"$($o.Caption) $($o.Version) build $($o.BuildNumber)\"; \"arch: $($o.OSArchitecture)\"; $c=Get-CimInstance Win32_ComputerSystem; \"model: $($c.Manufacturer) $($c.Model)\"; \"cpu: $((Get-CimInstance Win32_Processor | Select-Object -First 1).Name)\"; \"memory: $([math]::Round($c.TotalPhysicalMemory/1GB)) GB\"; \"boot: $($o.LastBootUpTime)\"; Get-Date; \"locale: $((Get-Culture).Name)\"")));
    s.push(("Power and sleep".into(), ps_out("powercfg /getactivescheme; '--- requests'; powercfg /requests")));
    s.push(("Tools".into(), ps_out("foreach($t in 'node','ffmpeg','ffprobe'){ $c=Get-Command $t -ErrorAction SilentlyContinue; \"${t}: $(if($c){$c.Source}else{'not found'})\" }; node --version; foreach($p in 'bin\\coredns\\coredns.exe','bin\\mediamtx\\mediamtx.exe','bin\\ffmpeg\\ffmpeg.exe'){ \"${p}: $(Test-Path $p)\" }; Get-ChildItem bin -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name")));
    s.push(("Programs".into(), ps_out("foreach($p in \"$env:ProgramFiles\\obs-studio\\bin\\64bit\\obs64.exe\",\"$env:ProgramFiles\\Streamlabs Desktop\\Streamlabs Desktop.exe\",\"$env:LOCALAPPDATA\\Programs\\streamlabs-desktop\\Streamlabs Desktop.exe\"){ if(Test-Path $p){ \"${p}: $((Get-Item $p).VersionInfo.ProductVersion)\" } else { \"${p}: not installed\" } }; '--- OBS scenes'; Get-ChildItem \"$env:APPDATA\\obs-studio\\basic\\scenes\" -ErrorAction SilentlyContinue | Select-Object -First 12 Name,LastWriteTime | Format-Table -AutoSize | Out-String")));
    s.push(("Network interfaces".into(), ps_out("Get-NetIPConfiguration | ForEach-Object { \"$($_.InterfaceAlias): $(($_.IPv4Address.IPAddress) -join ', ') gw=$(($_.IPv4DefaultGateway.NextHop) -join ',') status=$($_.NetAdapter.Status)\" }")));
    s.push(("Default route".into(), ps_out("Get-NetRoute -DestinationPrefix 0.0.0.0/0 | Select-Object InterfaceAlias,NextHop,RouteMetric | Format-Table -AutoSize | Out-String")));
    s.push(("DNS of this computer".into(), ps_out("Get-DnsClientServerAddress -AddressFamily IPv4 | Where-Object { $_.ServerAddresses } | ForEach-Object { \"$($_.InterfaceAlias): $($_.ServerAddresses -join ', ')\" }")));
    s.push(("Ports in use (53, 1935, 8787)".into(), ps_out("'TCP 1935 / 8787:'; Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in 1935,8787 } | ForEach-Object { \"$($_.LocalAddress):$($_.LocalPort) pid $($_.OwningProcess) $((Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName)\" }; 'UDP 53:'; Get-NetUDPEndpoint -LocalPort 53 -ErrorAction SilentlyContinue | ForEach-Object { \"$($_.LocalAddress):53 pid $($_.OwningProcess) $((Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName)\" }")));
    s.push(("Firewall".into(), ps_out("Get-NetFirewallProfile | ForEach-Object { \"$($_.Name): enabled=$($_.Enabled)\" }; '--- rules'; Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match 'ps5|gateway|coredns|mediamtx' } | Select-Object -First 10 DisplayName,Enabled,Direction,Action | Format-Table -AutoSize | Out-String")));
    let ps5 = if env_ps5.is_empty() { "127.0.0.1".to_string() } else { env_ps5.clone() };
    s.push(("Reachability".into(), ps_out(&format!("'internet (1.1.1.1):'; ping -n 2 -w 4000 1.1.1.1 | Select-Object -Last 3; 'PS5 ({ps5}):'; ping -n 3 -w 4000 {ps5} | Select-Object -Last 3"))));
    let pc = if env_pc.is_empty() { plain(ps_out("(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway } | Select-Object -First 1).IPv4Address.IPAddress")) } else { env_pc.clone() };
    let pcq = if pc.is_empty() { "127.0.0.1".to_string() } else { pc.clone() };
    s.push(("DNS test against the gateway".into(), ps_out(&format!("$ErrorActionPreference='SilentlyContinue'; nslookup ingest.global-contribute.live-video.net {pcq} 2>$null | Select-Object -First 12; '--- an ordinary name through the gateway'; nslookup example.com {pcq} 2>$null | Select-Object -First 10"))));
    s.push(("Login item and processes".into(), ps_out("schtasks /query /tn ps5gw 2>&1; '--- processes'; Get-Process coredns,mediamtx,ffmpeg,node -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,CPU,WorkingSet | Format-Table -AutoSize | Out-String")));
    s.push(("Settings file (.env, names only for secrets)".into(), ps_out("if(Test-Path .env){ Get-Content .env | ForEach-Object { $_ -replace '^(.*(KEY|TOKEN|SECRET|PASSWORD)[^=]*)=.*','$1=<hidden>' } } else { '.env not found' }; '--- config/Corefile'; Get-Content config\\Corefile -TotalCount 40 -ErrorAction SilentlyContinue; '--- config/mediamtx.yml (first lines)'; Get-Content config\\mediamtx.yml -TotalCount 25 -ErrorAction SilentlyContinue")));
    s.push(("Log files".into(), ps_out("Get-ChildItem logs -ErrorAction SilentlyContinue | Select-Object -First 20 Name,Length,LastWriteTime | Format-Table -AutoSize | Out-String")));
    for (file, n) in [("orch.err.log", 40), ("orch.out.log", 60), ("dns.log", 40), ("ingest.log", 40), ("relay.log", 30)] {
        s.push((format!("logs/{file} (last {n})"), ps_out(&format!("if(Test-Path logs\\{file}){{ Get-Content logs\\{file} -Tail {n} }} else {{ '(no such file)' }}"))));
    }
    s.into_iter().map(|(t, b)| format!("=== {t} ===\n{}\n", if b.trim().is_empty() { "(empty)".to_string() } else { b })).collect::<Vec<_>>().join("\n")
}

// ---------------------------------------------------------------- updates
// The gateway is published as release archives on GitHub (see .github/workflows/release.yml).
// The app looks at the latest release, and can replace the project's files with the new ones.
// Only these commands talk to the internet here, with the system's `curl`, and they send nothing about the user.
const REPO_API: &str = "https://api.github.com/repos/avedevelop/ps5-gateway/releases/latest";
const REPO_BASE: &str = "https://github.com/avedevelop/ps5-gateway/";

fn update_api() -> String { std::env::var("PS5GW_UPDATE_API").unwrap_or_else(|_| REPO_API.to_string()) }
fn update_base() -> String { std::env::var("PS5GW_UPDATE_BASE").unwrap_or_else(|_| REPO_BASE.to_string()) }

fn project_version() -> String {
    std::fs::read_to_string(root().join("package.json")).ok()
        .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok())
        .and_then(|v| v["version"].as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "0.0.0".to_string())
}

fn parse_ver(v: &str) -> Option<(u32, u32, u32)> {
    let t = v.trim().trim_start_matches('v');
    let core = t.split(|c| c == '-' || c == '+').next()?;
    let mut it = core.split('.').map(|x| x.parse::<u32>());
    Some((it.next()?.ok()?, it.next().unwrap_or(Ok(0)).ok()?, it.next().unwrap_or(Ok(0)).ok()?))
}

/// The version of the installed project (package.json), for the "About" line.
#[tauri::command]
fn app_version() -> String { project_version() }

/// Ask GitHub for the latest release. JSON: {current, latest, newer, notes, url, published, assetUrl, assetName, sumsUrl}.
#[tauri::command(async)]
fn update_check() -> Result<String, String> {
    let out = cmd("curl").args(["-fsSL", "-m", "12", "-H", "Accept: application/vnd.github+json", "-H", "User-Agent: ps5-gateway-app", &update_api()])
        .stdin(Stdio::null()).output().map_err(|e| format!("curl: {e}"))?;
    if !out.status.success() { return Err("no answer from GitHub".into()); }
    let v: serde_json::Value = serde_json::from_slice(&out.stdout).map_err(|_| "bad answer".to_string())?;
    let tag = v["tag_name"].as_str().ok_or("no release")?.to_string();
    let cur = project_version();
    let newer = match (parse_ver(&tag), parse_ver(&cur)) { (Some(a), Some(b)) => a > b, _ => false };
    let mut asset = (String::new(), String::new()); let mut sums = String::new();
    if let Some(list) = v["assets"].as_array() {
        for a in list {
            let name = a["name"].as_str().unwrap_or(""); let url = a["browser_download_url"].as_str().unwrap_or("");
            if name.contains(if cfg!(windows) { "windows" } else { "macos" }) && (name.ends_with(".tar.gz") || name.ends_with(".zip")) { asset = (url.to_string(), name.to_string()); }
            if name == "SHA256SUMS.txt" { sums = url.to_string(); }
        }
    }
    let notes: String = v["body"].as_str().unwrap_or("").chars().take(4000).collect();
    Ok(serde_json::json!({ "current": cur, "latest": tag.trim_start_matches('v'), "newer": newer, "notes": notes, "url": v["html_url"], "published": v["published_at"],
        "assetUrl": asset.0, "assetName": asset.1, "sumsUrl": sums }).to_string())
}

fn url_ok(u: &str) -> bool { u.starts_with(&update_base()) && !u.contains(' ') && !u.contains('\n') && !u.contains('"') }

/// Download the archive and its checksum list, check the checksum, unpack. Returns the folder with the new files.
#[tauri::command(async)]
fn update_download(asset_url: String, asset_name: String, sums_url: String) -> Result<String, String> {
    if !url_ok(&asset_url) || !url_ok(&sums_url) { return Err("the download address is not from the project's repository".into()); }
    if asset_name.contains('/') || asset_name.contains("..") || !(asset_name.ends_with(".tar.gz") || (cfg!(windows) && asset_name.ends_with(".zip"))) || asset_name.contains('\\') { return Err("bad file name".into()); }
    let tmp = std::env::temp_dir().join(format!("ps5gw-update-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&tmp);
    std::fs::create_dir_all(tmp.join("stage")).map_err(|e| e.to_string())?;
    let arch = tmp.join(&asset_name); let sums = tmp.join("SHA256SUMS.txt");
    for (url, dest) in [(&asset_url, &arch), (&sums_url, &sums)] {
        let st = cmd("curl").args(["-fsSL", "-m", "300", "-o"]).arg(dest).arg(url).status().map_err(|e| e.to_string())?;
        if !st.success() { return Err("download failed".into()); }
    }
    // the checksum must match the one published next to the archive
    let sum_text = std::fs::read_to_string(&sums).map_err(|e| e.to_string())?;
    let want = sum_text.lines().filter(|l| l.trim_end().ends_with(&asset_name)).filter_map(|l| l.split_whitespace().next()).next().ok_or("no checksum for this file")?.to_lowercase();
    let got = if cfg!(windows) {
        run("certutil", &["-hashfile", arch.to_str().unwrap_or(""), "SHA256"])?.lines().nth(1).unwrap_or("").replace(' ', "").to_lowercase()
    } else {
        run("shasum", &["-a", "256", arch.to_str().unwrap_or("")])?.split_whitespace().next().unwrap_or("").to_lowercase()
    };
    if want.len() != 64 || want != got { return Err("checksum does not match: the file is damaged or not the published one".into()); }
    // Windows 10/11 ship bsdtar, which also unpacks .zip
    let st = cmd("tar").args(["-xf"]).arg(&arch).arg("-C").arg(tmp.join("stage")).status().map_err(|e| e.to_string())?;
    if !st.success() { return Err("cannot unpack".into()); }
    let dir = std::fs::read_dir(tmp.join("stage")).map_err(|e| e.to_string())?.flatten().map(|e| e.path()).find(|p| p.join("scripts").join("start.sh").exists() && p.join("package.json").exists()).ok_or("the archive is not a PS5 Gateway release")?;
    Ok(dir.to_string_lossy().to_string())
}

/// Copy the new files over the project, keep the user's data, update the components, restart the gateway if it was running.
#[tauri::command(async)]
fn update_install(stage: String) -> Result<String, String> {
    let st = PathBuf::from(&stage);
    if !st.starts_with(std::env::temp_dir()) || !st.join("package.json").exists() { return Err("bad folder".into()); }
    let r = root();
    if !r.join("scripts").join("start.sh").exists() { return Err("not the PS5 Gateway folder".into()); }
    let new_v = std::fs::read_to_string(st.join("package.json")).ok().and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok()).and_then(|v| v["version"].as_str().map(|s| s.to_string())).unwrap_or_default();
    match (parse_ver(&new_v), parse_ver(&project_version())) { (Some(a), Some(b)) if a > b => {}, _ => return Err("the downloaded version is not newer".into()) }
    let was_running = gateway_status().is_ok();
    let src = format!("{}/", st.to_string_lossy());
    let dst = format!("{}/", r.to_string_lossy());
    let mut log = String::new();
    if cfg!(windows) {
        // robocopy exit codes 0..7 mean success (8 and above are errors); the running .exe is skipped if it is locked
        let out = cmd("robocopy").args([st.to_str().unwrap_or(""), r.to_str().unwrap_or(""), "/E", "/R:1", "/W:1", "/NFL", "/NDL", "/NJH", "/NJS", "/NP",
            "/XD", ".git", "spike", "bin", "logs", "target", "/XF", ".env", ".token", "Corefile", "mediamtx.yml", ".DS_Store", "PS5 Gateway.exe", "PS5 Gateway.new.exe"]).stdin(Stdio::null()).output().map_err(|e| e.to_string())?;
        if out.status.code().unwrap_or(16) >= 8 { return Err(format!("copy failed: {}", String::from_utf8_lossy(&out.stdout))); }
        log.push_str(&String::from_utf8_lossy(&out.stdout));
        // the running program cannot be replaced: the new one is put next to it and swapped in by restart_app
        let new_exe = st.join("PS5 Gateway.exe");
        if new_exe.is_file() { std::fs::copy(&new_exe, r.join("PS5 Gateway.new.exe")).map_err(|e| format!("cannot copy the new program: {e}"))?; }
    } else {
    let out = run("rsync", &["-a", "--exclude=/.env", "--exclude=/.token", "--exclude=/bin/", "--exclude=/logs/", "--exclude=/config/Corefile", "--exclude=/config/mediamtx.yml",
        "--exclude=/.git/", "--exclude=/spike/", "--exclude=/app/src-tauri/target/", "--exclude=.DS_Store", &src, &dst])?;
    log.push_str(&out);
    }
    // components may have new versions: setup is safe to run again
    let ps5 = std::fs::read_to_string(r.join(".env")).unwrap_or_default().lines().find_map(|l| l.strip_prefix("PS5_IP=").map(|v| v.trim().to_string())).unwrap_or_default();
    if !ps5.is_empty() && ps5.chars().all(|c| c.is_ascii_digit() || c == '.') { log.push_str(&run("node", &["scripts/setup.mjs", "--yes", &format!("--ps5-ip={ps5}")])?); }
    if was_running { let _ = run_script("stop", &[]); std::thread::sleep(Duration::from_millis(800)); let _ = run_script("start", &[]); }
    if let Some(top) = st.parent() { if top.starts_with(std::env::temp_dir()) && top.file_name().map(|n| n.to_string_lossy().starts_with("ps5gw-update-")).unwrap_or(false) { let _ = std::fs::remove_dir_all(top); } }
    Ok(format!("updated to {new_v}{}", if was_running { ", gateway restarted" } else { "" }))
}

/// Start a fresh copy of this program and quit this one (after an update, so the new interface is loaded).
#[tauri::command]
fn restart_app(app: tauri::AppHandle) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    #[cfg(windows)]
    {
        // an update left "PS5 Gateway.new.exe" next to the program: wait until this one has ended, swap the files, start the new one
        let new_exe = exe.with_file_name("PS5 Gateway.new.exe");
        if new_exe.is_file() {
            let (n, c) = (new_exe.to_string_lossy().to_string(), exe.to_string_lossy().to_string());
            if n.contains('\'') || c.contains('\'') { return Err("the program folder name has quotes in it".into()); }
            let script = format!("Wait-Process -Id {} -ErrorAction SilentlyContinue; for($i=0;$i -lt 20;$i++){{ try {{ Move-Item -Force -LiteralPath '{n}' -Destination '{c}' -ErrorAction Stop; break }} catch {{ Start-Sleep -Milliseconds 300 }} }}; Start-Process -FilePath '{c}'", std::process::id());
            cmd("powershell.exe").args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", &script]).spawn().map_err(|e| e.to_string())?;
            app.exit(0);
            return Ok(());
        }
    }
    Command::new(exe).spawn().map_err(|e| e.to_string())?;
    app.exit(0);
    Ok(())
}

/// Remove what the app set up: the login item, the downloaded components, the settings file, logs, generated configs.
/// Only inside the project folder, and only when it really is this project (scripts/start.sh exists).
#[tauri::command(async)]
fn uninstall() -> Result<String, String> {
    let r = root();
    if !r.join("scripts").join("start.sh").exists() { return Err("not the PS5 Gateway folder".into()); }
    let _ = run_script("stop", &[]);
    if cfg!(windows) { let _ = ps("Unregister-ScheduledTask -TaskName ps5gw -Confirm:$false -ErrorAction SilentlyContinue"); }
    else { let _ = run("sh", &["scripts/install-autostart.sh", "--remove"]); }
    let mut removed = Vec::new();
    for rel in ["bin", "logs"] { let p = r.join(rel); if p.is_dir() && std::fs::remove_dir_all(&p).is_ok() { removed.push(rel.to_string()); } }
    for rel in [".env", ".token", "config/Corefile", "config/mediamtx.yml"] { let p = r.join(rel); if p.is_file() && std::fs::remove_file(&p).is_ok() { removed.push(rel.to_string()); } }
    Ok(removed.join(", "))
}

/// A macOS notification (shown by the system, even when the window is in the background).
#[tauri::command]
fn notify(title: String, body: String) -> Result<(), String> {
    if cfg!(windows) {
        // a balloon from a short-lived tray icon; text is passed through environment variables, never pasted into the script
        let script = "Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $n=New-Object System.Windows.Forms.NotifyIcon; $n.Icon=[System.Drawing.SystemIcons]::Information; $n.Visible=$true; $n.ShowBalloonTip(5000,$env:PS5GW_T,$env:PS5GW_B,'Info'); Start-Sleep 6; $n.Dispose()";
        cmd("powershell.exe").args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script]).env("PS5GW_T", &title).env("PS5GW_B", &body).spawn().map_err(|e| e.to_string())?;
        return Ok(());
    }
    let esc = |t: &str| t.replace('\\', "").replace('"', "'");
    let script = format!("display notification \"{}\" with title \"{}\"", esc(&body), esc(&title));
    Command::new("osascript").args(["-e", &script]).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

/// Open the gateway's own web panel in the default browser.
#[tauri::command]
fn open_panel() -> Result<(), String> {
    if cfg!(windows) { cmd("rundll32").args(["url.dll,FileProtocolHandler", &format!("http://127.0.0.1:{}", port())]).spawn().map_err(|e| e.to_string())?; return Ok(()); }
    Command::new("open").arg(format!("http://127.0.0.1:{}", port())).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

fn main() {
    // PS5GW_SELFTEST=1: run the Rust side without a window and print what the interface would get.
    if std::env::var("PS5GW_SELFTEST").is_ok() {
        match gateway_status() {
            Ok(json) => {
                let v: serde_json::Value = serde_json::from_str(&json).unwrap_or(serde_json::Value::Null);
                println!("status: ok, parsed as JSON: {}, live={}, pcIp={}", !v.is_null(), v["live"], v["net"]["pcIp"]);
            }
            Err(e) => println!("status: ERROR {e}"),
        }
        println!("root: {}", root().display());
        println!("env: {}", read_env());
        println!("apps: {}", detect_apps());
        if std::env::var("PS5GW_SELFTEST_UPDATE").is_ok() {
            println!("version: {}", project_version());
            match update_check() {
                Ok(j) => {
                    println!("check: {j}");
                    let v: serde_json::Value = serde_json::from_str(&j).unwrap_or_default();
                    if v["newer"] == true {
                        match update_download(v["assetUrl"].as_str().unwrap_or("").into(), v["assetName"].as_str().unwrap_or("").into(), v["sumsUrl"].as_str().unwrap_or("").into()) {
                            Ok(dir) => { println!("download ok: {dir}"); println!("install: {:?}", update_install(dir)); }
                            Err(e) => println!("download ERROR {e}"),
                        }
                    }
                }
                Err(e) => println!("check ERROR {e}"),
            }
        }
        if std::env::var("PS5GW_DIAG").is_ok() { println!("{}", collect_diagnostics()); }
        return;
    }
    // Only one copy of the program: a second start brings the first one forward and ends. Right after an update restart the
    // old copy is still closing, so the lock is retried for a few seconds before giving up.
    let lock = {
        let mut got = None;
        for _ in 0..12 {
            match std::net::TcpListener::bind("127.0.0.1:8794") { Ok(l) => { got = Some(l); break; } Err(_) => std::thread::sleep(Duration::from_millis(300)) }
        }
        if got.is_none() {
            if let Ok(mut s) = TcpStream::connect_timeout(&"127.0.0.1:8794".parse().unwrap(), Duration::from_millis(500)) { let _ = s.write_all(b"show"); return; }
        }
        got
    };
    // The interface is served from app/ui in the project folder when it is there, so an update of the project
    // files (and a restart) brings the new interface without building the program again. Without that folder
    // the interface embedded at build time is used.
    let ui_dir = root().join("app").join("ui");
    let from_disk = ui_dir.join("index.html").exists() && std::env::var("PS5GW_EMBEDDED").is_err();
    let serve_dir = ui_dir.clone();
    tauri::Builder::default()
        .register_uri_scheme_protocol("ps5ui", move |_ctx, request| {
            let mut rel = request.uri().path().trim_start_matches('/').to_string();
            if rel.is_empty() { rel = "index.html".into(); }
            let bad = rel.split('/').any(|s| s == ".." || s.is_empty()) || rel.contains('\\');
            let file = serve_dir.join(&rel);
            let ext = file.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
            let mime = match ext.as_str() { "html" => "text/html; charset=utf-8", "css" => "text/css; charset=utf-8", "js" => "text/javascript; charset=utf-8", "woff2" => "font/woff2", "jpg" | "jpeg" => "image/jpeg", "png" => "image/png", "svg" => "image/svg+xml", "txt" => "text/plain; charset=utf-8", _ => "application/octet-stream" };
            match (bad, std::fs::read(&file)) {
                (false, Ok(bytes)) => tauri::http::Response::builder().header("Content-Type", mime).header("Cache-Control", "no-store").body(std::borrow::Cow::Owned(bytes)).unwrap(),
                _ => tauri::http::Response::builder().status(404).body(std::borrow::Cow::Owned(Vec::new())).unwrap(),
            }
        })
        .setup(move |app| {
            use tauri::Manager;
            let mut cfg = app.config().app.windows[0].clone();
            if from_disk { cfg.url = tauri::WebviewUrl::CustomProtocol("ps5ui://localhost/index.html".parse().unwrap()); }
            let w = tauri::WebviewWindowBuilder::from_config(app.handle(), &cfg)?.build()?;
            // Closing the window only hides it: the gateway keeps running and the app stays in the tray / menu bar (D5).
            // It really ends with "Quit" in the tray menu.
            { let w2 = w.clone(); w.on_window_event(move |ev| { if let tauri::WindowEvent::CloseRequested { api, .. } = ev { api.prevent_close(); let _ = w2.hide(); } }); }
            let wshow = w.clone();
            std::thread::spawn(move || { std::thread::sleep(Duration::from_secs(4)); let _ = w.show(); });
            // tray (Windows) / menu bar (macOS)
            {
                use tauri::menu::{Menu, MenuItem};
                use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
                let open = MenuItem::with_id(app, "open", "Открыть", true, None::<&str>)?;
                let quit = MenuItem::with_id(app, "quit", "Выйти", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&open, &quit])?;
                let show = |h: &tauri::AppHandle| { if let Some(win) = h.get_webview_window("main") { let _ = win.show(); let _ = win.unminimize(); let _ = win.set_focus(); } };
                let mut tb = TrayIconBuilder::with_id("main").tooltip("PS5 Gateway").menu(&menu).show_menu_on_left_click(false)
                    .on_menu_event(move |h, ev| match ev.id.as_ref() { "open" => show(h), "quit" => h.exit(0), _ => {} })
                    .on_tray_icon_event(|tray, ev| { if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev {
                        let h = tray.app_handle(); if let Some(win) = h.get_webview_window("main") { let _ = win.show(); let _ = win.unminimize(); let _ = win.set_focus(); } } });
                if let Some(icon) = app.default_window_icon() { tb = tb.icon(icon.clone()); }
                tb.build(app)?;
                app.manage(TrayLabels { open, quit });
            }
            // a second start of the program only brings the first window forward
            if let Some(l) = lock { let h = app.handle().clone(); std::thread::spawn(move || { for s in l.incoming().flatten() { drop(s); if let Some(win) = h.get_webview_window("main") { let _ = win.show(); let _ = win.unminimize(); let _ = win.set_focus(); } } }); }
            let _ = wshow;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            gateway_status, read_env, detect_apps, gateway_start, gateway_stop, run_check, run_setup, setup_progress, firewall_setup, save_report, tray_labels, autostart_set, autostart_state, copy_text, open_url, open_app, ui_metrics, write_env, open_path, open_panel, clear_logs, notify, uninstall, app_exists, collect_diagnostics, ui_ready, app_version, update_check, update_download, update_install, restart_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running the app");
}
