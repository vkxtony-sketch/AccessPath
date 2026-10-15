'use strict';

/* AccessPath prototype. Locations load from data/places.json and cite data/sources.json; unknown values are never treated as inaccessible. */
let places = [];
let sources = {};

const FEATURES = [
  { key: 'wheelchair', label: 'Wheelchair info' },
  { key: 'parking', label: 'Accessible parking' },
  { key: 'tactile', label: 'Tactile / Braille' }
];

/* Full set of accessibility features shown in the location detail panel and the amenity search. */
const DETAIL_FEATURES = [
  { key: 'entrance', label: 'Entrance', plain: 'How you get in, and whether the way in is step-free.' },
  { key: 'ramp', label: 'Ramp', plain: 'Whether a ramp is available and any documented limits.' },
  { key: 'door', label: 'Automatic door', plain: 'Whether doors open automatically or have accessible controls.' },
  { key: 'elevator', label: 'Elevator', plain: 'Whether an elevator is available between levels.' },
  { key: 'parking', label: 'Accessible parking', plain: 'Whether accessible parking spaces are documented.' },
  { key: 'restroom', label: 'Restroom', plain: 'Whether an accessible restroom is available and where.' },
  { key: 'tactile', label: 'Tactile / Braille signage', plain: 'Raised-letter, Braille, or tactile wayfinding.' },
  { key: 'communication', label: 'Communication / sensory', plain: 'Hearing loops, visual alerts, and other sensory aids.' },
  { key: 'curbRamp', label: 'Curb ramp', plain: 'Lowered curbs where a path meets the street.' },
  { key: 'surface', label: 'Surface', plain: 'What the path or floor is made of.' },
  { key: 'sidewalk', label: 'Sidewalk / path width', plain: 'Documented walkway width where a source provides it.' },
  { key: 'wheelchair', label: 'Wheelchair access (general)', plain: 'The broad wheelchair-accessibility statement for a place.' }
];

/* Every accessibility claim carries a value plus evidence. "unknown" is never proof of inaccessibility. */
const VALUE_META = {
  yes: { cls: 'verified', symbol: '✓', text: 'documented' },
  limited: { cls: 'limited', symbol: '!', text: 'limited' },
  no: { cls: 'no', symbol: '✕', text: 'not available' },
  unknown: { cls: 'warning', symbol: '?', text: 'not yet verified' }
};

const STORAGE_KEY = 'accesspath-reports-v1';
const SEARCH_KEY = 'accesspath-searches-v1';
const categoryEnabled = {};
let reports = readReports();
let savedSearches = readSavedSearches();
let map = null;
let placeLayer = null;
let placeMarkers = new Map();
let userLocation = null;
let userMarker = null;
let areaFilter = null;
let reportMarkers = [];
let reportPin = null;
let awaitingReportPin = false;
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
function downscalePhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const max = 480;
        const scale = Math.min(1, max / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      image.onerror = reject;
      image.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
const BARRIER_CATEGORIES = [
  { key: 'path', label: 'Blocked or uneven path', icon: '\u{1F6A7}' },
  { key: 'curb', label: 'Missing or difficult curb ramp', icon: '\u2B06\uFE0F' },
  { key: 'entrance', label: 'Entrance access concern', icon: '\u{1F6AA}' },
  { key: 'parking', label: 'Accessible parking concern', icon: '\u{1F17F}\uFE0F' },
  { key: 'restroom', label: 'Restroom access concern', icon: '\u{1F6BB}' },
  { key: 'elevator', label: 'Elevator or lift concern', icon: '\u{1F6D7}' },
  { key: 'signage', label: 'Signage or wayfinding concern', icon: '\u{1F9ED}' },
  { key: 'other', label: 'Other access concern', icon: '\u2753' }
];
const DURATION_META = {
  temporary: { label: 'Temporary barrier' },
  permanent: { label: 'Permanent barrier' }
};
function durationMeta(key) { return DURATION_META[key] || null; }
const REPORT_STATUS_META = {
  unconfirmed: { label: 'Unconfirmed', cls: 'status-unknown' },
  observed: { label: 'Observed by reporter', cls: 'status-limited' },
  resolved: { label: 'Possibly resolved', cls: 'status-yes' }
};
function reportStatusMeta(key) { return REPORT_STATUS_META[key] || null; }
function reportExpired(report) {
  return Boolean(report.expiresOn && report.expiresOn < new Date().toISOString().slice(0, 10));
}
const SEVERITY_META = {
  blocks: { label: 'Blocks my route', cls: 'sev-high' },
  difficult: { label: 'Difficult but passable', cls: 'sev-mid' },
  minor: { label: 'Minor inconvenience', cls: 'sev-low' }
};
function severityMeta(key) { return SEVERITY_META[key] || null; }
function barrierCategory(key) {
  return BARRIER_CATEGORIES.find(item => item.key === key) || BARRIER_CATEGORIES.find(item => item.label === key) || { key: key || 'other', label: key || 'Access concern', icon: '\u2753' };
}
function populateReportTypes() {
  const select = $('report-type');
  if (!select) return;
  select.innerHTML = '<option value="">Choose a barrier type</option>' + BARRIER_CATEGORIES.map(category => `<option value="${escapeHTML(category.key)}">${category.icon} ${escapeHTML(category.label)}</option>`).join('');
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
  const ids = [place.infoSourceId, ...DETAIL_FEATURES.map(feature => place[feature.key]?.sourceId)];
  const seen = new Set();
  return ids
    .filter(id => id && !seen.has(id) && seen.add(id))
    .map(sourceById)
    .filter(Boolean);
}
const ABBREVIATIONS = {
  ave: 'avenue', av: 'avenue', st: 'street', rd: 'road', blvd: 'boulevard', dr: 'drive',
  pl: 'place', ln: 'lane', ct: 'court', hwy: 'highway', pkwy: 'parkway', cir: 'circle',
  n: 'north', s: 'south', e: 'east', w: 'west', ne: 'northeast', nw: 'northwest',
  se: 'southeast', sw: 'southwest', ky: 'kentucky'
};
function normalizeText(value) {
  return String(value)
    .toLowerCase()
    .replace(/[.,#]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(word => ABBREVIATIONS[word] || word)
    .join(' ');
}
function searchHaystack(place) {
  return normalizeText(`${place.name} ${place.address} ${place.category} ${place.short} ${place.neighborhood || ''}`);
}
function renderNeighborhoodFilter() {
  const select = $('filter-neighborhood');
  if (!select) return;
  const current = select.value;
  const seen = [];
  places.forEach(place => {
    if (place.neighborhood && !seen.includes(place.neighborhood)) seen.push(place.neighborhood);
  });
  seen.sort((a, b) => a.localeCompare(b));
  select.innerHTML = `<option value="">All neighborhoods</option>` +
    seen.map(name => `<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`).join('');
  if (seen.includes(current)) select.value = current;
}
function parseHourMinute(text) {
  const parts = String(text).split(':').map(Number);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}
function isOpenNow(place, now = new Date()) {
  const hours = place.hours;
  if (!hours) return null;
  if (hours.alwaysOpen) return true;
  if (!Array.isArray(hours.schedule) || !hours.schedule.length) return null;
  const day = now.getDay();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const today = hours.schedule.filter(slot => Array.isArray(slot.days) && slot.days.includes(day));
  if (!today.length) return false;
  return today.some(slot => {
    const open = parseHourMinute(slot.open);
    const close = parseHourMinute(slot.close);
    return minutes >= open && minutes < close;
  });
}
function renderAmenityFilter() {
  const select = $('filter-amenity');
  if (!select) return;
  const current = select.value;
  select.innerHTML = `<option value="">Any amenity</option>` +
    DETAIL_FEATURES.map(feature => `<option value="${escapeHTML(feature.key)}">${escapeHTML(feature.label)} documented</option>`).join('');
  if (DETAIL_FEATURES.some(feature => feature.key === current)) select.value = current;
}
function currentFilteredPlaces() {
  const terms = normalizeText($('search-input').value.trim()).split(' ').filter(Boolean);
  const wantsWheelchair = $('filter-wheelchair').checked;
  const wantsParking = $('filter-parking').checked;
  const wantsTactile = $('filter-tactile').checked;
  const wantsOpen = $('filter-open') ? $('filter-open').checked : false;
  const neighborhood = $('filter-neighborhood')?.value || '';
  const amenity = $('filter-amenity')?.value || '';
  return places.filter(place => {
    const haystack = searchHaystack(place);
    const matchesText = terms.every(term => haystack.includes(term));
    const matchesNeighborhood = !neighborhood || place.neighborhood === neighborhood;
    const matchesCategory = categoryEnabled[place.category] !== false;
    const matchesArea = !areaFilter || areaFilter.contains([place.lat, place.lng]);
    const matchesWheelchair = !wantsWheelchair || featureValue(place, 'wheelchair') === 'yes';
    const matchesParking = !wantsParking || featureValue(place, 'parking') === 'yes';
    const matchesTactile = !wantsTactile || featureValue(place, 'tactile') === 'yes';
    const matchesOpen = !wantsOpen || isOpenNow(place) === true;
    const matchesAmenity = !amenity || featureValue(place, amenity) === 'yes';
    return matchesText && matchesNeighborhood && matchesCategory && matchesArea && matchesWheelchair && matchesParking && matchesTactile && matchesOpen && matchesAmenity;
  });
}
function distanceMiles(lat1, lng1, lat2, lng2) {
  const toRad = value => value * Math.PI / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function placeDistance(place) {
  if (!userLocation || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return null;
  return distanceMiles(userLocation.lat, userLocation.lng, place.lat, place.lng);
}
function formatDistance(miles) {
  if (miles == null) return '';
  return miles < 0.1 ? `${Math.round(miles * 5280)} ft` : `${miles.toFixed(1)} mi`;
}
function renderPlaceList() {
  let filtered = currentFilteredPlaces();

  const radius = Number($('nearby-radius')?.value) || 0;
  if (radius > 0) {
    if (!userLocation) {
      showToast('Turn on location first to filter by distance.');
    } else {
      filtered = filtered.filter(place => {
        const miles = placeDistance(place);
        return miles != null && miles <= radius;
      });
    }
  }

  const sort = $('sort-select')?.value || 'default';
  if (sort === 'distance' && userLocation) {
    filtered = filtered.slice().sort((a, b) => (placeDistance(a) ?? Infinity) - (placeDistance(b) ?? Infinity));
  } else if (sort === 'name') {
    filtered = filtered.slice().sort((a, b) => a.name.localeCompare(b.name));
  }

  $('results-count').textContent = `${filtered.length} ${filtered.length === 1 ? 'place' : 'places'}`;
  $('place-list').innerHTML = filtered.map(place => `
    <button class="place-card ${selectedPlaceId === place.id ? 'selected' : ''}" type="button" data-place-id="${escapeHTML(place.id)}" aria-pressed="${selectedPlaceId === place.id}">
      <span class="place-glyph" aria-hidden="true">${escapeHTML(place.icon)}</span>
      <span class="place-main"><strong>${escapeHTML(place.name)}</strong><span class="place-address">${escapeHTML(place.address)}</span><span class="place-badges">${getAccessBadges(place)}${userLocation ? `<span class="mini-badge distance">${formatDistance(placeDistance(place))}</span>` : ''}</span></span>
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
  updateUrlState();
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
function makeReportIcon(severity, expired) {
  const variant = severity && SEVERITY_META[severity] ? ` sev-${severity}` : '';
  return L.divIcon({ className: '', html: `<div class="custom-marker report${variant}${expired ? ' expired' : ''}"><span>!</span></div>`, iconSize: [33, 40], iconAnchor: [16, 38], popupAnchor: [0, -35] });
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
  addAreaControl();
  map.on('focus', () => { map.scrollWheelZoom.enable(); });
  map.on('click', event => {
    if (!awaitingReportPin) return;
    awaitingReportPin = false;
    reportPin = { lat: event.latlng.lat, lng: event.latlng.lng };
    const status = $('report-pin-status');
    if (status) status.textContent = `Pin set at ${reportPin.lat.toFixed(5)}, ${reportPin.lng.toFixed(5)}.`;
    openReportDialog();
  });
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
function addAreaControl() {
  const control = L.control({ position: 'topleft' });
  control.onAdd = () => {
    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
    const link = L.DomUtil.create('a', 'area-control', container);
    link.href = '#';
    link.title = 'Search the visible map area';
    link.setAttribute('role', 'button');
    link.setAttribute('aria-label', 'Search the visible map area');
    link.innerHTML = '⛶';
    L.DomEvent.on(link, 'click', event => {
      L.DomEvent.stop(event);
      if (areaFilter) {
        areaFilter = null;
        L.DomUtil.removeClass(link, 'active');
        showToast('Showing places everywhere again.');
      } else {
        areaFilter = map.getBounds();
        L.DomUtil.addClass(link, 'active');
        showToast('Showing only places in the visible map area. Tap again to clear.');
      }
      renderPlaceList();
    });
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
function statusPill(value) {
  const meta = VALUE_META[value] || VALUE_META.unknown;
  return `<span class="mini-badge ${meta.cls}">${meta.symbol} ${escapeHTML(meta.text)}</span>`;
}
const EVIDENCE_META = {
  official_source: { label: 'Official source', symbol: '\u{1F4C4}' },
  field_checked: { label: 'Field checked', symbol: '\u{1F441}' },
  community_report: { label: 'Community report', symbol: '\u{1F5E3}' },
  unknown: { label: 'Unverified', symbol: '\u2754' }
};
function evidenceMeta(key) { return EVIDENCE_META[key] || EVIDENCE_META.unknown; }
function daysSince(dateString) {
  const then = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(then.getTime())) return null;
  return Math.floor((Date.now() - then.getTime()) / 86400000);
}
function freshnessText(dateString) {
  const days = daysSince(dateString);
  if (days == null) return '';
  if (days <= 0) return 'Checked today';
  if (days === 1) return 'Checked yesterday';
  if (days < 30) return `Checked ${days} days ago`;
  if (days < 365) return `Checked about ${Math.round(days / 30)} months ago`;
  return `Checked about ${Math.round(days / 365)} years ago`;
}
function featureExtras(data) {
  const parts = [];
  if (data.spaces != null) parts.push(`${data.spaces} documented space${data.spaces === 1 ? '' : 's'}`);
  if (data.location) parts.push(data.location);
  if (data.widthMeters != null) parts.push(`about ${data.widthMeters} m wide`);
  if (data.surfaceType) parts.push(data.surfaceType);
  if (!parts.length) return '';
  return `<p class="feature-extra">${escapeHTML(parts.join(' · '))}</p>`;
}
function featureCard(place, feature) {
  const data = place[feature.key] || {};
  const value = typeof data.value === 'string' ? data.value : 'unknown';
  const source = sourceById(data.sourceId);
  return `<section class="feature-card">
    <div class="feature-head"><h3 title="${escapeHTML(feature.plain || '')}">${escapeHTML(feature.label)}</h3>${statusPill(value)}</div>
    <p class="feature-detail">${escapeHTML(data.detail || 'No information recorded yet.')}</p>
    ${featureExtras(data)}
    <div class="feature-meta">
      ${source ? `<a href="${escapeHTML(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(source.title)} ↗</a>` : '<span class="muted">No source recorded</span>'}
      <span class="evidence" title="Where this information comes from">${evidenceMeta(data.evidence).symbol} ${escapeHTML(evidenceMeta(data.evidence).label)}</span>
      ${data.lastChecked ? `<span class="muted" title="Last checked ${escapeHTML(data.lastChecked)}">${escapeHTML(freshnessText(data.lastChecked))}</span>` : ''}
    </div>
  </section>`;
}
function openStatusText(place) {
  const open = isOpenNow(place);
  if (open === null) return 'Hours not recorded.';
  const base = open ? 'Open now' : 'Closed now';
  const note = place.hours && place.hours.note ? place.hours.note : '';
  const checked = place.hours && place.hours.lastChecked ? ` Hours checked ${place.hours.lastChecked}.` : '';
  return `${base}. ${note}${checked}`.replace(/\s+/g, ' ').trim();
}
function renderDetailPanel(place) {
  const panel = $('detail-panel');
  if (!panel) return;
  const distance = placeDistance(place);
  panel.innerHTML = `
    <div class="detail-head">
      <div>
        <div class="eyebrow">${escapeHTML(place.category)}</div>
        <h2 id="detail-title">${escapeHTML(place.name)}</h2>
        <p class="detail-address">${escapeHTML(place.address)}${distance != null ? ` · ${formatDistance(distance)} away` : ''}</p>
        <p class="detail-hours">${escapeHTML(openStatusText(place))}</p>
      </div>
      <button type="button" class="dialog-close" id="detail-close" aria-label="Close location details">×</button>
    </div>
    <div class="detail-body">${DETAIL_FEATURES.map(feature => featureCard(place, feature)).join('')}${renderPlaceReports(place)}</div>`;
  panel.hidden = false;
  $('detail-close').addEventListener('click', closeDetailPanel);
}
function renderPlaceReports(place) {
  const list = reports.filter(report => report.placeId === place.id);
  const heading = `<h3 class="detail-subhead">Community reports (${list.length})</h3>`;
  const addButton = `<button type="button" class="button button-outline button-small" data-report-for="${escapeHTML(place.id)}">Add a report</button>`;
  if (!list.length) return `<section class="reports-block">${heading}<p class="muted">No community reports saved for this location yet.</p>${addButton}</section>`;
  const items = list.map(report => {
    const category = barrierCategory(report.type);
    const meta = reportStatusMeta(report.status) || REPORT_STATUS_META.unconfirmed;
    const options = Object.entries(REPORT_STATUS_META).map(([key, value]) => `<option value="${key}"${key === report.status ? ' selected' : ''}>${escapeHTML(value.label)}</option>`).join('');
    return `<li class="report-item"><div><strong>${category.icon} ${escapeHTML(category.label)}</strong><span class="report-status ${meta.cls}">${escapeHTML(meta.label)}</span>${report.notes ? `<p class="report-note">${escapeHTML(report.notes)}</p>` : ''}</div><div class="report-actions"><select data-report-status="${escapeHTML(report.id)}" aria-label="Report status">${options}</select><button type="button" class="report-delete" data-report-delete="${escapeHTML(report.id)}" aria-label="Delete report">Delete</button></div></li>`;
  }).join('');
  return `<section class="reports-block">${heading}<ul class="report-list">${items}</ul>${addButton}</section>`;
}
function closeDetailPanel() {
  const panel = $('detail-panel');
  if (panel) panel.hidden = true;
}
function selectPlace(id, panMap) {
  const place = places.find(item => item.id === id);
  if (!place) return;
  selectedPlaceId = id;
  renderPlaceList();
  renderDetailPanel(place);
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
    // Use an exact report pin when the reporter placed one; otherwise a small deterministic
    // offset from the venue so multiple report pins do not completely overlap.
    const offset = 0.00035 * (index + 1);
    const lat = Number.isFinite(report.lat) ? report.lat : place.lat + offset;
    const lng = Number.isFinite(report.lng) ? report.lng : place.lng + offset;
    const marker = L.marker([lat, lng], { icon: makeReportIcon(report.severity, reportExpired(report)) }).addTo(map);
    const label = report.status === 'observed' ? 'Reported as personally observed' : 'Unconfirmed community report';
    const category = barrierCategory(report.type);
    const severity = severityMeta(report.severity);
    const duration = durationMeta(report.duration);
    marker.bindPopup(`<div class="map-popup"><h4>Community report</h4><p><b>${escapeHTML(place.name)}</b></p><p>${category.icon} ${escapeHTML(category.label)}</p>${severity ? `<p><span class="sev ${severity.cls}">${escapeHTML(severity.label)}</span></p>` : ''}${duration ? `<p>${escapeHTML(duration.label)}${report.expiresOn ? ` \u00b7 ends ${escapeHTML(report.expiresOn)}` : ''}</p>` : ''}${reportExpired(report) ? '<p><span class="sev sev-low">Possibly resolved</span></p>' : ''}<p>${escapeHTML(label)}</p>${report.notes ? `<p>${escapeHTML(report.notes)}</p>` : ''}${report.photo ? `<img class="report-photo" src="${report.photo}" alt="Photo attached to this community report">` : ''}<p><small>Saved on this device</small></p></div>`);
    reportMarkers.push(marker);
  });
}
function findDuplicateReport(placeId, type) {
  return reports.find(report => report.placeId === placeId && report.type === type) || null;
}
function populateReportPlaces() {
  $('report-place').innerHTML = places.map(place => `<option value="${escapeHTML(place.id)}">${escapeHTML(place.name)}</option>`).join('');
}
function openReportDialog() {
  if (selectedPlaceId && $('report-place') && !$('report-place').value) $('report-place').value = selectedPlaceId;
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
  if ($('filter-open')) $('filter-open').checked = false;
  if ($('filter-neighborhood')) $('filter-neighborhood').value = '';
  if ($('filter-amenity')) $('filter-amenity').value = '';
  areaFilter = null;
  const areaControl = document.querySelector('.area-control');
  if (areaControl) L.DomUtil.removeClass(areaControl, 'active');
  renderPlaceList();
}
function updateSearchSuggestions() {
  const list = $('search-suggestions');
  if (!list) return;
  const query = $('search-input').value.trim().toLowerCase();
  const matches = places
    .filter(place => !categoryEnabled || categoryEnabled[place.category] !== false)
    .filter(place => !query || `${place.name} ${place.address} ${place.neighborhood || ''}`.toLowerCase().includes(query))
    .slice(0, 8);
  list.innerHTML = matches
    .map(place => `<option value="${escapeHTML(place.name)}">${escapeHTML(place.address)}</option>`)
    .join('');
}
function bindEvents() {
  $('search-input').addEventListener('input', () => { updateSearchSuggestions(); renderPlaceList(); });
  $('clear-search').addEventListener('click', () => { $('search-input').value = ''; $('search-input').focus(); renderPlaceList(); });
  ['filter-wheelchair', 'filter-parking', 'filter-tactile'].forEach(id => $(id).addEventListener('change', renderPlaceList));
  $('filter-open')?.addEventListener('change', renderPlaceList);
  $('sort-select')?.addEventListener('change', renderPlaceList);
  $('nearby-radius')?.addEventListener('change', renderPlaceList);
  $('filter-neighborhood')?.addEventListener('change', renderPlaceList);
  $('filter-amenity')?.addEventListener('change', renderPlaceList);
  $('use-my-location')?.addEventListener('click', locateUser);
  $('save-search')?.addEventListener('click', saveCurrentSearch);
  $('copy-link')?.addEventListener('click', copyShareLink);
  $('reset-filters').addEventListener('click', resetFilters);
  ['header-report', 'hero-report'].forEach(id => $(id).addEventListener('click', openReportDialog));
  $('close-dialog').addEventListener('click', closeReportDialog);
  $('cancel-report').addEventListener('click', closeReportDialog);
  $('report-pick-pin')?.addEventListener('click', () => {
    awaitingReportPin = true;
    closeReportDialog();
    showToast('Tap the map where the barrier is, then finish the report.');
  });
  $('report-duration')?.addEventListener('change', () => {
    const field = $('report-expiry-field');
    if (field) field.hidden = $('report-duration').value !== 'temporary';
  });
  $('report-dialog').addEventListener('click', event => { if (event.target === $('report-dialog')) closeReportDialog(); });
  $('report-form').addEventListener('submit', async event => {
    event.preventDefault();
    const placeId = $('report-place').value;
    const type = $('report-type').value;
    const notes = $('report-notes').value.trim();
    const status = document.querySelector('input[name="report-status"]:checked')?.value || 'unconfirmed';
    const severity = $('report-severity') ? $('report-severity').value : '';
    const duration = $('report-duration') ? $('report-duration').value : '';
    const expiresOn = duration === 'temporary' && $('report-expiry') ? $('report-expiry').value : '';
    if (!placeId || !type) { showToast('Choose a location and barrier type first.'); return; }
    const duplicate = findDuplicateReport(placeId, type);
    if (duplicate && !window.confirm('A similar report already exists for this location. Add another one anyway?')) {
      showToast('Not added. A similar report already exists for this location.');
      return;
    }
    const report = { id: `r-${Date.now()}`, placeId, type, severity, duration, expiresOn, notes, status, createdAt: new Date().toISOString() };
    const file = $('report-photo') && $('report-photo').files ? $('report-photo').files[0] : null;
    if (file) {
      try { report.photo = await downscalePhoto(file); }
      catch (error) { console.warn('AccessPath could not read the photo:', error); showToast('The photo could not be added, but the report will still be saved.'); }
    }
    if (reportPin) { report.lat = reportPin.lat; report.lng = reportPin.lng; }
    reports.unshift(report);
    if (!saveReports()) { reports.shift(); return; }
    reportPin = null;
    if ($('report-pin-status')) $('report-pin-status').textContent = 'Using the location\u2019s general map point.';
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
  const detailPanel = $('detail-panel');
  detailPanel.addEventListener('change', event => {
    const select = event.target.closest('select[data-report-status]');
    if (!select) return;
    const report = reports.find(item => item.id === select.dataset.reportStatus);
    if (!report) return;
    report.status = select.value;
    saveReports();
    renderReportMarkers();
    showToast('Report status updated.');
  });
  detailPanel.addEventListener('click', event => {
    const remove = event.target.closest('[data-report-delete]');
    if (remove) {
      if (!window.confirm('Delete this report from this device?')) return;
      reports = reports.filter(item => item.id !== remove.dataset.reportDelete);
      saveReports();
      renderReportMarkers();
      const place = places.find(item => item.id === selectedPlaceId);
      if (place) renderDetailPanel(place);
      showToast('Report deleted.');
      return;
    }
    const add = event.target.closest('[data-report-for]');
    if (add) { $('report-place').value = add.dataset.reportFor; openReportDialog(); }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && $('report-dialog').open) closeReportDialog();
    else if (event.key === 'Escape' && $('detail-panel') && !$('detail-panel').hidden) closeDetailPanel();
  });
}

function readSavedSearches() {
  try {
    const value = JSON.parse(localStorage.getItem(SEARCH_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch (error) {
    console.warn('AccessPath could not read saved searches:', error);
    return [];
  }
}
function writeSavedSearches() {
  try {
    localStorage.setItem(SEARCH_KEY, JSON.stringify(savedSearches));
    return true;
  } catch (error) {
    console.error('AccessPath could not save searches:', error);
    return false;
  }
}
function captureSearchState() {
  return {
    id: `s-${Date.now()}`,
    label: $('search-input').value.trim() || 'All places',
    query: $('search-input').value,
    wheelchair: $('filter-wheelchair').checked,
    parking: $('filter-parking').checked,
    tactile: $('filter-tactile').checked,
    open: $('filter-open') ? $('filter-open').checked : false,
    neighborhood: $('filter-neighborhood') ? $('filter-neighborhood').value : '',
    amenity: $('filter-amenity') ? $('filter-amenity').value : '',
    categories: { ...categoryEnabled },
    sort: $('sort-select') ? $('sort-select').value : 'default',
    radius: $('nearby-radius') ? $('nearby-radius').value : '0'
  };
}
function applySearchState(state) {
  $('search-input').value = state.query || '';
  $('filter-wheelchair').checked = !!state.wheelchair;
  $('filter-parking').checked = !!state.parking;
  $('filter-tactile').checked = !!state.tactile;
  if ($('filter-open')) $('filter-open').checked = !!state.open;
  if ($('filter-neighborhood')) $('filter-neighborhood').value = state.neighborhood || '';
  if ($('filter-amenity')) $('filter-amenity').value = state.amenity || '';
  Object.keys(categoryEnabled).forEach(key => delete categoryEnabled[key]);
  Object.assign(categoryEnabled, state.categories || {});
  if ($('sort-select')) $('sort-select').value = state.sort || 'default';
  if ($('nearby-radius')) $('nearby-radius').value = state.radius || '0';
  renderLayerToggles();
  updateSearchSuggestions();
  renderPlaceList();
}
function renderSavedSearches() {
  const box = $('saved-searches');
  if (!box) return;
  if (!savedSearches.length) {
    box.innerHTML = '<p class="muted saved-empty">No saved searches yet.</p>';
    return;
  }
  box.innerHTML = savedSearches.map(item => `
    <span class="saved-chip">
      <button type="button" class="saved-apply" data-apply="${escapeHTML(item.id)}">${escapeHTML(item.label)}</button>
      <button type="button" class="saved-remove" data-remove="${escapeHTML(item.id)}" aria-label="Remove saved search">×</button>
    </span>`).join('');
  box.querySelectorAll('[data-apply]').forEach(button => {
    button.addEventListener('click', () => {
      const state = savedSearches.find(item => item.id === button.dataset.apply);
      if (state) { applySearchState(state); showToast(`Applied saved search: ${state.label}`); }
    });
  });
  box.querySelectorAll('[data-remove]').forEach(button => {
    button.addEventListener('click', () => {
      savedSearches = savedSearches.filter(item => item.id !== button.dataset.remove);
      writeSavedSearches();
      renderSavedSearches();
    });
  });
}
function saveCurrentSearch() {
  const state = captureSearchState();
  savedSearches = [state, ...savedSearches.filter(item => item.label !== state.label)].slice(0, 12);
  if (writeSavedSearches()) {
    renderSavedSearches();
    showToast(`Saved search: ${state.label}`);
  }
}
let pendingUrlState = null;
function readUrlState() {
  const params = new URLSearchParams(location.search);
  if (![...params.keys()].length) return null;
  const state = {
    query: params.get('q') || '',
    wheelchair: params.get('wheel') === '1',
    parking: params.get('park') === '1',
    tactile: params.get('tact') === '1',
    open: params.get('open') === '1',
    neighborhood: params.get('hood') || '',
    amenity: params.get('amenity') || '',
    sort: params.get('sort') || 'default',
    radius: params.get('radius') || '0',
    categories: {}
  };
  (params.get('hide') || '').split('|').filter(Boolean).forEach(category => { state.categories[category] = false; });
  return state;
}
function applyUrlStateInputs(state) {
  if (!state) return;
  $('search-input').value = state.query;
  $('filter-wheelchair').checked = state.wheelchair;
  $('filter-parking').checked = state.parking;
  $('filter-tactile').checked = state.tactile;
  if ($('filter-open')) $('filter-open').checked = state.open;
  if ($('filter-neighborhood') && state.neighborhood) $('filter-neighborhood').value = state.neighborhood;
  if ($('filter-amenity') && state.amenity) $('filter-amenity').value = state.amenity;
  Object.assign(categoryEnabled, state.categories);
  if ($('sort-select')) $('sort-select').value = state.sort;
  if ($('nearby-radius')) $('nearby-radius').value = state.radius;
}
function updateUrlState() {
  const state = captureSearchState();
  const params = new URLSearchParams();
  if (state.query) params.set('q', state.query);
  if (state.wheelchair) params.set('wheel', '1');
  if (state.parking) params.set('park', '1');
  if (state.tactile) params.set('tact', '1');
  if (state.open) params.set('open', '1');
  if (state.neighborhood) params.set('hood', state.neighborhood);
  if (state.amenity) params.set('amenity', state.amenity);
  if (state.sort !== 'default') params.set('sort', state.sort);
  if (state.radius !== '0') params.set('radius', state.radius);
  const hidden = Object.keys(state.categories).filter(key => state.categories[key] === false);
  if (hidden.length) params.set('hide', hidden.join('|'));
  const queryString = params.toString();
  const url = queryString ? `${location.pathname}?${queryString}` : location.pathname;
  try { history.replaceState(null, '', url); } catch (error) { /* ignore */ }
}
function addSourceLink(text, url) { return `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(text)} ↗</a>`; }
function copyShareLink() {
  const url = location.href;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(
      () => showToast('Shareable link copied. It restores your search and filters.'),
      () => showToast(`Copy this link: ${url}`)
    );
  } else {
    showToast(`Copy this link: ${url}`);
  }
}
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
  populateReportTypes();
  renderNeighborhoodFilter();
  renderAmenityFilter();
  applyUrlStateInputs(pendingUrlState);
  updateSearchSuggestions();
  renderLayerToggles();
  renderSavedSearches();
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

  pendingUrlState = readUrlState();
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
