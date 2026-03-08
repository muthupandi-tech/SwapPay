const mysql = require('mysql2');
const bcrypt = require('bcrypt');

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'mysqlpandi',
    database: 'swappay'
});

connection.connect(async (err) => {
    if (err) throw err;
    console.log('Connected to MySQL server.');

    const adminPasswordHash = await bcrypt.hash('admin123', 10);
    const query = `
        INSERT IGNORE INTO users (name, phone, email, college, password, role) 
        VALUES ('System Admin', '0000000000', 'admin@swappay.com', 'AdminHQ', ?, 'admin')
    `;

    connection.query(query, [adminPasswordHash], (err, results) => {
        if (err) {
            console.error('Error seeding admin via override script:', err);
        } else {
            console.log('Admin user forcefully seeded via test-seed.js');
        }
        connection.end();
    });
});
