/* global MMO_Core */
exports.initialize = function(io) {
    exports.use = async (args, initiator) => {
        if (args.length < 3) {
            return MMO_Core.socket.modules.messages.sendToPlayer(initiator, "System", "Not enough arguments.", "error");
        }

        const oldPassword = MMO_Core.security.hashPassword(args[1]);
        const newPassword = MMO_Core.security.hashPassword(args[2]);

        const user = await MMO_Core.database.findUser({ username: initiator.playerData.username });
        if (oldPassword !== user.password) {
            return MMO_Core.socket.modules.messages.sendToPlayer(initiator, "System", "Wrong old password.", "error");
        }

        const payload = {
            username: initiator.playerData.username,
            password: newPassword
        };

        await MMO_Core.database.savePlayer(payload);
        return MMO_Core.socket.modules.messages.sendToPlayer(initiator, "System", "Password changed with success!", "action");
    };
};
