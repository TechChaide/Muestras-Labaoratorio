import type { Auth, Usuario } from "@/types/interfaces";
import type { BodyResponse } from "@/types/body-response";
import { environment } from "@/environments/environments.prod";
import { fetchWithAuth } from "@/lib/http-client";

const API_URL = `${environment.apiURL}/api/auths/login`;
const API_URL_CENTRAL = `${environment.apiURL}/api/auths/loginCentral`;

// Define a type for the login credentials
type LoginCredentials = {
  email: string;
  password: string;
};

// Tipo para login facial/central — aceptar string o el objeto facial
type LoginCentralCredentials = {
  email: string;
  password:
    | string
    | {
        CODIGO: string;
        NOMBRE: string;
        DEPARTAMENTO?: string;
        CENTRO?: string;
      };
};

/**
 * Busca un valor en un objeto de forma recursiva
 */
function findTokenInResponse(data: any): string | null {
  if (!data) return null;
  
  // Si es string, es probablemente el token
  if (typeof data === 'string' && data.startsWith('eyJ')) return data;
  
  // Buscar en propiedades comunes
  if (data.token) return data.token;
  if (data.access_token) return data.access_token;
  if (data.auth_token) return data.auth_token;
  
  // Buscar recursivamente en data.data
  if (data.data) {
    const nested = findTokenInResponse(data.data);
    if (nested) return nested;
  }
  
  return null;
}

export const authService = {
  async login(credentials: LoginCredentials): Promise<BodyResponse<Auth>> {
    // El login es una petición PÚBLICA (sin autenticación previa)
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
      credentials: 'include',
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Error al iniciar sesión.' }));
      throw new Error(errorBody.message || 'Ocurrió un error desconocido.');
    }

    const data = await response.json() as BodyResponse<Auth>;

    // Buscar y guardar el token en localStorage
    const token = findTokenInResponse(data);
    if (token) {
      if (typeof window !== 'undefined') {
        localStorage.setItem('auth_token', token);
        console.log('✅ Token guardado en localStorage');
        console.log('🔑 Token:', token.substring(0, 20) + '...');
      }
    } else {
      console.warn('⚠️ No se encontró token en la respuesta:', data);
    }

    return data;
  },

  async loginCentral(credentials: any): Promise<BodyResponse<Auth>> {
    // El login es una petición PÚBLICA (sin autenticación previa)
    const response = await fetch(API_URL_CENTRAL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: credentials.email,
        password: credentials.password,
      }),
      credentials: 'include',
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Error al iniciar sesión facial.' }));
      throw new Error(errorBody.message || 'Ocurrió un error desconocido.');
    }
    
    const data = await response.json() as BodyResponse<Auth>;

    console.log('🔍 Response del loginCentral:', JSON.stringify(data, null, 2));

    // Buscar y guardar el token en localStorage
    const token = findTokenInResponse(data);
    if (token) {
      if (typeof window !== 'undefined') {
        localStorage.setItem('auth_token', token);
        console.log('✅ Token guardado en localStorage con éxito');
        console.log('🔑 Token:', token.substring(0, 20) + '...');
      }
    } else {
      console.warn('⚠️ NO SE ENCONTRÓ TOKEN en la respuesta:', data);
    }

    return data;
  },
};
