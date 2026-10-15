'use strict';

/* AccessPath prototype. Place details link to public sources; unknown values are never treated as inaccessible. */
const places = [
  {
    id: 'waterfront-park', name: 'Louisville Waterfront Park', category: 'Park', address: '129 River Road, Louisville, KY 40202', lat: 38.2571, lng: -85.7441,
    short: 'Waterfront paths and accessible wayfinding',
    wheelchair: { status: 'verified', detail: 'The park says it is wheelchair accessible and that walkways were built to ADA standards. Routes are provided where stairs are present.' },
    parking: { status: 'unknown', detail: 'Accessible-parking details for this exact destination have not been verified in this prototype.' },
    tactile: { status: 'verified', detail: 'The park describes accessible signs with raised letters, Braille, tactile graphics, and textured sidewalk cues.' },
    openStatus: 'Open public space', sourceLabel: 'Waterfront Park — Accessibility', sourceUrl: 'https://ourwaterfront.org/feature/accessibility/', secondarySource: 'https://ourwaterfront.org/contact/', icon: '⌁'
  },
  {
    id: 'crescent-hill-library', name: 'Crescent Hill Branch Library', category: 'Library', address: '2762 Frankfort Avenue, Louisville, KY 40206', lat: 38.2551, lng: -85.7005,
    short: 'Ramp, push-button entry and elevator information',
    wheelchair: { status: 'verified', detail: 'The branch describes wheelchair ramps from its parking lot and Birchwood Avenue, a push-button door, and an interior elevator to the lower level.' },
    parking: { status: 'verified', detail: 'The branch lists two accessible parking spaces next to the ramp.' },
    tactile: { status: 'unknown', detail: 'Tactile or Braille wayfinding details for this branch have not been verified in this prototype.' },
    openStatus: 'Library branch', sourceLabel: 'LFPL — Crescent Hill accessibility', sourceUrl: 'https://www.lfpl.org/crescent-hill-1', secondarySource: 'https://www.lfpl.org/branches', icon: '▤'
  },
  {
    id: 'bon-air-library', name: 'Bon Air Branch Library', category: 'Library', address: '2816 Del Rio Place, Louisville, KY 40220', lat: 38.2317, lng: -85.6196,
    short: 'Library accessibility information published by LFPL',
    wheelchair: { status: 'verified', detail: 'Louisville Free Public Library states that all of its library locations are wheelchair accessible.' },
    parking: { status: 'verified', detail: 'Louisville Free Public Library states that all library locations offer parking for vehicles displaying a disability parking permit. Branch-specific details should be confirmed directly.' },
    tactile: { status: 'unknown', detail: 'Tactile or Braille wayfinding details for this branch have not been verified in this prototype.' },
    openStatus: 'Library branch', sourceLabel: 'LFPL — Accessibility services', sourceUrl: 'https://www.lfpl.org/accessibility-services', secondarySource: 'https://www.lfpl.org/branches', icon: '▤'
  },
  {
    id: 'library-computer-center', name: 'Library Computer Center', category: 'Library / computer access', address: '721 South Brook Street, Louisville, KY 40203', lat: 38.2438, lng: -85.7588,
    short: 'Public library computer center',
    wheelchair: { status: 'verified', detail: 'Louisville Free Public Library states that all of its library locations are wheelchair accessible. Confirm this center’s current entrance and service arrangements directly.' },
    parking: { status: 'verified', detail: 'Louisville Free Public Library states that all library locations offer parking for vehicles displaying a disability parking permit. Exact parking arrangements at this center have not been individually checked.' },
    tactile: { status: 'unknown', detail: 'Tactile or Braille wayfinding details for this location have not been verified in this prototype.' },
    openStatus: 'Library location', sourceLabel: 'LFPL — Accessibility services', sourceUrl: 'https://www.lfpl.org/accessibility-services', secondarySource: 'https://www.lfpl.org/branches', icon: '▤'
  }
];

const STORAGE_KEY = 'accesspath-reports-v1';
let reports = readReports();
let map = null;
let placeMarkers = new Map();
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
function statusBadge(status, label) {
  if (status === 'verified') return `<span class="mini-badge">✓ ${label}</span>`;
  if (status === 'unknown') return `<span class="mini-badge warning">? Not yet verified</span>`;
  return `<span class="mini-badge warning">${escapeHTML(label)}</span>`;
}
function getAccessBadges(place) {
  const badges = [];
  if (place.wheelchair.status === 'verified') badges.push(statusBadge('verified', 'Wheelchair info'));
  else badges.push(statusBadge('unknown', 'Wheelchair info'));
  if (place.tactile.status === 'verified') badges.push(statusBadge('verified', 'Tactile / Braille'));
  return badges.slice(0, 2).join('');
}
function currentFilteredPlaces() {
  const query = $('search-input').value.trim().toLowerCase();
  const wantsWheelchair = $('filter-wheelchair').checked;
  const wantsParking = $('filter-parking').checked;
  const wantsTactile = $('filter-tactile').checked;
  return places.filter(place => {
    const matchesText = !query || `${place.name} ${place.address} ${place.category} ${place.short}`.toLowerCase().includes(query);
    const matchesWheelchair = !wantsWheelchair || place.wheelchair.status === 'verified';
    const matchesParking = !wantsParking || place.parking.status === 'verified';
    const matchesTactile = !wantsTactile || place.tactile.status === 'verified';
    return matchesText && matchesWheelchair && matchesParking && matchesTactile;
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
  $('verified-count').textContent = String(places.filter(p => p.wheelchair.status === 'verified').length);
  $('report-count').textContent = String(reports.length);
}
function makeMarkerIcon(index, type = 'place') {
  const className = type === 'report' ? 'custom-marker report' : 'custom-marker';
  return L.divIcon({ className: '', html: `<div class="${className}"><span>${type === 'report' ? '!' : index}</span></div>`, iconSize: [33, 40], iconAnchor: [16, 38], popupAnchor: [0, -35] });
}
function initMap() {
  if (!window.L) {
    $('map').innerHTML = '<div class="map-error"><strong>The interactive map could not load.</strong><p>Check your internet connection and refresh this page. You can still use the location list.</p></div>';
    return;
  }
  map = L.map('map', { scrollWheelZoom: false }).setView([38.2527, -85.7335], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>'
  }).addTo(map);
  places.forEach((place, index) => {
    const marker = L.marker([place.lat, place.lng], { icon: makeMarkerIcon(index + 1) }).addTo(map);
    marker.bindPopup(popupHTML(place));
    marker.on('click', () => selectPlace(place.id, false));
    placeMarkers.set(place.id, marker);
  });
  map.on('focus', () => { map.scrollWheelZoom.enable(); });
  renderReportMarkers();
}
function popupHTML(place) {
  const access = place.wheelchair.status === 'verified' ? 'Published wheelchair-access information' : 'Wheelchair-access details not yet verified';
  return `<div class="map-popup"><h4>${escapeHTML(place.name)}</h4><p>${escapeHTML(place.address)}</p><p>${escapeHTML(access)}</p><a href="${escapeHTML(place.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open published source ↗</a></div>`;
}
function updateMarkerVisibility(visibleIds) {
  if (!map) return;
  const visible = new Set(visibleIds);
  placeMarkers.forEach((marker, id) => {
    if (visible.has(id)) {
      if (!map.hasLayer(marker)) marker.addTo(map);
    } else if (map.hasLayer(marker)) map.removeLayer(marker);
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
    marker.openPopup();
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
    const marker = L.marker([place.lat + offset, place.lng + offset], { icon: makeMarkerIcon(0, 'report') }).addTo(map);
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
function init() {
  populateReportPlaces();
  bindEvents();
  initMap();
  renderPlaceList();
  updateStats();
}

document.addEventListener('DOMContentLoaded', init);
