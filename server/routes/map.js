const router = require("express").Router();
const database = require("../core/database");

router.get("/:name", async (req, res) => {
  if (!req.params.name) {
    return res.status(404).send();
  }
  if (req.params.name === 'MapInfos.json') {
    const maps = await database.getMaps();
    return res.json([null, ...maps.map((map, index) => ({
      id: map.id,
      expanded: true,
      name: map.name,
      order: index + 1,
      parentId: map.parentId,
      scrollX: 0,
      scrollY: 0
    }))]);
  }
  const matches = req.params.name.match(/^Map([0-9]+).json$/);
  if (matches === null) return res.status(404).send();
  const id = parseInt(matches[1]);
  const mapInfo = await database.getMap(id, true);
  delete mapInfo.id;
  delete mapInfo.name;
  mapInfo.events.unshift(null);
  res.json(mapInfo);
});

module.exports = router;
