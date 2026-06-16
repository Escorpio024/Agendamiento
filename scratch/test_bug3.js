const availabilityService = require('./availability_service');

async function run() {
    console.log("=== SIMULATING LOOP MODO B (NOV 2026) ===");
    
    // PACIENTE 1
    console.log("1. Paciente 1: Llamando a getNextAvailableSlots...");
    const availResult1 = await availabilityService.getNextAvailableSlots(
        '2026-11-05',
        'medicina general',
        'p y p medicos'
    );
    if (!availResult1) return console.log("NO HAY SLOTS EN NOV");
    
    console.log("Paciente 1 slots encontrados:", availResult1.slots.length);
    const slot1 = availResult1.slots[Math.floor(availResult1.slots.length / 2)];
    
    console.log(`2. Paciente 1: reserveSlot en ${availResult1.date} ${slot1.time}`);
    const reserved1 = await availabilityService.reserveSlot(
        availResult1.date, 
        slot1.time, 
        "123", 
        'PYP_CARDIO|890301-7', 
        slot1.doctorId, 
        { KC0_COD: "TEST3", zona: '99' }
    );
    console.log("Paciente 1 reserved:", reserved1);
    
    // PACIENTE 2
    console.log("\n3. Paciente 2: Llamando a getNextAvailableSlots...");
    const availResult2 = await availabilityService.getNextAvailableSlots(
        '2026-11-05',
        'medicina general',
        'p y p medicos'
    );
    if (!availResult2) return console.log("NO HAY SLOTS PARA PACIENTE 2");
    
    console.log("Paciente 2 slots encontrados:", availResult2.slots.length);
    const slot2 = availResult2.slots[Math.floor(availResult2.slots.length / 2)];
    
    console.log(`4. Paciente 2: reserveSlot en ${availResult2.date} ${slot2.time}`);
    const reserved2 = await availabilityService.reserveSlot(
        availResult2.date, 
        slot2.time, 
        "456", 
        'PYP_CARDIO|890301-7', 
        slot2.doctorId, 
        { KC0_COD: "TEST4", zona: '99' }
    );
    console.log("Paciente 2 reserved:", reserved2);
    
    process.exit(0);
}
run();
