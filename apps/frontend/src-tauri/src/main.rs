#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use reqwest::Client;
use serde::{
    de::{IgnoredAny, MapAccess, Visitor},
    Deserialize, Deserializer, Serialize,
};
use serde_json::Value;
use std::fmt;
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
const LOCAL_DATASET_CHECKPOINT_MAX_AGE: Duration = Duration::from_secs(36 * 60 * 60);
const LEGACY_DATASET_MAX_MTIME_GAP: Duration = Duration::from_secs(10 * 60);

fn lock_dataset_checkpoints() -> Result<std::sync::MutexGuard<'static, ()>, String> {
    DATASET_CHECKPOINT_LOCK
        .lock()
        .map_err(|_| "Local dataset checkpoint lock was poisoned".to_owned())
}

#[derive(Serialize)]
struct LcuData {
    port: u16,
    password: String,
    username: String,
}

fn parse_league_lcu_command_line(command_line: &str) -> Result<LcuData, String> {
    if command_line.trim().is_empty() {
        return Err("League Client process was not found".to_owned());
    }

    let port = regex::Regex::new(r"--app-port=([0-9]+)")
        .expect("Could not create port regex")
        .captures(command_line)
        .and_then(|captures| captures.get(1))
        .ok_or_else(|| "League Client command line did not include an app port".to_owned())?
        .as_str()
        .parse::<u16>()
        .map_err(|_| "League Client app port was invalid".to_owned())?;

    let password = regex::Regex::new(r"--remoting-auth-token=([a-zA-Z0-9_-]+)")
        .expect("Could not create password regex")
        .captures(command_line)
        .and_then(|captures| captures.get(1))
        .ok_or_else(|| "League Client command line did not include an auth token".to_owned())?
        .as_str()
        .to_owned();

    Ok(LcuData {
        port,
        password,
        username: "riot".to_owned(),
    })
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

    if !output.status.success() {
        return Err("Could not inspect the League Client process".to_owned());
    }

    parse_league_lcu_command_line(&String::from_utf8_lossy(&output.stdout))
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

fn checkpoint_created_at(checkpoint_path: &Path) -> Option<SystemTime> {
    let metadata_path = checkpoint_path.join("meta.json");
    let contents = std::fs::read_to_string(&metadata_path).ok()?;
    let metadata: Value = serde_json::from_str(&contents).ok()?;
    let checkpoint_id = metadata.get("checkpointId").and_then(Value::as_str)?;
    let created_at = metadata.get("createdAt").and_then(Value::as_str);
    if metadata.get("formatVersion").and_then(Value::as_u64) != Some(1)
        || !is_valid_dataset_component(checkpoint_id)
        || !matches!(created_at, Some(value) if !value.is_empty())
    {
        return None;
    }

    if let Some(created_at_ms) = metadata.get("createdAtMs").and_then(Value::as_u64) {
        return UNIX_EPOCH.checked_add(Duration::from_millis(created_at_ms));
    }

    // Checkpoints written before createdAtMs was added use the metadata file's
    // creation-time equivalent. meta.json is immutable for a checkpoint, so
    // its modified time tracks the same lifetime without parsing RFC 3339.
    std::fs::metadata(metadata_path).ok()?.modified().ok()
}

fn prune_expired_dataset_checkpoints_at(tier_path: &Path, now: SystemTime) {
    for name in ["current-patch", "30-days"] {
        let checkpoint_path = tier_path.join("checkpoints").join(name);
        if !checkpoint_path.exists() {
            continue;
        }

        let should_remove = match checkpoint_created_at(&checkpoint_path) {
            Some(created_at) => match now.duration_since(created_at) {
                Ok(age) => age > LOCAL_DATASET_CHECKPOINT_MAX_AGE,
                // A future timestamp cannot be resumed by the frontend's
                // existing validity rules, so it is invalid rather than fresh.
                Err(_) => true,
            },
            None => true,
        };
        if should_remove {
            if let Err(error) = std::fs::remove_dir_all(&checkpoint_path) {
                eprintln!(
                    "Could not remove expired local dataset checkpoint {}: {}",
                    checkpoint_path.display(),
                    error
                );
            }
        }
    }
}

fn prune_expired_dataset_checkpoints(
    app: &tauri::AppHandle,
    dataset_version: &str,
    tier: &str,
) -> Result<(), String> {
    let pairs_path = local_dataset_pairs_path(app, dataset_version, tier)?;
    let tier_path = pairs_path
        .parent()
        .ok_or_else(|| "Local dataset tier directory has no parent".to_owned())?;
    prune_expired_dataset_checkpoints_at(tier_path, SystemTime::now());
    Ok(())
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

struct JsonObject {
    is_empty: bool,
}

impl<'de> Deserialize<'de> for JsonObject {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct JsonObjectVisitor;

        impl<'de> Visitor<'de> for JsonObjectVisitor {
            type Value = JsonObject;

            fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str("a JSON object")
            }

            fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
            where
                A: MapAccess<'de>,
            {
                let mut is_empty = true;
                while map.next_entry::<IgnoredAny, IgnoredAny>()?.is_some() {
                    is_empty = false;
                }
                Ok(JsonObject { is_empty })
            }
        }

        deserializer.deserialize_map(JsonObjectVisitor)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalDatasetMinimumShape {
    version: String,
    date: String,
    #[serde(rename = "championData")]
    _champion_data: JsonObject,
    #[serde(rename = "itemData")]
    _item_data: JsonObject,
    #[serde(rename = "runeData")]
    _rune_data: JsonObject,
    #[serde(rename = "runePathData")]
    _rune_path_data: JsonObject,
    #[serde(rename = "statShardData")]
    _stat_shard_data: JsonObject,
    #[serde(rename = "summonerSpellData")]
    _summoner_spell_data: JsonObject,
}

fn parse_two_digits(value: &[u8]) -> Option<u8> {
    if value.len() != 2 || !value.iter().all(u8::is_ascii_digit) {
        return None;
    }
    Some((value[0] - b'0') * 10 + value[1] - b'0')
}

fn local_dataset_date_has_minimum_shape(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() < 10
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || !bytes[..4].iter().all(u8::is_ascii_digit)
    {
        return false;
    }

    let year = bytes[..4]
        .iter()
        .fold(0_u16, |year, digit| year * 10 + u16::from(digit - b'0'));
    let Some(month) = parse_two_digits(&bytes[5..7]) else {
        return false;
    };
    let Some(day) = parse_two_digits(&bytes[8..10]) else {
        return false;
    };
    let leap_year = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let days_in_month = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap_year => 29,
        2 => 28,
        _ => return false,
    };
    if day == 0 || day > days_in_month {
        return false;
    }
    if bytes.len() == 10 {
        return true;
    }

    if bytes.len() < 20
        || bytes[10] != b'T'
        || bytes[13] != b':'
        || bytes[16] != b':'
        || bytes.last() != Some(&b'Z')
    {
        return false;
    }
    let (Some(hour), Some(minute), Some(second)) = (
        parse_two_digits(&bytes[11..13]),
        parse_two_digits(&bytes[14..16]),
        parse_two_digits(&bytes[17..19]),
    ) else {
        return false;
    };
    if hour > 23 || minute > 59 || second > 59 {
        return false;
    }

    bytes.len() == 20
        || (bytes[19] == b'.'
            && bytes[20..bytes.len() - 1].iter().all(u8::is_ascii_digit)
            && bytes.len() > 21)
}

fn parse_local_dataset_minimum_shape(contents: &str) -> Option<LocalDatasetMinimumShape> {
    let dataset = serde_json::from_str::<LocalDatasetMinimumShape>(contents).ok()?;
    if dataset.version.is_empty()
        || !local_dataset_date_has_minimum_shape(&dataset.date)
        || dataset._champion_data.is_empty
    {
        return None;
    }
    Some(dataset)
}

fn local_dataset_has_minimum_shape(contents: &str) -> bool {
    parse_local_dataset_minimum_shape(contents).is_some()
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
    if !local_dataset_has_minimum_shape(&current_patch) {
        return None;
    }
    let thirty_days = std::fs::read_to_string(pair_path.join("30-days.json")).ok()?;
    if !local_dataset_has_minimum_shape(&thirty_days) {
        return None;
    }

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

fn system_time_gap(left: SystemTime, right: SystemTime) -> Option<Duration> {
    left.duration_since(right)
        .or_else(|_| right.duration_since(left))
        .ok()
}

fn legacy_dataset_pair_is_compatible(
    current_patch: &str,
    thirty_days: &str,
    current_modified: SystemTime,
    thirty_days_modified: SystemTime,
) -> bool {
    let Some(current_shape) = parse_local_dataset_minimum_shape(current_patch) else {
        return false;
    };
    let Some(thirty_days_shape) = parse_local_dataset_minimum_shape(thirty_days) else {
        return false;
    };

    current_shape.version != "30"
        && thirty_days_shape.version == "30"
        && matches!(
            system_time_gap(current_modified, thirty_days_modified),
            Some(gap) if gap <= LEGACY_DATASET_MAX_MTIME_GAP
        )
}

fn read_legacy_local_dataset_pair(tier_path: &Path) -> Option<LocalDatasetPair> {
    let current_patch_path = tier_path.join("current-patch.json");
    let thirty_days_path = tier_path.join("30-days.json");
    let current_before = std::fs::metadata(&current_patch_path).ok()?;
    let thirty_days_before = std::fs::metadata(&thirty_days_path).ok()?;
    let current_patch = std::fs::read_to_string(&current_patch_path).ok()?;
    let thirty_days = std::fs::read_to_string(&thirty_days_path).ok()?;
    let current_after = std::fs::metadata(current_patch_path).ok()?;
    let thirty_days_after = std::fs::metadata(thirty_days_path).ok()?;
    let current_modified = current_before.modified().ok()?;
    let thirty_days_modified = thirty_days_before.modified().ok()?;

    // Do not accept a pair that changed while it was being inspected.
    if current_before.len() != current_after.len()
        || thirty_days_before.len() != thirty_days_after.len()
        || current_modified != current_after.modified().ok()?
        || thirty_days_modified != thirty_days_after.modified().ok()?
    {
        return None;
    }

    if !legacy_dataset_pair_is_compatible(
        &current_patch,
        &thirty_days,
        current_modified,
        thirty_days_modified,
    ) {
        return None;
    }

    Some(LocalDatasetPair {
        current_patch,
        thirty_days,
    })
}

fn legacy_dataset_pair_id() -> String {
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let counter = DATASET_TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("legacy-{now_ms}-{}-{counter}", std::process::id())
}

#[tauri::command]
fn load_local_dataset_pair(
    app: tauri::AppHandle,
    dataset_version: String,
    tier: String,
) -> Result<Option<LocalDatasetPair>, String> {
    let _checkpoint_guard = lock_dataset_checkpoints()?;
    let pairs_path = local_dataset_pairs_path(&app, &dataset_version, &tier)?;
    prune_expired_dataset_checkpoints(&app, &dataset_version, &tier)?;
    if let Some(pair) = read_local_dataset_pair(&pairs_path) {
        return Ok(Some(pair));
    }

    let tier_path = pairs_path
        .parent()
        .ok_or_else(|| "Local dataset tier directory has no parent".to_owned())?;
    let Some(legacy_pair) = read_legacy_local_dataset_pair(tier_path) else {
        return Ok(None);
    };

    // Keep the verified legacy files untouched. A failed migration can be
    // retried later, while this invocation can still use the validated pair.
    if let Err(error) = store_local_dataset_pair(
        &app,
        &dataset_version,
        &tier,
        &legacy_dataset_pair_id(),
        &legacy_pair.current_patch,
        &legacy_pair.thirty_days,
    ) {
        eprintln!("Could not migrate legacy local dataset pair: {error}");
    }

    Ok(Some(legacy_pair))
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
    )?;
    prune_expired_dataset_checkpoints(&app, &dataset_version, &tier)
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
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            get_champ_select_session,
            get_current_summoner,
            get_grid_champions,
            get_pickable_champion_ids,
            fetch_dataset_url,
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

    fn test_directory(name: &str) -> PathBuf {
        let test_id = DATASET_TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!(
            "draftgap-{name}-test-{}-{test_id}",
            std::process::id()
        ))
    }

    fn test_dataset(version: &str, label: &str) -> String {
        serde_json::json!({
            "version": version,
            "date": "2026-08-09T00:00:00.000Z",
            "championData": { "1": { "label": label } },
            "itemData": {},
            "runeData": {},
            "runePathData": {},
            "statShardData": {},
            "summonerSpellData": {},
        })
        .to_string()
    }

    #[test]
    fn lcu_parse_errors_never_echo_the_command_line_or_auth_token() {
        let auth_token = "super_secret_lcu_token";
        let command_line = format!(
            "LeagueClientUx.exe --remoting-auth-token={auth_token} --app-port=99999 --other=private"
        );

        let error = parse_league_lcu_command_line(&command_line).err().unwrap();
        assert_eq!(error, "League Client app port was invalid");
        assert!(!error.contains(auth_token));
        assert!(!error.contains(&command_line));

        let error = parse_league_lcu_command_line(&format!(
            "LeagueClientUx.exe --remoting-auth-token={auth_token}"
        ))
        .err()
        .unwrap();
        assert!(!error.contains(auth_token));
    }

    #[test]
    fn lcu_command_line_parser_extracts_connection_details() {
        let data = parse_league_lcu_command_line(
            "LeagueClientUx.exe --app-port=12345 --remoting-auth-token=test_token-1",
        )
        .unwrap();

        assert_eq!(data.port, 12345);
        assert_eq!(data.password, "test_token-1");
        assert_eq!(data.username, "riot");
    }

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
        let pairs_path = test_directory("pair");
        let old_current = test_dataset("16.15.1", "old-current");
        let old_thirty = test_dataset("30", "old-30");
        let new_current = test_dataset("16.15.1", "new-current");
        let new_thirty = test_dataset("30", "new-30");

        write_test_pair(&pairs_path, "old", 1, &old_current, Some(&old_thirty));
        write_test_pair(&pairs_path, "new", 2, "{", Some(&new_thirty));

        let fallback = read_local_dataset_pair(&pairs_path).unwrap();
        assert_eq!(fallback.current_patch, old_current);
        assert_eq!(fallback.thirty_days, old_thirty);

        std::fs::write(
            pairs_path.join("new").join("current-patch.json"),
            &new_current,
        )
        .unwrap();
        std::fs::write(
            pairs_path.join("new").join("30-days.json"),
            r#"{"version":"30","date":"2026-08-09T00:00:00.000Z"}"#,
        )
        .unwrap();
        let structurally_invalid_fallback = read_local_dataset_pair(&pairs_path).unwrap();
        assert_eq!(structurally_invalid_fallback.current_patch, old_current);
        assert_eq!(structurally_invalid_fallback.thirty_days, old_thirty);

        std::fs::write(pairs_path.join("new").join("30-days.json"), &new_thirty).unwrap();
        let newest = read_local_dataset_pair(&pairs_path).unwrap();
        assert_eq!(newest.current_patch, new_current);
        assert_eq!(newest.thirty_days, new_thirty);

        std::fs::remove_dir_all(pairs_path).unwrap();
    }

    #[test]
    fn dataset_minimum_shape_requires_at_least_one_champion() {
        let empty = serde_json::json!({
            "version": "16.15.1",
            "date": "2026-08-09T00:00:00.000Z",
            "championData": {},
            "itemData": {},
            "runeData": {},
            "runePathData": {},
            "statShardData": {},
            "summonerSpellData": {},
        })
        .to_string();

        assert!(!local_dataset_has_minimum_shape(&empty));
        assert!(local_dataset_has_minimum_shape(&test_dataset(
            "16.15.1", "valid"
        )));
    }

    #[test]
    fn legacy_pair_requires_compatible_versions_and_close_write_times() {
        let current_patch = test_dataset("16.15.1", "current");
        let thirty_days = test_dataset("30", "thirty-days");
        let base_time = UNIX_EPOCH + Duration::from_secs(10_000);

        assert!(legacy_dataset_pair_is_compatible(
            &current_patch,
            &thirty_days,
            base_time,
            base_time + LEGACY_DATASET_MAX_MTIME_GAP,
        ));
        assert!(!legacy_dataset_pair_is_compatible(
            &current_patch,
            &thirty_days,
            base_time,
            base_time + LEGACY_DATASET_MAX_MTIME_GAP + Duration::from_secs(1),
        ));
        assert!(!legacy_dataset_pair_is_compatible(
            &test_dataset("30", "wrong-current"),
            &thirty_days,
            base_time,
            base_time,
        ));
        assert!(!legacy_dataset_pair_is_compatible(
            &current_patch,
            &test_dataset("16.15.1", "wrong-thirty-days"),
            base_time,
            base_time,
        ));
    }

    #[test]
    fn legacy_pair_reader_does_not_modify_loose_files() {
        let tier_path = test_directory("legacy-pair");
        std::fs::create_dir_all(&tier_path).unwrap();
        let current_patch = test_dataset("16.15.1", "current");
        let thirty_days = test_dataset("30", "thirty-days");
        let current_path = tier_path.join("current-patch.json");
        let thirty_path = tier_path.join("30-days.json");
        std::fs::write(&current_path, &current_patch).unwrap();
        std::fs::write(&thirty_path, &thirty_days).unwrap();

        let pair = read_legacy_local_dataset_pair(&tier_path).unwrap();
        assert_eq!(pair.current_patch, current_patch);
        assert_eq!(pair.thirty_days, thirty_days);
        assert_eq!(
            std::fs::read_to_string(current_path).unwrap(),
            current_patch
        );
        assert_eq!(std::fs::read_to_string(thirty_path).unwrap(), thirty_days);

        std::fs::remove_dir_all(tier_path).unwrap();
    }

    #[test]
    fn checkpoint_cleanup_removes_expired_and_preserves_recent_checkpoints() {
        let tier_path = test_directory("checkpoint");
        let now_ms = 2 * LOCAL_DATASET_CHECKPOINT_MAX_AGE.as_millis() as u64;

        for (name, created_at_ms) in [
            (
                "current-patch",
                now_ms - LOCAL_DATASET_CHECKPOINT_MAX_AGE.as_millis() as u64 - 1,
            ),
            ("30-days", now_ms - 1),
        ] {
            let checkpoint_path = tier_path.join("checkpoints").join(name);
            std::fs::create_dir_all(checkpoint_path.join("champions")).unwrap();
            std::fs::write(
                checkpoint_path.join("meta.json"),
                serde_json::json!({
                    "formatVersion": 1,
                    "checkpointId": format!("{name}-checkpoint"),
                    "createdAt": "2026-08-09T00:00:00.000Z",
                    "createdAtMs": created_at_ms,
                })
                .to_string(),
            )
            .unwrap();
        }

        prune_expired_dataset_checkpoints_at(
            &tier_path,
            UNIX_EPOCH + Duration::from_millis(now_ms),
        );

        assert!(!tier_path.join("checkpoints").join("current-patch").exists());
        assert!(tier_path.join("checkpoints").join("30-days").exists());

        std::fs::remove_dir_all(tier_path).unwrap();
    }
}
