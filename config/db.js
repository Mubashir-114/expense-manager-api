import mysql from "mysql2/promise";
import dotenv from "dotenv";

import { validateTestDatabaseConfig } from "../utils/configValidation.js";

if (process.env.NODE_ENV === "test") {
    validateTestDatabaseConfig();
} else {
    dotenv.config();
}

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,

    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
});

export default pool;