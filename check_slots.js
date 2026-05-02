const { getAvailableSlots } = require('./availability_service');
async function run() {
    const slots = await getAvailableSlots('2026-04-09');
    console.log(slots);
    process.exit(0);
}
run();
