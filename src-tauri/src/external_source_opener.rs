use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use url::Url;

pub fn validate_external_learning_source_url(value: &str) -> Result<String, String> {
    let parsed =
        Url::parse(value.trim()).map_err(|_| "仅支持有效的 http/https 学习来源 URL".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https")
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err("仅支持不含用户名或密码的 http/https 学习来源 URL".to_string());
    }
    Ok(parsed.to_string())
}

#[tauri::command]
pub fn open_external_learning_source(app: AppHandle, url: String) -> Result<(), String> {
    let safe_url = validate_external_learning_source_url(&url)?;
    app.opener()
        .open_url(safe_url, None::<&str>)
        .map_err(|_| "无法使用系统默认浏览器打开学习来源".to_string())
}

#[cfg(test)]
mod tests {
    use super::validate_external_learning_source_url;

    #[test]
    fn only_accepts_safe_http_urls() {
        assert_eq!(
            validate_external_learning_source_url("https://example.com/docs").unwrap(),
            "https://example.com/docs"
        );
        assert!(validate_external_learning_source_url("javascript:alert(1)").is_err());
        assert!(validate_external_learning_source_url("file:///C:/private.txt").is_err());
        assert!(validate_external_learning_source_url("https://user:pass@example.com").is_err());
    }
}
