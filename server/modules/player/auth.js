/* global MMO_Core */
exports.initialize = function() {
    const io = MMO_Core.socket.socketConnection;

    io.on("connect", function(client) {
        // Handle in-game user login and registration
        // Expect : data : {username, password (optional)}
        client.on("login", async (data) => {
            if (data.username === undefined) {
                return loginError(client, "Missing username");
            }

            if (MMO_Core.database.config.passwordRequired && data.password === undefined) {
                return loginError(client, "Missing password");
            }

            const user = await MMO_Core.database.findUser(data);
            if (user === undefined) {
                return loginError(client, "Bad Credentials");
            }

            // If passwordRequired is activated then we check for password
            if (MMO_Core.database.config.passwordRequired && MMO_Core.security.hashPassword(data.password) !== user.password) {
                return loginError(client, "Bad credentials");
            }

            const existingPlayer = await MMO_Core.socket.modules.player.subs.player.getPlayer(data.username);
            if (existingPlayer !== null) {
                return loginError(client, "Player is already connected.");
            }

            return loginSuccess(client, user);

            // If user doesn't exist
        });

        client.on("register", async (data) => {
            // username validation
            if (data.username === undefined) {
                return loginError(client, "Missing username");
            }
            if (data.username.includes(" ")) {
                return loginError(client, "Username can't contain spaces");
            }
            if (!/^(?=[a-zA-Z0-9\s]{4,25}$)(?=[a-zA-Z0-9\s])(?:([\w\s*?])\1?(?!\1))+$/.test(data.username)) {
                return loginError(client, "Incorrect username format");
            }
            // password validation
            if (MMO_Core.database.config.passwordRequired && data.password === undefined) {
                return loginError(client, "Missing password");
            }

            const user = await MMO_Core.database.findUser(data);
            // If user exist
            if (user !== undefined) {
                return loginError(client, "Cannot create this account."); // Avoid telling that username is taken !
            }

            // If user doesn't exist
            await MMO_Core.database.registerUser(data);
            return registerSuccess(client);
        });

        // Handle the disconnection of a player
        client.on("disconnect", async () => {
            if (client.lastMap === undefined) {
                return;
            }

            MMO_Core.gameworld.removeNode(MMO_Core.gameworld.getNodeBy("playerId", client.playerData.id));
            MMO_Core.gameworld.playerLeaveInstance(client.playerData.id, parseInt(client.playerData.mapId));

            // ANTI-CHEAT : Deleting some entries before saving the character.
            delete (client.playerData.permission); // Avoid permission elevation exploit
            delete (client.playerData.id); // Avoid account-spoofing
            delete (client.playerData.isInCombat); // Sanitizing
            // client.playerData.isInCombat = false;

            MMO_Core.security.createLog(`${client.playerData.username} disconnected from the game.`);

            await MMO_Core.database.savePlayer(client.playerData);
            client.broadcast.to(client.lastMap).emit("map_exited", client.id);
            client.leave(client.lastMap);
        });
    });
};

// ---------------------------------------
// ---------- EXPOSED FUNCTIONS
// ---------------------------------------

exports.saveWorld = function() {
    // To do : Save every players before closing the server
};

// ---------------------------------------
// ---------- PRIVATE FUNCTIONS
// ---------------------------------------

// Connecting the player and storing datas locally
function loginSuccess(client, details) {
    // We remove the things we don't want the user to see
    delete details.password;

    details.isBusy = false;

    // Then we continue
    client.emit("login_success", { msg: details });
    client.playerData = details;
    MMO_Core.gameworld.attachNode(client.playerData, true);
    MMO_Core.security.createLog(client.playerData.username + " connected to the game");
}

// Sending error in case of failure at login
function loginError(client, message) {
    client.emit("login_error", { msg: message });
}

// Register user emitter
function registerSuccess(client) {
    client.emit("register_success", { msg: "Account has been created !" });
}
