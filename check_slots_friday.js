const { getAvailableSlots } = require('./availability_service');
const sql = require('mssql');
require('dotenv').config();

async function run() {
    const slots = await getAvailableSlots('2026-04-10');
    console.log("April 10 slots:", slots.length);
    if(slots.length > 0) console.log(slots[0]);
    process.exit(0);
}
run();
