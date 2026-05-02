const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const citas = await prisma.cita.findFirst();
  console.log("CITA", citas);
  console.log("KC3_MEDICO string:", String(citas.KC3_MEDICO));
  console.log("KC3_HH type:", typeof citas.KC3_HH, "toString:", citas.KC3_HH.toString());
}
main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
