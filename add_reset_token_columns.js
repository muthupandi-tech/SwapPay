const mysql = require('mysql2');

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'mysqlpandi',
    database: 'swappay'
});

connection.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL:', err);
        return;
    }
    console.log('Connected to MySQL server.');

    const alterTableQuery = `
        ALTER TABLE users
        ADD COLUMN reset_token VARCHAR(255),
        ADD COLUMN reset_token_expiry DATETIME;
    `;

    connection.query(alterTableQuery, (err, results) => {
        if (err) {
            console.error('Error altering users table:', err);
        } else {
            console.log('Columns "reset_token" and "reset_token_expiry" added successfully (or already present).');
        }
        connection.end();
    });
});
