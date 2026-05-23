const DEFAULT_CONFIG = {
  spreadsheetId: '1OpY8f4kVncwmATe9X8qZ-ibGj64TnwkeHv1CPrpkOYc',
  sheetName: '表單回覆 2',
  publishedFormUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSeFfBA405xEHrmRQxYPPLQwzewTGJsYLEJDA-BPsG4cDc27Tw/viewform?usp=dialog',

  // Use the ID from the Google Form edit URL:
  // https://docs.google.com/forms/d/FORM_ID/edit
  formId: 'PASTE_FORM_EDIT_ID_HERE',
  adminPasscode: 'admin-change-me',
  adminPhone: '',

  columns: {
    timestamp: '時間戳記',
    name: '參加蓮友姓名',
    dharmaName: '法名',
    phone: '手機',
    systemKey: '系統Key',
    editUrl: '修改連結',
  },
};

const CONFIG_PROPERTY_KEY = 'EVENT_MANAGER_CONFIG';
const CONFIG = getConfig_();

function doGet(e) {
  const page = e && e.parameter && e.parameter.page === 'admin' ? 'Admin' : 'Index';
  const title = page === 'Admin' ? '活動報名管理後台' : '活動報名查詢';

  return HtmlService.createTemplateFromFile(page)
    .evaluate()
    .setTitle(title)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getBootstrap() {
  return {
    formUrl: CONFIG.publishedFormUrl,
    keyFields: getKeyFieldLabels_(),
    dharmaNameColumn: CONFIG.columns.dharmaName,
    adminPhone: CONFIG.adminPhone || '',
  };
}

function getAdminConfig(input) {
  assertAdmin_(input && input.adminPasscode);
  const spreadsheet = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const sheetNames = spreadsheet.getSheets().map((sheet) => sheet.getName());
  return {
    config: withoutSecrets_(CONFIG),
    sheetNames,
    adminUrlHint: ScriptApp.getService().getUrl() ? `${ScriptApp.getService().getUrl()}?page=admin` : '',
  };
}

function saveAdminConfig(input) {
  assertAdmin_(input && input.currentAdminPasscode);
  const nextConfig = mergeConfig_(DEFAULT_CONFIG, {
    spreadsheetId: cleanString_(input.spreadsheetId),
    sheetName: cleanString_(input.sheetName),
    publishedFormUrl: cleanString_(input.publishedFormUrl),
    formId: extractFormId_(input.formId || input.formEditUrl),
    adminPasscode: cleanString_(input.newAdminPasscode) || CONFIG.adminPasscode,
    adminPhone: cleanString_(input.adminPhone),
    columns: {
      timestamp: cleanString_(input.timestampColumn),
      name: cleanString_(input.nameColumn),
      dharmaName: cleanString_(input.dharmaNameColumn),
      phone: cleanString_(input.phoneColumn),
      systemKey: cleanString_(input.systemKeyColumn),
      editUrl: cleanString_(input.editUrlColumn),
    },
  });

  validateConfig_(nextConfig);
  PropertiesService.getScriptProperties().setProperty(CONFIG_PROPERTY_KEY, JSON.stringify(nextConfig));

  return {
    ok: true,
    message: '設定已儲存。重新整理前台後會套用新設定。',
    config: withoutSecrets_(nextConfig),
  };
}

function resetAdminConfig(input) {
  assertAdmin_(input && input.adminPasscode);
  PropertiesService.getScriptProperties().deleteProperty(CONFIG_PROPERTY_KEY);
  return {
    ok: true,
    message: '已還原為程式內的預設設定。',
    config: withoutSecrets_(DEFAULT_CONFIG),
  };
}

function lookupRegistration(input) {
  const key = buildKeyFromInput_(input);
  if (!key) {
    return {
      ok: false,
      message: '請完整填寫識別欄位。',
    };
  }

  const data = getRegistrationRows_();
  const matches = data.rows.filter((row) => rowMatchesInput_(row, input, key));

  if (matches.length >= 2) {
    return {
      ok: true,
      found: true,
      multiple: true,
      adminPhone: CONFIG.adminPhone || '',
      message: '此組資料查詢到多筆報名紀錄，請聯繫管理員協助確認。',
    };
  }

  if (!matches.length) {
    return {
      ok: true,
      found: false,
      formUrl: getPrefilledFormUrl_(input),
      message: '查無既有報名資料，請直接填寫新報名表。',
    };
  }

  let latest = sortRowsByTimestampDesc_(matches)[0];
  latest = ensureEditUrlForRow_(latest, data, input, key);

  return {
    ok: true,
    found: true,
    registration: publicRegistration_(latest),
  };
}

function onFormSubmit(e) {
  const response = e && e.response ? e.response : null;
  const editUrl = response ? response.getEditResponseUrl() : '';
  const timestamp = response ? response.getTimestamp() : null;
  const answers = response ? getResponseAnswers_(response) : {};

  const data = getRegistrationRows_();
  const key = buildKey_(
    answers[CONFIG.columns.name],
    answers[CONFIG.columns.dharmaName],
    answers[CONFIG.columns.phone]
  );
  const rowNumber = findSubmittedRow_(data.rows, timestamp, key, responseInputFromAnswers_(answers)) || data.sheet.getLastRow();

  if (key) {
    data.sheet.getRange(rowNumber, data.headerMap[CONFIG.columns.systemKey] + 1).setValue(key);
  }
  if (editUrl) {
    data.sheet.getRange(rowNumber, data.headerMap[CONFIG.columns.editUrl] + 1).setValue(editUrl);
  }
}

function backfillEditUrls() {
  if (!CONFIG.formId || CONFIG.formId === 'PASTE_FORM_EDIT_ID_HERE') {
    throw new Error('請先到管理後台填入 Google Form 編輯網址或 FORM_ID。');
  }

  const form = FormApp.openById(CONFIG.formId);
  const responses = form.getResponses();
  const data = getRegistrationRows_();
  let updatedCount = 0;

  responses.forEach((response) => {
    const answers = getResponseAnswers_(response);
    const key = buildKey_(
      answers[CONFIG.columns.name],
      answers[CONFIG.columns.dharmaName],
      answers[CONFIG.columns.phone]
    );
    const rowNumber = findSubmittedRow_(data.rows, response.getTimestamp(), key, responseInputFromAnswers_(answers));

    if (!rowNumber) return;

    data.sheet.getRange(rowNumber, data.headerMap[CONFIG.columns.systemKey] + 1).setValue(key);
    data.sheet.getRange(rowNumber, data.headerMap[CONFIG.columns.editUrl] + 1).setValue(response.getEditResponseUrl());
    updatedCount += 1;
  });

  return `已補寫 ${updatedCount} 筆修改連結。`;
}

function adminBackfillEditUrls(input) {
  assertAdmin_(input && input.adminPasscode);
  return {
    ok: true,
    message: backfillEditUrls(),
  };
}

function ensureEditUrlForRow_(row, data, input, key) {
  if (row.editUrl || !CONFIG.formId || CONFIG.formId === 'PASTE_FORM_EDIT_ID_HERE') return row;

  try {
    const form = FormApp.openById(CONFIG.formId);
    const rowTimestamp = row[CONFIG.columns.timestamp] ? new Date(row[CONFIG.columns.timestamp]).getTime() : null;
    const responses = form.getResponses();

    for (let i = 0; i < responses.length; i += 1) {
      const response = responses[i];
      const answers = getResponseAnswers_(response);
      const responseInput = responseInputFromAnswers_(answers);
      const responseKey = buildKey_(responseInput.name, responseInput.dharmaName, responseInput.phone);
      const responseTime = response.getTimestamp() ? new Date(response.getTimestamp()).getTime() : null;
      const sameTimestamp = rowTimestamp && responseTime && Math.abs(rowTimestamp - responseTime) < 2000;
      const sameKey = responseKey === key && rowMatchesInput_(row, input, key);

      if (!sameTimestamp && !sameKey) continue;

      const editUrl = response.getEditResponseUrl();
      if (!editUrl) return row;

      data.sheet.getRange(row.rowNumber, data.headerMap[CONFIG.columns.systemKey] + 1).setValue(key);
      data.sheet.getRange(row.rowNumber, data.headerMap[CONFIG.columns.editUrl] + 1).setValue(editUrl);
      row.systemKey = key;
      row.editUrl = editUrl;
      return row;
    }
  } catch (error) {
    return row;
  }

  return row;
}

function getRegistrationRows_() {
  const spreadsheet = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const sheet = spreadsheet.getSheetByName(CONFIG.sheetName);
  if (!sheet) throw new Error(`找不到工作表：${CONFIG.sheetName}`);

  const headerMap = ensureSystemColumns_(sheet);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const rows = values.slice(1)
    .map((valuesRow, index) => rowObject_(headers, valuesRow, index + 2))
    .filter((row) => hasAnyValue_(row));

  return { sheet, headerMap, rows };
}

function ensureSystemColumns_(sheet) {
  const required = [
    CONFIG.columns.systemKey,
    CONFIG.columns.editUrl,
  ];

  let headers = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
  required.forEach((header) => {
    if (headers.indexOf(header) === -1) {
      sheet.getRange(1, headers.length + 1).setValue(header);
      headers.push(header);
    }
  });

  return headers.reduce((map, header, index) => {
    map[header] = index;
    return map;
  }, {});
}

function rowObject_(headers, valuesRow, rowNumber) {
  const row = { rowNumber };
  headers.forEach((header, index) => {
    row[header] = valuesRow[index];
  });
  row.systemKey = row[CONFIG.columns.systemKey];
  row.editUrl = row[CONFIG.columns.editUrl];
  return row;
}

function publicRegistration_(row) {
  return {
    name: row[CONFIG.columns.name] || '',
    dharmaName: row[CONFIG.columns.dharmaName] || '',
    phone: row[CONFIG.columns.phone] || '',
    editUrl: row.editUrl || '',
    timestamp: formatDate_(row[CONFIG.columns.timestamp]),
  };
}

function getResponseAnswers_(response) {
  return response.getItemResponses().reduce((answers, itemResponse) => {
    answers[itemResponse.getItem().getTitle()] = itemResponse.getResponse();
    return answers;
  }, {});
}

function getPrefilledFormUrl_(input) {
  if (!CONFIG.formId || CONFIG.formId === 'PASTE_FORM_EDIT_ID_HERE') {
    return CONFIG.publishedFormUrl;
  }

  try {
    const form = FormApp.openById(CONFIG.formId);
    const response = form.createResponse();
    const valuesByTitle = {};

    valuesByTitle[CONFIG.columns.name] = input && input.name;
    valuesByTitle[CONFIG.columns.dharmaName] = input && input.dharmaName;
    valuesByTitle[CONFIG.columns.phone] = input && input.phone;

    form.getItems().forEach((item) => {
      const value = valuesByTitle[item.getTitle()];
      if (!value) return;

      const itemResponse = createPrefillItemResponse_(item, value);
      if (itemResponse) response.withItemResponse(itemResponse);
    });

    return response.toPrefilledUrl();
  } catch (error) {
    return CONFIG.publishedFormUrl;
  }
}

function createPrefillItemResponse_(item, value) {
  const type = item.getType();
  const text = String(value || '').trim();

  if (type === FormApp.ItemType.TEXT) {
    return item.asTextItem().createResponse(text);
  }

  if (type === FormApp.ItemType.PARAGRAPH_TEXT) {
    return item.asParagraphTextItem().createResponse(text);
  }

  return null;
}

function findSubmittedRow_(rows, timestamp, key, input) {
  const targetTime = timestamp ? new Date(timestamp).getTime() : null;
  const timestampMatches = rows.filter((row) => {
    const rowTime = row[CONFIG.columns.timestamp] ? new Date(row[CONFIG.columns.timestamp]).getTime() : null;
    return targetTime && rowTime && Math.abs(rowTime - targetTime) < 2000;
  });

  if (timestampMatches.length === 1) return timestampMatches[0].rowNumber;
  if (key) {
    const keyMatches = rows.filter((row) => rowMatchesInput_(row, input, key));
    if (keyMatches.length) return sortRowsByTimestampDesc_(keyMatches)[0].rowNumber;
  }

  return null;
}

function responseInputFromAnswers_(answers) {
  return {
    name: answers[CONFIG.columns.name],
    dharmaName: answers[CONFIG.columns.dharmaName],
    phone: answers[CONFIG.columns.phone],
  };
}

function sortRowsByTimestampDesc_(rows) {
  return rows.slice().sort((a, b) => {
    const aTime = a[CONFIG.columns.timestamp] ? new Date(a[CONFIG.columns.timestamp]).getTime() : 0;
    const bTime = b[CONFIG.columns.timestamp] ? new Date(b[CONFIG.columns.timestamp]).getTime() : 0;
    return bTime - aTime;
  });
}

function buildKeyFromInput_(input) {
  return buildKey_(input && input.name, input && input.dharmaName, input && input.phone);
}

function buildKeyFromRow_(row) {
  return buildKey_(row[CONFIG.columns.name], row[CONFIG.columns.dharmaName], row[CONFIG.columns.phone]);
}

function rowMatchesInput_(row, input, inputKey) {
  if (buildKeyFromRow_(row) === inputKey) return true;

  const inputDharmaName = normalizeDharmaName_(input && input.dharmaName);
  const rowDharmaName = normalizeDharmaName_(row[CONFIG.columns.dharmaName]);
  const storedKey = String(row.systemKey || '');

  // When the user says there is no dharma name, legacy rows with a 2-part key
  // should still match. When a dharma name is supplied, require exact dharma name.
  if (inputDharmaName) {
    if (storedKey === inputKey && storedKey.split('|').length === 3) return true;

    return normalizeText_(row[CONFIG.columns.name]) === normalizeText_(input && input.name)
      && rowDharmaName === inputDharmaName
      && normalizePhone_(row[CONFIG.columns.phone]) === normalizePhone_(input && input.phone);
  }

  if (storedKey === inputKey && storedKey.split('|').length === 2 && !rowDharmaName) return true;

  return !rowDharmaName
    && normalizeText_(row[CONFIG.columns.name]) === normalizeText_(input && input.name)
    && normalizePhone_(row[CONFIG.columns.phone]) === normalizePhone_(input && input.phone);
}

function buildKey_(name, dharmaName, phone) {
  const normalizedDharmaName = normalizeDharmaName_(dharmaName);
  const parts = normalizedDharmaName
    ? [normalizeText_(name), normalizedDharmaName, normalizePhone_(phone)]
    : [normalizeText_(name), normalizePhone_(phone)];

  if (parts.some((part) => !part)) return '';
  return parts.join('|');
}

function normalizeText_(value) {
  return String(value || '').trim().replace(/\s+/g, '').toLowerCase();
}

function normalizePhone_(value) {
  return String(value || '').replace(/[^\d]/g, '');
}

function normalizeDharmaName_(value) {
  const text = normalizeText_(value);
  if (['無', '无', '沒有', '沒有法名', '無法名', '无法名', 'no', 'none'].indexOf(text) !== -1) {
    return '';
  }

  return text;
}

function hasAnyValue_(row) {
  return Object.keys(row).some((key) => key !== 'rowNumber' && row[key] !== '' && row[key] !== null && row[key] !== undefined);
}

function formatDate_(value) {
  if (!value) return '';
  return Utilities.formatDate(new Date(value), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm');
}

function ensureConfiguredSheet_() {
  const data = getRegistrationRows_();
  return {
    ok: true,
    message: `已確認工作表「${data.sheet.getName()}」與系統欄位。`,
  };
}

function getConfig_() {
  const stored = PropertiesService.getScriptProperties().getProperty(CONFIG_PROPERTY_KEY);
  if (!stored) return DEFAULT_CONFIG;

  try {
    return mergeConfig_(DEFAULT_CONFIG, JSON.parse(stored));
  } catch (error) {
    return DEFAULT_CONFIG;
  }
}

function mergeConfig_(base, override) {
  const merged = Object.assign({}, base, override || {});
  merged.columns = Object.assign({}, base.columns, override && override.columns ? override.columns : {});
  return merged;
}

function validateConfig_(config) {
  const required = [
    ['spreadsheetId', 'Google Sheet ID'],
    ['sheetName', '回覆工作表名稱'],
    ['publishedFormUrl', '公開填寫連結'],
    ['formId', 'Google Form 編輯 ID'],
  ];

  required.forEach(([key, label]) => {
    if (!config[key] || config[key] === 'PASTE_FORM_EDIT_ID_HERE') {
      throw new Error(`請填寫${label}。`);
    }
  });

  getKeyFieldLabels_(config).forEach((field) => {
    if (!field.column) throw new Error(`請填寫 ${field.label} 欄位名稱。`);
  });
}

function getKeyFieldLabels_(config) {
  config = config || CONFIG;
  return [
    { id: 'name', label: '參加蓮友姓名', column: config.columns.name },
    { id: 'phone', label: '手機', column: config.columns.phone },
  ];
}

function extractFormId_(value) {
  const text = cleanString_(value);
  if (!text) return '';

  const match = text.match(/\/forms\/d\/([^/]+)\//);
  if (match) return match[1];

  return text;
}

function cleanString_(value) {
  return String(value || '').trim();
}

function assertAdmin_(passcode) {
  if (!CONFIG.adminPasscode || CONFIG.adminPasscode === 'admin-change-me') {
    if (passcode === 'admin-change-me') return;
  }

  if (String(passcode || '') !== String(CONFIG.adminPasscode || '')) {
    throw new Error('管理密碼錯誤。');
  }
}

function withoutSecrets_(config) {
  const copy = mergeConfig_(DEFAULT_CONFIG, config);
  copy.adminPasscode = '';
  return copy;
}
