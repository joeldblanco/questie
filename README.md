# Questie Front

Questie ahora se prepara para funcionar como una unica aplicacion Next.js desplegable en Vercel, con Prisma sobre Neon y API interna bajo `/api/*`.

## Stack actual

- Next.js 14
- App Router + route handlers
- Prisma 7 + adaptador de Neon
- Auth0 para OAuth y login social
- API local para cursos, categorias, modulos, lecciones, contenidos, usuarios, enrolments, productos, invoices, progress y assessment

## Configuracion local

1. Instala dependencias:

```bash
npm install
```

2. Crea `.env.local` a partir de `.env.example`.

3. Configura como minimo:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DB?sslmode=require"
JWT_SECRET="cambia-este-valor"
NEXT_PUBLIC_API_URL="http://localhost:3000/api/"
API_URL="http://localhost:3000/api/"
```

4. Genera el cliente de Prisma:

```bash
npm run db:generate
```

5. Aplica el esquema a la base:

```bash
npm run db:push
```

6. Levanta el proyecto:

```bash
npm run dev
```

## Flujo de datos

- El frontend ya no necesita un backend Nest externo para el slice principal.
- Las llamadas existentes pueden apuntar a `NEXT_PUBLIC_API_URL=/api/`.
- El repositorio `Questie-Back` queda como referencia de dominio, no como dependencia runtime.

## Notas de migracion

- `uploadfile` usa una representacion `data:` para mantener compatibilidad inmediata. Conviene migrarlo despues a Cloudinary o Vercel Blob.
- `payments/paypal` y `payments/mercado-pago` siguen pendientes de migracion server-side.
- Para despliegue en Vercel, configura `DATABASE_URL`, `JWT_SECRET` y las variables de Auth0 en el proyecto.
