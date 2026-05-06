const { PrismaClient } = require('@prisma/bot-client');
const path = require('path');

const prisma = new PrismaClient({
    datasourceUrl: `file:${path.join(__dirname, 'prisma', 'bot.db')}`
});

module.exports = prisma;
