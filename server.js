// server.js
// Express server for IDW interpolation

const express = require("express");
// const { interpolateIDW } = require("./idw");
const { interpolateIDW_directdraw } = require("./idw_2");
const cors = require("cors");

const app = express();
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json({ limit: "10mb" }));

app.post("/interpolate", (req, res) => {
  console.log("Endpoint hit");
  try {
    const { points, width, height, cellSize, max, gradient, bounds, exp } =
      req.body;
    if (!points || !width || !height || !gradient || !bounds) {
      return res.status(400).json({ error: "Missing required parameters." });
    }
    const options = { width, height, cellSize, max, gradient, bounds, exp };
    const pngBuffer = interpolateIDW_directdraw(points, options);
    res.set("Content-Type", "image/png");
    res.send(pngBuffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`IDW backend listening on port ${PORT}`);
});
