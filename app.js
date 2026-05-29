const API_BASE = "https://d-portal.org/q.json";
const DPORTAL_ACTIVITY = "https://d-portal.iatistandard.org/ctrack.html#view=act&aid=";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const state = {
  rows: [],
  markersByKey: new Map(),
  lastQueryKey: "",
  offset: 0,
  loading: false,
};

const els = {
  form: document.querySelector("#query-form"),
  country: document.querySelector("#country-code"),
  status: document.querySelector("#status-code"),
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

const map = L.map("map", {
  zoomControl: false,
}).setView([18, 12], 2);

L.control.zoom({ position: "topright" }).addTo(map);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  updateWhenIdle: false,
  keepBuffer: 3,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const markerLayer = L.markerClusterGroup
  ? L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 42,
      spiderfyDistanceMultiplier: 1.2,
    })
  : L.layerGroup();

markerLayer.addTo(map);

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

function hasValidLocation(row) {
  const lat = Number(row.location_latitude);
  const lon = Number(row.location_longitude);
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

function getFilterValues() {
  return {
    country: els.country.value.trim().toUpperCase(),
    status: els.status.value,
    orderBy: els.orderBy.value,
    limit: Number(els.limit.value) || 1000,
    keyword: els.keyword.value.trim().toLowerCase(),
    activeOnly: els.activeFilter.checked,
    asOfDate: els.asOfDate.value || "2026-05-28",
  };
}

function queryKey(filters) {
  return JSON.stringify({
    country: filters.country,
    status: filters.status,
    orderBy: filters.orderBy,
    limit: filters.limit,
    activeOnly: filters.activeOnly,
    asOfDate: filters.activeOnly ? filters.asOfDate : "",
  });
}

function buildApiUrl(filters, offset) {
  const params = new URLSearchParams({
    from: "act,location",
    limit: String(filters.limit),
    offset: String(offset),
  });

  if (filters.country) params.set("country_code", filters.country);
  if (filters.status) params.set("status_code", filters.status);
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

function rowMatchesKeyword(row, keyword) {
  if (!keyword) return true;
  const haystack = [
    row.title,
    row.reporting,
    row.funder_ref,
    row.location_name,
    row.description,
    row.aid,
  ]
    .map(cleanText)
    .join(" ")
    .toLowerCase();
  return haystack.includes(keyword);
}

function getVisibleRows() {
  const filters = getFilterValues();
  const seen = new Set();
  return state.rows.filter((row) => {
    if (!hasValidLocation(row) || !rowMatchesKeyword(row, filters.keyword)) return false;
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
  const status = escapeHtml(statusLabels[row.status_code] || `Status ${row.status_code || "-"}`);
  const start = dayToDate(row.day_start);
  const end = dayToDate(row.day_end);
  const activityUrl = `${DPORTAL_ACTIVITY}${encodeURIComponent(row.aid)}`;

  return `
    <div class="popup">
      <h3>${title}</h3>
      <p><strong>${reporting}</strong></p>
      <p>${location}</p>
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

  refreshMapLayout();
}

function refreshMapLayout() {
  const refresh = () => {
    map.invalidateSize({ pan: false });
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
      const location = document.createElement("span");
      location.className = "pill";
      location.textContent = cleanText(row.location_name) || "Location";
      const dates = document.createElement("span");
      dates.className = "pill";
      dates.textContent = `${dayToDate(row.day_start)} - ${dayToDate(row.day_end)}`;
      meta.append(status, location, dates);

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
    state.offset = 0;
    state.lastQueryKey = key;
  }

  setLoading(true);
  try {
    const url = buildApiUrl(filters, state.offset);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const rawRows = Array.isArray(payload.rows) ? payload.rows : [];
    const rows = rawRows.filter(hasValidLocation);

    const knownKeys = new Set(state.rows.map(rowKey));
    for (const row of rows) {
      const keyForRow = rowKey(row);
      if (!knownKeys.has(keyForRow)) {
        state.rows.push(row);
        knownKeys.add(keyForRow);
      }
    }

    state.offset += filters.limit;
    els.loadMore.disabled = rawRows.length === 0;
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
    "status_code",
    "day_start",
    "day_end",
    "location_name",
    "location_latitude",
    "location_longitude",
    "commitment",
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

els.loadMore.addEventListener("click", () => loadProjects({ append: true }));
els.downloadCsv.addEventListener("click", downloadCsv);
els.keyword.addEventListener("input", render);
window.addEventListener("resize", refreshMapLayout);
window.addEventListener("load", refreshMapLayout);

loadProjects({ append: false });
