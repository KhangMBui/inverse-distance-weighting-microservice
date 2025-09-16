// idw.js
// Node.js module for IDW interpolation and image generation

const { PNG } = require("pngjs");

/**
 * Interpolates values over a grid using the IDW algorithm.
 * @param {Array} points - Array of [lat, lng, value]
 * @param {Object} options - { width, height, cellSize, max, gradient, bounds }
 * @returns {Buffer} PNG image buffer
 */
function interpolateIDW(points, options) {
  const { width, height, cellSize = 1, max = 1, gradient, bounds } = options;
  const png = new PNG({ width, height });
  const grad = createGradientLookup(gradient);

  for (let y = 0; y < height; y += cellSize) {
    for (let x = 0; x < width; x += cellSize) {
      const latlng = pixelToLatLng(
        x + cellSize / 2,
        y + cellSize / 2,
        width,
        height,
        bounds
      );
      let numerator = 0,
        denominator = 0;
      for (const p of points) {
        const dist = haversine(latlng, { lat: p[0], lng: p[1] });
        const val = p[2];
        const exp = options.exp || 2;
        const dist2 = Math.pow(dist, exp) || 1e-6;
        numerator += val / dist2;
        denominator += 1 / dist2;
      }
      let interpolVal = numerator / denominator;
      interpolVal = Math.min(interpolVal, max);
      const color = grad[Math.round((interpolVal / max) * 255)];
      // Fill cellSize x cellSize block
      for (let dy = 0; dy < cellSize; dy++) {
        for (let dx = 0; dx < cellSize; dx++) {
          const px = x + dx;
          const py = y + dy;
          if (px < width && py < height) {
            const idx = (py * width + px) * 4;
            png.data[idx] = color[0];
            png.data[idx + 1] = color[1];
            png.data[idx + 2] = color[2];
            png.data[idx + 3] = 255;
          }
        }
      }
    }
  }
  return PNG.sync.write(png);
}

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

// function pixelToLatLng(x, y, width, height, bounds) {
//   // bounds: { minLat, minLng, maxLat, maxLng }
//   const lat = bounds.minLat + (y / height) * (bounds.maxLat - bounds.minLat);
//   const lng = bounds.minLng + (x / width) * (bounds.maxLng - bounds.minLng);
//   return { lat, lng };
// }

function latToMerc(lat) {
  // convert lat (deg) -> mercator Y
  const rad = (lat * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + rad / 2));
}
function mercToLat(mercY) {
  // convert mercator Y -> lat (deg)
  return (2 * Math.atan(Math.exp(mercY)) - Math.PI / 2) * (180 / Math.PI);
}

function pixelToLatLng(x, y, width, height, bounds) {
  // bounds: { minLat, minLng, maxLat, maxLng }
  // Use Web Mercator in latitude direction so image lines up with Leaflet
  const minLng = bounds.minLng;
  const maxLng = bounds.maxLng;

  const minMerc = latToMerc(bounds.minLat);
  const maxMerc = latToMerc(bounds.maxLat);

  // note: y = 0 is top; interpolate mercator Y top->bottom
  const tY = y / height;
  const mercY = minMerc + tY * (maxMerc - minMerc);
  const lat = mercToLat(mercY);

  const tX = x / width;
  const lng = minLng + tX * (maxLng - minLng);

  return { lat, lng };
}

function haversine(a, b) {
  // Returns distance in meters between two lat/lng points
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

module.exports = { interpolateIDW };
