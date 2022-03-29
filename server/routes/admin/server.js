/* global MMO_Core, isTokenValid */
const router = require("express").Router();

// Send back the configurations of the server
router.get("/", isTokenValid, async (req, res) => {
    res.status(200).json({
        serverConfig: MMO_Core.database.config,
        gameData: MMO_Core.gamedata.data
    });
});

// Update the server configuration
router.patch("/:type", isTokenValid, async (req, res) => {
    if (!req.body) {
        return res.status(400).json({ error: "Bad Request" });
    }

    await MMO_Core.database.changeConfig(req.params.type, req.body);
    res.status(200).send(true);
});

module.exports = router;
