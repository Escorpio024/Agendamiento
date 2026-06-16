const availabilityService = require('./availability_service');
const controlCVDService = require('./control_cvd_service');

async function run() {
    console.log("1. Llamando a getNextAvailableSlots...");
    const availResult = await availabilityService.getNextAvailableSlots(
        '2026-08-05',
        'medicina general',
        'p y p medicos'
    );
    console.log("Resultado de getNextAvailableSlots:");
    console.log(availResult);
    
    if (availResult && availResult.slots && availResult.slots.length > 0) {
        const slot = availResult.slots[0];
        console.log(`\n2. Intentando reserveSlot para la fecha ${availResult.date} a las ${slot.time} con el doctor ${slot.doctorId}...`);
        
        // Simular llamada interna de reserveSlot -> getAvailableSlots
        const slots = await availabilityService.getAvailableSlots(
            availResult.date, 
            'PYP_CARDIO|890301-7', 
            null, 
            true, 
            'Ebejico'
        );
        console.log(`\n3. Resultado de getAvailableSlots interno en reserveSlot (slotsCount: ${slots.length}):`);
        
        let hh = parseInt(slot.time.split(':')[0]);
        let mm = parseInt(slot.time.split(':')[1]);
        if (slot.time.includes('PM') && hh < 12) hh += 12;
        if (slot.time.includes('AM') && hh === 12) hh = 0;
        
        const found = slots.find(s => s.doctorId === Number(slot.doctorId) && s.hh === hh && s.mm === mm);
        console.log(`\n4. Búsqueda del slot en el array:`, found ? "ENCONTRADO" : "NO ENCONTRADO");
        
        if (!found) {
            console.log("\n⚠️ LOS SLOTS DISPONIBLES SON:");
            console.log(slots.map(s => `${s.hh}:${s.mm} (Doc: ${s.doctorId})`));
        }
    }
    process.exit(0);
}
run();
