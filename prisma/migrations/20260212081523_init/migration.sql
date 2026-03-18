-- CreateTable
CREATE TABLE "tipos_documento" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(5) NOT NULL,
    "nombre" VARCHAR(50) NOT NULL,

    CONSTRAINT "tipos_documento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entidades_salud" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "codigo_habilitacion" VARCHAR(20),

    CONSTRAINT "entidades_salud_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ciudades" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "departamento" VARCHAR(100),

    CONSTRAINT "ciudades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pacientes" (
    "id" SERIAL NOT NULL,
    "tipo_documento_id" INTEGER,
    "numero_documento" VARCHAR(20) NOT NULL,
    "historia_clinica" VARCHAR(20),
    "nombres" VARCHAR(100) NOT NULL,
    "apellidos" VARCHAR(100),
    "fecha_nacimiento" DATE NOT NULL,
    "genero" VARCHAR(20),
    "ocupacion" VARCHAR(100),
    "ciudad_residencia_id" INTEGER,
    "direccion" VARCHAR(200),
    "barrio" VARCHAR(100),
    "email" VARCHAR(150),
    "celular" VARCHAR(20),
    "telefono_fijo" VARCHAR(20),
    "entidad_id" INTEGER,
    "tipo_usuario" VARCHAR(50),
    "numero_carnet" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pacientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contactos_emergencia" (
    "id" SERIAL NOT NULL,
    "paciente_id" INTEGER,
    "nombre" VARCHAR(100),
    "parentesco" VARCHAR(50),
    "telefono" VARCHAR(20),
    "es_responsable_legal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "contactos_emergencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipos_cita" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(50) NOT NULL,
    "descripcion" TEXT,

    CONSTRAINT "tipos_cita_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "citas" (
    "id" SERIAL NOT NULL,
    "fecha" DATE NOT NULL,
    "hora" VARCHAR(10) NOT NULL,
    "tipo_cita_id" INTEGER NOT NULL,
    "paciente_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "citas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tipos_documento_codigo_key" ON "tipos_documento"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "pacientes_numero_documento_key" ON "pacientes"("numero_documento");

-- CreateIndex
CREATE UNIQUE INDEX "pacientes_historia_clinica_key" ON "pacientes"("historia_clinica");

-- CreateIndex
CREATE UNIQUE INDEX "citas_fecha_hora_tipo_cita_id_key" ON "citas"("fecha", "hora", "tipo_cita_id");

-- AddForeignKey
ALTER TABLE "pacientes" ADD CONSTRAINT "pacientes_tipo_documento_id_fkey" FOREIGN KEY ("tipo_documento_id") REFERENCES "tipos_documento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pacientes" ADD CONSTRAINT "pacientes_ciudad_residencia_id_fkey" FOREIGN KEY ("ciudad_residencia_id") REFERENCES "ciudades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pacientes" ADD CONSTRAINT "pacientes_entidad_id_fkey" FOREIGN KEY ("entidad_id") REFERENCES "entidades_salud"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contactos_emergencia" ADD CONSTRAINT "contactos_emergencia_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_tipo_cita_id_fkey" FOREIGN KEY ("tipo_cita_id") REFERENCES "tipos_cita"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
