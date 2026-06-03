require('dotenv').config();
const { getAvailableSlots, getWeekAvailability } = require('./availability_service');

async function verificarDisponibilidad() {
    const hoy = new Date();
    const fechaInicio = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;

    console.log(`\n🗓️  Disponibilidad desde hoy (${fechaInicio}) — próximos 14 días:\n`);

    try {
        const semana = await getWeekAvailability(fechaInicio, 'medicina general', null, 14, 14);

        if (!semana.length) {
            console.log('❌ No se encontraron días con disponibilidad en los próximos 14 días.');
        } else {
            for (const dia of semana) {
                console.log(`  📅 ${dia.dayName} ${dia.date} → ${dia.slotCount} slot(s) | ${dia.firstSlot} – ${dia.lastSlot}`);
            }
        }

        // Ahora verificar hoy en detalle por doctor
        console.log(`\n👨‍⚕️  Detalle de doctores y slots para MAÑANA:\n`);
        const manana = new Date(hoy); manana.setDate(hoy.getDate() + 1);
        const fechaManana = `${manana.getFullYear()}-${String(manana.getMonth()+1).padStart(2,'0')}-${String(manana.getDate()).padStart(2,'0')}`;

        const slots = await getAvailableSlots(fechaManana, 'medicina general', null, true);

        if (!slots.length) {
            console.log(`  Sin slots disponibles para mañana (${fechaManana})`);
        } else {
            // Agrupar por doctor
            const porDoctor = {};
            for (const s of slots) {
                const key = `${s.doctorId}|${s.doctorName}`;
                if (!porDoctor[key]) porDoctor[key] = [];
                porDoctor[key].push(s.time);
            }
            for (const [key, times] of Object.entries(porDoctor)) {
                const [id, nombre] = key.split('|');
                console.log(`  Dr. ${nombre} (cod ${id}) → ${times.length} slot(s): ${times.slice(0,5).join(', ')}${times.length > 5 ? ' ...' : ''}`);
            }
        }

        // También verificar próximos 3 días con detalle
        console.log(`\n📊 Slots por doctor — próximos 3 días:\n`);
        for (let i = 0; i < 3; i++) {
            const d = new Date(hoy); d.setDate(hoy.getDate() + i);
            const fd = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            const dias = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
            const slotsD = await getAvailableSlots(fd, 'medicina general', null, true);
            
            if (!slotsD.length) {
                console.log(`  ${dias[d.getDay()]} ${fd}: Sin disponibilidad`);
                continue;
            }
            const porDr = {};
            for (const s of slotsD) {
                if (!porDr[s.doctorName]) porDr[s.doctorName] = 0;
                porDr[s.doctorName]++;
            }
            const resumen = Object.entries(porDr).map(([n,c]) => `${n.trim()}(${c})`).join(' | ');
            console.log(`  ${dias[d.getDay()]} ${fd}: ${slotsD.length} slots → ${resumen}`);
        }

    } catch(err) {
        console.error('❌ Error:', err.message);
    }
    process.exit(0);
}

verificarDisponibilidad();
