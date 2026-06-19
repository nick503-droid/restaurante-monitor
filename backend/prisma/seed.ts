// prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Insertando datos de prueba...');

  // Insertamos cada clase individualmente usando upsert
  // upsert = "si existe actualiza, si no existe crea"
  // Así evitamos el error de skipDuplicates y los tipos quedan correctos
  const clases = [
    { clase_id: 0,  nombre: 'Persona',  descripcion: 'Detecta personas en general' },
    { clase_id: 67, nombre: 'Celular',  descripcion: 'Uso de celular en cocina' },
    { clase_id: 46, nombre: 'Tenedor',  descripcion: 'Cubiertos en área incorrecta' },
    { clase_id: 47, nombre: 'Cuchillo', descripcion: 'Cuchillo en área incorrecta' },
    { clase_id: 39, nombre: 'Botella',  descripcion: 'Botella en área de trabajo' },
    { clase_id: 41, nombre: 'Vaso',     descripcion: 'Vaso en área de preparación' },
  ];

  for (const clase of clases) {
    await prisma.catalogoClase.upsert({
      where:  { clase_id: clase.clase_id },
      update: {},
      create: clase,
    });
  }

  console.log('Clases del catálogo insertadas ✓');

  // Cámara de prueba
  await prisma.camara.upsert({
    where:  { id: 1 },
    update: {},
    create: {
      nombre:        'Cocina Principal',
      source:        '0',
      activa:        true,
      clases_vigilar: JSON.stringify([0, 67]),
    },
  });

  console.log('Cámara de prueba insertada ✓');
  console.log('Datos listos. Ya puedes arrancar el sistema.');
}

main()
  .catch((e) => {
    console.error('Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });