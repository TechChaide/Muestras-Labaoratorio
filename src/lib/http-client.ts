/**
 * HTTP Client with automatic token handling via Authorization header
 * 
 * El backend devuelve el token en Set-Cookie (httpOnly) pero ADEMÁS en el JSON response.
 * Como tenemos dominios diferentes (apps.chaide.com vs localhost:5400),
 * los cookies cross-domain NO se envían. Por eso guardamos el token en localStorage
 * y lo enviamos en Authorization Bearer header.
 */

import { toast } from "@/hooks/use-toast";

export type FetchOptions = RequestInit & {
  skipAuth?: boolean;
};

/**
 * Obtiene el token del localStorage
 */
function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  
  // Buscar en múltiples claves (por compatibilidad)
  const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
  
  if (token) {
    console.log('🔑 Token encontrado en localStorage');
  } else {
    console.warn('⚠️ NO hay token en localStorage');
  }
  return token;
}

/**
 * Fetch wrapper que automáticamente:
 * 1. Incluye el token en el header Authorization Bearer
 * 2. Maneja errores sin borrar datos
 * 
 * @param url - The URL to fetch
 * @param options - Fetch options (puede incluir skipAuth: true para saltar autenticación)
 * @returns Promise with the fetch response
 */
export async function fetchWithAuth(
  url: string,
  options: FetchOptions = {}
) {
  const { skipAuth = false, ...restOptions } = options;

  const headers = {
    ...restOptions.headers,
  };

  // Agregar token en Authorization header si no es skipAuth
  if (!skipAuth) {
    const token = getToken();
    if (token) {
      (headers as any)['Authorization'] = `Bearer ${token}`;
      console.log('✅ Token enviado en Authorization Bearer header');
    } else {
      console.warn('⚠️ No hay token para enviar en Authorization header a:', url);
    }
  }

  console.log(`📡 Petición a: ${url}`);

  // Determinar si debemos enviar credenciales
  // Solo para dominios del backend de autenticación (para mantener las cookies de sesión)
  const shouldIncludeCredentials = url.includes('apps.chaide.com');

  // Realizar la petición
  const response = await fetch(url, {
    ...restOptions,
    headers,
    credentials: shouldIncludeCredentials ? 'include' : 'omit', // ✅ Selectivo
  });

  // Si error 401 (Unauthorized), solo loguear
  if (response.status === 401) {
    let errMsg = 'No autorizado (401).';
    try {
      const cloned = response.clone();
      const body = await cloned.json().catch(() => null);
      if (body) {
        if (typeof body === 'string') errMsg = body;
        else if (body.message) errMsg = body.message;
        else if (body.error) errMsg = body.error;
      }
    } catch (_) {
      // Ignorar errores al parsear
    }
    console.warn('⚠️ Error 401 en:', url, '→', errMsg);
  }

  return response;
}

/**
 * Limpia todos los datos de autenticación local
 */
function clearAuthData() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('auth_token');  // Nueva clave
    localStorage.removeItem('token');       // Vieja clave (por compatibilidad)
    localStorage.removeItem('user');
    localStorage.removeItem('appsByProfile');
    console.warn('❌ Auth data clearedjl - Token eliminado');
  }
}

/**
 * Limpia todos los datos de autenticación local
 */
export function clearAuth() {
  clearAuthData();
}
