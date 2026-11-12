//! A one-way copy of the game's save folders into the mirror folder the site reads.
//!
//! Rules that keep the real saves safe:
//! - nothing in a source folder is ever opened for writing, renamed or deleted;
//! - every copied file is written next to its target and renamed over it, so the site never reads half a file;
//! - only save folders and their files inside the mirror can be deleted, and only when all guards pass:
//!   the mirror holds our marker, no link sits in its path, it is a different folder from every source,
//!   and the sources list at least one save (an empty source pauses deletions instead of wiping the copy).

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

/// Marks a folder made by the app: deletions only ever happen in a folder that has it.
pub const MARKER: &str = ".helpervalley-mirror";
/// Files the app writes next to the saves; they are never treated as saves.
const OWN_FILES: [&str; 3] = [MARKER, ".helpervalley-app.json", "helpervalley-undo.log"];
/// A file changed this recently may still be being written by the game.
const SETTLE: Duration = Duration::from_millis(1000);

#[derive(Debug, Default, PartialEq, Eq)]
pub struct Report {
    /// Files copied in this pass.
    pub copied: usize,
    /// Files or save folders removed from the copy because they're gone from the game.
    pub removed: usize,
    /// Save folders found in the game's folders.
    pub saves: usize,
    /// No game folder exists on this computer (yet).
    pub source_missing: bool,
    /// Deletions skipped: the game folders list no save while the copy has some.
    pub paused_deletes: bool,
    /// Deletions skipped because a guard failed (no marker, a link, or the same folder).
    pub deletes_blocked: bool,
    /// Files still being written; another pass should follow soon.
    pub busy: bool,
    /// The same save name in two game folders: the first one wins.
    pub duplicates: Vec<String>,
}

/// A save folder holds "SaveGameInfo" plus a main file named after the folder.
fn is_save_folder(dir: &Path) -> bool {
    let Some(name) = dir.file_name() else { return false };
    dir.join("SaveGameInfo").is_file() && dir.join(name).is_file()
}

/// Temporary files of the game or of this app.
fn is_temp(name: &str) -> bool {
    name.starts_with('.') || name.ends_with("_STARDEWVALLEYSAVETMP") || name.ends_with(".hv-tmp") || name.ends_with(".tmp")
}

/// The save folders of every existing source, by name. Never follows links while walking.
fn source_saves(sources: &[PathBuf], report: &mut Report) -> BTreeMap<String, PathBuf> {
    let mut saves = BTreeMap::new();
    let mut any = false;
    for source in sources {
        let Ok(entries) = fs::read_dir(source) else { continue };
        any = true;
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(kind) = entry.file_type() else { continue };
            if !kind.is_dir() || !is_save_folder(&path) {
                continue;
            }
            let name = entry.file_name().to_string_lossy().into_owned();
            if saves.contains_key(&name) {
                report.duplicates.push(name);
            } else {
                saves.insert(name, path);
            }
        }
    }
    report.source_missing = !any;
    report.saves = saves.len();
    saves
}

fn same_file(a: &fs::Metadata, b: &fs::Metadata) -> bool {
    a.len() == b.len() && a.modified().ok() == b.modified().ok()
}

/// Copies one file atomically, keeping its modified time. False when it changed while copying.
fn copy_file(from: &Path, to: &Path) -> io::Result<bool> {
    let before = fs::metadata(from)?;
    let tmp = to.with_file_name(format!(".{}.hv-tmp", to.file_name().unwrap_or_default().to_string_lossy()));
    fs::copy(from, &tmp)?;
    let after = fs::metadata(from)?;
    if !same_file(&before, &after) {
        let _ = fs::remove_file(&tmp);
        return Ok(false);
    }
    if let Ok(modified) = before.modified() {
        filetime::set_file_mtime(&tmp, filetime::FileTime::from_system_time(modified))?;
    }
    fs::rename(&tmp, to)?;
    Ok(true)
}

/// The path with every link resolved, without Windows' \\?\ prefix.
fn resolved(path: &Path) -> Option<PathBuf> {
    dunce::canonicalize(path).ok()
}

fn lowercase(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/").trim_end_matches('/').to_lowercase()
}

/// A symlink or junction (a folder that is really somewhere else).
fn is_link(path: &Path) -> bool {
    let Ok(meta) = fs::symlink_metadata(path) else { return true };
    #[cfg(windows)]
    // An ordinary folder is an error here (not a reparse point), so only a confirmed junction counts.
    if junction::exists(path).unwrap_or(false) {
        return true;
    }
    meta.file_type().is_symlink()
}

/// The copy folder itself isn't a link. Links higher up (macOS /var, Windows short names, a moved
/// Documents) are fine: `apart` compares the resolved paths, so the copy can't reach the game folder.
fn not_a_link(mirror: &Path) -> bool {
    !is_link(mirror)
}

/// The mirror and a source are different folders, and neither is inside the other.
fn apart(mirror: &Path, source: &Path) -> bool {
    let (Some(m), Some(s)) = (resolved(mirror), resolved(source)) else { return true };
    let (m, s) = (lowercase(&m), lowercase(&s));
    m != s && !m.starts_with(&format!("{s}/")) && !s.starts_with(&format!("{m}/"))
}

/// Creates the mirror folder and its marker. A folder that already had files without the marker
/// was made by someone else: it gets copies, but never deletions.
fn prepare_mirror(mirror: &Path) -> io::Result<bool> {
    let existed = mirror.exists();
    fs::create_dir_all(mirror)?;
    let marker = mirror.join(MARKER);
    if marker.is_file() {
        return Ok(true);
    }
    let empty = !existed || fs::read_dir(mirror)?.flatten().all(|e| OWN_FILES.contains(&e.file_name().to_string_lossy().as_ref()));
    if empty {
        fs::write(&marker, "Created by the HelperValley app. Files here are copies of your Stardew Valley saves.\n")?;
    }
    Ok(empty)
}

/// One full pass: copy what changed, then remove from the copy what the game no longer has.
pub fn sync(sources: &[PathBuf], mirror: &Path) -> io::Result<Report> {
    let mut report = Report::default();
    let saves = source_saves(sources, &mut report);
    let marked = prepare_mirror(mirror)?;
    let now = SystemTime::now();

    for (name, from_dir) in &saves {
        let to_dir = mirror.join(name);
        fs::create_dir_all(&to_dir)?;
        let mut files: Vec<(String, PathBuf, fs::Metadata)> = Vec::new();
        for entry in fs::read_dir(from_dir)?.flatten() {
            let file = entry.file_name().to_string_lossy().into_owned();
            let Ok(meta) = entry.metadata() else { continue };
            if !meta.is_file() || is_temp(&file) {
                continue;
            }
            files.push((file, entry.path(), meta));
        }
        // SaveGameInfo first and the main file last: the site reloads when the main file changes.
        files.sort_by_key(|(file, _, _)| if file == "SaveGameInfo" { 0 } else if file == name { 2 } else { 1 });
        for (file, from, meta) in &files {
            if meta.modified().ok().and_then(|m| now.duration_since(m).ok()).is_some_and(|age| age < SETTLE) {
                report.busy = true;
                continue;
            }
            let to = to_dir.join(file);
            if fs::metadata(&to).is_ok_and(|current| same_file(meta, &current)) {
                continue;
            }
            if copy_file(from, &to)? {
                report.copied += 1;
            } else {
                report.busy = true;
            }
        }
        // Files the game removed from this save (its own "_old" rotation): only once the whole folder is settled.
        if !report.busy && marked && !is_link(&to_dir) {
            let wanted: BTreeSet<&str> = files.iter().map(|(f, _, _)| f.as_str()).collect();
            for entry in fs::read_dir(&to_dir)?.flatten() {
                let file = entry.file_name().to_string_lossy().into_owned();
                if entry.file_type().is_ok_and(|t| t.is_file()) && !wanted.contains(file.as_str()) && !is_temp(&file) && deletes_allowed(sources, mirror, &report) {
                    fs::remove_file(entry.path())?;
                    report.removed += 1;
                }
            }
        }
    }

    // Saves deleted in the game: remove their copy, only behind every guard.
    let stale: Vec<PathBuf> = fs::read_dir(mirror)?
        .flatten()
        .filter(|e| e.file_type().is_ok_and(|t| t.is_dir()))
        .map(|e| e.path())
        // A save folder that is really a link elsewhere is never deleted.
        .filter(|p| !is_link(p))
        .filter(|p| is_save_folder(p) && !saves.contains_key(&p.file_name().unwrap_or_default().to_string_lossy().into_owned()))
        .collect();
    if !stale.is_empty() {
        if saves.is_empty() {
            report.paused_deletes = true;
        } else if !marked || !deletes_allowed(sources, mirror, &report) {
            report.deletes_blocked = true;
        } else {
            for dir in stale {
                fs::remove_dir_all(&dir)?;
                report.removed += 1;
            }
        }
    }
    Ok(report)
}

/// Every guard for deleting inside the mirror.
fn deletes_allowed(sources: &[PathBuf], mirror: &Path, report: &Report) -> bool {
    report.saves > 0 && mirror.join(MARKER).is_file() && not_a_link(mirror) && sources.iter().all(|s| apart(mirror, s))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread::sleep;

    fn save(root: &Path, name: &str, day: &str) {
        let dir = root.join(name);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("SaveGameInfo"), format!("info {day}")).unwrap();
        fs::write(dir.join(name), format!("save {day}")).unwrap();
    }

    fn settle() {
        sleep(SETTLE + Duration::from_millis(100));
    }

    fn read(path: PathBuf) -> String {
        fs::read_to_string(path).unwrap_or_default()
    }

    #[test]
    fn copies_saves_and_keeps_them_current() {
        let tmp = tempfile::tempdir().unwrap();
        let (game, copy) = (tmp.path().join("game"), tmp.path().join("copy"));
        save(&game, "Farm_1", "dia 1");
        settle();
        let report = sync(&[game.clone()], &copy).unwrap();
        assert_eq!(report.copied, 2);
        assert_eq!(read(copy.join("Farm_1/Farm_1")), "save dia 1");
        assert!(copy.join(MARKER).is_file());
        // Nothing changed: nothing copied.
        assert_eq!(sync(&[game.clone()], &copy).unwrap().copied, 0);
        save(&game, "Farm_1", "dia 2");
        settle();
        assert_eq!(sync(&[game.clone()], &copy).unwrap().copied, 2);
        assert_eq!(read(copy.join("Farm_1/Farm_1")), "save dia 2");
        // No temporary file left behind, and the original time is kept.
        assert!(fs::read_dir(copy.join("Farm_1")).unwrap().flatten().all(|e| !e.file_name().to_string_lossy().ends_with(".hv-tmp")));
        assert_eq!(fs::metadata(game.join("Farm_1/Farm_1")).unwrap().modified().unwrap(), fs::metadata(copy.join("Farm_1/Farm_1")).unwrap().modified().unwrap());
    }

    #[test]
    fn waits_for_files_the_game_is_still_writing() {
        let tmp = tempfile::tempdir().unwrap();
        let (game, copy) = (tmp.path().join("game"), tmp.path().join("copy"));
        save(&game, "Farm_1", "dia 1");
        let report = sync(&[game.clone()], &copy).unwrap();
        assert!(report.busy);
        assert_eq!(report.copied, 0);
        settle();
        assert_eq!(sync(&[game], &copy).unwrap().copied, 2);
    }

    #[test]
    fn never_touches_the_game_folder() {
        let tmp = tempfile::tempdir().unwrap();
        let (game, copy) = (tmp.path().join("game"), tmp.path().join("copy"));
        save(&game, "Farm_1", "dia 1");
        settle();
        sync(&[game.clone()], &copy).unwrap();
        // Editing or deleting the copy changes nothing in the game folder.
        fs::write(copy.join("Farm_1/Farm_1"), "edited").unwrap();
        fs::remove_dir_all(copy.join("Farm_1")).unwrap();
        settle();
        sync(&[game.clone()], &copy).unwrap();
        assert_eq!(read(game.join("Farm_1/Farm_1")), "save dia 1");
        assert_eq!(read(copy.join("Farm_1/Farm_1")), "save dia 1");
    }

    #[test]
    fn removes_saves_deleted_in_the_game() {
        let tmp = tempfile::tempdir().unwrap();
        let (game, copy) = (tmp.path().join("game"), tmp.path().join("copy"));
        save(&game, "Farm_1", "a");
        save(&game, "Farm_2", "b");
        settle();
        sync(&[game.clone()], &copy).unwrap();
        fs::remove_dir_all(game.join("Farm_2")).unwrap();
        let report = sync(&[game.clone()], &copy).unwrap();
        assert_eq!(report.removed, 1);
        assert!(!copy.join("Farm_2").exists());
        assert!(copy.join("Farm_1/Farm_1").is_file());
    }

    #[test]
    fn an_empty_game_folder_pauses_deletes() {
        let tmp = tempfile::tempdir().unwrap();
        let (game, copy) = (tmp.path().join("game"), tmp.path().join("copy"));
        save(&game, "Farm_1", "a");
        settle();
        sync(&[game.clone()], &copy).unwrap();
        fs::remove_dir_all(game.join("Farm_1")).unwrap();
        let report = sync(&[game.clone()], &copy).unwrap();
        assert!(report.paused_deletes);
        assert!(copy.join("Farm_1/Farm_1").is_file());
        // And a missing game folder too.
        fs::remove_dir_all(&game).unwrap();
        let report = sync(&[game], &copy).unwrap();
        assert!(report.source_missing && report.paused_deletes);
        assert!(copy.join("Farm_1/Farm_1").is_file());
    }

    #[test]
    fn a_folder_made_by_someone_else_is_never_cleaned() {
        let tmp = tempfile::tempdir().unwrap();
        let (game, copy) = (tmp.path().join("game"), tmp.path().join("copy"));
        save(&game, "Farm_1", "a");
        save(&copy, "Other_9", "someone else's");
        settle();
        let report = sync(&[game.clone()], &copy).unwrap();
        assert!(!copy.join(MARKER).exists());
        assert!(report.deletes_blocked);
        assert!(copy.join("Other_9/Other_9").is_file());
        assert!(copy.join("Farm_1/Farm_1").is_file());
    }

    #[test]
    fn deletes_are_blocked_when_the_copy_is_the_game_folder() {
        let tmp = tempfile::tempdir().unwrap();
        let game = tmp.path().join("game");
        save(&game, "Farm_1", "a");
        fs::write(game.join(MARKER), "").unwrap();
        save(&game.join("Farm_1"), "Nested", "x");
        settle();
        // The copy pointed at the game folder itself: nothing may be deleted.
        let report = sync(&[game.clone()], &game).unwrap();
        assert_eq!(report.removed, 0);
        assert!(!deletes_allowed(&[game.clone()], &game, &report));
        assert!(game.join("Farm_1/Farm_1").is_file());
    }

    #[test]
    fn deletes_are_blocked_through_a_link() {
        let tmp = tempfile::tempdir().unwrap();
        let (game, real_copy, linked) = (tmp.path().join("game"), tmp.path().join("real"), tmp.path().join("linked"));
        save(&game, "Farm_1", "a");
        save(&game, "Farm_2", "b");
        settle();
        sync(&[game.clone()], &real_copy).unwrap();
        #[cfg(windows)]
        junction::create(&real_copy, &linked).unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(&real_copy, &linked).unwrap();
        fs::remove_dir_all(game.join("Farm_2")).unwrap();
        let report = sync(&[game], &linked).unwrap();
        assert!(report.deletes_blocked);
        assert!(real_copy.join("Farm_2/Farm_2").is_file());
    }

    #[test]
    fn a_link_higher_up_in_the_path_still_allows_deletes() {
        // Like macOS /var -> /private/var, or Documents moved to another drive.
        let tmp = tempfile::tempdir().unwrap();
        let (game, parent, linked_parent) = (tmp.path().join("game"), tmp.path().join("parent"), tmp.path().join("linked_parent"));
        fs::create_dir_all(&parent).unwrap();
        #[cfg(windows)]
        junction::create(&parent, &linked_parent).unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(&parent, &linked_parent).unwrap();
        let copy = linked_parent.join("copy");
        save(&game, "Farm_1", "a");
        save(&game, "Farm_2", "b");
        settle();
        sync(&[game.clone()], &copy).unwrap();
        fs::remove_dir_all(game.join("Farm_2")).unwrap();
        let report = sync(&[game], &copy).unwrap();
        assert_eq!(report.removed, 1);
        assert!(!parent.join("copy/Farm_2").exists());
        assert!(parent.join("copy/Farm_1/Farm_1").is_file());
    }

    #[test]
    fn a_save_folder_that_is_a_link_is_never_deleted() {
        let tmp = tempfile::tempdir().unwrap();
        let (game, copy, elsewhere) = (tmp.path().join("game"), tmp.path().join("copy"), tmp.path().join("elsewhere"));
        save(&game, "Farm_1", "a");
        save(&elsewhere, "Farm_9", "precious");
        settle();
        sync(&[game.clone()], &copy).unwrap();
        #[cfg(windows)]
        junction::create(elsewhere.join("Farm_9"), copy.join("Farm_9")).unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(elsewhere.join("Farm_9"), copy.join("Farm_9")).unwrap();
        let report = sync(&[game], &copy).unwrap();
        assert_eq!(report.removed, 0);
        assert!(elsewhere.join("Farm_9/Farm_9").is_file());
    }

    #[test]
    fn skips_temporary_files_and_reports_duplicates() {
        let tmp = tempfile::tempdir().unwrap();
        let (a, b, copy) = (tmp.path().join("a"), tmp.path().join("b"), tmp.path().join("copy"));
        save(&a, "Farm_1", "from a");
        save(&b, "Farm_1", "from b");
        fs::write(a.join("Farm_1/Farm_1_STARDEWVALLEYSAVETMP"), "temp").unwrap();
        settle();
        let report = sync(&[a, b], &copy).unwrap();
        assert_eq!(report.duplicates, vec!["Farm_1".to_string()]);
        assert_eq!(read(copy.join("Farm_1/Farm_1")), "save from a");
        assert!(!copy.join("Farm_1/Farm_1_STARDEWVALLEYSAVETMP").exists());
    }
}
