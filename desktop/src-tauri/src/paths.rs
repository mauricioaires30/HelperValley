//! Where the game keeps its saves on each system, and where the copy goes.
//! `HV_SOURCE_DIRS` and `HV_MIRROR_DIR` replace them, for tests on fake folders.

use std::path::PathBuf;

/// The game's Saves folders that may exist on this computer (Steam, GOG and Steam Flatpak).
pub fn source_dirs() -> Vec<PathBuf> {
    if let Some(value) = std::env::var_os("HV_SOURCE_DIRS") {
        return std::env::split_paths(&value).filter(|p| !p.as_os_str().is_empty()).collect();
    }
    let mut dirs = Vec::new();
    #[cfg(windows)]
    if let Some(roaming) = dirs::config_dir() {
        dirs.push(roaming.join("StardewValley").join("Saves"));
    }
    #[cfg(not(windows))]
    if let Some(home) = dirs::home_dir() {
        dirs.push(home.join(".config").join("StardewValley").join("Saves"));
        #[cfg(target_os = "linux")]
        dirs.push(home.join(".var/app/com.valvesoftware.Steam/.config/StardewValley/Saves"));
    }
    dirs
}

/// The copy the site reads: Documents/HelperValley Saves.
pub fn mirror_dir() -> Option<PathBuf> {
    if let Some(value) = std::env::var_os("HV_MIRROR_DIR") {
        return Some(PathBuf::from(value));
    }
    dirs::document_dir().map(|d| d.join("HelperValley Saves"))
}

/// The app's own settings (copy on or off).
pub fn settings_file() -> Option<PathBuf> {
    if let Some(value) = std::env::var_os("HV_SETTINGS_FILE") {
        return Some(PathBuf::from(value));
    }
    dirs::config_dir().map(|d| d.join("HelperValley").join("settings.json"))
}
