/**
 * Logger con niveles para Aurora Bot
 * ─────────────────────────────────────────────────────────────
 * Configura en .env:
 *   LOG_LEVEL=debug   → todo visible (desarrollo)
 *   LOG_LEVEL=info    → solo info + warn + error (por defecto)
 *   LOG_LEVEL=warn    → solo warnings y errores (producción silenciosa)
 *   LOG_LEVEL=error   → solo errores críticos
 *
 * Uso:
 *   const logger = require('./logger');
 *   logger.debug('[SLOTS] 87 slots encontrados para fecha=20260525');
 *   logger.info('[HABEJICO] ✅ Cita creada');
 *   logger.warn('[DB] Reconectando...');
 *   logger.error('[WA] Fallo crítico:', err.message);
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const CURRENT = LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LEVELS.info;

const ts = () => {
    const d = new Date();
    return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`;
};

const logger = {
    debug: (...args) => { if (CURRENT <= LEVELS.debug)  console.log  (`[${ts()} DBG]`, ...args); },
    info:  (...args) => { if (CURRENT <= LEVELS.info)   console.log  (`[${ts()} INF]`, ...args); },
    warn:  (...args) => { if (CURRENT <= LEVELS.warn)   console.warn (`[${ts()} WRN]`, ...args); },
    error: (...args) => { if (CURRENT <= LEVELS.error)  console.error(`[${ts()} ERR]`, ...args); },
};

module.exports = logger;
