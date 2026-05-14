/**
 * ANÁLISIS ESTÁTICO DEL FLUJO DE AGENDAMIENTO
 * Identifica bugs potenciales sin necesidad de conexión a BD
 */
require('dotenv').config();

console.log('\n=== ANÁLISIS DEL FLUJO DE AGENDAMIENTO ===\n');

// ─── 1. Revisar reserveSlot: KC3_NUM fijo en 0 ───────────────────────────────
console.log('🔍 [1] KC3_NUM fijo en 0 (línea ~703 availability_service.js):');
console.log('   KC3_NUM: 0  ← Siempre cero. Si la BD requiere un número único, esto causaría');
console.log('   error de UNIQUE constraint o el Visor de Agenda no muestra la cita.\n');

// ─── 2. KC3_SEQK vacío siempre ────────────────────────────────────────────────
console.log('🔍 [2] KC3_SEQK fijo en "" (línea ~642):');
console.log('   const seqk = "";  ← Siempre vacío.');
console.log('   Si la clave primaria de KC3 incluye SEQK, puede colisionar con registros existentes.\n');

// ─── 3. Revisar parseRelativeDate con null ────────────────────────────────────
const { parseRelativeDate } = require('./availability_service');
const tests = [
    { input: 'mañana', expected: 'YYYY-MM-DD' },
    { input: 'hoy', expected: 'YYYY-MM-DD' },
    { input: '2026-09-10', expected: '2026-09-10' },
    { input: 'Viernes', expected: 'null o fecha' },
    { input: 'próxima semana', expected: 'YYYY-MM-DD' },
    { input: null, expected: 'null' },
    { input: undefined, expected: 'null' },
];

console.log('🔍 [3] parseRelativeDate tests:');
for (const t of tests) {
    try {
        const result = parseRelativeDate(t.input);
        const ok = result !== 'Invalid Date' && (result === null || /^\d{4}-\d{2}-\d{2}$/.test(result));
        console.log(`   ${ok ? '✅' : '❌'} parseRelativeDate("${t.input}") = "${result}"`);
    } catch(e) {
        console.log(`   💥 parseRelativeDate("${t.input}") EXCEPCIÓN: ${e.message}`);
    }
}

// ─── 4. Revisar normalizeTipoCita ─────────────────────────────────────────────
const { normalizeTipoCita } = require('./availability_service');
const tipoTests = ['medicina general', 'medico general', '999', 'odontologia', null, undefined, ''];
console.log('\n🔍 [4] normalizeTipoCita tests:');
for (const t of tipoTests) {
    const result = normalizeTipoCita(t);
    console.log(`   normalizeTipoCita("${t}") = "${result}"`);
}

// ─── 5. Revisar codigoToNombreServicio ────────────────────────────────────────
const { codigoToNombreServicio } = require('./availability_service');
console.log('\n🔍 [5] codigoToNombreServicio:');
['999', 'medicina general', null, '461', '0'].forEach(c => {
    console.log(`   codigoToNombreServicio("${c}") = "${codigoToNombreServicio(c)}"`);
});

// ─── 6. Revisar getAvailableSlots con prisma=null ────────────────────────────
console.log('\n🔍 [6] Comportamiento sin DB (prisma=null):');
const { getAvailableSlots } = require('./availability_service');
getAvailableSlots('2026-09-10', 'medicina general').then(slots => {
    console.log(`   getAvailableSlots sin DB retorna: ${JSON.stringify(slots)} (esperado: [])`);
}).catch(e => {
    console.log(`   💥 getAvailableSlots sin DB EXCEPCIÓN: ${e.message}`);
});

// ─── 7. Revisar el campo serviceType en AppointmentLog ───────────────────────
console.log('\n🔍 [7] Campo serviceType guardado como tipoCita ("medicina general" en lugar de "999"):');
console.log('   En index.js línea ~1600: serviceType: String(userData.tipoCita)');
console.log('   userData.tipoCita = "medicina general" (siempre forzado en línea ~1276)');
console.log('   codigoToNombreServicio("medicina general") =', codigoToNombreServicio('medicina general'));
console.log('   → El visor muestra "medicina general" en lugar de "Medicina General" ⚠️\n');

// ─── 8. Revisar timeout del finalizarCita ─────────────────────────────────────
console.log('🔍 [8] finalizarCita: reserveSlot valida el slot con getAvailableSlots(skipLimit=true)');
console.log('   Luego crea la cita. Si la BD tarda >30s, el bot puede responder antes de confirmar.');
console.log('   El AppointmentLog se guarda DESPUÉS de reserveSlot → si reserveSlot falla, no hay log.\n');

// ─── 9. Revisar entidad 0 y contrato por defecto ─────────────────────────────
console.log('🔍 [9] Contrato por defecto cuando entidad=0:');
const contratoPorEntidad = {
    235:  { num: 'RS-0159-2026',     seq: 3 },
    141:  { num: '01_EVN_890982370', seq: 2 },
    265:  { num: 'RC-0160-2026',     seq: 3 },
    550:  { num: '0474-2025',         seq: 1 },
};
const contratoDefault = contratoPorEntidad[0] || { num: '0152-2025', seq: 2 };
console.log(`   Entidad=0 → contrato="${contratoDefault.num}" seq=${contratoDefault.seq}`);
console.log('   ⚠️  Si la mayoría de pacientes tienen entidad=0, todas usan el mismo contrato.');
console.log('   Verificar si ese contrato es válido para todos los pacientes.\n');

console.log('=== FIN DEL ANÁLISIS ===\n');
