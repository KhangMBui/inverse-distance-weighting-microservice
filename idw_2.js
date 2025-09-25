// idw_2.js
// Node.js port of Leaflet.idw-directdraw.js core logic for IDW interpolation and PNG generation

const { PNG } = require("pngjs");
const tinycolor = require("tinycolor2");

function createGradientLookup(gradient) {
  // gradient: {0: '#000066', 0.1: 'blue', ...}
  const stops = Object.keys(gradient)
    .map(Number)
    .sort((a, b) => a - b);
  const colors = stops.map((s) => tinycolor(gradient[s]).toRgb());
  const lookup = [];
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let idx = stops.findIndex((s) => t <= s);
    if (idx === -1) idx = stops.length - 1;
    if (idx === 0) {
      lookup.push([colors[0].r, colors[0].g, colors[0].b]);
    } else {
      const s0 = stops[idx - 1],
        s1 = stops[idx];
      const c0 = colors[idx - 1],
        c1 = colors[idx];
      const f = (t - s0) / (s1 - s0);
      lookup.push([
        Math.round(c0.r + (c1.r - c0.r) * f),
        Math.round(c0.g + (c1.g - c0.g) * f),
        Math.round(c0.b + (c1.b - c0.b) * f),
      ]);
    }
  }
  return lookup;
}

function latToMerc(lat) {
  const rad = (lat * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + rad / 2));
}
function mercToLat(mercY) {
  return (2 * Math.atan(Math.exp(mercY)) - Math.PI / 2) * (180 / Math.PI);
}

function pixelToLatLng(x, y, width, height, bounds) {
  // Web Mercator for latitude, linear for longitude
  const minLng = bounds.minLng;
  const maxLng = bounds.maxLng;
  const minMerc = latToMerc(bounds.minLat);
  const maxMerc = latToMerc(bounds.maxLat);
  const tY = y / height;
  const mercY = minMerc + tY * (maxMerc - minMerc);
  const lat = mercToLat(mercY);
  const tX = x / width;
  const lng = minLng + tX * (maxLng - minLng);
  return { lat, lng };
}

function haversine(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const aVal =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
}

function interpolateIDW_directdraw(points, options) {
  const {
    width,
    height,
    cellSize = 10,
    max = 1,
    gradient,
    bounds,
    exp = 2,
  } = options;
  const png = new PNG({ width, height });
  const grad = createGradientLookup(gradient);

  // Prefill entire image with gradient[0] so pixels with no computation
  // use the default color (e.g. "cold" / 0-stop).
  const bg = grad[0];
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const idx = (py * width + px) * 4;
      const alpha = 1;
      png.data[idx] = bg[0];
      png.data[idx + 1] = bg[1];
      png.data[idx + 2] = bg[2];
      png.data[idx + 3] = Math.round(255 * alpha);
    }
  }

  // Calculate grid size
  const r = cellSize;
  const cellCen = r / 2;
  const nCellX = Math.ceil(width / r);
  const nCellY = Math.ceil(height / r);

  const FADE_DISTANCE = 100000; // meters (adjust as needed for your map)

  for (let i = 0; i < nCellY; i++) {
    for (let j = 0; j < nCellX; j++) {
      const x = j * r;
      const y = i * r;
      const latlng = pixelToLatLng(
        x + cellCen,
        y + cellCen,
        width,
        height,
        bounds
      );
      let numerator = 0,
        denominator = 0,
        minDist = Infinity;
      for (const pt of points) {
        const dist = haversine(latlng, { lat: pt[0], lng: pt[1] });
        minDist = Math.min(minDist, dist);
        const val = pt[2];
        const dist2 = Math.pow(dist, exp) || 1e-6;
        numerator += val / dist2;
        denominator += 1 / dist2;
      }
      let interpolVal = numerator / denominator;
      interpolVal = Math.min(interpolVal, max);

      // Handle the case when max is 0 (all values are 0)
      let gradientIndex;
      if (max === 0) {
        gradientIndex = 0; // Use the first color in gradient
      } else {
        gradientIndex = Math.round((interpolVal / max) * 255);
      }

      // Feathering: blend with default color if far from stations
      let alpha = 1;
      if (minDist > FADE_DISTANCE) {
        alpha = Math.max(0, 1 - (minDist - FADE_DISTANCE) / FADE_DISTANCE);
      }
      const interpColor = grad[gradientIndex];
      const color = [
        Math.round(interpColor[0] * alpha + bg[0] * (1 - alpha)),
        Math.round(interpColor[1] * alpha + bg[1] * (1 - alpha)),
        Math.round(interpColor[2] * alpha + bg[2] * (1 - alpha)),
      ];

      // Fill cell
      for (let dy = 0; dy < r; dy++) {
        for (let dx = 0; dx < r; dx++) {
          const px = x + dx;
          const py = y + dy;
          if (px < width && py < height) {
            const idx = (py * width + px) * 4;
            png.data[idx] = color[0];
            png.data[idx + 1] = color[1];
            png.data[idx + 2] = color[2];
            png.data[idx + 3] = Math.round(255 * alpha);
          }
        }
      }
    }
  }
  return PNG.sync.write(png);
}

module.exports = { interpolateIDW_directdraw };
