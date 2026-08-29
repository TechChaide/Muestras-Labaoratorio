'use client';

import React from 'react';
import { LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LogoutButtonProps {
  className?: string;
  variant?: 'gradient' | 'outline' | 'ghost';
  showLabel?: boolean;
  compact?: boolean; // square icon style when collapsed
}

export const LogoutButton: React.FC<LogoutButtonProps> = ({ className, variant = 'gradient', showLabel = true, compact = false }) => {
  const handleLogout = () => {
    try {
      // Limpiar TODOS los datos de sesión
      localStorage.removeItem('auth_token');
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('perfiles');
      localStorage.removeItem('appsByProfile');
      localStorage.removeItem('aplicacionesDisponibles');
      localStorage.removeItem('perfilesAutorizados');
      
      console.log('✅ Sesión cerrada - Todos los datos limpios');
    } catch (error) {
      console.error('Error al limpiar localStorage:', error);
    }
    
    const basePath = ((window as any).__NEXT_DATA__?.basePath || process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/+$/, '');
    window.location.href = basePath ? `${basePath}/` : '/';
  };

  const base = 'flex items-center justify-center gap-2 rounded-md text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2';
  const styles: Record<string,string> = {
    gradient: 'bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 text-white shadow hover:from-pink-600 hover:to-indigo-600 hover:shadow-md active:scale-[.98] focus:ring-indigo-400',
    outline: 'border border-primary/30 text-primary-foreground/80 hover:bg-primary-foreground/10',
    ghost: 'text-primary-foreground/80 hover:bg-primary-foreground/10',
  };

  const sizeClasses = compact
    ? 'w-10 h-10 p-0 rounded-full'
    : 'w-full px-4 py-2';

  return (
    <button
      aria-label="Cerrar sesión"
      onClick={handleLogout}
      className={cn(base, sizeClasses, styles[variant], className)}
    >
      <LogOut className="h-4 w-4" />
      {showLabel && <span>Cerrar sesión</span>}
    </button>
  );
};
