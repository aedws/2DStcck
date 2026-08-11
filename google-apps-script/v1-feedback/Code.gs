var CONFIG = Object.freeze({
  SHEET_NAME: "V1_Feedback",
  COOLDOWN_SECONDS: 30,
  MAX_TITLE_LENGTH: 80,
  MAX_CATEGORY_LENGTH: 40,
  MAX_DESCRIPTION_LENGTH: 2000,
  MAX_PLAYER_ID_LENGTH: 40,
  RESPONSE_SOURCE: "vstock-google-feedback",
});

var HEADERS = Object.freeze([
  "received_at",
  "request_id",
  "source",
  "player_id",
  "category",
  "title",
  "description",
  "page_url",
  "locale",
  "app_version",
  "status",
  "admin_note",
]);

/**
 * 최초 1회 실행한다. 바인딩된 스프레드시트 ID를 Script Properties에 저장하고
 * 접수 탭과 고정 헤더를 준비한다.
 */
function setupFeedbackSheet() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error("Google Sheet에서 확장 프로그램 > Apps Script로 열어 실행해 주세요.");
  }
  PropertiesService.getScriptProperties().setProperty(
    "SPREADSHEET_ID",
    spreadsheet.getId(),
  );
  var sheet = getOrCreateSheet_(spreadsheet);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
  sheet.autoResizeColumns(1, HEADERS.length);
}

function doGet() {
  return ContentService.createTextOutput(
    JSON.stringify({ ok: true, service: "vstock-v1-feedback" }),
  ).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var requestId = cleanText_(parameter_(e, "request_id"), 80);
  try {
    if (parameter_(e, "website")) {
      return responseHtml_(requestId, false, "rejected", "요청을 처리할 수 없습니다.");
    }

    var clientId = cleanText_(parameter_(e, "client_id"), 100);
    var source = cleanText_(parameter_(e, "source"), 20);
    var playerId = cleanText_(parameter_(e, "player_id"), CONFIG.MAX_PLAYER_ID_LENGTH);
    var category = cleanText_(parameter_(e, "category"), CONFIG.MAX_CATEGORY_LENGTH);
    var title = cleanText_(parameter_(e, "title"), CONFIG.MAX_TITLE_LENGTH);
    var description = cleanText_(
      parameter_(e, "description"),
      CONFIG.MAX_DESCRIPTION_LENGTH,
    );
    var pageUrl = cleanText_(parameter_(e, "page_url"), 500);
    var locale = cleanText_(parameter_(e, "locale"), 20);
    var appVersion = cleanText_(parameter_(e, "app_version"), 60);

    if (!/^[a-z0-9-]{16,80}$/i.test(requestId) || !clientId || !title) {
      return responseHtml_(requestId, false, "invalid", "필수 항목이 올바르지 않습니다.");
    }

    var cache = CacheService.getScriptCache();
    var cooldownKey = "cooldown:" + digest_(clientId);
    if (cache.get(cooldownKey)) {
      return responseHtml_(
        requestId,
        false,
        "cooldown",
        "30초 후 다시 제출해 주세요.",
      );
    }

    var lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) {
      return responseHtml_(requestId, false, "busy", "접수가 몰리고 있습니다. 잠시 후 다시 시도해 주세요.");
    }
    try {
      var spreadsheet = openSpreadsheet_();
      var sheet = getOrCreateSheet_(spreadsheet);
      if (hasRequestId_(sheet, requestId)) {
        return responseHtml_(requestId, true, "duplicate", "이미 접수된 요청입니다.");
      }

      var row = [
        Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss"),
        requestId,
        source || "v1",
        playerId,
        category,
        title,
        description,
        pageUrl,
        locale,
        appVersion,
        "open",
        "",
      ].map(safeCell_);
      var target = sheet.getRange(sheet.getLastRow() + 1, 1, 1, HEADERS.length);
      target.setNumberFormat("@");
      target.setValues([row]);
      SpreadsheetApp.flush();
      cache.put(cooldownKey, "1", CONFIG.COOLDOWN_SECONDS);
    } finally {
      lock.releaseLock();
    }

    return responseHtml_(requestId, true, "created", "피드백이 접수되었습니다.");
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return responseHtml_(requestId, false, "server_error", "저장 중 오류가 발생했습니다.");
  }
}

function parameter_(event, name) {
  return event && event.parameter && event.parameter[name]
    ? String(event.parameter[name])
    : "";
}

function cleanText_(value, maxLength) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, maxLength);
}

/** 셀 수식으로 평가될 수 있는 사용자 입력은 문자열로 강제한다. */
function safeCell_(value) {
  var text = String(value == null ? "" : value);
  return /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
}

function digest_(value) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    value,
    Utilities.Charset.UTF_8,
  );
  return Utilities.base64EncodeWebSafe(bytes).slice(0, 32);
}

function openSpreadsheet_() {
  var spreadsheetId = PropertiesService.getScriptProperties().getProperty(
    "SPREADSHEET_ID",
  );
  if (!spreadsheetId) {
    throw new Error("SPREADSHEET_ID가 없습니다. setupFeedbackSheet를 먼저 실행하세요.");
  }
  return SpreadsheetApp.openById(spreadsheetId);
}

function getOrCreateSheet_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(CONFIG.SHEET_NAME);
  var headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
  var current = headerRange.getDisplayValues()[0];
  if (sheet.getLastRow() === 0 || current.join("|") !== HEADERS.join("|")) {
    if (sheet.getLastRow() > 0 && current.some(function (value) { return value; })) {
      throw new Error("기존 헤더가 예상 구조와 다릅니다. 별도 탭을 사용해 주세요.");
    }
    headerRange.setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function hasRequestId_(sheet, requestId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  return Boolean(
    sheet
      .getRange(2, 2, lastRow - 1, 1)
      .createTextFinder(requestId)
      .matchEntireCell(true)
      .findNext(),
  );
}

function responseHtml_(requestId, success, code, message) {
  var payload = JSON.stringify({
    source: CONFIG.RESPONSE_SOURCE,
    requestId: requestId,
    success: success,
    code: code,
    message: message,
  }).replace(/</g, "\\u003c");
  var output = HtmlService.createHtmlOutput(
    "<!doctype html><meta charset=\"utf-8\"><script>" +
      "window.top.postMessage(" + payload + ", '*');" +
      "</script>",
  );
  return output.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
