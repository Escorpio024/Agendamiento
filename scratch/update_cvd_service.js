const fs = require('fs');

const path = 'd:\\Angel\\Proyectos\\agendamiento\\control_cvd_service.js';
let content = fs.readFileSync(path, 'utf8');

// Añadir el nuevo método para detectar riesgo cardiovascular
const newMethod = `
    // ─────────────────────────────────────────────────────────────────────────
    // FASE 4: DETECCIÓN DE ALTO RIESGO POR FRAMINGHAM O ENFERMEDAD CRÓNICA
    // ─────────────────────────────────────────────────────────────────────────
    async detectHighRiskPatients() {
        try {
            const today = new Date();
            const todayDec = this.dateToDecimal(today);
            
            // Buscar pacientes atendidos hoy en consulta externa (no solo CVD, sino cualquier atención)
            // Cruzar con VIQ_MOVIMIENTO_HC_ALTO_COSTO para ver si tienen HTA, DM o Riesgo CV Alto
            const highRiskPacientes = await prisma.$queryRawUnsafe(\`
                SELECT DISTINCT c.KC3_COD, c.KC3_ENTIDAD, e.ENT_NOMBRE,
                       v.[TIENE HTA], v.[TIENE DM], v.[RIESGO CV]
                FROM TMCITASUSUARIOS c
                INNER JOIN VIQ_MOVIMIENTO_HC_ALTO_COSTO v ON c.KC3_COD = v.Codigo_KC AND c.KC3_FCH = v.[Fecha HC]
                LEFT JOIN TMENTIDADES e ON e.ENT_COD = c.KC3_ENTIDAD
                WHERE c.KC3_FCH = \${todayDec}
                  AND c.KC3_NUM > 0
                  AND (
                      v.[TIENE HTA] = '1' OR 
                      v.[TIENE DM] = '1' OR 
                      v.[RIESGO CV] IS NOT NULL
                  )
                  AND c.KC3_COD <> '00000000000000'
            \`);

            logger.info(\`[Control CVD] Detección Clínica: \${highRiskPacientes.length} pacientes de alto riesgo detectados hoy.\`);

            for (const paciente of highRiskPacientes) {
                const cedulaRaw = String(paciente.KC3_COD).trim();
                
                // Verificar si ya existe un control pendiente o agendado en botPrisma
                const exists = await botPrisma.controlReminder.findFirst({
                    where: {
                        cedula: cedulaRaw,
                        estado: { notIn: ['CANCELLED', 'BOOKING_FAILED_NO_SLOT', 'BOOKING_FAILED_XENCO'] }
                    }
                });

                if (exists) {
                    continue; // Ya está en seguimiento
                }

                // Verificar si ya tiene una cita futura en Xenco
                const xencoBooking = await this.hasExistingControlCita(cedulaRaw);
                if (xencoBooking.found) {
                    await botPrisma.controlReminder.create({
                        data: {
                            cedula: cedulaRaw,
                            entidad: String(paciente.ENT_NOMBRE || 'SIN EPS'),
                            estado: 'BOOKED_PRESENCIAL', // Ya agendado por clínica
                            fechaControl: xencoBooking.fecha,
                            citaMedico: xencoBooking.medico,
                            citaFch: xencoBooking.fecha
                        }
                    });
                    continue;
                }

                // Si no tiene seguimiento y es de riesgo, lo insertamos como PENDING
                // El Phase 2 lo agendará mañana a las 7:30 AM
                await botPrisma.controlReminder.create({
                    data: {
                        cedula: cedulaRaw,
                        entidad: String(paciente.ENT_NOMBRE || 'SIN EPS'),
                        estado: 'PENDING',
                        fechaControl: this.dateToString(new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000)) // 3 meses
                    }
                });
                
                logger.info(\`[Control CVD] Registrado por Riesgo Clínico para seguimiento: \${cedulaRaw}\`);
            }
        } catch (e) {
            logger.error(\`[Control CVD] Error en detección de riesgo clínico: \${e.message}\`);
        }
    }
`;

// Injectar the method before the last closing brace of the class
const classEndIndex = content.lastIndexOf('}');
content = content.substring(0, classEndIndex) + newMethod + content.substring(classEndIndex);

// Add to cron scheduler
const startSchedulerOld = `cron.schedule('0 10 * * 1-6', async () => {
            logger.info('🔔 [Control CVD] Fase 3: Recordatorio de laboratorios 8 días antes...');
            await this.executeLaboratoryReminder();
        });

        this.isRunning = true;`;

const startSchedulerNew = `cron.schedule('0 10 * * 1-6', async () => {
            logger.info('🔔 [Control CVD] Fase 3: Recordatorio de laboratorios 8 días antes...');
            await this.executeLaboratoryReminder();
        });

        // Fase 4 — Detección Clínica: Todos los días a las 8:30 PM
        cron.schedule('30 20 * * 1-6', async () => {
            logger.info('🩺 [Control CVD] Fase 4: Detección de pacientes de alto riesgo por clínica (Framingham, DM, HTA)...');
            await this.detectHighRiskPatients();
        });

        this.isRunning = true;`;

content = content.replace(startSchedulerOld, startSchedulerNew);

fs.writeFileSync(path, content, 'utf8');
console.log('ControlCVDService updated correctly');
