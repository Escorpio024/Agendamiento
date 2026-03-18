-- ============================================================
-- SEED: Datos de prueba para HABEJICO
-- Ejecutar en SSMS o con sqlcmd
-- ============================================================
USE HABEJICO;
GO

-- ============================================================
-- 1. ESPECIALIDADES
-- ============================================================
DELETE FROM TMESPECIALIDADES;

INSERT INTO TMESPECIALIDADES (ESP_COD, ESP_NOMBRE, ESP_PUB_WEB, ESP_CANTD_WEB) VALUES
('MEGEN', 'MEDICINA GENERAL',  'S', 10),
('ODONT', 'ODONTOLOGIA',       'S', 8),
('PEDIJ', 'PEDIATRIA',         'S', 6),
('GINEC', 'GINECOLOGIA',       'S', 5),
('CARD',  'CARDIOLOGIA',       'S', 4),
('NTRN',  'NUTRICION',         'S', 6);
GO

-- ============================================================
-- 2. CONSULTORIOS
-- ============================================================
DELETE FROM TMCONSULTORIOS;

INSERT INTO TMCONSULTORIOS (COT_COD, COT_NOMBRE, COT_ACTIVO) VALUES
('CONS01', 'Consultorio 1 - Medicina General', 'S'),
('CONS02', 'Consultorio 2 - Odontologia',      'S'),
('CONS03', 'Consultorio 3 - Pediatria',        'S'),
('CONS04', 'Consultorio 4 - Especialistas',    'S');
GO

-- ============================================================
-- 3. MEDICOS
-- ============================================================
DELETE FROM TMMEDICOS;

INSERT INTO TMMEDICOS (MED_COD, MED_NOMBRE, MED_ESPECIALIDAD_1, MED_CONSULTORIO, MED_EST_ESTADO) VALUES
(1, 'DR. CARLOS ALBERTO GOMEZ',    'MEGEN', 'CONS01', 'A'),
(2, 'DRA. LAURA PATRICIA TORRES',  'ODONT', 'CONS02', 'A'),
(3, 'DR. MIGUEL ANGEL RIOS',       'PEDIJ', 'CONS03', 'A'),
(4, 'DRA. SOFIA ISABELA MENDEZ',   'GINEC', 'CONS04', 'A'),
(5, 'DR. ANDRES FELIPE CASTILLO',  'MEGEN', 'CONS01', 'A');
GO

-- ============================================================
-- 4. TURNOS DE MEDICOS (Horarios)
-- Fechas: 20260301 al 20261231 (todo 2026)
-- Manana: 07:00 - 12:00  |  Tarde: 14:00 - 18:00
-- Duracion cita: 20 minutos
-- ============================================================
DELETE FROM TMTURNOSMEDICOS;

-- Dr. Carlos Gomez - Medicina General - Lunes a Viernes
INSERT INTO TMTURNOSMEDICOS (TME_CODM, TME_FCH, TME_FCH_FIN,
    TME_HH_I, TME_MM_I, TME_HH_F, TME_MM_F,
    TME_HH_I_A, TME_MM_I_A, TME_HH_F_A, TME_MM_F_A,
    TME_DUR_CITA, TME_CONSULTORIO, TME_ESPECIALIDAD, TME_OBSERV) VALUES
(1, 20260301, 20261231, 7, 0, 12, 0, 14, 0, 18, 0, 20, 'CONS01', 'MEGEN', 'Turno completo');

-- Dra. Laura Torres - Odontologia - Lunes a Viernes
INSERT INTO TMTURNOSMEDICOS (TME_CODM, TME_FCH, TME_FCH_FIN,
    TME_HH_I, TME_MM_I, TME_HH_F, TME_MM_F,
    TME_HH_I_A, TME_MM_I_A, TME_HH_F_A, TME_MM_F_A,
    TME_DUR_CITA, TME_CONSULTORIO, TME_ESPECIALIDAD, TME_OBSERV) VALUES
(2, 20260301, 20261231, 8, 0, 12, 0, 13, 0, 17, 0, 30, 'CONS02', 'ODONT', 'Turno completo');

-- Dr. Miguel Rios - Pediatria - Lunes, Miercoles, Viernes
INSERT INTO TMTURNOSMEDICOS (TME_CODM, TME_FCH, TME_FCH_FIN,
    TME_HH_I, TME_MM_I, TME_HH_F, TME_MM_F,
    TME_HH_I_A, TME_MM_I_A, TME_HH_F_A, TME_MM_F_A,
    TME_DUR_CITA, TME_CONSULTORIO, TME_ESPECIALIDAD, TME_OBSERV) VALUES
(3, 20260301, 20261231, 7, 30, 12, 30, 14, 0, 17, 0, 20, 'CONS03', 'PEDIJ', 'Turno completo');

-- Dra. Sofia Mendez - Ginecologia - Martes y Jueves
INSERT INTO TMTURNOSMEDICOS (TME_CODM, TME_FCH, TME_FCH_FIN,
    TME_HH_I, TME_MM_I, TME_HH_F, TME_MM_F,
    TME_HH_I_A, TME_MM_I_A, TME_HH_F_A, TME_MM_F_A,
    TME_DUR_CITA, TME_CONSULTORIO, TME_ESPECIALIDAD, TME_OBSERV) VALUES
(4, 20260301, 20261231, 8, 0, 13, 0, NULL, NULL, NULL, NULL, 30, 'CONS04', 'GINEC', 'Solo manana');

-- Dr. Andres Castillo - Medicina General (tarde)
INSERT INTO TMTURNOSMEDICOS (TME_CODM, TME_FCH, TME_FCH_FIN,
    TME_HH_I, TME_MM_I, TME_HH_F, TME_MM_F,
    TME_HH_I_A, TME_MM_I_A, TME_HH_F_A, TME_MM_F_A,
    TME_DUR_CITA, TME_CONSULTORIO, TME_ESPECIALIDAD, TME_OBSERV) VALUES
(5, 20260301, 20261231, NULL, NULL, NULL, NULL, 14, 0, 19, 0, 20, 'CONS01', 'MEGEN', 'Solo tarde');
GO

-- ============================================================
-- 5. PACIENTES DE PRUEBA (TMUSUARIOSASEGURAMIENTO)
-- Usa tu número de WhatsApp real en KC0_RES_TEL para probar
-- ============================================================
DELETE FROM TMUSUARIOSASEGURAMIENTO;

INSERT INTO TMUSUARIOSASEGURAMIENTO (
    KC0_COD, KC0_TIPO_DOCTO, KC0_TIPO_USUARIO,
    KC0_NOM, KC0_PAPELLIDO, KC0_SAPELLIDO, KC0_PNOMBRE, KC0_SNOMBRE,
    KC0_RES_TEL, KC0_RES_DIR, KC0_SEXO, KC0_ESTADO, KC0_FCH_NACE
) VALUES
-- *** CAMBIA 3001234567 POR TU NUMERO DE WHATSAPP (solo digitos, sin +57) ***
('1234567890', 'CC', 'B', 'OSCAR PRUEBA USUARIO',
 'APELLIDO1', 'APELLIDO2', 'OSCAR', NULL,
 '3016404175', 'CL 123 # 45-67', 'M', 'AC', 19900101),

('9876543210', 'CC', 'B', 'MARIA FERNANDA LOPEZ',
 'LOPEZ', 'GARCIA', 'MARIA', 'FERNANDA',
 '3109876543', 'CRA 10 # 20-30', 'F', 'AC', 19850515),

('1111111111', 'CC', 'B', 'JUAN CARLOS PEREZ',
 'PEREZ', 'MARTINEZ', 'JUAN', 'CARLOS',
 '3201111111', 'AV 68 # 15-20', 'M', 'AC', 19751225);
GO

PRINT '✅ Seed completado exitosamente!';
PRINT 'Recuerda cambiar el telefono 3001234567 por tu numero de WhatsApp real.';
GO
