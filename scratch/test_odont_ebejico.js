const availabilityService = require('../availability_service');

async function main() {
  try {
    console.log('=== TEST: Odontología en Ebejico ===');
    console.log('Buscando slots para los próximos 7 días...\n');
    
    // Probar getNextAvailableSlots para odontología en Ebejico
    const hoy = new Date();
    const todayStr = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;
    
    console.log(`Fecha de inicio: ${todayStr}`);
    const result = await availabilityService.getNextAvailableSlots(todayStr, 'odontologia', null, 'Ebejico');
    
    if (result) {
      console.log(`\n✅ ¡ENCONTRADO! Próxima fecha disponible: ${result.date}`);
      console.log(`Número de slots: ${result.slots.length}`);
      console.log('Primeros 5 slots:');
      result.slots.slice(0, 5).forEach(s => {
        console.log(`  - ${s.time} | ${s.doctorName}`);
      });
    } else {
      console.log('\n❌ No se encontraron slots disponibles para odontología en Ebejico');
    }
    
    // Probar directamente en una fecha específica
    const fecha18 = '2026-07-18';
    console.log(`\n=== Slots directos para ${fecha18} ===`);
    const slots18 = await availabilityService.getAvailableSlots(fecha18, 'odontologia', null, true, 'Ebejico');
    console.log(`Slots encontrados: ${slots18.length}`);
    slots18.forEach(s => {
      console.log(`  - ${s.time} | ${s.doctorName} (cod: ${s.doctorId})`);
    });

  } catch(e) {
    console.error('Error:', e.message);
    console.error(e.stack);
  }
}

main();
