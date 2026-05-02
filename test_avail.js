const citasExistentes = [
    { KC3_MEDICO: { toString: () => "123" }, KC3_HH: { toString: () => "8" }, KC3_MM: { toString: () => "0" }, KC3_ESTADO: "01" }
];

const turno = { TME_CODM: { toString: () => "123" } };
const currH = 8;
const currM = 0;

const isBooked = citasExistentes.some(c =>
    String(c.KC3_MEDICO) === String(turno.TME_CODM) &&
    parseInt(c.KC3_HH) === currH &&
    parseInt(c.KC3_MM) === currM
);

console.log('isBooked:', isBooked);
