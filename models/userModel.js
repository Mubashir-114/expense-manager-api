import db from '../config/db.js';

export const findUserByEmail = async (email) => {
  const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
  return rows[0];
};

export const createUser = async(name,email,password)=> {
    const [result] = await db.execute(
        `Insert into users(name,email,password) values(?,?,?)`,
        [name,email,password]
    );
    return result.insertId;
};

export const findUserById = async (id) => {
  const [rows] = await db.execute('SELECT id,name,email,created_at FROM users WHERE id = ?', [id]);
  return rows[0];
};