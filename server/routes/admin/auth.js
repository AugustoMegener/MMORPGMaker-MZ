/* global MMO_Core, isTokenValid, activeTokens */
const router = require("express").Router();

// Sign in the user
router.post("/signin", async (req, res) => {
    if ((req.body) === undefined || (req.body.password && req.body.username) === undefined) {
        return res.status(400).send({ message: "Fields missing" });
    }

    const user = await MMO_Core.database.findUser(req.body);

    // If user is not found or password is incorrect.
    if (user === undefined || MMO_Core.security.hashPassword(req.body.password) !== user.password) {
        return res.status(401).send({ message: "Incorrect username/password" });
    }

    // If permission is incorrect
    if (user.permission < 100) {
        return res.status(403).send({ message: "You are not permitted to use this page." });
    }

    // Generate valide JWT and send it back
    MMO_Core.security.generateToken(req, user, function(_err, result) {
        res.status(200).send(result);
    });
});

// Logout user from JWT
router.get("/logout", isTokenValid, function(req, res) {
    // We filter the variables to get ride of the bad one
    activeTokens[req.token.decoded.username] = activeTokens[req.token.decoded.username].filter(function(value) {
        return value.token !== req.token.token;
    });

    res.status(200).send(true);
});

module.exports = router;
