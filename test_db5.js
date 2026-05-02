require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function test() {
    const today = parseInt(new Date('2026-03-21T12:00:00').toISOString().split('T')[0].replace(/-/g, ''));
    console.log("Searching appointments for >= 20260321");
    const citas = await prisma.cita.findMany({
        where: { KC3_FCH: { gte: 20260321 } }
    });
    fs.writeFileSync('debug_citas_output.json', JSON.stringify(citas, null, 2));
    console.log("Saved to debug_citas_output.json");
    await prisma.$disconnect();
}
test().catch(e => {
    fs.writeFileSync('debug_citas_error.txt', String(e));
});
