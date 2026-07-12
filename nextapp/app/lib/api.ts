/** API base. Server-side code uses API_URL; client-side uses NEXT_PUBLIC_API_URL. */
export const API_URL = process.env.API_URL ?? 'http://localhost:4000';
export const PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
