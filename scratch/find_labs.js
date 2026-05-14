const prisma = require('../db.js');

async function main() {
    console.log("Buscando Plantillas CA 000092 y PL 000181...");
    
    const queries = [
        `SELECT TOP 10 * FROM TQPLANTILLASITEMS WHERE QWH_NOM LIKE '%000181%' OR QWH_NOM_OBS LIKE '%000181%'`,
        `SELECT TOP 10 * FROM TQPLANTILLASITEMS WHERE QWH_NOM LIKE '%000092%' OR QWH_NOM_OBS LIKE '%000092%'`,
        `SELECT TOP 10 * FROM TQPLANTILLASITEMSC WHERE QWC_NOM LIKE '%000181%' OR QWC_NOM LIKE '%000092%'`,
        `SELECT TOP 10 * FROM TQPLANTILLASITEMSG WHERE QWG_NOM LIKE '%000181%' OR QWG_NOM LIKE '%000092%'`,
        `SELECT TOP 10 * FROM TQPLANTILLASUSUARIOS WHERE QRH_NOM LIKE '%000181%' OR QRH_NOM LIKE '%000092%'`,
        `SELECT TOP 10 * FROM TQPLANTILLASUSUARIOSG WHERE QRG_NOM LIKE '%000181%' OR QRG_NOM LIKE '%000092%'`
    ];

    for (const q of queries) {
        try {
            const result = await prisma.$queryRawUnsafe(q);
            if (result.length > 0) {
                console.log("Encontrado en query:", q);
                console.log(result);
            }
        } catch(e) {}
    }
    
    // Y para la orden de laboratorio en si, si está creada, en tablas de PyP
    const pypQueries = [
        `SELECT TOP 10 * FROM TMPYPPROGRAMAS`,
        `SELECT TOP 10 * FROM TMPYPPROGRAMAACTIVIDADSU`,
        `SELECT TOP 10 * FROM TQPYPACTIVIDADES`
    ];
    for (const q of pypQueries) {
        try {
            const result = await prisma.$queryRawUnsafe(q);
            if (result.length > 0) {
                console.log("Encontrado en query:", q);
                console.log(result[0]); // solo el primero para ver estructura
            }
        } catch(e) {}
    }

    process.exit(0);
}

main();
