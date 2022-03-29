/* global MMO_Core, isTokenValid */
const router = require("express").Router();

/*****************************
 EXPORTS
 *****************************/

// Send back the configurations of the server
router.get("/:playerId?", isTokenValid, async (req, res) => {
    if (!req.params.playerId) {
        return res.status(200).json(await MMO_Core.database.getPlayers());
    }
    res.status(200).json(await MMO_Core.database.findUserById(req.params.playerId));
});

router.patch("/", isTokenValid, async (req, res) => {
    if (!req.body.username) {
        return;
    }

    await MMO_Core.database.savePlayer(req.body);
    res.status(200).json({ success: true });
});

router.delete("/:playerId", isTokenValid, async (req, res) => {
    if (!req.params.playerId) {
        return;
    }

    await MMO_Core.database.deleteUser(req.params.playerId);
    res.status(200).json({ success: true });
});

/*****************************
 FUNCTIONS
 *****************************/

module.exports = router;
