const { reserveSlot } = require('./availability_service');
const prisma = require('./db');

async function main() {
  const result = await reserveSlot('2024-12-01', '8:00 AM', '3000000000', 'medicina general');
  console.log('Result:', result);
}
main().finally(() => prisma.$disconnect());
