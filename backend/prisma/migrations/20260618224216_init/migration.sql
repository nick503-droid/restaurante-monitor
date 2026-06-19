-- CreateTable
CREATE TABLE "CatalogoClase" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "clase_id" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Camara" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "clases_vigilar" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AlertaInfraccion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "camaraId" INTEGER NOT NULL,
    "catalogoClaseId" INTEGER NOT NULL,
    "confianza" REAL NOT NULL,
    "duracion_seg" REAL NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AlertaInfraccion_camaraId_fkey" FOREIGN KEY ("camaraId") REFERENCES "Camara" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AlertaInfraccion_catalogoClaseId_fkey" FOREIGN KEY ("catalogoClaseId") REFERENCES "CatalogoClase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CatalogoClase_clase_id_key" ON "CatalogoClase"("clase_id");
