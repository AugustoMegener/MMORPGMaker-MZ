/* global MMO_Core */
const r = require("rethinkdb");
const fs = require("fs");
const path = require("path");

const initialServerConfig = {
    port: parseInt(process.env.HTTP_PORT) || 8097,
    passwordRequired: process.env.PASSWORD_REQUIRED === "true",
    newPlayerDetails: {
        permission: 0,
        mapId: 1,
        skin: {
            characterIndex: 0,
            characterName: "Actor1",
            battlerName: "Actor1_1",
            faceName: "Actor1",
            faceIndex: 0
        },
        x: 5,
        y: 5
    },
    globalSwitches: {
    },
    partySwitches: {
    },
    globalVariables: {
    },
    offlineMaps: {
    }
};

class Database {
    static DB_CONNECTION_TIMEOUT = 1000 * 60 * 5;

    /**
     * Ideally, we don't want to re-establish a connection each time we need the database
     * but at the same time, keeping an inactive connection active for hours may not be desirable
     * depending on the database system.
     * What we'll do is keep a connection active but close it after <DB_CONNECTION_TIMEOUT> miliseconds of inactivity
     */
    constructor() {
        this.connection = null;
        this.initialized = false;
        this.disconnectTimeout = null;
        this.config = {};
    }

    /**
     * Open the connection if necessary
     * @return {Promise<void>}
     */
    async connect() {
        if (this.connection !== null) return this.extendTimeout();
        this.connection = await r.connect({
            host: process.env.RETHINKDB_HOST ?? "localhost",
            port: parseInt(process.env.RETHINKDB_PORT) || 28015
        });
        this.setDisconnectionTimeout();
    }

    /**
     * Schedules the closing of the connection
     */
    setDisconnectionTimeout() {
        this.disconnectTimeout = setTimeout(() => {
            this.connection?.close();
            this.connection = null;
            this.disconnectTimeout = null;
        }, Database.DB_CONNECTION_TIMEOUT);
    }

    /**
     * Extends the connection's lifetime
     */
    extendTimeout() {
        if (this.disconnectTimeout === null) return;
        clearTimeout(this.disconnectTimeout);
        this.setDisconnectionTimeout();
    }

    /**
     * Creates the database if necessary
     *
     * @return {Promise<void>}
     */
    async initialize() {
        if (this.initialized) return;
        await this.connect();
        const dbList = await r.dbList().run(this.connection);
        if (dbList.includes("mmorpg")) {
            MMO_Core.security.loadTokens();
            console.log("[I] Database initialized with success"); // And we abort any additional procedures
            this.initialized = true;
            return;
        }
        console.log("[O] I have not found the database! 😱  Let me fix that for you...");
        // Else, we create the database and its tables
        await r.dbCreate("mmorpg").run(this.connection);
        this.connection.use("mmorpg");
        console.log("[I] Database was created with success");

        // We create the tables asynchronously
        await Promise.all(["users", "maps", "events", "encounters", "banks", "config"]
          .map((table) => r.db("mmorpg").tableCreate(table).run(this.connection).then(() => {
            console.log(`[I] Table ${table} was created successfully`);
          }))
        );

        // We populate the tables
        await r.db("mmorpg").table("users").insert([{
            ...initialServerConfig.newPlayerDetails,
            username: "admin",
            password: MMO_Core.security.hashPassword("admin"),
            permission: 100
        }]).run(this.connection);
        console.log("[I] Initial admin account created.");

        const mapFolder = path.join(__dirname, "..", "..", "data");
        const mapInfos = JSON.parse(
          await fs.promises.readFile(path.join(mapFolder, "MapInfos.json"), 'utf8')
        ).filter(Boolean); // Removing the `null` element
        for (const mapInfo of mapInfos) {
            const mapFileId = String(mapInfo.id).padStart(3, "0");
            const mapData = JSON.parse(
              await fs.promises.readFile(path.join(mapFolder, `Map${mapFileId}.json`), 'utf8')
            );
            const events = mapData.events.filter(Boolean).map(event => ({...event, mapId: mapInfo.id}));
            const encounterList = mapData.encounterList.map(encounter => ({...encounter, mapId: mapInfo.id}));
            delete mapData.events;
            delete mapData.encounterList;
            await r.db("mmorpg").table("maps").insert([{
                ...mapData,
                id: mapInfo.id,
                name: mapInfo.name,
                parentId: mapInfo.parentId
            }]).run(this.connection);
            for (const event of events) {
                event.idInMap = event.id;
                delete event.id;
                await r.db("mmorpg").table("events").insert([event]).run(this.connection);
            }
            for (const encounter of encounterList) {
                await r.db("mmorpg").table("encounters").insert([encounter]).run(this.connection);
            }
            console.log(`[I] Created map ${mapInfo.name}...`);
        }

        await r.db("mmorpg").table("config").insert([initialServerConfig]).run(this.connection);
        console.log("[I] Initial server configuration was created with success.");
        console.log("[I] All good! Everything is ready for you 😘");
        console.log("[I] Database initialized with success");
        this.initialized = true;
    }

    // Players
    async getPlayers() {
        await this.connect();
        const players = await r.db("mmorpg").table("users").run(this.connection);
        return await players.toArray();
    }

    async findUser(userDetails) {
        const player = await r.db("mmorpg").table("users")
          .filter((user) => user("username").match(`(?i)^${userDetails.username}$`))
          .run(this.connection);
        return (await player.toArray()).pop();
    }

    async findUserById(userId) {
        await this.connect();
        const player = r.db("mmorpg").table("users").get(userId).run(this.connection);
        return player;
    }

    async deleteUser(userId) {
        await this.connect();
        await r.db("mmorpg").table("users").get(userId).delete().run(this.connection);
    }

    async registerUser(userDetails) {
        const userPayload = {
            ...initialServerConfig.newPlayerDetails,
            username: userDetails.username,
            password: (this.config.passwordRequired && userDetails.password) ?
              MMO_Core.security.hashPassword(userDetails.password) :
              undefined
        };

        await r.db("mmorpg").table("users").insert(userPayload).run(this.connection);
    }

    async savePlayer(playerData) {
        await this.connect();
        const usernamePattern = `(?i)^${playerData.username}$`;
        let request = r.db("mmorpg").table("users")
          .filter(function(user) {
              return user("username").match(usernamePattern);
          })
          .update(playerData);

        if (playerData.stats) {
            request = request.do(r.db("mmorpg").table("users")
              .filter(function(user) {
                  return user("username").match(usernamePattern);
              })
              .update({ stats: r.literal(playerData.stats) }));
        }

        return await request.run(this.connection);
    }

    // Maps
    async getMaps() {
        await this.connect();
        const maps = await r.db("mmorpg").table("maps").run(this.connection);
        return await maps.toArray();
    }

    async getMap(id, returnFullObject = false) {
        await this.connect();
        const events = await r.db("mmorpg").table("events").filter({mapId: id}).run(this.connection);
        const encounterList = await r.db("mmorpg").table("encounters").filter({mapId: id}).run(this.connection);
        const map = returnFullObject ?
          await r.db("mmorpg").table("maps").get(id).run(this.connection) :
          {};
        return {
            ...map,
            events: await events.toArray().map(event => {
                event.id = event.idInMap;
                delete event.idInMap;
                return event;
            }),
            encounterList: await encounterList.toArray()
        };
    }
    // Banks
    async getBanks() {
        await this.connect();
        const banks = r.db("mmorpg").table("banks").run(this.connection);
        return await banks.toArray();
    }

    async getBank(name) {
        await this.connect();
        return await r.db("mmorpg").table("banks").filter({name}).run(this.connection);
    }

    async getBankById(id) {
        await this.connect();
        return await r.db("mmorpg").table("banks").get(id).run(this.connection);
    }

    async saveBank(bank) {
        await this.connect();
        return await r.db("mmorpg").table("banks")
          .get(bank.id)
          .update(bank)
          .run(this.connection);
    }

    async createBank(payload) {
        const content = (payload.type === "global") ? { items: {}, weapons: {}, armors: {}, gold: 0 } : {};
        const template = {
            name: payload.name,
            type: payload.type,
            content: content
        };
        await this.connect();
        return await r.db("mmorpg").table("banks")
          .insert(template)
          .run(this.connection);
    }

    async deleteBank(id) {
        await this.connect();
        return await r.db("mmorpg").table("banks")
          .get(id)
          .delete()
          .run(this.connection);
    }

    // Config
    async reloadConfig() {
        await this.connect();
        this.config = await r.db("mmorpg").table("config")(0).run(this.connection);
    }

    async changeConfig(type, payload) {
        await this.connect();
        await r.db("mmorpg").table("config")(0).update({[type]: r.literal(payload)}).run(this.connection);
        await this.reloadConfig()
    }

    async saveConfig() {
        await this.connect();
        await r.db("mmorpg").table("config")(0)
          .update(this.config)
          .run(this.connection);
        console.log("[I] Server configuration changes saved.");
    }
}

const database = new Database();

module.exports = database;
