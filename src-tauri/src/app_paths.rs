use std::{fs, io, path::PathBuf};

use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppDirectories {
    pub root: PathBuf,
    pub config: PathBuf,
    pub media: PathBuf,
    pub backups: PathBuf,
    pub logs: PathBuf,
    pub temp: PathBuf,
    pub runtime: PathBuf,
}

impl AppDirectories {
    pub fn from_root(root: impl Into<PathBuf>) -> Self {
        let root = root.into();

        Self {
            config: root.join("config"),
            media: root.join("media"),
            backups: root.join("backups"),
            logs: root.join("logs"),
            temp: root.join("temp"),
            runtime: root.join("runtime"),
            root,
        }
    }

    pub fn ensure_exists(&self) -> io::Result<()> {
        fs::create_dir_all(&self.root)?;

        for directory in self.managed_directories() {
            fs::create_dir_all(directory)?;
        }

        Ok(())
    }

    #[cfg(test)]
    pub fn is_contained_by_root(&self) -> bool {
        self.managed_directories()
            .into_iter()
            .all(|directory| is_child_path(&self.root, directory))
    }

    fn managed_directories(&self) -> [&std::path::Path; 6] {
        [
            &self.config,
            &self.media,
            &self.backups,
            &self.logs,
            &self.temp,
            &self.runtime,
        ]
    }
}

pub fn initialize_app_directories(app: &AppHandle) -> io::Result<AppDirectories> {
    let root = app
        .path()
        .app_local_data_dir()
        .map_err(|_| io::Error::other("unable to resolve the application local data directory"))?;
    let directories = AppDirectories::from_root(root);

    directories.ensure_exists()?;
    Ok(directories)
}

#[cfg(test)]
fn is_child_path(root: &std::path::Path, candidate: &std::path::Path) -> bool {
    candidate
        .strip_prefix(root)
        .map(|relative| {
            !relative.as_os_str().is_empty()
                && relative
                    .components()
                    .all(|component| matches!(component, std::path::Component::Normal(_)))
        })
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::{is_child_path, AppDirectories};

    fn temporary_root() -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after the Unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("learning-knowledge-base-paths-{suffix}"))
    }

    #[test]
    fn builds_a_contained_directory_layout_from_a_supplied_root() {
        let root = temporary_root();
        let directories = AppDirectories::from_root(&root);

        assert!(directories.is_contained_by_root());
        assert_eq!(directories.config, root.join("config"));
        assert_eq!(directories.media, root.join("media"));
        assert_eq!(directories.backups, root.join("backups"));
        assert_eq!(directories.logs, root.join("logs"));
        assert_eq!(directories.temp, root.join("temp"));
        assert_eq!(directories.runtime, root.join("runtime"));
    }

    #[test]
    fn rejects_parent_directory_escapes_from_the_root() {
        let root = temporary_root();
        let escaped_path = root.join("..").join("outside");

        assert!(!is_child_path(&root, &escaped_path));
    }

    #[test]
    fn initialization_is_idempotent_inside_a_temporary_directory() {
        let root = temporary_root();
        let directories = AppDirectories::from_root(&root);

        directories.ensure_exists().expect("first initialization");
        directories.ensure_exists().expect("second initialization");

        assert!(directories.config.is_dir());
        assert!(directories.media.is_dir());
        assert!(directories.backups.is_dir());
        assert!(directories.logs.is_dir());
        assert!(directories.temp.is_dir());
        assert!(directories.runtime.is_dir());

        fs::remove_dir_all(root).expect("remove only this generated temporary test directory");
    }
}
