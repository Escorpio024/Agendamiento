require('dotenv').config();
const { reserveSlot } = require('./availability_service');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    try {
        console.log("Testing reservation...");
        // Use a test pacien with ID '12345'
        const success = await reserveSlot('mañana', '10:00 AM', '12345', '999', 44191600);
        console.log("Reservation result:", success);
    } catch (e) {
        console.error("Test failed:", e);
    } finally {
        await prisma.$disconnect();
    }
}
run();
