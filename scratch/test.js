require('dotenv').config();
const sql = require('mssql');

const config = {
    user: 'AURORA',
    password: 'AURORA890982370',
    server: '10.32.93.90',
    database: 'HABEJICO',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function run() {
    try {
        await sql.connect(config);
        
        const q1 = "SELECT TOP 1 * FROM TMRESULTADOSLABORATORIOE ORDER BY RL1_FCH DESC";
        const res1 = await sql.query(q1);
        console.dir(res1.recordset[0]);

        if(res1.recordset.length > 0) {
            const e = res1.recordset[0];
            const q2 = `SELECT TOP 5 * FROM TMRESULTADOSLABORATORIOD WHERE RL2_COD_TIPO='${e.RL1_COD_TIPO}' AND RL2_COD_NUM=${e.RL1_COD_NUM}`;
            const res2 = await sql.query(q2);
            console.dir(res2.recordset);
        }

    } catch (e) {
        console.error('ERROR:', e.message);
    } finally {
        await sql.close();
    }
}
run();
