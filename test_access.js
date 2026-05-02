const sql = require('mssql');
require('dotenv').config();

const config = {
    user: 'AURORA',
    password: 'AURORA890982370',
    server: '10.32.93.90', 
    port: 1433,
    database: 'HABEJICO',
    options: {
        encrypt: true,
        trustServerCertificate: true,
        enableArithAbort: true
    }
};

async function test() {
    try {
        console.log('Conectando a SQL Server con usuario AURORA...');
        let pool = await sql.connect(config);
        console.log('¡Conexión Exitosa!');
        let result = await pool.request().query('SELECT TOP 1 * FROM INFORMATION_SCHEMA.TABLES');
        console.log('Prueba de consulta exitosa. Tablas encontradas:', result.recordset.length > 0);
        await sql.close();
    } catch (err) {
        console.error('Error de conexión:', err.message);
        if (err.originalError) {
          console.error('Detalle del error:', err.originalError.message);
        }
    }
}

test();
