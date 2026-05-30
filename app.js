const API_BASE = "https://d-portal.org/q.json";
const DPORTAL_ACTIVITY = "https://d-portal.iatistandard.org/ctrack.html#view=act&aid=";
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const THEME_STORAGE_KEY = "aid-project-map-theme";
const MAX_SERVER_FILTER_REQUESTS = 18;

const tileUrls = {
  light: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
};

const state = {
  rows: [],
  filters: {
    countries: new Set(),
    statuses: new Set(),
    orgs: new Set(),
    sizes: new Set(),
  },
  markersByKey: new Map(),
  orgOptions: new Map(),
  lastQueryKey: "",
  offset: 0,
  loading: false,
};

let serverReloadTimer = null;

const els = {
  form: document.querySelector("#query-form"),
  countrySearch: document.querySelector("#country-search"),
  countryOptions: document.querySelector("#country-options"),
  countrySummary: document.querySelector("#country-summary"),
  statusOptions: document.querySelector("#status-options"),
  statusSummary: document.querySelector("#status-summary"),
  sizeOptions: document.querySelector("#size-options"),
  sizeSummary: document.querySelector("#size-summary"),
  orgSearch: document.querySelector("#org-search"),
  orgOptions: document.querySelector("#org-options"),
  orgSummary: document.querySelector("#org-summary"),
  orderBy: document.querySelector("#order-by"),
  limit: document.querySelector("#limit"),
  keyword: document.querySelector("#keyword"),
  activeFilter: document.querySelector("#active-filter"),
  asOfDate: document.querySelector("#as-of-date"),
  loadMore: document.querySelector("#load-more"),
  downloadCsv: document.querySelector("#download-csv"),
  statusLine: document.querySelector("#status-line"),
  list: document.querySelector("#project-list"),
  statProjects: document.querySelector("#stat-projects"),
  statPoints: document.querySelector("#stat-points"),
  statCommitment: document.querySelector("#stat-commitment"),
  themeToggle: document.querySelector("#theme-toggle"),
};

const statusLabels = {
  1: "Pipeline",
  2: "Implementation",
  3: "Finalisation",
  4: "Closed",
  5: "Cancelled",
  6: "Suspended",
};

const statusColors = {
  1: "#c9851d",
  2: "#168a84",
  3: "#c9851d",
  4: "#c0445d",
  5: "#c0445d",
  6: "#c0445d",
};

const sizeRanges = [
  { value: "unknown", label: "금액 없음", min: null, max: null },
  { value: "under-1m", label: "1M 미만", min: 0, max: 1_000_000 },
  { value: "1m-10m", label: "1M - 10M", min: 1_000_000, max: 10_000_000 },
  { value: "10m-100m", label: "10M - 100M", min: 10_000_000, max: 100_000_000 },
  { value: "over-100m", label: "100M 이상", min: 100_000_000, max: Infinity },
];

const countryCodes = [
  "AF", "AX", "AL", "DZ", "AS", "AD", "AO", "AI", "AQ", "AG", "AR", "AM", "AW", "AU", "AT", "AZ",
  "BS", "BH", "BD", "BB", "BY", "BE", "BZ", "BJ", "BM", "BT", "BO", "BQ", "BA", "BW", "BV", "BR",
  "IO", "BN", "BG", "BF", "BI", "CV", "KH", "CM", "CA", "KY", "CF", "TD", "CL", "CN", "CX", "CC",
  "CO", "KM", "CG", "CD", "CK", "CR", "CI", "HR", "CU", "CW", "CY", "CZ", "DK", "DJ", "DM", "DO",
  "EC", "EG", "SV", "GQ", "ER", "EE", "SZ", "ET", "FK", "FO", "FJ", "FI", "FR", "GF", "PF", "TF",
  "GA", "GM", "GE", "DE", "GH", "GI", "GR", "GL", "GD", "GP", "GU", "GT", "GG", "GN", "GW", "GY",
  "HT", "HM", "VA", "HN", "HK", "HU", "IS", "IN", "ID", "IR", "IQ", "IE", "IM", "IL", "IT", "JM",
  "JP", "JE", "JO", "KZ", "KE", "KI", "KP", "KR", "KW", "KG", "LA", "LV", "LB", "LS", "LR", "LY",
  "LI", "LT", "LU", "MO", "MG", "MW", "MY", "MV", "ML", "MT", "MH", "MQ", "MR", "MU", "YT", "MX",
  "FM", "MD", "MC", "MN", "ME", "MS", "MA", "MZ", "MM", "NA", "NR", "NP", "NL", "NC", "NZ", "NI",
  "NE", "NG", "NU", "NF", "MK", "MP", "NO", "OM", "PK", "PW", "PS", "PA", "PG", "PY", "PE", "PH",
  "PN", "PL", "PT", "PR", "QA", "RE", "RO", "RU", "RW", "BL", "SH", "KN", "LC", "MF", "PM", "VC",
  "WS", "SM", "ST", "SA", "SN", "RS", "SC", "SL", "SG", "SX", "SK", "SI", "SB", "SO", "ZA", "GS",
  "SS", "ES", "LK", "SD", "SR", "SJ", "SE", "CH", "SY", "TW", "TJ", "TZ", "TH", "TL", "TG", "TK",
  "TO", "TT", "TN", "TR", "TM", "TC", "TV", "UG", "UA", "AE", "GB", "US", "UM", "UY", "UZ", "VU",
  "VE", "VN", "VG", "VI", "WF", "EH", "YE", "ZM", "ZW", "XK",
];

let regionNames = null;
try {
  regionNames = new Intl.DisplayNames(["ko"], { type: "region" });
} catch {
  regionNames = null;
}

const countryOptions = countryCodes
  .map((code) => {
    let name = code;
    try {
      name = regionNames?.of(code) || code;
    } catch {
      name = code === "XK" ? "코소보" : code;
    }
    return { value: code, label: `${code} ${name}` };
  })
  .sort((a, b) => a.label.localeCompare(b.label, "ko"));

const statusOptions = Object.entries(statusLabels).map(([value, label]) => ({ value, label }));

const map = L.map("map", {
  fadeAnimation: false,
  markerZoomAnimation: false,
  scrollWheelZoom: "center",
  wheelDebounceTime: 80,
  wheelPxPerZoomLevel: 100,
  zoomControl: false,
  zoomAnimation: false,
}).setView([18, 12], 2);

L.control.zoom({ position: "topright" }).addTo(map);

const baseLayer = L.tileLayer(tileUrls.light, {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  detectRetina: false,
  keepBuffer: 6,
  maxZoom: 18,
  updateWhenIdle: true,
  updateWhenZooming: false,
}).addTo(map);

const markerLayer = L.markerClusterGroup
  ? L.markerClusterGroup({
      animate: false,
      animateAddingMarkers: false,
      showCoverageOnHover: false,
      maxClusterRadius: 42,
      spiderfyDistanceMultiplier: 1.2,
    })
  : L.layerGroup();

markerLayer.addTo(map);
window.aidProjectMap = { map, markerLayer, state };

function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function getSystemTheme() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function setStoredTheme(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The theme still applies for the current session if storage is unavailable.
  }
}

function applyTheme(theme, { persist = false } = {}) {
  const nextTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = nextTheme;
  els.themeToggle?.setAttribute("aria-pressed", String(nextTheme === "dark"));
  els.themeToggle?.setAttribute("aria-label", nextTheme === "dark" ? "라이트모드 켜기" : "다크모드 켜기");
  els.themeToggle?.setAttribute("title", nextTheme === "dark" ? "라이트모드" : "다크모드");
  baseLayer.setUrl(tileUrls[nextTheme]);
  if (persist) setStoredTheme(nextTheme);
  baseLayer.redraw();
}

function dateToDay(value) {
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) ? Math.floor(time / MS_PER_DAY) : null;
}

function dayToDate(day) {
  if (!Number.isFinite(Number(day))) return "-";
  return new Date(Number(day) * MS_PER_DAY).toISOString().slice(0, 10);
}

function cleanText(value) {
  const text = String(value || "");
  const withoutTags = text.replace(/<[^>]+>/g, " ");
  return withoutTags.replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return "-";
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(number);
}

function markerSize(row) {
  const value = Math.max(0, Number(row.commitment) || 0);
  if (value <= 0) return 15;
  return Math.max(16, Math.min(34, 12 + Math.log10(value + 10) * 3.1));
}

function rowKey(row) {
  return [
    row.aid,
    Number(row.location_latitude).toFixed(5),
    Number(row.location_longitude).toFixed(5),
    row.location_name || "",
  ].join("|");
}

function dataRowKey(row) {
  return [rowKey(row), row.country_code || "", row.country_percent || ""].join("|");
}

function hasValidLocation(row) {
  const lat = Number(row.location_latitude);
  const lon = Number(row.location_longitude);
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

function getSizeBucket(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "unknown";
  const range = sizeRanges.find((item) => item.value !== "unknown" && amount >= item.min && amount < item.max);
  return range?.value || "unknown";
}

function getOrgEntries(row) {
  const entries = [];
  const reporting = cleanText(row.reporting);
  const reportingRef = cleanText(row.reporting_ref);
  const funderRef = cleanText(row.funder_ref);

  if (reporting || reportingRef) {
    const key = `reporting:${(reportingRef || reporting).toUpperCase()}`;
    const label = reporting && reportingRef ? `기관: ${reporting} (${reportingRef})` : `기관: ${reporting || reportingRef}`;
    entries.push({ key, label });
  }

  if (funderRef) {
    entries.push({ key: `funder:${funderRef.toUpperCase()}`, label: `공여: ${funderRef}` });
  }

  return entries;
}

function getFilterValues() {
  return {
    countries: Array.from(state.filters.countries).sort(),
    statuses: Array.from(state.filters.statuses).sort(),
    orgs: Array.from(state.filters.orgs).sort(),
    sizes: Array.from(state.filters.sizes).sort(),
    orderBy: els.orderBy.value,
    limit: Number(els.limit.value) || 1000,
    keyword: els.keyword.value.trim().toLowerCase(),
    activeOnly: els.activeFilter.checked,
    asOfDate: els.asOfDate.value || "2026-05-28",
  };
}

function queryKey(filters) {
  return JSON.stringify({
    countries: filters.countries,
    statuses: filters.statuses,
    orderBy: filters.orderBy,
    limit: filters.limit,
    activeOnly: filters.activeOnly,
    asOfDate: filters.activeOnly ? filters.asOfDate : "",
  });
}

function buildApiUrl(filters, offset, slice = {}) {
  const params = new URLSearchParams({
    from: slice.country || slice.countryJoin ? "act,location,country" : "act,location",
    limit: String(filters.limit),
    offset: String(offset),
  });

  if (slice.country) params.set("country_code", slice.country);
  if (slice.status) params.set("status_code", slice.status);
  if (filters.orderBy) params.set("orderby", filters.orderBy);

  if (filters.activeOnly) {
    const day = dateToDay(filters.asOfDate);
    if (day !== null) {
      params.set("day_start_lt", String(day + 1));
      params.set("day_end_gt", String(day - 1));
    }
  }

  return `${API_BASE}?${params.toString()}`;
}

function buildApiUrls(filters, offset) {
  const countrySlices = filters.countries.length ? filters.countries : [""];
  const statusSlices = filters.statuses.length ? filters.statuses : [""];
  const combinationCount = countrySlices.length * statusSlices.length;
  const hasServerFilters = filters.countries.length > 0 || filters.statuses.length > 0;
  const shouldSlice = hasServerFilters && combinationCount <= MAX_SERVER_FILTER_REQUESTS;

  if (!shouldSlice) return [buildApiUrl(filters, offset, { countryJoin: filters.countries.length > 0 })];

  return countrySlices.flatMap((country) =>
    statusSlices.map((status) => buildApiUrl(filters, offset, { country, status }))
  );
}

function rowMatchesKeyword(row, keyword) {
  if (!keyword) return true;
  const haystack = [
    row.title,
    row.reporting,
    row.reporting_ref,
    row.funder_ref,
    row.country_code,
    row.location_name,
    row.description,
    row.aid,
  ]
    .map(cleanText)
    .join(" ")
    .toLowerCase();
  return haystack.includes(keyword);
}

function rowMatchesFilters(row, filters) {
  const countryCode = cleanText(row.country_code).toUpperCase();
  if (filters.countries.length && !filters.countries.includes(countryCode)) return false;

  const statusCode = String(row.status_code || "");
  if (filters.statuses.length && !filters.statuses.includes(statusCode)) return false;

  if (filters.orgs.length) {
    const rowOrgKeys = getOrgEntries(row).map((entry) => entry.key);
    if (!rowOrgKeys.some((key) => filters.orgs.includes(key))) return false;
  }

  if (filters.sizes.length && !filters.sizes.includes(getSizeBucket(row.commitment))) return false;

  return rowMatchesKeyword(row, filters.keyword);
}

function getVisibleRows() {
  const filters = getFilterValues();
  const seen = new Set();
  return state.rows.filter((row) => {
    if (!hasValidLocation(row) || !rowMatchesFilters(row, filters)) return false;
    const key = rowKey(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function summarize(rows) {
  const projects = new Map();
  for (const row of rows) {
    if (!projects.has(row.aid)) projects.set(row.aid, row);
  }

  const commitment = Array.from(projects.values()).reduce((sum, row) => {
    const value = Number(row.commitment);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);

  return {
    projectCount: projects.size,
    pointCount: rows.length,
    commitment,
  };
}

function createPopup(row) {
  const title = escapeHtml(cleanText(row.title) || row.aid);
  const reporting = escapeHtml(cleanText(row.reporting) || "Unknown reporting org");
  const location = escapeHtml(cleanText(row.location_name) || "No location name");
  const country = escapeHtml(cleanText(row.country_code) || "-");
  const status = escapeHtml(statusLabels[row.status_code] || `Status ${row.status_code || "-"}`);
  const start = dayToDate(row.day_start);
  const end = dayToDate(row.day_end);
  const activityUrl = `${DPORTAL_ACTIVITY}${encodeURIComponent(row.aid)}`;

  return `
    <div class="popup">
      <h3>${title}</h3>
      <p><strong>${reporting}</strong></p>
      <p>${location} · ${country}</p>
      <p>${status} · ${start} - ${end}</p>
      <p>Commitment: ${escapeHtml(formatMoney(row.commitment))}</p>
      <a href="${activityUrl}" target="_blank" rel="noreferrer">d-portal</a>
    </div>
  `;
}

function renderMarkers(rows) {
  markerLayer.clearLayers();
  state.markersByKey.clear();

  for (const row of rows) {
    const lat = Number(row.location_latitude);
    const lon = Number(row.location_longitude);
    const size = markerSize(row);
    const color = statusColors[row.status_code] || "#2864b0";
    const key = rowKey(row);
    const marker = L.marker([lat, lon], {
      title: cleanText(row.title) || row.aid,
      icon: L.divIcon({
        className: "project-marker",
        html: `<span class="project-dot" style="--size:${size}px; --color:${color}"></span>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      }),
    }).bindPopup(createPopup(row), { maxWidth: 320 });

    markerLayer.addLayer(marker);
    state.markersByKey.set(key, marker);
  }
}

function refreshMapLayout() {
  const refresh = () => {
    map.invalidateSize({ animate: false, pan: false });
  };

  requestAnimationFrame(refresh);
  window.setTimeout(refresh, 250);
  window.setTimeout(refresh, 900);
}

function renderList(rows) {
  const uniqueProjects = [];
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.aid)) continue;
    seen.add(row.aid);
    uniqueProjects.push(row);
    if (uniqueProjects.length >= 80) break;
  }

  els.list.replaceChildren(
    ...uniqueProjects.map((row) => {
      const item = document.createElement("li");
      item.className = "project-item";
      item.tabIndex = 0;
      item.dataset.key = rowKey(row);

      const title = document.createElement("h2");
      title.textContent = cleanText(row.title) || row.aid;

      const org = document.createElement("p");
      org.textContent = cleanText(row.reporting) || "Unknown reporting org";

      const meta = document.createElement("div");
      meta.className = "meta-row";
      const status = document.createElement("span");
      status.className = "pill";
      status.textContent = statusLabels[row.status_code] || "Unknown";
      const country = document.createElement("span");
      country.className = "pill";
      country.textContent = cleanText(row.country_code || row.location_name) || "Location";
      const amount = document.createElement("span");
      amount.className = "pill";
      amount.textContent = formatMoney(row.commitment);
      const dates = document.createElement("span");
      dates.className = "pill";
      dates.textContent = `${dayToDate(row.day_start)} - ${dayToDate(row.day_end)}`;
      meta.append(status, country, amount, dates);

      item.append(title, org, meta);
      item.addEventListener("click", () => focusMarker(row));
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter") focusMarker(row);
      });
      return item;
    })
  );
}

function focusMarker(row) {
  const marker = state.markersByKey.get(rowKey(row));
  if (!marker) return;
  const latLng = marker.getLatLng();
  map.setView(latLng, Math.max(map.getZoom(), 6), { animate: true });
  marker.openPopup();
}

function updateFilterSummary(summary, count) {
  if (!summary) return;
  if (count > 0) {
    summary.dataset.count = `${count}개 선택`;
  } else {
    summary.removeAttribute("data-count");
  }
}

function updateFilterSummaries() {
  updateFilterSummary(els.countrySummary, state.filters.countries.size);
  updateFilterSummary(els.statusSummary, state.filters.statuses.size);
  updateFilterSummary(els.sizeSummary, state.filters.sizes.size);
  updateFilterSummary(els.orgSummary, state.filters.orgs.size);
}

function createCheckbox(option, selectedSet, groupName) {
  const label = document.createElement("label");
  label.className = "filter-check";
  label.title = option.label;

  const input = document.createElement("input");
  input.type = "checkbox";
  input.name = groupName;
  input.value = option.value;
  input.checked = selectedSet.has(option.value);

  const text = document.createElement("span");
  text.textContent = option.label;

  label.append(input, text);
  return label;
}

function renderCheckboxList(container, options, selectedSet, groupName, emptyText) {
  if (!options.length) {
    const empty = document.createElement("p");
    empty.className = "empty-filter";
    empty.textContent = emptyText;
    container.replaceChildren(empty);
    return;
  }

  container.replaceChildren(...options.map((option) => createCheckbox(option, selectedSet, groupName)));
}

function renderCountryOptions() {
  const keyword = els.countrySearch.value.trim().toLowerCase();
  const options = countryOptions.filter((option) => option.label.toLowerCase().includes(keyword));
  renderCheckboxList(els.countryOptions, options, state.filters.countries, "countries", "해당 국가 코드가 없습니다.");
}

function renderStatusOptions() {
  renderCheckboxList(els.statusOptions, statusOptions, state.filters.statuses, "statuses", "상태가 없습니다.");
}

function renderSizeOptions() {
  renderCheckboxList(els.sizeOptions, sizeRanges, state.filters.sizes, "sizes", "규모 구간이 없습니다.");
}

function collectOrgOptions(rows) {
  const options = new Map();
  for (const row of rows) {
    for (const entry of getOrgEntries(row)) {
      if (!options.has(entry.key)) options.set(entry.key, { value: entry.key, label: entry.label, count: 0 });
      options.get(entry.key).count += 1;
    }
  }
  state.orgOptions = options;
}

function renderOrgOptions() {
  const keyword = els.orgSearch.value.trim().toLowerCase();
  const options = Array.from(state.orgOptions.values())
    .map((option) => ({
      value: option.value,
      label: `${option.label} (${new Intl.NumberFormat("en").format(option.count)})`,
      searchText: `${option.label} ${option.value}`.toLowerCase(),
    }))
    .filter((option) => option.searchText.includes(keyword))
    .sort((a, b) => a.label.localeCompare(b.label, "ko"));

  renderCheckboxList(
    els.orgOptions,
    options,
    state.filters.orgs,
    "orgs",
    state.rows.length ? "해당 기관이 없습니다." : "데이터를 불러온 뒤 선택할 수 있습니다."
  );
}

function handleFilterChange(filterName, renderOptions) {
  return (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") return;
    if (target.checked) {
      state.filters[filterName].add(target.value);
    } else {
      state.filters[filterName].delete(target.value);
    }
    updateFilterSummaries();
    renderOptions?.();
    render();
  };
}

function scheduleServerReload() {
  window.clearTimeout(serverReloadTimer);
  serverReloadTimer = window.setTimeout(() => loadProjects({ append: false }), 250);
}

function render() {
  const rows = getVisibleRows();
  const summary = summarize(rows);
  renderMarkers(rows);
  renderList(rows);

  els.statProjects.textContent = new Intl.NumberFormat("en").format(summary.projectCount);
  els.statPoints.textContent = new Intl.NumberFormat("en").format(summary.pointCount);
  els.statCommitment.textContent = formatMoney(summary.commitment);

  const loaded = new Intl.NumberFormat("en").format(state.rows.length);
  const visible = new Intl.NumberFormat("en").format(rows.length);
  els.statusLine.textContent = `${loaded}개 행 로드됨 · ${visible}개 지점 표시`;
  els.downloadCsv.disabled = rows.length === 0;
}

function setLoading(isLoading) {
  state.loading = isLoading;
  els.form.querySelector("button[type='submit']").disabled = isLoading;
  els.loadMore.disabled = isLoading;
  els.statusLine.textContent = isLoading ? "d-portal에서 데이터를 불러오는 중" : els.statusLine.textContent;
}

async function loadProjects({ append = false } = {}) {
  const filters = getFilterValues();
  const key = queryKey(filters);

  if (!append || key !== state.lastQueryKey) {
    state.rows = [];
    state.orgOptions.clear();
    state.offset = 0;
    state.lastQueryKey = key;
    renderOrgOptions();
  }

  setLoading(true);
  try {
    const urls = buildApiUrls(filters, state.offset);
    const responses = await Promise.all(urls.map((url) => fetch(url)));
    const badResponse = responses.find((response) => !response.ok);
    if (badResponse) throw new Error(`HTTP ${badResponse.status}`);

    const payloads = await Promise.all(responses.map((response) => response.json()));
    const rawRows = payloads.flatMap((payload) => (Array.isArray(payload.rows) ? payload.rows : []));
    const rows = rawRows.filter(hasValidLocation);

    const knownKeys = new Set(state.rows.map(dataRowKey));
    for (const row of rows) {
      const keyForRow = dataRowKey(row);
      if (!knownKeys.has(keyForRow)) {
        state.rows.push(row);
        knownKeys.add(keyForRow);
      }
    }

    state.offset += filters.limit;
    els.loadMore.disabled = rawRows.length === 0;
    collectOrgOptions(state.rows);
    renderOrgOptions();
    render();
  } catch (error) {
    console.error(error);
    els.statusLine.textContent = `데이터를 불러오지 못했습니다: ${error.message}`;
  } finally {
    setLoading(false);
  }
}

function downloadCsv() {
  const rows = getVisibleRows();
  const columns = [
    "aid",
    "title",
    "reporting",
    "reporting_ref",
    "funder_ref",
    "country_code",
    "status_code",
    "day_start",
    "day_end",
    "location_name",
    "location_latitude",
    "location_longitude",
    "commitment",
    "commitment_eur",
    "spend",
  ];

  const csv = [
    columns.join(","),
    ...rows.map((row) =>
      columns
        .map((column) => {
          const value = row[column] ?? "";
          return `"${String(value).replaceAll('"', '""')}"`;
        })
        .join(",")
    ),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "aid-project-map.csv";
  link.click();
  URL.revokeObjectURL(url);
}

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  loadProjects({ append: false });
});

els.countryOptions.addEventListener("change", (event) => {
  handleFilterChange("countries", renderCountryOptions)(event);
  scheduleServerReload();
});
els.statusOptions.addEventListener("change", (event) => {
  handleFilterChange("statuses", renderStatusOptions)(event);
  scheduleServerReload();
});
els.sizeOptions.addEventListener("change", handleFilterChange("sizes", renderSizeOptions));
els.orgOptions.addEventListener("change", handleFilterChange("orgs", renderOrgOptions));
els.countrySearch.addEventListener("input", renderCountryOptions);
els.orgSearch.addEventListener("input", renderOrgOptions);
els.loadMore.addEventListener("click", () => loadProjects({ append: true }));
els.downloadCsv.addEventListener("click", downloadCsv);
els.keyword.addEventListener("input", render);
els.themeToggle?.addEventListener("click", () => {
  const currentTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  applyTheme(currentTheme === "dark" ? "light" : "dark", { persist: true });
});
window.addEventListener("resize", refreshMapLayout);
map.on("zoomstart", () => map.getContainer().classList.add("is-map-zooming"));
map.on("zoomend", () => {
  map.getContainer().classList.remove("is-map-zooming");
  baseLayer.redraw();
});

renderCountryOptions();
renderStatusOptions();
renderSizeOptions();
renderOrgOptions();
updateFilterSummaries();
applyTheme(getStoredTheme() || getSystemTheme());

loadProjects({ append: false });
