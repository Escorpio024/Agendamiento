// Test de la lógica de ajuste a sábado
function dateToDecimal(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return parseInt(`${y}${m}${day}`);
}

function ajustarASabado(dControl) {
    const diaSemana = dControl.getDay(); // 0=Dom, 1=Lun, ... 6=Sáb
    if (diaSemana === 6) return; // ya es sábado
    
    const diasHastaSabAnterior = diaSemana === 0 ? 1 : diaSemana + 1;
    const diasHastaSabSiguiente = 6 - diaSemana;
    
    const sabAnterior = new Date(dControl);
    sabAnterior.setDate(dControl.getDate() - diasHastaSabAnterior);
    
    const sabSiguiente = new Date(dControl);
    sabSiguiente.setDate(dControl.getDate() + diasHastaSabSiguiente);
    
    // Escoger más cercano (en empate, preferir anterior)
    if (diasHastaSabSiguiente <= diasHastaSabAnterior) {
        dControl.setTime(sabSiguiente.getTime());
    } else {
        dControl.setTime(sabAnterior.getTime());
    }
}

const diasSemana = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

// Simular: examen hoy (sábado 7 de junio 2026), control en 3 meses → 9 sept (Mié)
const casos = [
    { nombre: "3 meses desde sábado → cae Miércoles", base: new Date(2026, 8, 9) },   // Sept 9 = Mié
    { nombre: "3 meses desde sábado → cae Viernes",   base: new Date(2026, 8, 11) },  // Sept 11 = Vie
    { nombre: "3 meses desde sábado → cae Lunes",     base: new Date(2026, 8, 7) },   // Sept 7 = Lun
    { nombre: "3 meses desde sábado → cae Sábado",    base: new Date(2026, 8, 6) },   // Sept 6 = Sáb
    { nombre: "3 meses desde sábado → cae Domingo",   base: new Date(2026, 8, 13) },  // Sept 13 = Dom
    { nombre: "3 meses desde sábado → cae Jueves",    base: new Date(2026, 8, 10) },  // Sept 10 = Jue
];

for (const caso of casos) {
    const dControl = new Date(caso.base);
    const original = dControl.toISOString().substring(0, 10);
    const diaOriginal = diasSemana[dControl.getDay()];
    ajustarASabado(dControl);
    const ajustada = dControl.toISOString().substring(0, 10);
    const diaAjustado = diasSemana[dControl.getDay()];
    console.log(`${caso.nombre}`);
    console.log(`   Original: ${original} (${diaOriginal}) → Ajustado: ${ajustada} (${diaAjustado})`);
    console.log(`   ¿Es sábado? ${dControl.getDay() === 6 ? '✅' : '❌'}`);
    console.log('');
}
