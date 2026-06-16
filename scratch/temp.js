const p = require('./db');
async function run() {
    try {
        const r = await p.$queryRawUnsafe("SELECT TOP 20 ENT_COD, ENT_NOMBRE FROM TMENTIDADES WHERE ENT_NOMBRE LIKE '%Savia%' OR ENT_NOMBRE LIKE '%NUEVA EPS%'");
        console.log(r);
    } catch(e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
run();
