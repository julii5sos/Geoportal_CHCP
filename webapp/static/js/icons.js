/* Iconos SVG en línea (trazo) usados por la interfaz del Geoportal CHCP. */
(function () {
  const svg = (body, size = 18) => `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const paths = {
    map: '<path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
    cloud: '<path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 9.2 4.4 4.4 0 0 0 7 18z"/>',
    download: '<path d="M12 4v11M7 10.5 12 15.5 17 10.5"/><path d="M4 18.5V20h16v-1.5"/>',
    doc: '<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6"/><path d="M12 17h.01"/>',
    layers: '<path d="m12 3.5 9 4.8-9 4.8-9-4.8z"/><path d="m3 12.4 9 4.8 9-4.8"/><path d="m3 16.4 9 4.8 9-4.8"/>',
    filter: '<path d="M4 5h16l-6.2 7.4V19l-3.6-1.6v-5z"/>',
    basemap: '<path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z"/>',
    trend: '<path d="M3 17.5 9 11.5l4 4 8-8.5"/><path d="M15 7h6v6"/><path d="M3 21h18"/>',
    network: '<circle cx="5.5" cy="6" r="2.3"/><circle cx="18.5" cy="6.5" r="2.3"/><circle cx="12" cy="18" r="2.3"/><path d="M7.6 7 16.3 6.6M6.7 8l4.2 7.9M17.4 8.6l-4.3 7.5"/>',
    leaf: '<path d="M20 4c-9 0-15 4.5-15 11.2 0 1.6.4 2.9 1 3.8C8 13 12.5 10 16 9c-4 2.2-7.3 5.6-8.8 10.1.9.4 2 .6 3.1.6C17 19.7 20 13 20 4z"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    pin: '<path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.3"/>',
    clipboard: '<rect x="5" y="4.5" width="14" height="16.5" rx="2"/><path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 14h7M8.5 18h4"/>',
    shield: '<path d="M12 3 4.5 6v5.5c0 4.7 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.8 7.5-9.5V6z"/><path d="m8.8 12 2.2 2.2 4.2-4.4"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
    forest: '<path d="M12 3 6.5 11h3L6 16h12l-3.5-5h3z"/><path d="M12 16v5"/>',
    warning: '<path d="M12 3.5 2.8 19.5h18.4z"/><path d="M12 9.5v4.5M12 17h.01"/>',
    sprout: '<path d="M12 21v-8"/><path d="M12 13c0-4.4-3-7-7.5-7 0 4.4 3 7 7.5 7z"/><path d="M12 11c0-3.6 2.6-6 6.5-6 0 3.6-2.6 6-6.5 6z"/>',
    loss: '<path d="M4 6l7 7 3-3 6 7"/><path d="M20 12v5h-5"/>',
    saw: '<path d="M4 15h13l3-3H7z"/><path d="M6 19h12"/><path d="m7 12 1-2 1 2 1-2 1 2 1-2 1 2 1-2 1 2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6h.01"/>',
    target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>',
    pdf: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M8.5 16.5v-3h1.2a1 1 0 0 1 0 2H8.5M13 13.5v3h1a1.5 1.5 0 0 0 0-3zM17 13.5h-1.6v3M15.4 15h1.2"/>',
    user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.5c1.3-3.6 4.2-5.4 7.5-5.4s6.2 1.8 7.5 5.4"/>',
  };
  window.CHCP_ICON = (name, size) => (paths[name] ? svg(paths[name], size) : '');
})();
