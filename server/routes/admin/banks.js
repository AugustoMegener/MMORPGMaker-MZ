/* global MMO_Core, isTokenValid */
const router = require("express").Router();

/*****************************
 EXPORTS
 *****************************/

// Send back the configurations of the server
router.get("/", isTokenValid, async (req, res) => {
    res.status(200).json(await MMO_Core.database.getBanks());
});

router.post("/", isTokenValid, async (req, res) => {
    await MMO_Core.database.createBank(req.body);
    res.status(200).send();
});

router.delete("/:id", isTokenValid, async (req, res) => {
    if (!req.params.id) {
        return;
    }

    await MMO_Core.database.deleteBank(req.params.id);
    res.status(200).send();
});

/*****************************
 FUNCTIONS
 *****************************/

module.exports = router;
