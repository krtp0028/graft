pub fn normalize_rel_path(path: &str) -> Result<String, String> {
    if path.contains('\0') {
        return Err("path contains a NUL byte".to_string());
    }

    if path.starts_with('/') || path.starts_with('\\') {
        return Err(format!("path must be relative: {path}"));
    }

    let mut parts: Vec<&str> = Vec::new();
    for part in path.split(['/', '\\']) {
        match part {
            "" | "." => continue,
            ".." => return Err(format!("path must not escape the vault: {path}")),
            _ => parts.push(part),
        }
    }

    if parts
        .first()
        .is_some_and(|head| starts_with_drive_prefix(head))
    {
        return Err(format!("path must be relative: {path}"));
    }

    Ok(parts.join("/"))
}

fn starts_with_drive_prefix(part: &str) -> bool {
    let mut chars = part.chars();
    matches!(
        (chars.next(), chars.next()),
        (Some(letter), Some(':')) if letter.is_ascii_alphabetic()
    )
}

#[cfg(test)]
mod tests {
    use super::normalize_rel_path;

    #[test]
    fn converts_backslashes_to_forward_slashes() {
        assert_eq!(
            normalize_rel_path("docs\\notes\\a.md").unwrap(),
            "docs/notes/a.md"
        );
    }

    #[test]
    fn strips_current_dir_and_duplicate_separators() {
        assert_eq!(normalize_rel_path("./a//b/").unwrap(), "a/b");
    }

    #[test]
    fn accepts_the_vault_root() {
        assert_eq!(normalize_rel_path("").unwrap(), "");
        assert_eq!(normalize_rel_path(".").unwrap(), "");
    }

    #[test]
    fn rejects_parent_traversal() {
        assert!(normalize_rel_path("a/../b").is_err());
        assert!(normalize_rel_path("..").is_err());
    }

    #[test]
    fn rejects_absolute_paths() {
        assert!(normalize_rel_path("/etc/passwd").is_err());
        assert!(normalize_rel_path("\\windows\\system32").is_err());
        assert!(normalize_rel_path("C:/vault/a.md").is_err());
        assert!(normalize_rel_path("C:\\vault\\a.md").is_err());
        assert!(normalize_rel_path("z:notes.md").is_err());
        assert!(normalize_rel_path("a:b.md").is_err());
    }

    #[test]
    fn rejects_nul_bytes() {
        assert!(normalize_rel_path("a\0b").is_err());
    }

    #[test]
    fn keeps_names_with_colons_beyond_the_first_component() {
        assert_eq!(normalize_rel_path("a/b:c.md").unwrap(), "a/b:c.md");
    }
}
