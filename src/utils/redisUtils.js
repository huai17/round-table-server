const redis = require("redis");

const { REDIS_URI } = require("./configs/keys");
const client = redis.createClient({ host: REDIS_URI, port: 6379 });
const { promisify } = require("util");
const hset = promisify(client.hset).bind(client);
const hget = promisify(client.hget).bind(client);
const hdel = promisify(client.hdel).bind(client);
const hgetall = promisify(client.hgetall).bind(client);
const del = promisify(client.del).bind(client);
const exists = promisify(client.exists).bind(client);
const keys = promisify(client.keys).bind(client);

module.exports = { hset, hget, hdel, hgetall, del, exists, keys };
