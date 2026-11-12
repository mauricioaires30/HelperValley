//! The setup made by the site's old commands: the game's Saves folder turned into a link to a folder in
//! Documents, plus a job copying it to a backup (Windows scheduled task with robocopy, launchd on Mac,
//! systemd on Linux). Undoing it puts the real saves back where the game expects them. It never deletes
//! saves or backups: at worst it leaves a renamed copy behind.

use serde::Serialize;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

pub const TASK_NAME: &str = "HelperValley Backup";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Legacy {
    /// The game's Saves path, which is a link.
    pub link: Option<String>,
    /// Where that link points: the real saves.
    pub target: Option<String>,
    /// The old backup job still exists.
    pub backup_job: bool,
    /// Folders the old setup left in Documents, for the person to delete if they want.
    pub leftovers: Vec<String>,
}

impl Legacy {
    pub fn found(&self) -> bool {
        self.link.is_some() || self.backup_job
    }
}

/// What undoing needs from the system, so tests can stand in for it.
pub trait System {
    fn game_running(&self) -> bool;
    fn backup_job_exists(&self) -> bool;
    fn stop_backup_job(&self) -> io::Result<()>;
}

/// The link at the game's Saves path, and where it points.
fn link_target(saves: &Path) -> Option<PathBuf> {
    let meta = fs::symlink_metadata(saves).ok()?;
    if meta.file_type().is_symlink() || is_junction(saves) {
        fs::read_link(saves).ok().map(|t| if t.is_absolute() { t } else { saves.parent().unwrap_or(Path::new("")).join(t) })
    } else {
        None
    }
}

#[cfg(windows)]
fn is_junction(path: &Path) -> bool {
    junction::exists(path).unwrap_or(false)
}

#[cfg(not(windows))]
fn is_junction(_: &Path) -> bool {
    false
}

/// Looks for the old setup around the game's Saves folders.
pub fn detect(game_saves: &[PathBuf], documents: Option<&Path>, system: &dyn System) -> Legacy {
    let found = game_saves.iter().find_map(|s| link_target(s).map(|t| (s.clone(), t)));
    let mut leftovers = Vec::new();
    if let Some(docs) = documents {
        for name in ["StardewValley Saves Backup", "Stardew Valley"] {
            let dir = docs.join(name);
            if dir.is_dir() && found.as_ref().map_or(true, |(_, t)| !t.starts_with(&dir)) {
                leftovers.push(dir.to_string_lossy().into_owned());
            }
        }
    }
    Legacy {
        link: found.as_ref().map(|(s, _)| s.to_string_lossy().into_owned()),
        target: found.as_ref().map(|(_, t)| t.to_string_lossy().into_owned()),
        backup_job: system.backup_job_exists(),
        leftovers,
    }
}

fn copy_tree(from: &Path, to: &Path) -> io::Result<u64> {
    fs::create_dir_all(to)?;
    let mut bytes = 0;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let kind = entry.file_type()?;
        let target = to.join(entry.file_name());
        if kind.is_dir() {
            bytes += copy_tree(&entry.path(), &target)?;
        } else if kind.is_file() {
            bytes += fs::copy(entry.path(), &target)?;
        }
    }
    Ok(bytes)
}

fn tree_size(dir: &Path) -> io::Result<u64> {
    let mut bytes = 0;
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let kind = entry.file_type()?;
        if kind.is_dir() {
            bytes += tree_size(&entry.path())?;
        } else if kind.is_file() {
            bytes += entry.metadata()?.len();
        }
    }
    Ok(bytes)
}

/// Undoes the old setup step by step and returns what was done, for the log.
pub fn undo(saves_link: &Path, system: &dyn System) -> io::Result<Vec<String>> {
    if system.game_running() {
        return Err(io::Error::other("game-running"));
    }
    let mut done = Vec::new();
    // 1. The backup job, so nothing copies while folders move.
    if system.backup_job_exists() {
        system.stop_backup_job()?;
        done.push("stopped the old backup job".into());
    }
    // 2. Only the link, after checking it really is one.
    let Some(target) = link_target(saves_link) else {
        done.push("no link at the game's Saves folder".into());
        return Ok(done);
    };
    if !target.is_dir() {
        return Err(io::Error::other(format!("target-missing:{}", target.display())));
    }
    #[cfg(windows)]
    fs::remove_dir(saves_link)?;
    #[cfg(not(windows))]
    fs::remove_file(saves_link)?;
    done.push(format!("removed the link {}", saves_link.display()));
    // 3. The real saves back where the game expects them.
    match fs::rename(&target, saves_link) {
        Ok(()) => done.push(format!("moved {} back to {}", target.display(), saves_link.display())),
        Err(_) => {
            // Another disk: copy, check, and keep the original under a new name.
            let copied = copy_tree(&target, saves_link)?;
            if copied != tree_size(&target)? || tree_size(saves_link)? != copied {
                return Err(io::Error::other("copy-mismatch"));
            }
            let kept = target.with_file_name(format!("{} (HelperValley old setup)", target.file_name().unwrap_or_default().to_string_lossy()));
            fs::rename(&target, &kept)?;
            done.push(format!("copied the saves back to {}; the original stays at {}", saves_link.display(), kept.display()));
        }
    }
    Ok(done)
}

/// The real system: the scheduled task, launchd or systemd, and the game's process.
pub struct RealSystem;

impl System for RealSystem {
    fn game_running(&self) -> bool {
        let mut system = sysinfo::System::new();
        system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
        system.processes().values().any(|p| {
            let name = p.name().to_string_lossy().to_lowercase();
            name.contains("stardew valley") || name.contains("stardewvalley") || name.contains("stardewmoddingapi")
        })
    }

    fn backup_job_exists(&self) -> bool {
        #[cfg(windows)]
        return hidden(std::process::Command::new("schtasks").args(["/Query", "/TN", TASK_NAME])).status().is_ok_and(|s| s.success());
        #[cfg(target_os = "macos")]
        return plist().is_some_and(|p| p.is_file());
        #[cfg(target_os = "linux")]
        return units().iter().any(|u| u.is_file());
    }

    fn stop_backup_job(&self) -> io::Result<()> {
        #[cfg(windows)]
        {
            let _ = hidden(std::process::Command::new("schtasks").args(["/End", "/TN", TASK_NAME])).status();
            hidden(std::process::Command::new("schtasks").args(["/Delete", "/TN", TASK_NAME, "/F"])).status()?;
            // The task's robocopy keeps running on its own after the task ends.
            let mut system = sysinfo::System::new();
            system.refresh_processes_specifics(sysinfo::ProcessesToUpdate::All, true, sysinfo::ProcessRefreshKind::nothing().with_cmd(sysinfo::UpdateKind::Always));
            for process in system.processes().values() {
                let cmd = process.cmd().iter().map(|c| c.to_string_lossy()).collect::<Vec<_>>().join(" ");
                if process.name().to_string_lossy().eq_ignore_ascii_case("robocopy.exe") && (cmd.contains("Stardew Valley\\Backup") || cmd.contains("StardewValley Saves Backup")) {
                    process.kill();
                }
            }
        }
        #[cfg(target_os = "macos")]
        if let Some(p) = plist() {
            let _ = std::process::Command::new("launchctl").arg("unload").arg(&p).status();
            if p.is_file() {
                fs::remove_file(p)?;
            }
        }
        #[cfg(target_os = "linux")]
        {
            let _ = std::process::Command::new("systemctl").args(["--user", "disable", "--now", "helpervalley-backup.timer"]).status();
            for u in units() {
                if u.is_file() {
                    fs::remove_file(u)?;
                }
            }
            let _ = std::process::Command::new("systemctl").args(["--user", "daemon-reload"]).status();
        }
        Ok(())
    }
}

#[cfg(windows)]
fn hidden(command: &mut std::process::Command) -> &mut std::process::Command {
    use std::os::windows::process::CommandExt;
    command.creation_flags(0x0800_0000) // CREATE_NO_WINDOW
}

#[cfg(target_os = "macos")]
fn plist() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join("Library/LaunchAgents/com.helpervalley.backup.plist"))
}

#[cfg(target_os = "linux")]
fn units() -> Vec<PathBuf> {
    dirs::home_dir()
        .map(|h| ["helpervalley-backup.service", "helpervalley-backup.timer"].iter().map(|u| h.join(".config/systemd/user").join(u)).collect())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    struct Fake {
        running: bool,
        job: Cell<bool>,
    }

    impl System for Fake {
        fn game_running(&self) -> bool {
            self.running
        }
        fn backup_job_exists(&self) -> bool {
            self.job.get()
        }
        fn stop_backup_job(&self) -> io::Result<()> {
            self.job.set(false);
            Ok(())
        }
    }

    /// The old Windows layout: the game's Saves is a link to a folder in Documents.
    fn old_setup(root: &Path) -> (PathBuf, PathBuf) {
        let real = root.join("Documents/Stardew Valley/Saves");
        fs::create_dir_all(real.join("Farm_1")).unwrap();
        fs::write(real.join("Farm_1/Farm_1"), "save").unwrap();
        fs::write(real.join("Farm_1/SaveGameInfo"), "info").unwrap();
        fs::create_dir_all(root.join("Documents/Stardew Valley/Backup")).unwrap();
        let saves = root.join("AppData/StardewValley/Saves");
        fs::create_dir_all(saves.parent().unwrap()).unwrap();
        #[cfg(windows)]
        junction::create(&real, &saves).unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(&real, &saves).unwrap();
        (saves, real)
    }

    #[test]
    fn finds_the_old_setup() {
        let tmp = tempfile::tempdir().unwrap();
        let (saves, real) = old_setup(tmp.path());
        let fake = Fake { running: false, job: Cell::new(true) };
        let found = detect(&[saves.clone()], Some(&tmp.path().join("Documents")), &fake);
        assert!(found.found());
        assert_eq!(dunce::canonicalize(found.target.unwrap()).unwrap(), dunce::canonicalize(real).unwrap());
        assert!(found.backup_job);
        // A normal folder is not the old setup.
        let normal = tmp.path().join("normal");
        fs::create_dir_all(&normal).unwrap();
        assert!(!detect(&[normal], None, &Fake { running: false, job: Cell::new(false) }).found());
    }

    #[test]
    fn puts_the_saves_back_and_keeps_the_backup() {
        let tmp = tempfile::tempdir().unwrap();
        let (saves, real) = old_setup(tmp.path());
        let fake = Fake { running: false, job: Cell::new(true) };
        let done = undo(&saves, &fake).unwrap();
        assert!(!fake.job.get());
        assert!(done.len() >= 3);
        assert!(link_target(&saves).is_none());
        assert_eq!(fs::read_to_string(saves.join("Farm_1/Farm_1")).unwrap(), "save");
        assert!(!real.exists());
        assert!(tmp.path().join("Documents/Stardew Valley/Backup").is_dir());
        // Running it again finds nothing to do.
        assert!(undo(&saves, &fake).unwrap().iter().any(|d| d.contains("no link")));
    }

    #[test]
    fn refuses_while_the_game_is_open_or_the_saves_are_gone() {
        let tmp = tempfile::tempdir().unwrap();
        let (saves, real) = old_setup(tmp.path());
        assert!(undo(&saves, &Fake { running: true, job: Cell::new(true) }).is_err());
        assert!(link_target(&saves).is_some());
        fs::rename(&real, tmp.path().join("moved")).unwrap();
        assert!(undo(&saves, &Fake { running: false, job: Cell::new(false) }).is_err());
        assert!(link_target(&saves).is_some());
    }
}
