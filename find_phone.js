const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function run() {
    const tables = Object.keys(p).filter(k => !k.startsWith('_') && !k.startsWith('$'));
    for (const t of tables) {
        try {
            const fields = Object.keys(p[t].fields);
            for(const f of fields) {
                // only test string columns
                if (typeof p[t].fields[f] === 'object') {
                    const res = await p.$queryRawUnsafe(`SELECT TOP 1 * FROM ${t} WHERE ${f} LIKE '%3217586696%'`);
                    if(res && res.length > 0) {
                        console.log(`FOUND PHONE IN TABLE ${t} on FIELD ${f}:`, res);
                    }
                }
            }
        } catch(e) {}
    }
    p.$disconnect();
}
run();
