#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use reqwest::Client;
use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{async_runtime::Mutex, Manager};

struct AppState {
    lcu_data: Mutex<Option<LcuData>>,
    lcu_client: Client,
    dataset_client: Client,
}

static DATASET_TEMP_FILE_COUNTER: AtomicU64 = AtomicU64::new(0);
static DATASET_CHECKPOINT_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn lock_dataset_checkpoints() -> Result<std::sync::MutexGuard<'static, ()>, String> {
    DATASET_CHECKPOINT_LOCK
        .lock()
        .map_err(|_| "Local dataset checkpoint lock was poisoned".to_owned())
}

#[derive(Serialize, Debug)]
struct LcuData {
    port: u16,
    password: String,
    username: String,
}

fn get_league_lcu_data() -> Result<LcuData, String> {
    #[cfg(not(target_os = "windows"))]
    let output = std::process::Command::new("sh")
        .arg("-lc")
        .arg("ps axww -o args | grep -F 'LeagueClientUx ' | grep -v grep | head -n 1")
        .output()
        .map_err(|_| "Could not run command")?;

    #[cfg(target_os = "windows")]
    let output = {
        match std::process::Command::new("powershell")
            .arg("/C")
            .arg("Get-CimInstance -Query \"SELECT * from Win32_Process WHERE name LIKE 'LeagueClientUx.exe'\" | Select-Object -ExpandProperty CommandLine")
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output()
        {
            Ok(output) => Ok(output),
            Err(_) => {
                std::process::Command::new("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell")
                    .arg("/C")
                    .arg("Get-CimInstance -Query \"SELECT * from Win32_Process WHERE name LIKE 'LeagueClientUx.exe'\" | Select-Object -ExpandProperty CommandLine")
                    .creation_flags(0x08000000) // CREATE_NO_WINDOW
                    .output()
            }
        }
    }
    .map_err(|e| "Could not run command:".to_owned() + &e.to_string())?;

    let output_str = String::from_utf8_lossy(&output.stdout);

    let port_regex = "--app-port=([0-9]+)";
    let password_regex = "--remoting-auth-token=([a-zA-Z0-9_-]+)";

    let port: u16 = regex::Regex::new(port_regex)
        .expect("Could not create port regex")
        .captures(&output_str)
        .ok_or_else(|| {
            "Could not find process, powershell output: \"".to_owned() + &output_str + "\""
        })?
        .get(1)
        .ok_or_else(|| "Could not find port")?
        .as_str()
        .parse()
        .map_err(|_| "Could not parse port")?;

    let password = regex::Regex::new(password_regex)
        .expect("Could not create password regex")
        .captures(&output_str)
        .ok_or_else(|| "Could not find password")?
        .get(1)
        .ok_or_else(|| "Could not find password")?
        .as_str()
        .to_owned();

    Ok(LcuData {
        port,
        password,
        username: "riot".to_owned(),
    })
}

async fn get_lcu_response(
    state: &tauri::State<'_, AppState>,
    path: &str,
) -> Result<serde_json::Value, String> {
    let mut lcu_data_mutex = state.lcu_data.lock().await;

    if lcu_data_mutex.is_none() {
        let new_lcu_data =
            get_league_lcu_data().map_err(|e| "Could not get lcu data: ".to_owned() + &e)?;
        *lcu_data_mutex = Some(new_lcu_data);
    }
    let lcu_data = lcu_data_mutex.as_ref().unwrap();

    let res = state
        .lcu_client
        .get(format!("https://127.0.0.1:{}/{}", lcu_data.port, path))
        .basic_auth(&lcu_data.username, Some(&lcu_data.password))
        .send()
        .await;

    let res = match res {
        Ok(res) => res,
        Err(e) => {
            *lcu_data_mutex = None;
            return Err("Could not get response: ".to_owned() + &e.to_string());
        }
    };

    let status = res.status();
    let body = res
        .text()
        .await
        .map_err(|e| format!("Could not read response body: {e}"))?;

    // 404: endpoint not found
    // 403: champ-select endpoints can be forbidden when not currently in champion select
    let is_champ_select_endpoint = path.starts_with("lol-champ-select/");

    if status == reqwest::StatusCode::NOT_FOUND
        || (is_champ_select_endpoint && status == reqwest::StatusCode::FORBIDDEN)
    {
        return Ok(serde_json::Value::Null);
    }

    if status == reqwest::StatusCode::UNAUTHORIZED {
        *lcu_data_mutex = None;
        return Err("Unauthorized".to_owned());
    }

    if !status.is_success() {
        return Err(format!("LCU returned {status}: {body}"));
    }

    let json = serde_json::from_str(&body).map_err(|e| {
        format!(
            "Could not parse json: {e}; body={}",
            body.chars().take(300).collect::<String>()
        )
    })?;

    Ok(json)
}

#[tauri::command]
async fn get_champ_select_session(
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    get_lcu_response(&state, "lol-champ-select/v1/session").await
}

#[tauri::command]
async fn get_current_summoner(state: tauri::State<'_, AppState>) -> Result<Value, String> {
    get_lcu_response(&state, "lol-summoner/v1/current-summoner").await
}

#[tauri::command]
async fn get_grid_champions(state: tauri::State<'_, AppState>) -> Result<Value, String> {
    get_lcu_response(&state, "lol-champ-select/v1/all-grid-champions").await
}

#[tauri::command]
async fn get_pickable_champion_ids(state: tauri::State<'_, AppState>) -> Result<Value, String> {
    get_lcu_response(&state, "lol-champ-select/v1/pickable-champion-ids").await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DatasetHttpResponse {
    status: u16,
    body: String,
    retry_after: Option<String>,
}

fn is_allowed_dataset_url(url: &reqwest::Url) -> bool {
    if url.scheme() != "https" {
        return false;
    }

    let Some(host) = url.host_str() else {
        return false;
    };

    host == "lolalytics.com"
        || host.ends_with(".lolalytics.com")
        || host == "ddragon.leagueoflegends.com"
        || host == "dacaidi.github.io"
}

#[tauri::command]
async fn fetch_dataset_url(
    state: tauri::State<'_, AppState>,
    url: String,
    timeout_ms: Option<u64>,
) -> Result<DatasetHttpResponse, String> {
    let url = reqwest::Url::parse(&url).map_err(|e| format!("Invalid dataset URL: {e}"))?;
    if !is_allowed_dataset_url(&url) {
        return Err("Dataset URL is not allowed".to_owned());
    }

    let maximum_timeout_ms = if url.host_str() == Some("dacaidi.github.io") {
        180_000
    } else {
        30_000
    };
    let request_timeout = Duration::from_millis(
        timeout_ms
            .unwrap_or(maximum_timeout_ms)
            .clamp(1_000, maximum_timeout_ms),
    );
    let response = state
        .dataset_client
        .get(url)
        .timeout(request_timeout)
        .send()
        .await
        .map_err(|e| format!("Could not fetch dataset URL: {e}"))?;
    let status = response.status().as_u16();
    let retry_after = response
        .headers()
        .get(reqwest::header::RETRY_AFTER)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    let body = response
        .text()
        .await
        .map_err(|e| format!("Could not read dataset response: {e}"))?;

    Ok(DatasetHttpResponse {
        status,
        body,
        retry_after,
    })
}

fn is_valid_dataset_component(value: &str) -> bool {
    !value.is_empty()
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '-' || character == '_'
        })
}

fn local_dataset_path(
    app: &tauri::AppHandle,
    dataset_version: &str,
    tier: &str,
    name: &str,
) -> Result<PathBuf, String> {
    if !is_valid_dataset_component(dataset_version)
        || !is_valid_dataset_component(tier)
        || !is_valid_dataset_component(name)
    {
        return Err("Invalid local dataset path".to_owned());
    }

    let mut path = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not resolve app data directory: {e}"))?;
    path.push("datasets");
    path.push(format!("v{dataset_version}"));
    path.push(tier);
    path.push(format!("{name}.json"));
    Ok(path)
}

fn write_file_via_temporary(path: &Path, contents: &str) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Local dataset file has no parent directory".to_owned())?;
    std::fs::create_dir_all(parent)
        .map_err(|e| format!("Could not create local dataset directory: {e}"))?;

    let temporary_id = DATASET_TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed);
    let temporary_path =
        path.with_extension(format!("json.{}.{temporary_id}.tmp", std::process::id()));
    std::fs::write(&temporary_path, contents)
        .map_err(|e| format!("Could not write local dataset: {e}"))?;
    if path.exists() {
        std::fs::remove_file(path).map_err(|e| format!("Could not replace local dataset: {e}"))?;
    }
    std::fs::rename(temporary_path, path)
        .map_err(|e| format!("Could not finish local dataset write: {e}"))?;

    Ok(())
}

#[tauri::command]
fn load_local_dataset(
    app: tauri::AppHandle,
    dataset_version: String,
    tier: String,
    name: String,
) -> Result<Option<String>, String> {
    let path = local_dataset_path(&app, &dataset_version, &tier, &name)?;
    if !path.exists() {
        return Ok(None);
    }

    std::fs::read_to_string(path)
        .map(Some)
        .map_err(|e| format!("Could not read local dataset: {e}"))
}

#[tauri::command]
fn save_local_dataset(
    app: tauri::AppHandle,
    dataset_version: String,
    tier: String,
    name: String,
    contents: String,
) -> Result<(), String> {
    let path = local_dataset_path(&app, &dataset_version, &tier, &name)?;
    write_file_via_temporary(&path, &contents)
}

fn local_dataset_checkpoint_path(
    app: &tauri::AppHandle,
    dataset_version: &str,
    tier: &str,
    name: &str,
) -> Result<PathBuf, String> {
    if !is_valid_dataset_component(dataset_version)
        || !is_valid_dataset_component(tier)
        || !is_valid_dataset_component(name)
    {
        return Err("Invalid local dataset checkpoint path".to_owned());
    }

    let mut path = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not resolve app data directory: {e}"))?;
    path.push("datasets");
    path.push(format!("v{dataset_version}"));
    path.push(tier);
    path.push("checkpoints");
    path.push(name);
    Ok(path)
}

fn local_dataset_checkpoint_matches_id(
    checkpoint_path: &Path,
    checkpoint_id: &str,
) -> Result<bool, String> {
    if !is_valid_dataset_component(checkpoint_id) {
        return Err("Invalid local dataset checkpoint id".to_owned());
    }

    let metadata = match std::fs::read_to_string(checkpoint_path.join("meta.json")) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(error) => {
            return Err(format!(
                "Could not read local dataset checkpoint metadata: {error}"
            ))
        }
    };
    let metadata: Value = serde_json::from_str(&metadata)
        .map_err(|e| format!("Could not parse local dataset checkpoint metadata: {e}"))?;
    Ok(metadata.get("checkpointId").and_then(Value::as_str) == Some(checkpoint_id))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalDatasetCheckpointChampion {
    champion_key: String,
    contents: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalDatasetCheckpoint {
    metadata: String,
    champions: Vec<LocalDatasetCheckpointChampion>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalDatasetPair {
    current_patch: String,
    thirty_days: String,
}

fn local_dataset_pairs_path(
    app: &tauri::AppHandle,
    dataset_version: &str,
    tier: &str,
) -> Result<PathBuf, String> {
    if !is_valid_dataset_component(dataset_version) || !is_valid_dataset_component(tier) {
        return Err("Invalid local dataset pair path".to_owned());
    }

    let mut path = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not resolve app data directory: {e}"))?;
    path.push("datasets");
    path.push(format!("v{dataset_version}"));
    path.push(tier);
    path.push("pairs");
    Ok(path)
}

fn local_dataset_pair_manifests(pairs_path: &Path) -> Vec<(u64, String, PathBuf)> {
    let manifests_path = pairs_path.join("manifests");
    let Ok(entries) = std::fs::read_dir(manifests_path) else {
        return Vec::new();
    };
    let mut manifests = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let Some(file_pair_id) = path.file_stem().and_then(|value| value.to_str()) else {
            continue;
        };
        let Ok(contents) = std::fs::read_to_string(&path) else {
            continue;
        };
        let Ok(manifest) = serde_json::from_str::<Value>(&contents) else {
            continue;
        };
        let Some(pair_id) = manifest.get("pairId").and_then(Value::as_str) else {
            continue;
        };
        let Some(created_at_ms) = manifest.get("createdAtMs").and_then(Value::as_u64) else {
            continue;
        };
        if manifest.get("formatVersion").and_then(Value::as_u64) != Some(1)
            || pair_id != file_pair_id
            || !is_valid_dataset_component(pair_id)
        {
            continue;
        }
        manifests.push((created_at_ms, pair_id.to_owned(), path));
    }

    manifests.sort_by(|left, right| right.0.cmp(&left.0).then_with(|| right.1.cmp(&left.1)));
    manifests
}

fn read_local_dataset_pair_by_id(pairs_path: &Path, pair_id: &str) -> Option<LocalDatasetPair> {
    let pair_path = pairs_path.join(pair_id);
    let current_patch = std::fs::read_to_string(pair_path.join("current-patch.json")).ok()?;
    let thirty_days = std::fs::read_to_string(pair_path.join("30-days.json")).ok()?;

    Some(LocalDatasetPair {
        current_patch,
        thirty_days,
    })
}

fn read_local_dataset_pair(pairs_path: &Path) -> Option<LocalDatasetPair> {
    for (_, pair_id, _) in local_dataset_pair_manifests(pairs_path) {
        if let Some(pair) = read_local_dataset_pair_by_id(pairs_path, &pair_id) {
            return Some(pair);
        }
    }

    None
}

#[tauri::command]
fn load_local_dataset_pair(
    app: tauri::AppHandle,
    dataset_version: String,
    tier: String,
) -> Result<Option<LocalDatasetPair>, String> {
    let _checkpoint_guard = lock_dataset_checkpoints()?;
    let pairs_path = local_dataset_pairs_path(&app, &dataset_version, &tier)?;
    Ok(read_local_dataset_pair(&pairs_path))
}

fn store_local_dataset_pair(
    app: &tauri::AppHandle,
    dataset_version: &str,
    tier: &str,
    pair_id: &str,
    current_patch: &str,
    thirty_days: &str,
) -> Result<(), String> {
    if !is_valid_dataset_component(&pair_id) {
        return Err("Invalid local dataset pair id".to_owned());
    }

    let pairs_path = local_dataset_pairs_path(app, dataset_version, tier)?;
    let existing_manifests = local_dataset_pair_manifests(&pairs_path);
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u64::MAX as u128) as u64;
    let created_at_ms = existing_manifests
        .first()
        .map(|manifest| now_ms.max(manifest.0.saturating_add(1)))
        .unwrap_or(now_ms);
    let pair_path = pairs_path.join(pair_id);
    if pair_path.exists() {
        return Err("Local dataset pair already exists".to_owned());
    }
    std::fs::create_dir_all(&pair_path)
        .map_err(|e| format!("Could not create local dataset pair: {e}"))?;

    let write_result = (|| {
        write_file_via_temporary(&pair_path.join("current-patch.json"), current_patch)?;
        write_file_via_temporary(&pair_path.join("30-days.json"), thirty_days)?;
        let manifest = serde_json::json!({
            "formatVersion": 1,
            "pairId": pair_id,
            "createdAtMs": created_at_ms,
        });
        write_file_via_temporary(
            &pairs_path.join("manifests").join(format!("{pair_id}.json")),
            &manifest.to_string(),
        )
    })();
    if let Err(error) = write_result {
        let _ = std::fs::remove_dir_all(&pair_path);
        return Err(error);
    }

    let mut retained_previous_pair = false;
    for (_, old_pair_id, manifest_path) in local_dataset_pair_manifests(&pairs_path) {
        if old_pair_id == pair_id {
            continue;
        }
        if !retained_previous_pair
            && read_local_dataset_pair_by_id(&pairs_path, &old_pair_id).is_some()
        {
            retained_previous_pair = true;
            continue;
        }

        if let Err(error) = std::fs::remove_file(&manifest_path) {
            eprintln!(
                "Could not remove old local dataset pair manifest {}: {}",
                manifest_path.display(),
                error
            );
            continue;
        }
        let old_pair_path = pairs_path.join(old_pair_id);
        if let Err(error) = std::fs::remove_dir_all(&old_pair_path) {
            if error.kind() != std::io::ErrorKind::NotFound {
                eprintln!(
                    "Could not remove old local dataset pair {}: {}",
                    old_pair_path.display(),
                    error
                );
            }
        }
    }

    Ok(())
}

#[tauri::command]
fn save_downloaded_local_dataset_pair(
    app: tauri::AppHandle,
    dataset_version: String,
    tier: String,
    pair_id: String,
    current_patch: String,
    thirty_days: String,
) -> Result<(), String> {
    let _checkpoint_guard = lock_dataset_checkpoints()?;
    store_local_dataset_pair(
        &app,
        &dataset_version,
        &tier,
        &pair_id,
        &current_patch,
        &thirty_days,
    )
}

#[tauri::command]
fn commit_local_dataset_pair(
    app: tauri::AppHandle,
    dataset_version: String,
    tier: String,
    pair_id: String,
    current_checkpoint_id: String,
    thirty_days_checkpoint_id: String,
    current_patch: String,
    thirty_days: String,
) -> Result<(), String> {
    let _checkpoint_guard = lock_dataset_checkpoints()?;

    for (name, checkpoint_id) in [
        ("current-patch", current_checkpoint_id.as_str()),
        ("30-days", thirty_days_checkpoint_id.as_str()),
    ] {
        let checkpoint_path = local_dataset_checkpoint_path(&app, &dataset_version, &tier, name)?;
        if !local_dataset_checkpoint_matches_id(&checkpoint_path, checkpoint_id)? {
            return Err("Local dataset build was superseded".to_owned());
        }
    }

    store_local_dataset_pair(
        &app,
        &dataset_version,
        &tier,
        &pair_id,
        &current_patch,
        &thirty_days,
    )
}

#[tauri::command]
fn load_local_dataset_checkpoint(
    app: tauri::AppHandle,
    dataset_version: String,
    tier: String,
    name: String,
) -> Result<Option<LocalDatasetCheckpoint>, String> {
    let _checkpoint_guard = lock_dataset_checkpoints()?;
    let checkpoint_path = local_dataset_checkpoint_path(&app, &dataset_version, &tier, &name)?;
    let metadata_path = checkpoint_path.join("meta.json");
    if !metadata_path.exists() {
        return Ok(None);
    }

    let metadata = std::fs::read_to_string(metadata_path)
        .map_err(|e| format!("Could not read local dataset checkpoint metadata: {e}"))?;
    let champions_path = checkpoint_path.join("champions");
    let mut champions = Vec::new();
    if champions_path.exists() {
        let mut entries = std::fs::read_dir(champions_path)
            .map_err(|e| format!("Could not list local dataset checkpoints: {e}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Could not read local dataset checkpoint entry: {e}"))?;
        entries.sort_by_key(|entry| entry.file_name());

        for entry in entries {
            let path = entry.path();
            if !entry
                .file_type()
                .map_err(|e| format!("Could not inspect local dataset checkpoint: {e}"))?
                .is_file()
            {
                continue;
            }
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            let Some(champion_key) = path
                .file_stem()
                .and_then(|value| value.to_str())
                .map(str::to_owned)
            else {
                continue;
            };
            if !is_valid_dataset_component(&champion_key) {
                continue;
            }

            let contents = match std::fs::read_to_string(&path) {
                Ok(contents) => contents,
                Err(error) => {
                    eprintln!(
                        "Skipping unreadable local dataset champion checkpoint {}: {}",
                        path.display(),
                        error
                    );
                    continue;
                }
            };
            champions.push(LocalDatasetCheckpointChampion {
                champion_key,
                contents,
            });
        }
    }

    Ok(Some(LocalDatasetCheckpoint {
        metadata,
        champions,
    }))
}

#[tauri::command]
fn initialize_local_dataset_checkpoint(
    app: tauri::AppHandle,
    dataset_version: String,
    tier: String,
    name: String,
    checkpoint_id: String,
    metadata: String,
) -> Result<(), String> {
    let _checkpoint_guard = lock_dataset_checkpoints()?;
    let checkpoint_path = local_dataset_checkpoint_path(&app, &dataset_version, &tier, &name)?;
    let metadata_value: Value = serde_json::from_str(&metadata)
        .map_err(|e| format!("Could not parse local dataset checkpoint metadata: {e}"))?;
    if metadata_value.get("checkpointId").and_then(Value::as_str) != Some(checkpoint_id.as_str())
        || !is_valid_dataset_component(&checkpoint_id)
    {
        return Err("Local dataset checkpoint metadata id does not match".to_owned());
    }
    if checkpoint_path.exists() {
        std::fs::remove_dir_all(&checkpoint_path)
            .map_err(|e| format!("Could not reset local dataset checkpoint: {e}"))?;
    }
    std::fs::create_dir_all(checkpoint_path.join("champions"))
        .map_err(|e| format!("Could not create local dataset checkpoint: {e}"))?;
    write_file_via_temporary(&checkpoint_path.join("meta.json"), &metadata)
}

#[tauri::command]
fn save_local_dataset_checkpoint_champion(
    app: tauri::AppHandle,
    dataset_version: String,
    tier: String,
    name: String,
    checkpoint_id: String,
    champion_key: String,
    contents: String,
) -> Result<(), String> {
    let _checkpoint_guard = lock_dataset_checkpoints()?;
    if !is_valid_dataset_component(&champion_key) {
        return Err("Invalid local dataset checkpoint champion".to_owned());
    }

    let checkpoint_path = local_dataset_checkpoint_path(&app, &dataset_version, &tier, &name)?;
    if !local_dataset_checkpoint_matches_id(&checkpoint_path, &checkpoint_id)? {
        return Err("Local dataset checkpoint was superseded".to_owned());
    }
    let champion_path = checkpoint_path
        .join("champions")
        .join(format!("{champion_key}.json"));
    write_file_via_temporary(&champion_path, &contents)
}

#[tauri::command]
fn clear_local_dataset_checkpoint(
    app: tauri::AppHandle,
    dataset_version: String,
    tier: String,
    name: String,
    checkpoint_id: String,
) -> Result<(), String> {
    let _checkpoint_guard = lock_dataset_checkpoints()?;
    let checkpoint_path = local_dataset_checkpoint_path(&app, &dataset_version, &tier, &name)?;
    if checkpoint_path.exists()
        && local_dataset_checkpoint_matches_id(&checkpoint_path, &checkpoint_id)?
    {
        std::fs::remove_dir_all(checkpoint_path)
            .map_err(|e| format!("Could not clear local dataset checkpoint: {e}"))?;
    }
    Ok(())
}

fn main() {
    let lcu_client = Client::builder()
        .danger_accept_invalid_certs(true)
        .build()
        .expect("Could not build client");
    let dataset_client = Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if is_allowed_dataset_url(attempt.url()) {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .build()
        .expect("Could not build dataset client");

    let state = AppState {
        lcu_data: Mutex::new(None),
        lcu_client,
        dataset_client,
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            get_champ_select_session,
            get_current_summoner,
            get_grid_champions,
            get_pickable_champion_ids,
            fetch_dataset_url,
            load_local_dataset,
            save_local_dataset,
            load_local_dataset_pair,
            save_downloaded_local_dataset_pair,
            commit_local_dataset_pair,
            load_local_dataset_checkpoint,
            initialize_local_dataset_checkpoint,
            save_local_dataset_checkpoint_champion,
            clear_local_dataset_checkpoint
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dataset_url_allowlist_accepts_only_expected_https_hosts() {
        for url in [
            "https://lolalytics.com/lol/champion/ahri/build/",
            "https://axe.lolalytics.com/tierlist/1/",
            "https://ddragon.leagueoflegends.com/api/versions.json",
            "https://dacaidi.github.io/draftgap/v5/gold/manifest.json",
        ] {
            assert!(is_allowed_dataset_url(&reqwest::Url::parse(url).unwrap()));
        }

        for url in [
            "http://dacaidi.github.io/draftgap/v5/gold/manifest.json",
            "https://dacaidi.github.io.evil.example/dataset.json",
            "https://raw.githubusercontent.com/Dacaidi/draftgap/main/file.json",
        ] {
            assert!(!is_allowed_dataset_url(&reqwest::Url::parse(url).unwrap()));
        }
    }

    fn write_test_pair(
        pairs_path: &Path,
        pair_id: &str,
        created_at_ms: u64,
        current_patch: &str,
        thirty_days: Option<&str>,
    ) {
        let pair_path = pairs_path.join(pair_id);
        std::fs::create_dir_all(&pair_path).unwrap();
        std::fs::write(pair_path.join("current-patch.json"), current_patch).unwrap();
        if let Some(thirty_days) = thirty_days {
            std::fs::write(pair_path.join("30-days.json"), thirty_days).unwrap();
        }

        let manifests_path = pairs_path.join("manifests");
        std::fs::create_dir_all(&manifests_path).unwrap();
        std::fs::write(
            manifests_path.join(format!("{pair_id}.json")),
            serde_json::json!({
                "formatVersion": 1,
                "pairId": pair_id,
                "createdAtMs": created_at_ms,
            })
            .to_string(),
        )
        .unwrap();
    }

    #[test]
    fn dataset_pair_loader_never_mixes_generations() {
        let test_id = DATASET_TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed);
        let pairs_path = std::env::temp_dir().join(format!(
            "draftgap-pair-test-{}-{test_id}",
            std::process::id()
        ));

        write_test_pair(&pairs_path, "old", 1, "old-current", Some("old-30"));
        write_test_pair(&pairs_path, "new", 2, "new-current", None);

        let fallback = read_local_dataset_pair(&pairs_path).unwrap();
        assert_eq!(fallback.current_patch, "old-current");
        assert_eq!(fallback.thirty_days, "old-30");

        std::fs::write(pairs_path.join("new").join("30-days.json"), "new-30").unwrap();
        let newest = read_local_dataset_pair(&pairs_path).unwrap();
        assert_eq!(newest.current_patch, "new-current");
        assert_eq!(newest.thirty_days, "new-30");

        std::fs::remove_dir_all(pairs_path).unwrap();
    }
}
