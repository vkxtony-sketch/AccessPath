'use strict';

/* AccessPath prototype. Locations load from data/places.json and cite data/sources.json; unknown values are never treated as inaccessible. */
let places = [];
let sources = {};

const FEATURES = [
  { key: 'wheelchair', label: 'Wheelchair info' },
  { key: 'parking', label: 'Accessible parking' },
  { key: 'tactile', label: 'Tactile / Braille' }
];

/* Every accessibility claim carries a value plus evidence. "unknown" is never proof of inaccessibility. */
const VALUE_META = {
  yes: { cls: 'verified', symbol: '✓', text: 'documented' },
  limited: { cls: 'limited', symbol: '!', text: 'limited' },
  no: { cls: 'no', symbol: '✕', text: 'not available' },
  unknown: { cls: 'warning', symbol: '?', text: 'not yet verified' }
};

const STORAGE_KEY = 'accesspath-reports-v1';
const categoryEnabled = {};
let reports = readReports();
let map = null;
let placeLayer = null;
let placeMarkers = new Map();
let userLocation = null;
let userMarker = null;
let reportMarkers = [];
let selectedPlaceId = null;
let toastTimer = null;

const $ = (id) => document.getElementById(id);

function readReports() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch (error) {
    console.warn('AccessPath could not read local reports:', error);
    return [];
  }
}
function saveReports() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
    return true;
  } catch (error) {
    console.error('AccessPath could not save reports:', error);
    showToast('This browser could not save the report. Check browser storage settings.');
    return false;
  }
}
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function featureValue(place, key) {
  const feature = place[key];
  return feature && typeof feature.value === 'string' ? feature.value : 'unknown';
}
function valueBadge(value, label) {
  const meta = VALUE_META[value] || VALUE_META.unknown;
  const suffix = value === 'yes' || value === 'unknown' ? label : `${label} — ${meta.text}`;
  return `<span class="mini-badge ${meta.cls}">${meta.symbol} ${escapeHTML(suffix)}</span>`;
}
function getAccessBadges(place) {
  return FEATURES.map(feature => valueBadge(featureValue(place, feature.key), feature.label)).join('');
}
function sourceById(id) {
  return id && sources[id] ? sources[id] : null;
}
function placeSources(place) {
  const ids = [place.infoSourceId, ...FEATURES.map(feature => place[feature.key]?.sourceId)];
  const seen = new Set();
  return ids
    .filter(id => id && !seen.has(id) && seen.add(id))
    .map(sourceById)
    .filter(Boolean);
}
function currentFilteredPlaces() {
  const query = $('search-input').value.trim().toLowerCase();
  const wantsWheelchair = $('filter-wheelchair').checked;
  const wantsParking = $('filter-parking').checked;
  const wantsTactile = $('filter-tactile').checked;
  return places.filter(place => {
    const matchesText = !query || `${place.name} ${place.address} ${place.category} ${place.short}`.toLowerCase().includes(query);
    const matchesCategory = categoryEnabled[place.category] !== false;
    const matchesWheelchair = !wantsWheelchair || featureValue(place, 'wheelchair') === 'yes';
    const matchesParking = !wantsParking || featureValue(place, 'parking') === 'yes';
    const matchesTactile = !wantsTactile || featureValue(place, 'tactile') === 'yes';
    return matchesText && matchesCategory && matchesWheelchair && matchesParking && matchesTactile;
  });
}
function renderPlaceList() {
  const filtered = currentFilteredPlaces();
  $('results-count').textContent = `${filtered.length} ${filtered.length === 1 ? 'place' : 'places'}`;
  $('place-list').innerHTML = filtered.map(place => `
    <button class="place-card ${selectedPlaceId === place.id ? 'selected' : ''}" type="button" data-place-id="${escapeHTML(place.id)}" aria-pressed="${selectedPlaceId === place.id}">
      <span class="place-glyph" aria-hidden="true">${escapeHTML(place.icon)}</span>
      <span class="place-main"><strong>${escapeHTML(place.name)}</strong><span class="place-address">${escapeHTML(place.address)}</span><span class="place-badges">${getAccessBadges(place)}</span></span>
      <span class="place-arrow" aria-hidden="true">↗</span>
    </button>`).join('');
  $('no-results').hidden = filtered.length !== 0;
  $('place-list').hidden = filtered.length === 0;
  $('clear-search').hidden = !$('search-input').value;
  $('place-list').querySelectorAll('[data-place-id]').forEach(button => {
    button.addEventListener('click', () => selectPlace(button.dataset.placeId, true));
  });
  updateStats();
  updateMarkerVisibility(filtered.map(place => place.id));
}
function updateStats() {
  $('location-count').textContent = String(places.length);
  $('verified-count').textContent = String(places.filter(p => featureValue(p, 'wheelchair') === 'yes').length);
  $('report-count').textContent = String(reports.length);
}
function categoryStyle(category) {
  const c = String(category || '').toLowerCase();
  if (c.includes('park')) return { symbol: '⌁', variant: 'park' };
  if (c.includes('library')) return { symbol: '▤', variant: 'library' };
  if (c.includes('restroom')) return { symbol: '⧉', variant: 'restroom' };
  if (c.includes('transit') || c.includes('stop')) return { symbol: '⇄', variant: 'transit' };
  if (c.includes('parking')) return { symbol: 'P', variant: 'parking' };
  if (c.includes('sidewalk') || c.includes('path') || c.includes('route')) return { symbol: '═', variant: 'path' };
  return { symbol: '⌖', variant: 'default' };
}
function makeMarkerIcon(place, index) {
  const { symbol, variant } = categoryStyle(place.category);
  return L.divIcon({
    className: '',
    html: `<div class="custom-marker cat-${variant}" title="${escapeHTML(place.category)}"><span>${escapeHTML(symbol)}</span></div>`,
    iconSize: [33, 40],
    iconAnchor: [16, 38],
    popupAnchor: [0, -35]
  });
}
function makeReportIcon() {
  return L.divIcon({ className: '', html: '<div class="custom-marker report"><span>!</span></div>', iconSize: [33, 40], iconAnchor: [16, 38], popupAnchor: [0, -35] });
}
function initMap() {
  if (!window.L) {
    $('map').innerHTML = '<div class="map-error"><strong>The interactive map could not load.</strong><p>Check your internet connection and refresh this page. You can still use the location list.</p></div>';
    return;
  }
  map = L.map('map', { scrollWheelZoom: false }).setView([38.2527, -85.7335], 12);
  const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>'
  });
  const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
  });
  streets.addTo(map);
  L.control.layers({ 'Standard map': streets, 'Satellite': satellite }, null, { position: 'topright' }).addTo(map);
  placeLayer = typeof L.markerClusterGroup === 'function'
    ? L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 46, disableClusteringAtZoom: 15 })
    : null;
  if (placeLayer) map.addLayer(placeLayer);
  places.forEach((place, index) => {
    const marker = L.marker([place.lat, place.lng], { icon: makeMarkerIcon(place, index + 1) });
    marker.bindPopup(popupHTML(place));
    marker.on('click', () => selectPlace(place.id, false));
    placeMarkers.set(place.id, marker);
    if (placeLayer) placeLayer.addLayer(marker);
    else marker.addTo(map);
  });
  fitToPlaces();
  addLocateControl();
  map.on('focus', () => { map.scrollWheelZoom.enable(); });
  renderReportMarkers();
}
function addLocateControl() {
  const control = L.control({ position: 'topleft' });
  control.onAdd = () => {
    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
    const link = L.DomUtil.create('a', 'locate-control', container);
    link.href = '#';
    link.title = 'Show my location';
    link.setAttribute('role', 'button');
    link.setAttribute('aria-label', 'Show my location');
    link.innerHTML = '⌖';
    L.DomEvent.on(link, 'click', event => { L.DomEvent.stop(event); locateUser(); });
    return container;
  };
  control.addTo(map);
}
function locateUser() {
  if (!navigator.geolocation) {
    showToast('Location is not available in this browser.');
    return;
  }
  showToast('Finding your location…');
  navigator.geolocation.getCurrentPosition(position => {
    userLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.circleMarker([userLocation.lat, userLocation.lng], {
      radius: 8, color: '#ffffff', weight: 3, fillColor: '#2b5d8a', fillOpacity: 1
    }).addTo(map).bindTooltip('Your location');
    map.setView([userLocation.lat, userLocation.lng], 14);
    showToast('Showing your location. Distances are measured from here.');
    renderPlaceList();
  }, error => {
    showToast(`Could not get your location: ${error.message}`);
  }, { enableHighAccuracy: true, timeout: 10000 });
}
function fitToPlaces() {
  if (!map) return;
  const points = places
    .filter(place => Number.isFinite(place.lat) && Number.isFinite(place.lng))
    .map(place => [place.lat, place.lng]);
  if (!points.length) return;
  map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 14 });
}
function popupHTML(place) {
  const wheel = featureValue(place, 'wheelchair');
  const access = wheel === 'yes'
    ? 'Published wheelchair-access information'
    : wheel === 'limited'
      ? 'Wheelchair access documented with limitations'
      : wheel === 'no'
        ? 'Source documents that wheelchair access is unavailable'
        : 'Wheelchair-access details not yet verified';
  const links = placeSources(place)
    .map(source => `<a href="${escapeHTML(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(source.title)} ↗</a>`)
    .join(' ');
  return `<div class="map-popup"><h4>${escapeHTML(place.name)}</h4><p>${escapeHTML(place.address)}</p><p>${escapeHTML(access)}</p>${links ? `<p class="popup-sources">${links}</p>` : ''}</div>`;
}
function updateMarkerVisibility(visibleIds) {
  if (!map) return;
  const visible = new Set(visibleIds);
  placeMarkers.forEach((marker, id) => {
    if (placeLayer) {
      if (visible.has(id)) {
        if (!placeLayer.hasLayer(marker)) placeLayer.addLayer(marker);
      } else if (placeLayer.hasLayer(marker)) {
        placeLayer.removeLayer(marker);
      }
    } else if (visible.has(id)) {
      if (!map.hasLayer(marker)) marker.addTo(map);
    } else if (map.hasLayer(marker)) {
      map.removeLayer(marker);
    }
  });
}
function selectPlace(id, panMap) {
  const place = places.find(item => item.id === id);
  if (!place) return;
  selectedPlaceId = id;
  renderPlaceList();
  const marker = placeMarkers.get(id);
  if (map && marker) {
    if (panMap) map.flyTo([place.lat, place.lng], Math.max(map.getZoom(), 14), { duration: .45 });
    if (placeLayer && typeof placeLayer.zoomToShowLayer === 'function') {
      placeLayer.zoomToShowLayer(marker, () => marker.openPopup());
    } else {
      marker.openPopup();
    }
  }
}
function renderReportMarkers() {
  if (!map) return;
  reportMarkers.forEach(marker => map.removeLayer(marker));
  reportMarkers = [];
  reports.forEach((report, index) => {
    const place = places.find(item => item.id === report.placeId);
    if (!place) return;
    // Reports are about a venue in this prototype, not an exact obstacle coordinate.
    // Use a small deterministic offset so multiple report pins do not completely overlap.
    const offset = 0.00035 * (index + 1);
    const marker = L.marker([place.lat + offset, place.lng + offset], { icon: makeReportIcon() }).addTo(map);
    const label = report.status === 'observed' ? 'Reported as personally observed' : 'Unconfirmed community report';
    marker.bindPopup(`<div class="map-popup"><h4>Community report</h4><p><b>${escapeHTML(place.name)}</b></p><p>${escapeHTML(report.type)}</p><p>${escapeHTML(label)}</p>${report.notes ? `<p>${escapeHTML(report.notes)}</p>` : ''}<p><small>Saved on this device</small></p></div>`);
    reportMarkers.push(marker);
  });
}
function populateReportPlaces() {
  $('report-place').innerHTML = places.map(place => `<option value="${escapeHTML(place.id)}">${escapeHTML(place.name)}</option>`).join('');
}
function openReportDialog() {
  if (selectedPlaceId) $('report-place').value = selectedPlaceId;
  const dialog = $('report-dialog');
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else showToast('This browser does not support the report dialog. Please update your browser.');
}
function closeReportDialog() {
  $('report-dialog').close();
}
function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3600);
}
function resetFilters() {
  $('search-input').value = '';
  $('filter-wheelchair').checked = false;
  $('filter-parking').checked = false;
  $('filter-tactile').checked = false;
  renderPlaceList();
}
function bindEvents() {
  $('search-input').addEventListener('input', renderPlaceList);
  $('clear-search').addEventListener('click', () => { $('search-input').value = ''; $('search-input').focus(); renderPlaceList(); });
  ['filter-wheelchair', 'filter-parking', 'filter-tactile'].forEach(id => $(id).addEventListener('change', renderPlaceList));
  $('reset-filters').addEventListener('click', resetFilters);
  ['header-report', 'hero-report'].forEach(id => $(id).addEventListener('click', openReportDialog));
  $('close-dialog').addEventListener('click', closeReportDialog);
  $('cancel-report').addEventListener('click', closeReportDialog);
  $('report-dialog').addEventListener('click', event => { if (event.target === $('report-dialog')) closeReportDialog(); });
  $('report-form').addEventListener('submit', event => {
    event.preventDefault();
    const placeId = $('report-place').value;
    const type = $('report-type').value;
    const notes = $('report-notes').value.trim();
    const status = document.querySelector('input[name="report-status"]:checked')?.value || 'unconfirmed';
    if (!placeId || !type) { showToast('Choose a location and barrier type first.'); return; }
    const report = { id: `r-${Date.now()}`, placeId, type, notes, status, createdAt: new Date().toISOString() };
    reports.unshift(report);
    if (!saveReports()) { reports.shift(); return; }
    renderReportMarkers();
    updateStats();
    $('report-form').reset();
    $('report-place').value = placeId;
    closeReportDialog();
    showToast('Report saved on this device. It has not been sent anywhere.');
  });
  $('place-list').addEventListener('click', event => {
    const anchor = event.target.closest('[data-popup-place]');
    if (anchor) { event.preventDefault(); selectPlace(anchor.dataset.popupPlace, true); }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && $('report-dialog').open) closeReportDialog();
  });
}

function addSourceLink(text, url) { return `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(text)} ↗</a>`; }
function categoriesInData() {
  const seen = [];
  places.forEach(place => {
    if (place.category && !seen.includes(place.category)) seen.push(place.category);
  });
  return seen.sort((a, b) => a.localeCompare(b));
}
function renderLayerToggles() {
  const box = $('layer-toggles');
  if (!box) return;
  box.innerHTML = categoriesInData().map(category => {
    const checked = categoryEnabled[category] !== false;
    return `<label><input type="checkbox" data-category="${escapeHTML(category)}"${checked ? ' checked' : ''}><span>${escapeHTML(category)}</span></label>`;
  }).join('');
  box.querySelectorAll('input[data-category]').forEach(input => {
    input.addEventListener('change', () => {
      categoryEnabled[input.dataset.category] = input.checked;
      renderPlaceList();
    });
  });
}
function init() {
  populateReportPlaces();
  renderLayerToggles();
  bindEvents();
  initMap();
  renderPlaceList();
  updateStats();
}

async function loadData() {
  const [placesResponse, sourcesResponse] = await Promise.all([
    fetch('./data/places.json'),
    fetch('./data/sources.json')
  ]);

  if (!placesResponse.ok) {
    throw new Error(`Could not load locations: HTTP ${placesResponse.status}`);
  }

  const placeData = await placesResponse.json();
  if (!Array.isArray(placeData)) {
    throw new Error('places.json must contain an array of locations.');
  }
  places = placeData;

  if (sourcesResponse.ok) {
    const sourceData = await sourcesResponse.json();
    sources = sourceData && typeof sourceData === 'object' && !Array.isArray(sourceData) ? sourceData : {};
  } else {
    console.warn(`AccessPath could not load data/sources.json: HTTP ${sourcesResponse.status}. Source links will be limited.`);
  }

  init();
}

document.addEventListener('DOMContentLoaded', () => {
  loadData().catch(error => {
    console.error(error);
    const placeList = document.getElementById('place-list');
    if (placeList) {
      placeList.textContent = 'Location data could not be loaded. Check data/places.json.';
    }
  });
});
