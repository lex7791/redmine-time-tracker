// Элементы DOM
const apiKeyInput = document.getElementById('apiKey');
const redmineUrlInput = document.getElementById('redmineUrl');

const timeGridElement = document.getElementById('timeGrid');
const loadingElem = document.getElementById('loading');

// кнопки управления
const saveSettingsBtn = document.getElementById('saveSettings');
const prevWeekBtn = document.getElementById('prevWeek');
const nextWeekBtn = document.getElementById('nextWeek');
const addTimeBtn = document.getElementById('addTime');

// поля ввода
const taskIdInput = document.getElementById('taskId');
const taskDateInput = document.getElementById('taskDate');
const taskNumberInput = document.getElementById('taskNumber');
const taskTimeInput = document.getElementById('taskTime');
const taskCommentInput = document.getElementById('taskComment');
const taskActivityInput = document.getElementById('taskActivity');

timeEntries = {};
issuesData = {};
let editingTimeEntryId = null;
const locale = chrome.i18n.getUILanguage().startsWith('ru') ? 'ru-RU' : 'en-US';

function t(key, substitutions) {
  return chrome.i18n.getMessage(key, substitutions) || key;
}

function localizeStaticHtml() {
  document.querySelectorAll('[data-i18n]').forEach(element => {
    element.textContent = t(element.dataset.i18n);
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  });
}

// текущая отображаемая неделя
const today = new Date();
let currentWeekStart = getMonday(new Date());

function initApp() {
  localizeStaticHtml();
  setActivities();
  fetchTimeEntries();
  clearFastInputs();
}

chrome.storage.sync.get(['apiKey', 'redmineUrl'], (data) => {
  apiKeyInput.value = data.apiKey || '';
  redmineUrlInput.value = data.redmineUrl || '';

  if (data.apiKey && data.redmineUrl) {
    initApp();
  } else {
    localizeStaticHtml();
    alert(t('missingSettingsAlert'));
  }
});

function setApiKey() {
  const apiKey = apiKeyInput.value.trim();
  const redmineUrl = redmineUrlInput.value.trim();

  if (!redmineUrl) {
    alert(t('missingRedmineUrlAlert'));
    return false;
  }

  if (!apiKey) {
    alert(t('missingApiKeyAlert'));
    return false;
  }

  chrome.storage.sync.set({ apiKey, redmineUrl });
  return true;
}

async function getApiKey() {
  const data = await chrome.storage.sync.get(['apiKey', 'redmineUrl']);
  return { apiKey: data.apiKey, redmineUrl: data.redmineUrl };
}

// Сохраняем настройки
saveSettingsBtn.addEventListener('click', () => {
  if (!setApiKey()) {
    return;
  }

  initApp();
  alert(t('settingsSavedAlert'));
});

// Запрос к Redmine API
async function fetchTimeEntries() {
  try {
    showLoader();

    // получаем даты текущей недели
    const weekDates = getWeekDates(currentWeekStart);
    const fromDate = weekDates[0].toISOString().split('T')[0];
    const toDate = weekDates[6].toISOString().split('T')[0];

    // получаем список записей времени
    const { time_entries } = await getTimeEntries(fromDate, toDate) || {};

    // получаем список задач из списка
    const issuesIds = new Set();
    time_entries?.map(entry => {
      timeEntries[entry.id] = entry;
      issuesIds.add(entry?.issue?.id) || null
    })

    if (issuesIds?.size) {
      const { issues } = await getIssues([...issuesIds]) || {};
      issues?.map(issue => {
        issuesData[issue.id] = issue;
      })
    }

    // выводим в таблицу
    displayTimeEntries(time_entries, issuesData, weekDates);
  } catch (error) {
    timeGridElement.innerHTML = `<p class="error">${t('errorPrefix')}: ${error.message}</p>`;
    hideLoader();
  }
}

// Получение понедельника для указанной даты
function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Приводим к понедельнику
  return new Date(d.setDate(diff));
}

// Получение дат недели
function getWeekDates(startDate) {
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    dates.push(date);
  }
  return dates;
}

// Форматирование даты
function formatDate(date) {
  const options = { day: 'numeric', month: 'short' };
  return date.toLocaleDateString(locale, options);
}

// Форматирование дня недели
function getWeekDayName(date) {
  const options = { weekday: 'short' };
  return date.toLocaleDateString(locale, options);
}

function convertDateToISODate(date) {
  return date.toISOString().slice(0, 10)
}

function showLoader() {
  loadingElem.style.visibility = 'visible';
}

function hideLoader() {
  loadingElem.style.visibility = 'hidden';
}

// Отображение записей в таблице
async function displayTimeEntries(entries, issuesData, weekDates) {
  const { redmineUrl } = await getApiKey();
  // Группируем записи по дням недели
  const daysData = weekDates.map(date => {
    const dateStr = date.toISOString().split('T')[0];
    return {
      date,
      dateStr,
      dayName: getWeekDayName(date),
      formattedDate: formatDate(date),
      entries: entries?.filter(entry => entry.spent_on === dateStr) || [],
      totalHours: 0
    };
  });

  // Рассчитываем общее количество часов для каждого дня
  daysData.forEach(day => {
    day.totalHours = day.entries.reduce((sum, entry) => sum + entry.hours, 0);
  });

  // Создаём HTML для сетки
  timeGridElement.innerHTML = `
    <div class="grid-header">
      ${daysData.map(day => `
        <div class="day-header">
          <div>
           <span class="day-name">${day.dayName}</span>, <span class="day-date">${day.formattedDate}</span>
          </div>
          
          <div class="day-total ${day.totalHours >= 8 ? '_success' : '_warning'}">${formatTime(day.totalHours.toFixed(2))}</div>
        </div>
      `).join('')}
    </div>
    <div class="grid-body">
      ${daysData.map(day => `
        <div class="day-column">
          ${day.entries.map(entry => {
    const issue = issuesData?.[entry.issue.id];
    return `
            <div class="time-entry">
              <a class="entry-key link" target="_blank" href="${redmineUrl}/issues/${issue?.key}">${issue?.key}</a>
              <div class="entry-title hint" data-tooltip="${issue?.subject}">
                <a class="entry-task link" target="_blank" href="${redmineUrl}/issues/${issue?.key}">${issue?.subject}</a>
              </div>             
              <div class="entry-body">
                <div class="entry-comment">${entry.comments}</div>
              </div>
              <div class="entry-bottom">
                <span class="entry-hour _success">${formatTime(entry.hours)}</span>
                <div class="entry-btn delete-btn hint" data-tooltip="${t('deleteEntryTooltip')}" data-id="${entry?.id}">
                    <svg><use href="#delete-icon"></use></svg>
                </div>
                <div class="entry-btn edit-btn hint" data-tooltip="${t('editEntryTooltip')}" data-id="${entry?.id}">
                    <svg><use href="#edit-icon"></use></svg>
                </div>
                <div class="entry-btn copy-btn hint" data-tooltip="${t('copyEntryTooltip')}" data-id="${entry?.id}">
                    <svg><use href="#copy-icon"></use></svg>
                </div>
              </div>
            </div>
          `
  }).join('')}
          ${day.entries.length === 0 ? `<div class="no-entries">${t('noEntries')}</div>` : ''}
        </div>
      `).join('')}
    </div>
  `;

  hideLoader();
}

async function setActivities() {
  const { time_entry_activities } = await getActivities();

  // Заполняем select деятельностями
  taskActivityInput.innerHTML = `<option value="">${t('emptyActivityOption')}</option>`;

  time_entry_activities.forEach(activity => {
    const option = document.createElement('option');
    option.value = activity.id;
    option.textContent = activity.name;
    taskActivityInput.appendChild(option);
  });
}

// Переключение недель
prevWeekBtn.addEventListener('click', () => {
  currentWeekStart.setDate(currentWeekStart.getDate() - 7);
  fetchTimeEntries();
});

nextWeekBtn.addEventListener('click', () => {
  currentWeekStart.setDate(currentWeekStart.getDate() + 7);
  fetchTimeEntries();
});

timeGridElement.addEventListener('click', async (event) => {
  const button = event.target.closest('.entry-btn');

  if (!button) {
    return;
  }

  if (button.classList.contains('copy-btn')) {
    const entryId = button.dataset.id;
    const entry = timeEntries?.[entryId];
    const issue = issuesData?.[entry.issue.id];
    copy(issue.id, convertDateToISODate(today), issue.key, entry.hours, entry.comments, entry.activity.id);
    event.stopPropagation();
  }

  if (button.classList.contains('edit-btn')) {
    const entryId = button.dataset.id;
    const entry = timeEntries?.[entryId];
    const issue = issuesData?.[entry.issue.id];
    edit(entry.id, issue.id, entry.spent_on, issue.key, entry.hours, entry.comments, entry.activity.id);
    event.stopPropagation();
  }

  if (button.classList.contains('delete-btn')) {
    showLoader();
    const entryId = button.dataset.id;
    await deleteTime(entryId);
    await fetchTimeEntries(); // обновляем таблицу
    hideLoader();
    event.stopPropagation();
  }
})

function copy(id, date, key, hours, comment, activityCode) {
  editingTimeEntryId = null;
  addTimeBtn.textContent = t('addTime');
  fillFastInputs(id, date, key, hours, comment, activityCode);
}

function edit(entryId, id, date, key, hours, comment, activityCode) {
  editingTimeEntryId = entryId;
  addTimeBtn.textContent = t('editTime');
  fillFastInputs(id, date, key, hours, comment, activityCode);
}

function fillFastInputs(id, date, key, hours, comment, activityCode) {
  taskIdInput.value = id;
  taskDateInput.value = date;
  taskNumberInput.value = key;
  taskTimeInput.value = hours;
  taskCommentInput.value = comment;
  taskActivityInput.value = activityCode;
}

function clearFastInputs() {
  taskIdInput.value = '';
  taskDateInput.value = convertDateToISODate(today);
  taskNumberInput.value = '';
  taskTimeInput.value = '';
  taskCommentInput.value = '';
  taskActivityInput.value = '';
  editingTimeEntryId = null;
  addTimeBtn.textContent = t('addTime');
}

function formatTime(time) {
  // Удаляем пробелы и приводим к нижнему регистру
  time = time.toString().trim().toLowerCase().replace(/\s+/g, '');

  let totalMinutes = 0;

  // Парсим формат вроде "1h15m"
  const timeMatch = time.match(/(\d+(?:\.\d+)?)([hmdw])$/i);
  if (timeMatch) {
    const value = parseFloat(timeMatch[1]);
    const unit = timeMatch[2].toLowerCase();
    switch (unit) {
      case 'w': totalMinutes = value * 40 * 60; break; // неделя ~40ч
      case 'd': totalMinutes = value * 8 * 60; break;
      case 'h': totalMinutes = value * 60; break;
      case 'm': totalMinutes = value; break;
    }
  } else {
    // Парсим десятичные часы "1.25"
    const decimalMatch = time.match(/^(\d+(?:\.\d+)?)$/);
    if (decimalMatch) {
      totalMinutes = parseFloat(decimalMatch[1]) * 60;
    }
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.floor(totalMinutes % 60);

  let result = '';
  if (hours > 0) {
    result += t('hoursShort', [hours.toString()]);
  }
  if (minutes > 0) {
    if (result) result += ' ';
    result += t('minutesShort', [minutes.toString()]);
  }

  return result || t('zeroHours');
}

addTimeBtn.addEventListener('click', async () => {
  const taskKey = taskNumberInput.value.trim();
  const taskDate = taskDateInput.value.trim();
  const taskTime = taskTimeInput.value.trim();
  const taskComment = taskCommentInput.value.trim();
  const taskActivity = taskActivityInput.value.trim();

  try {
    if (!taskDate || !taskKey || !taskTime || !taskActivity) {
      return;
    }

    showLoader();

    const { issue } = await getIssueByKey(taskKey) || {}

    if (issue) {
      const entry = {
        issue_id: issue.id,
        spent_on: taskDate,
        hours: taskTime,
        activity_id: taskActivity, // созвоны
        comments: taskComment
      }

      if (editingTimeEntryId) {
        await updateTime(editingTimeEntryId, entry); // обновляем время
      } else {
        await addTime(entry); // добавляем время
      }

      await fetchTimeEntries(); // обновляем таблицу
      clearFastInputs(); // чистим поля быстрого ввода

      hideLoader();
    }
  } catch (e) {
    hideLoader();
  }


});

// API

async function request(urlPath, params, method = 'GET') {
  const { apiKey, redmineUrl } = await getApiKey();

  try {
    const response = await fetch(`${redmineUrl}/${urlPath}`, {
      headers: { 'X-Redmine-API-Key': apiKey, 'Content-Type': 'application/json' },
      body: params ? JSON.stringify(params) : null,
      method: method,
    });

    if (!response.ok) throw new Error(t('apiError'));

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json') && response.headers.get('content-length') !== '0') {
      return response.json();
    } else {
      return null;
    }
  } catch (e) {
    timeGridElement.innerHTML = `<p class="error">${t('errorPrefix')}: ${e.message}</p>`;
  }
}

// получить часы по задачам
async function getTimeEntries(fromDate, toDate) {
  const url = `time_entries.json?user_id=me&from=${fromDate}&to=${toDate}&limit=100`;
  return request(url);
}

// получение списка активностей
async function getActivities() {
  const url = `/enumerations/time_entry_activities.json`;
  return request(url);
}

// получение задач по списку id
async function getIssues(issuesIds) {
  const url = `issues.json?status_id=*&issue_id=${issuesIds.join(',')}`;
  return request(url);
}

// получить задачу по ее ключу
async function getIssueByKey(key) {
  const url = `issues/${key}.json`;
  return request(url);
}

// добавление времени
async function addTime(entry) {
  const params = { time_entry: entry };
  const url = `time_entries.json`;
  return request(url, params, 'POST');
}

// редактирование времени
async function updateTime(entryId, entry) {
  const params = { time_entry: entry };
  const url = `/time_entries/${entryId}.json`;
  return request(url, params, 'PUT');
}

// удаление времени
async function deleteTime(entryId) {
  const url = `/time_entries/${entryId}.json`;
  return request(url, null, 'DELETE');
}
