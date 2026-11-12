//! HelperValley: copies the Stardew Valley saves into Documents/HelperValley Saves, where the website can
//! read them, and tells the site it's running through a small status file next to the copies.

mod mirror;
mod paths;

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};

/// Full pass even without file events (watching is unreliable on synced folders).
const RESCAN: Duration = Duration::from_secs(30);
/// How often the status file is rewritten; the site takes 35 s of silence as "closed".
const HEARTBEAT: Duration = Duration::from_secs(15);
/// Files the game is still writing get another look this soon.
const RETRY: Duration = Duration::from_millis(1500);
pub const STATUS_FILE: &str = ".helpervalley-app.json";

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Status {
    enabled: bool,
    quit_on_close: bool,
    /// ok | paused | source-missing | error
    state: String,
    message: Option<String>,
    last_copy_at: Option<u64>,
    saves: usize,
    sources: Vec<String>,
    mirror: String,
    version: String,
}

struct Shared {
    status: Mutex<Status>,
    wake: Mutex<Option<Sender<Wake>>>,
}

enum Wake {
    Sync,
    Quit,
}

#[derive(Serialize, Deserialize, Default)]
struct Settings {
    #[serde(default)]
    disabled: bool,
    #[serde(default)]
    quit_on_close: bool,
}

fn load_settings() -> Settings {
    paths::settings_file().and_then(|f| fs::read_to_string(f).ok()).and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
}

fn save_settings(settings: &Settings) {
    if let Some(file) = paths::settings_file() {
        if let Some(dir) = file.parent() {
            let _ = fs::create_dir_all(dir);
        }
        let _ = fs::write(file, serde_json::to_string(settings).unwrap_or_default());
    }
}

/// The status file the site reads, written atomically.
fn write_status_file(mirror: &Path, status: &Status, running: bool) {
    if !mirror.is_dir() {
        return;
    }
    let body = serde_json::json!({
        "v": 1,
        "running": running,
        "enabled": status.enabled,
        "at": now_ms(),
        "lastCopyAt": status.last_copy_at,
        "state": status.state,
        "appVersion": status.version,
    });
    let tmp = mirror.join(".helpervalley-app.json.hv-tmp");
    if fs::write(&tmp, body.to_string()).is_ok() {
        let _ = fs::rename(&tmp, mirror.join(STATUS_FILE));
    }
}

/// The background loop: watch the game folders, copy, and keep the status file fresh.
fn run_worker(app: AppHandle, shared: Arc<Shared>, sources: Vec<PathBuf>, mirror: PathBuf) {
    let (tx, rx) = channel::<Wake>();
    *shared.wake.lock().unwrap() = Some(tx.clone());

    // File events wake the loop; a missing game folder is picked up by the regular rescan.
    let watch_tx = tx.clone();
    let mut debouncer = notify_debouncer_full::new_debouncer(Duration::from_millis(1500), None, move |result: notify_debouncer_full::DebounceEventResult| {
        if result.is_ok() {
            let _ = watch_tx.send(Wake::Sync);
        }
    })
    .ok();
    let watch = |debouncer: &mut Option<notify_debouncer_full::Debouncer<notify::RecommendedWatcher, notify_debouncer_full::RecommendedCache>>| {
        if let Some(d) = debouncer.as_mut() {
            for source in &sources {
                if source.is_dir() {
                    let _ = d.watch(source, notify::RecursiveMode::Recursive);
                }
            }
        }
    };
    watch(&mut debouncer);

    let mut last_heartbeat = std::time::Instant::now() - HEARTBEAT;
    let mut watching_missing = sources.iter().any(|s| !s.is_dir());
    let mut wait = Duration::ZERO;
    loop {
        match rx.recv_timeout(wait) {
            Ok(Wake::Quit) => break,
            Ok(Wake::Sync) | Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => break,
        }
        // A game folder that appeared later (first run of the game) starts being watched.
        if watching_missing && sources.iter().all(|s| s.is_dir()) {
            watch(&mut debouncer);
            watching_missing = false;
        }
        let enabled = shared.status.lock().unwrap().enabled;
        wait = RESCAN;
        if enabled {
            let result = mirror::sync(&sources, &mirror);
            let mut status = shared.status.lock().unwrap();
            match result {
                Ok(report) => {
                    if report.copied > 0 || report.removed > 0 {
                        status.last_copy_at = Some(now_ms());
                    }
                    status.saves = report.saves;
                    status.state = if report.source_missing { "source-missing".into() } else { "ok".into() };
                    status.message = if report.paused_deletes {
                        Some("paused-deletes".into())
                    } else if report.deletes_blocked {
                        Some("deletes-blocked".into())
                    } else if !report.duplicates.is_empty() {
                        Some(format!("duplicates:{}", report.duplicates.join(",")))
                    } else {
                        None
                    };
                    if report.busy {
                        wait = RETRY;
                    }
                }
                Err(e) => {
                    status.state = "error".into();
                    status.message = Some(e.to_string());
                    wait = RETRY.max(Duration::from_secs(5));
                }
            }
        }
        if last_heartbeat.elapsed() >= HEARTBEAT || enabled {
            let status = shared.status.lock().unwrap().clone();
            write_status_file(&mirror, &status, true);
            last_heartbeat = std::time::Instant::now();
            let _ = app.emit("status", status);
        }
        wait = wait.min(HEARTBEAT.saturating_sub(last_heartbeat.elapsed()).max(Duration::from_millis(200)));
    }
    let status = shared.status.lock().unwrap().clone();
    write_status_file(&mirror, &status, false);
}

#[tauri::command]
fn get_status(shared: State<'_, Arc<Shared>>) -> Status {
    shared.status.lock().unwrap().clone()
}

fn set_enabled_inner(app: &AppHandle, enabled: bool) {
    let shared = app.state::<Arc<Shared>>();
    shared.status.lock().unwrap().enabled = enabled;
    let quit_on_close = shared.status.lock().unwrap().quit_on_close;
    save_settings(&Settings { disabled: !enabled, quit_on_close });
    if let Some(tx) = shared.wake.lock().unwrap().as_ref() {
        let _ = tx.send(Wake::Sync);
    }
    if let Some(item) = app.try_state::<CheckMenuItem<tauri::Wry>>() {
        let _ = item.set_checked(enabled);
    }
    let _ = app.emit("status", shared.status.lock().unwrap().clone());
}

#[tauri::command]
fn set_enabled(app: AppHandle, enabled: bool) {
    set_enabled_inner(&app, enabled);
}

#[tauri::command]
fn open_mirror(shared: State<'_, Arc<Shared>>) -> Result<(), String> {
    let mirror = shared.status.lock().unwrap().mirror.clone();
    fs::create_dir_all(&mirror).map_err(|e| e.to_string())?;
    open_path(&mirror)
}

fn open_path(path: &str) -> Result<(), String> {
    tauri_plugin_opener::open_path(path, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_quit_on_close(shared: State<'_, Arc<Shared>>, quit: bool) {
    let enabled = {
        let mut status = shared.status.lock().unwrap();
        status.quit_on_close = quit;
        status.enabled
    };
    save_settings(&Settings { disabled: !enabled, quit_on_close: quit });
}

fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn quit(app: &AppHandle) {
    let shared = app.state::<Arc<Shared>>();
    if let Some(tx) = shared.wake.lock().unwrap().as_ref() {
        let _ = tx.send(Wake::Quit);
    }
    // Lets the worker write "running: false" before leaving.
    std::thread::sleep(Duration::from_millis(400));
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let sources = paths::source_dirs();
    let mirror = paths::mirror_dir().unwrap_or_else(|| PathBuf::from("HelperValley Saves"));
    let settings = load_settings();
    let shared = Arc::new(Shared {
        status: Mutex::new(Status {
            enabled: !settings.disabled,
            quit_on_close: settings.quit_on_close,
            state: "ok".into(),
            message: None,
            last_copy_at: None,
            saves: 0,
            sources: sources.iter().map(|s| s.to_string_lossy().into_owned()).collect(),
            mirror: mirror.to_string_lossy().into_owned(),
            version: env!("CARGO_PKG_VERSION").into(),
        }),
        wake: Mutex::new(None),
    });

    tauri::Builder::default()
        // Opening the app again just brings the open one forward.
        .plugin(tauri_plugin_single_instance::init(|app, _, _| show_window(app)))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .manage(shared.clone())
        .invoke_handler(tauri::generate_handler![get_status, set_enabled, open_mirror, set_quit_on_close])
        .setup(move |app| {
            let handle = app.handle().clone();
            let show = MenuItem::with_id(app, "show", "HelperValley", true, None::<&str>)?;
            let toggle = CheckMenuItem::with_id(app, "toggle", "Copiar saves / Copy saves", true, !settings.disabled, None::<&str>)?;
            let open = MenuItem::with_id(app, "open", "Abrir pasta / Open folder", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Sair / Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &PredefinedMenuItem::separator(app)?, &toggle, &open, &PredefinedMenuItem::separator(app)?, &quit_item])?;
            app.manage(toggle.clone());
            TrayIconBuilder::with_id("tray")
                .icon(app.default_window_icon().cloned().expect("app icon"))
                .tooltip("HelperValley")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => show_window(app),
                    "toggle" => {
                        let enabled = !app.state::<Arc<Shared>>().status.lock().unwrap().enabled;
                        set_enabled_inner(app, enabled);
                    }
                    "open" => {
                        let mirror = app.state::<Arc<Shared>>().status.lock().unwrap().mirror.clone();
                        let _ = fs::create_dir_all(&mirror);
                        let _ = open_path(&mirror);
                    }
                    "quit" => quit(app),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        show_window(tray.app_handle());
                    }
                })
                .build(app)?;

            let worker_shared = shared.clone();
            let worker_sources = sources.clone();
            let worker_mirror = mirror.clone();
            std::thread::spawn(move || run_worker(handle, worker_shared, worker_sources, worker_mirror));
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window keeps the app in the tray, unless set to quit; "Quit" in the tray always ends it.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let app = window.app_handle();
                let quit_on_close = app.state::<Arc<Shared>>().status.lock().unwrap().quit_on_close;
                if quit_on_close {
                    quit(app);
                } else {
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building HelperValley")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { code: None, api, .. } = event {
                // The last window closing doesn't end the app.
                api.prevent_exit();
                let _ = app;
            }
        });
}
